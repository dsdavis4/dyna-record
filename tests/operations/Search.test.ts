/**
 * Unit tests for the Search operation itself.
 *
 * These drive `new Search(index).run(...)` directly — the layer beneath the
 * public `myIndex.search(...)` surface. Consumers never construct this class;
 * `tests/integration/Search.test.ts` owns the public-interface coverage and is
 * the suite that decides whether behavior is correct.
 *
 * Most of what follows **deliberately mirrors** assertions that suite already
 * makes. `VectorIndexMetadata.search` is a thin dispatcher into this same
 * `run`, so topK resolution, query and vector resolution, condition
 * compilation, filter rejection, and result mapping are reachable from both
 * layers. These are kept for failure localization: when one of them breaks,
 * this file says the operation is at fault rather than the public surface.
 * They are not unique coverage, and a behavior change is expected to update
 * assertions in both files.
 *
 * Exactly one case here is genuinely unreachable from the public surface —
 * `run(query)` with no options object at all, which the construct's signature
 * cannot express because it always supplies `scopeId` on the scoped branch.
 */
import { SearchVectorsCommand } from "@aws-sdk/lib-dynamodb";
import {
  Listing,
  Review,
  mockEmbeddingProviderCalls,
  globalSearchIndex,
  storeSearchIndex
} from "../integration/mockModels.js";
import { Search } from "../../src/operations/index.js";
import { FilterError, ValidationError } from "../../src/errors.js";
import { type SearchFilter } from "../../src/filter-utils/index.js";

const mockedSearchVectorsCommand = vi.mocked(SearchVectorsCommand);

const mockSend = vi.fn();
const mockSearchVectors = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => {
  return {
    DynamoDBClient: vi.fn().mockImplementation(() => {
      return { key: "MockDynamoDBClient" };
    })
  };
});

vi.mock("@aws-sdk/lib-dynamodb", () => {
  return {
    DynamoDBDocumentClient: {
      from: vi.fn().mockImplementation(() => {
        return {
          send: vi.fn().mockImplementation(async command => {
            mockSend(command);
            if (command.name === "SearchVectorsCommand") {
              return await Promise.resolve(mockSearchVectors());
            }
          })
        };
      })
    },
    SearchVectorsCommand: vi.fn().mockImplementation(() => {
      return { name: "SearchVectorsCommand" };
    }),
    GetCommand: vi.fn().mockImplementation(() => {
      return { name: "GetCommand" };
    }),
    QueryCommand: vi.fn().mockImplementation(() => {
      return { name: "QueryCommand" };
    }),
    TransactWriteCommand: vi.fn().mockImplementation(() => {
      return { name: "TransactWriteCommand" };
    })
  };
});

const expectedTitanVector = new Array<number>(1024).fill(0.1);

describe("Search operation", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockEmbeddingProviderCalls.length = 0;
  });

  describe("scope guards", () => {
    // These messages belong to the operation, not to the construct's
    // signature guards — but they ARE reachable publicly, and the integration
    // suite asserts both (an empty scope id, and a scopeId smuggled into an
    // unscoped index's options in plain JS). Only the first case below, with
    // no options object at all, is unique to this layer.
    it("rejects a scoped index run with no scope id", async () => {
      expect.assertions(3);

      try {
        await new Search(storeSearchIndex).run("mugs");
      } catch (e: any) {
        expect(e).toBeInstanceOf(ValidationError);
        expect(e.message).toEqual(
          "Vector index store-search-index is scoped — provide the scope id of the Store to search within"
        );
      }
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("rejects a scoped index run with an empty scope id", async () => {
      expect.assertions(3);

      try {
        await new Search(storeSearchIndex).run("mugs", { scopeId: "" });
      } catch (e: any) {
        expect(e).toBeInstanceOf(ValidationError);
        expect(e.message).toEqual(
          "Vector index store-search-index is scoped — provide the scope id of the Store to search within"
        );
      }
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("rejects a scope id on an unscoped index", async () => {
      expect.assertions(3);

      try {
        await new Search(globalSearchIndex).run("articles", {
          scopeId: "123"
        });
      } catch (e: any) {
        expect(e).toBeInstanceOf(ValidationError);
        expect(e.message).toEqual(
          "Vector index global-search-index is unscoped — it does not take a scope id"
        );
      }
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe("topK resolution", () => {
    it("defaults topK to 10", async () => {
      expect.assertions(1);

      mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });
      await new Search(globalSearchIndex).run("articles");

      expect(mockedSearchVectorsCommand.mock.calls).toEqual([
        [
          {
            TableName: "search-table",
            IndexName: "global-search-index",
            SearchVector: new Array<number>(1024).fill(0.7),
            TopK: 10
          }
        ]
      ]);
    });

    it.each([1, 100])("accepts topK %p — the inclusive bounds", async valid => {
      expect.assertions(1);

      mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });
      await new Search(globalSearchIndex).run("articles", { topK: valid });

      expect(mockedSearchVectorsCommand.mock.calls).toEqual([
        [
          {
            TableName: "search-table",
            IndexName: "global-search-index",
            SearchVector: new Array<number>(1024).fill(0.7),
            TopK: valid
          }
        ]
      ]);
    });

    it.each([0, -1, 101, 1.5, NaN, Infinity, -Infinity])(
      "rejects topK %p before any AWS call",
      async invalid => {
        expect.assertions(3);

        try {
          await new Search(globalSearchIndex).run("articles", {
            topK: invalid
          });
        } catch (e: any) {
          expect(e).toBeInstanceOf(ValidationError);
          expect(e.message).toEqual(
            `topK must be an integer between 1 and 100. Received: ${invalid}`
          );
        }
        expect(mockSend).not.toHaveBeenCalled();
      }
    );
  });

  describe("query and vector resolution", () => {
    it("rejects empty query text before calling the provider", async () => {
      expect.assertions(4);

      try {
        await new Search(globalSearchIndex).run("");
      } catch (e: any) {
        expect(e).toBeInstanceOf(ValidationError);
        expect(e.message).toEqual("Search query text cannot be empty");
      }
      expect(mockEmbeddingProviderCalls).toEqual([]);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("accepts a precomputed vector without calling the provider", async () => {
      expect.assertions(2);

      mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });
      const vector = new Array<number>(1024).fill(0.5);

      await new Search(globalSearchIndex).run({ vector });

      expect(mockedSearchVectorsCommand.mock.calls).toEqual([
        [
          {
            TableName: "search-table",
            IndexName: "global-search-index",
            SearchVector: vector,
            TopK: 10
          }
        ]
      ]);
      expect(mockEmbeddingProviderCalls).toEqual([]);
    });

    it.each([
      [[] as number[], 0],
      [[0.1, 0.2], 2]
    ])(
      "rejects a precomputed vector of the wrong dimensions (%#)",
      async (vector, length) => {
        expect.assertions(3);

        try {
          await new Search(globalSearchIndex).run({ vector });
        } catch (e: any) {
          expect(e).toBeInstanceOf(ValidationError);
          expect(e.message).toEqual(
            `Search vector has ${length} dimensions; vector index global-search-index requires 1024 dimensions`
          );
        }
        expect(mockSend).not.toHaveBeenCalled();
      }
    );
  });

  describe("condition compilation", () => {
    it("compiles the HASH-only condition for a scoped index", async () => {
      expect.assertions(2);

      mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });

      await new Search(storeSearchIndex).run("hand thrown mugs", {
        scopeId: "123"
      });

      expect(mockEmbeddingProviderCalls).toEqual(["hand thrown mugs"]);
      expect(mockedSearchVectorsCommand.mock.calls).toEqual([
        [
          {
            TableName: "search-table",
            IndexName: "store-search-index",
            SearchVector: expectedTitanVector,
            TopK: 10,
            SearchConditionExpression: "#StoreId = :StoreId",
            ExpressionAttributeNames: { "#StoreId": "StoreId" },
            ExpressionAttributeValues: { ":StoreId": "123" }
          }
        ]
      ]);
    });

    it("adds the entity type predicate for the in option", async () => {
      expect.assertions(1);

      mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });

      await new Search(storeSearchIndex).run("hand thrown mugs", {
        scopeId: "123",
        in: "Listing"
      });

      expect(mockedSearchVectorsCommand.mock.calls).toEqual([
        [
          {
            TableName: "search-table",
            IndexName: "store-search-index",
            SearchVector: expectedTitanVector,
            TopK: 10,
            SearchConditionExpression: "#StoreId = :StoreId AND #Type = :Type",
            ExpressionAttributeNames: {
              "#StoreId": "StoreId",
              "#Type": "Type"
            },
            ExpressionAttributeValues: { ":StoreId": "123", ":Type": "Listing" }
          }
        ]
      ]);
    });

    it("merges equality filters into the single condition expression", async () => {
      expect.assertions(1);

      mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });

      await new Search(storeSearchIndex).run("hand thrown mugs", {
        scopeId: "123",
        in: "Listing",
        filter: { category: "Mugs" }
      });

      expect(mockedSearchVectorsCommand.mock.calls).toEqual([
        [
          {
            TableName: "search-table",
            IndexName: "store-search-index",
            SearchVector: expectedTitanVector,
            TopK: 10,
            SearchConditionExpression:
              "#StoreId = :StoreId AND #Type = :Type AND #Category = :Category1",
            ExpressionAttributeNames: {
              "#StoreId": "StoreId",
              "#Type": "Type",
              "#Category": "Category"
            },
            ExpressionAttributeValues: {
              ":StoreId": "123",
              ":Type": "Listing",
              ":Category1": "Mugs"
            }
          }
        ]
      ]);
    });

    it("omits the condition entirely for an unconditioned unscoped search", async () => {
      expect.assertions(1);

      mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });

      await new Search(globalSearchIndex).run("fresh articles");

      expect(mockedSearchVectorsCommand.mock.calls).toEqual([
        [
          {
            TableName: "search-table",
            IndexName: "global-search-index",
            SearchVector: new Array<number>(1024).fill(0.7),
            TopK: 10
          }
        ]
      ]);
    });

    it("compiles only the type predicate when narrowing an unscoped index", async () => {
      expect.assertions(1);

      mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });

      await new Search(globalSearchIndex).run("fresh articles", {
        in: "Article"
      });

      expect(mockedSearchVectorsCommand.mock.calls).toEqual([
        [
          {
            TableName: "search-table",
            IndexName: "global-search-index",
            SearchVector: new Array<number>(1024).fill(0.7),
            TopK: 10,
            SearchConditionExpression: "#Type = :Type",
            ExpressionAttributeNames: { "#Type": "Type" },
            ExpressionAttributeValues: { ":Type": "Article" }
          }
        ]
      ]);
    });

    it("compiles an empty filter to no added condition", async () => {
      expect.assertions(1);

      mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });

      await new Search(storeSearchIndex).run("mugs", {
        scopeId: "123",
        filter: {}
      });

      expect(mockedSearchVectorsCommand.mock.calls).toEqual([
        [
          {
            TableName: "search-table",
            IndexName: "store-search-index",
            SearchVector: expectedTitanVector,
            TopK: 10,
            SearchConditionExpression: "#StoreId = :StoreId",
            ExpressionAttributeNames: { "#StoreId": "StoreId" },
            ExpressionAttributeValues: { ":StoreId": "123" }
          }
        ]
      ]);
    });

    it("rejects an in option naming a non-member entity", async () => {
      expect.assertions(3);

      try {
        await new Search(storeSearchIndex).run("mugs", {
          scopeId: "123",
          in: "Article"
        });
      } catch (e: any) {
        expect(e).toBeInstanceOf(ValidationError);
        expect(e.message).toEqual(
          'Invalid search option in: "Article" is not a member of vector index store-search-index. Members are: Listing, Review'
        );
      }
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe("untrusted filter input is rejected before any AWS call", () => {
    it.each([
      [
        "$or blocks",
        { $or: [{ category: "Mugs" }] },
        "$or conditions are not supported in search filters"
      ],
      [
        "IN arrays",
        { category: ["Mugs", "Bowls"] },
        'IN conditions (array values) are not supported in search filters. Attribute "category" has an array value'
      ]
    ])("rejects %s", async (_label, filter, message) => {
      expect.assertions(3);

      try {
        await new Search(storeSearchIndex).run("mugs", {
          scopeId: "123",
          filter: filter as unknown as SearchFilter
        });
      } catch (e: any) {
        expect(e).toBeInstanceOf(FilterError);
        expect(e.message).toEqual(message);
      }
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("rejects operator objects", async () => {
      expect.assertions(2);

      try {
        await new Search(storeSearchIndex).run("mugs", {
          scopeId: "123",
          filter: {
            category: { $beginsWith: "Mu" }
          } as unknown as SearchFilter
        });
      } catch (e: any) {
        expect(e).toBeInstanceOf(FilterError);
      }
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe("result mapping", () => {
    it("hydrates results into typed entities, preserving response order", async () => {
      expect.assertions(6);

      // Vector indexes are provisioned with projection ALL, so real responses
      // carry the vector attribute — hydration must drop it
      mockSearchVectors.mockResolvedValueOnce({
        SearchResults: [
          {
            Item: {
              PK: "Listing#456",
              SK: "Listing",
              Id: "456",
              Type: "Listing",
              Description: "Hand thrown ceramic mug",
              Category: "Mugs",
              StoreId: "123",
              CreatedAt: "2023-10-01T00:00:00.000Z",
              UpdatedAt: "2023-10-02T00:00:00.000Z",
              __dyna_vector: [0.1, 0.2, 0.3]
            },
            Score: 0.2
          },
          {
            Item: {
              PK: "Review#789",
              SK: "Review",
              Id: "789",
              Type: "Review",
              Body: "Beautiful glaze",
              StoreId: "123",
              CreatedAt: "2023-10-03T00:00:00.000Z",
              UpdatedAt: "2023-10-04T00:00:00.000Z",
              __dyna_vector: [0.4, 0.5, 0.6]
            },
            Score: 0.5
          }
        ]
      });

      const res = await new Search(storeSearchIndex).run("mug", {
        scopeId: "123"
      });

      expect(res).toHaveLength(2);
      expect(res[0].entity).toBeInstanceOf(Listing);
      expect(res[1].entity).toBeInstanceOf(Review);
      // COSINE: similarity = 1 - score; the raw score stays accessible
      expect(res.map(r => r.similarity)).toEqual([0.8, 0.5]);
      expect(res.map(r => r.score)).toEqual([0.2, 0.5]);
      expect(res[0].entity).not.toHaveProperty("__dyna_vector");
    });

    it("returns an empty array when the response carries no results", async () => {
      expect.assertions(1);

      mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });

      await expect(
        new Search(globalSearchIndex).run("articles")
      ).resolves.toEqual([]);
    });

    it("rejects a result missing Item or Score", async () => {
      expect.assertions(2);

      mockSearchVectors.mockResolvedValueOnce({
        SearchResults: [{ Score: 0.2 }]
      });

      try {
        await new Search(globalSearchIndex).run("articles");
      } catch (e: any) {
        expect(e).toBeInstanceOf(Error);
        expect(e.message).toEqual(
          "Malformed search result. Missing item or score"
        );
      }
    });

    it("lets AWS errors surface unchanged", async () => {
      expect.assertions(1);

      const awsError = new Error("ProvisionedThroughputExceededException");
      mockSearchVectors.mockRejectedValueOnce(awsError);

      await expect(new Search(globalSearchIndex).run("articles")).rejects.toBe(
        awsError
      );
    });
  });
});
