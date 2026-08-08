import DynaRecord from "../../index.js";
import {
  GetCommand,
  QueryCommand,
  SearchVectorsCommand
} from "@aws-sdk/lib-dynamodb";
import {
  Listing,
  Review,
  Store,
  mockEmbeddingProviderCalls,
  globalSearchIndex,
  storeSearchIndex
} from "./mockModels.js";
import {
  BelongsTo,
  Entity,
  ForeignKeyAttribute,
  HasMany,
  PartitionKeyAttribute,
  Searchable,
  SearchFilterable,
  SortKeyAttribute,
  StringAttribute,
  Table
} from "../../src/decorators/index.js";
import { TitanTextEmbedV2 } from "../../src/embedding/types.js";
import { Search } from "../../src/operations/index.js";
import { type SearchFilter } from "../../src/filter-utils/index.js";
import {
  EmbeddingError,
  FilterError,
  ValidationError
} from "../../src/errors.js";
import type {
  ForeignKey,
  PartitionKey,
  SortKey,
  Searchable as SearchableText,
  SearchFilterable as SearchFilterableText
} from "../../src/types.js";

const mockedSearchVectorsCommand = vi.mocked(SearchVectorsCommand);
const mockedGetCommand = vi.mocked(GetCommand);
const mockedQueryCommand = vi.mocked(QueryCommand);

const mockSend = vi.fn();
const mockSearchVectors = vi.fn();
const mockGet = vi.fn();
const mockQuery = vi.fn();

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

            if (command.name === "GetCommand") {
              return await Promise.resolve(mockGet());
            }

            if (command.name === "QueryCommand") {
              return await Promise.resolve(mockQuery());
            }

            if (command.name === "TransactWriteCommand") {
              return await Promise.resolve(
                "TransactWriteCommand-mock-response"
              );
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

// A scoped index whose member declares the scoping foreign key as
// @SearchFilterable — exercises the scope-filter guard
@Table({
  name: "scoped-filter-table",
  defaultFields: {
    id: { alias: "Id" },
    type: { alias: "Type" },
    createdAt: { alias: "CreatedAt" },
    updatedAt: { alias: "UpdatedAt" }
  }
})
abstract class ScopedFilterTable extends DynaRecord {
  @PartitionKeyAttribute({ alias: "PK" })
  public readonly pk: PartitionKey;

  @SortKeyAttribute({ alias: "SK" })
  public readonly sk: SortKey;
}

@Entity
class ScopedShop extends ScopedFilterTable {
  declare readonly type: "ScopedShop";

  @StringAttribute({ alias: "Name" })
  public readonly name: string;

  @HasMany(() => ScopedProduct, { foreignKey: "shopId" })
  public readonly products: ScopedProduct[];
}

@Entity
class ScopedProduct extends ScopedFilterTable {
  declare readonly type: "ScopedProduct";

  @Searchable()
  @StringAttribute({ alias: "Description" })
  public readonly description: SearchableText;

  @SearchFilterable()
  @ForeignKeyAttribute(() => ScopedShop, { alias: "ShopId" })
  public readonly shopId: SearchFilterableText<ForeignKey<ScopedShop>>;

  @BelongsTo(() => ScopedShop, { foreignKey: "shopId" })
  public readonly shop: ScopedShop;
}

const mockScopedEmbed = vi.fn();

const scopedFilterIndex = ScopedFilterTable.vectorIndex({
  name: "scoped-filter-index",
  model: TitanTextEmbedV2,
  provider: async text => await mockScopedEmbed(text),
  scopedBy: () => ScopedShop
});

describe("Search", () => {
  const expectedTitanVector = new Array<number>(1024).fill(0.1);

  afterEach(() => {
    vi.clearAllMocks();
    mockEmbeddingProviderCalls.length = 0;
  });

  it("searches a scoped index with query text: embeds through the provider and compiles the HASH-only condition", async () => {
    expect.assertions(4);

    mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });

    const res = await new Search(storeSearchIndex).run("hand thrown mugs", {
      scopeId: "123"
    });

    expect(res).toEqual([]);
    expect(mockEmbeddingProviderCalls).toEqual(["hand thrown mugs"]);
    expect(mockSend.mock.calls).toEqual([[{ name: "SearchVectorsCommand" }]]);
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

  it("narrows the search to a single member entity with the in option", async () => {
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
          ExpressionAttributeValues: {
            ":StoreId": "123",
            ":Type": "Listing"
          }
        }
      ]
    ]);
  });

  it("merges equality filters into the search's single condition expression", async () => {
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

  it("searches a global index with no condition expression at all", async () => {
    expect.assertions(1);

    mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });

    await new Search(globalSearchIndex).run("fresh articles");

    expect(mockedSearchVectorsCommand.mock.calls).toEqual([
      [
        {
          TableName: "search-table",
          IndexName: "global-search-index",
          SearchVector: expectedTitanVector,
          TopK: 10
        }
      ]
    ]);
  });

  it("compiles only the type predicate when narrowing a global index", async () => {
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
          SearchVector: expectedTitanVector,
          TopK: 10,
          SearchConditionExpression: "#Type = :Type",
          ExpressionAttributeNames: { "#Type": "Type" },
          ExpressionAttributeValues: { ":Type": "Article" }
        }
      ]
    ]);
  });

  it("hydrates results into typed entity instances with similarity and the raw score, preserving response order", async () => {
    expect.assertions(7);

    const listingItem = {
      PK: "Listing#456",
      SK: "Listing",
      Id: "456",
      Type: "Listing",
      Description: "Hand thrown ceramic mug",
      Category: "Mugs",
      StoreId: "123",
      __dyna_vector_hash: "listing-content-hash",
      CreatedAt: "2023-10-01T00:00:00.000Z",
      UpdatedAt: "2023-10-02T00:00:00.000Z"
    };

    const reviewItem = {
      PK: "Review#789",
      SK: "Review",
      Id: "789",
      Type: "Review",
      Body: "Beautiful glaze, sturdy handle",
      StoreId: "123",
      __dyna_vector_hash: "review-content-hash",
      CreatedAt: "2023-10-03T00:00:00.000Z",
      UpdatedAt: "2023-10-04T00:00:00.000Z"
    };

    mockSearchVectors.mockResolvedValueOnce({
      SearchResults: [
        { Item: listingItem, Score: 0.2 },
        { Item: reviewItem, Score: 0.5 }
      ]
    });

    const res = await new Search(storeSearchIndex).run("mug", {
      scopeId: "123"
    });

    expect(res).toHaveLength(2);
    expect(res[0].entity).toBeInstanceOf(Listing);
    expect(res[1].entity).toBeInstanceOf(Review);
    expect(res[0].entity).toEqual({
      pk: "Listing#456",
      sk: "Listing",
      id: "456",
      type: "Listing",
      description: "Hand thrown ceramic mug",
      category: "Mugs",
      storeId: "123",
      __dyna_vector_hash: "listing-content-hash",
      createdAt: new Date("2023-10-01T00:00:00.000Z"),
      updatedAt: new Date("2023-10-02T00:00:00.000Z")
    });
    expect(res[1].entity).toEqual({
      pk: "Review#789",
      sk: "Review",
      id: "789",
      type: "Review",
      body: "Beautiful glaze, sturdy handle",
      storeId: "123",
      __dyna_vector_hash: "review-content-hash",
      createdAt: new Date("2023-10-03T00:00:00.000Z"),
      updatedAt: new Date("2023-10-04T00:00:00.000Z")
    });
    // COSINE: similarity = 1 - score; the raw score stays accessible
    expect(res.map(r => r.similarity)).toEqual([0.8, 0.5]);
    expect(res.map(r => r.score)).toEqual([0.2, 0.5]);
  });

  it("accepts a precomputed vector without calling the provider", async () => {
    expect.assertions(3);

    mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });

    const vector = new Array<number>(1024).fill(0.25);
    await new Search(globalSearchIndex).run({ vector });

    expect(mockEmbeddingProviderCalls).toEqual([]);
    expect(mockSend.mock.calls).toEqual([[{ name: "SearchVectorsCommand" }]]);
    expect(mockedSearchVectorsCommand).toHaveBeenCalledWith(
      expect.objectContaining({ SearchVector: vector })
    );
  });

  it("rejects a precomputed vector with the wrong dimensions before any AWS call", async () => {
    expect.assertions(3);

    try {
      await new Search(globalSearchIndex).run({ vector: [0.1, 0.2] });
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual(
        "Search vector has 2 dimensions; vector index global-search-index requires 1024 dimensions"
      );
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("rejects empty query text before calling the provider", async () => {
    expect.assertions(3);

    try {
      await new Search(globalSearchIndex).run("");
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual("Search query text cannot be empty");
    }
    expect(mockEmbeddingProviderCalls).toEqual([]);
  });

  it("wraps provider failures during query embedding in EmbeddingError", async () => {
    expect.assertions(4);

    const providerError = new Error("bedrock unavailable");
    mockScopedEmbed.mockRejectedValueOnce(providerError);

    try {
      await new Search(scopedFilterIndex).run("products", { scopeId: "123" });
    } catch (e: any) {
      expect(e).toBeInstanceOf(EmbeddingError);
      expect(e.message).toEqual(
        "Embedding failed for the search query via the amazon.titan-embed-text-v2:0 provider on vector index scoped-filter-index"
      );
      expect(e.cause).toEqual(providerError);
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("defaults topK to 10 and passes an explicit topK through", async () => {
    expect.assertions(1);

    mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });

    await new Search(globalSearchIndex).run("articles", { topK: 100 });

    expect(mockedSearchVectorsCommand).toHaveBeenCalledWith(
      expect.objectContaining({ TopK: 100 })
    );
  });

  it.each([0, -1, 101, 1.5])(
    "rejects invalid topK %p before any AWS call",
    async invalidTopK => {
      expect.assertions(3);

      try {
        await new Search(globalSearchIndex).run("articles", {
          topK: invalidTopK
        });
      } catch (e: any) {
        expect(e).toBeInstanceOf(ValidationError);
        expect(e.message).toEqual(
          `topK must be an integer between 1 and 100. Received: ${invalidTopK}`
        );
      }
      expect(mockSend).not.toHaveBeenCalled();
    }
  );

  it("requires a scope id when searching a scoped index", async () => {
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

  it("rejects a scope id on a global index", async () => {
    expect.assertions(3);

    try {
      await new Search(globalSearchIndex).run("articles", { scopeId: "123" });
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual(
        "Vector index global-search-index is global — it does not take a scope id"
      );
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("rejects an in option naming an entity that is not a member of the index", async () => {
    expect.assertions(3);

    try {
      // Article is searchable but not a member of the store-scoped index
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

  describe("untrusted filter input is rejected before any AWS call", () => {
    it("rejects $or blocks", async () => {
      expect.assertions(3);

      try {
        await new Search(storeSearchIndex).run("mugs", {
          scopeId: "123",
          filter: {
            $or: [{ category: "Mugs" }]
          } as unknown as SearchFilter
        });
      } catch (e: any) {
        expect(e).toBeInstanceOf(FilterError);
        expect(e.message).toEqual(
          "$or conditions are not supported in search filters"
        );
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

    it("rejects IN arrays", async () => {
      expect.assertions(3);

      try {
        await new Search(storeSearchIndex).run("mugs", {
          scopeId: "123",
          filter: {
            category: ["Mugs", "Bowls"]
          } as unknown as SearchFilter
        });
      } catch (e: any) {
        expect(e).toBeInstanceOf(FilterError);
        expect(e.message).toEqual(
          'IN conditions (array values) are not supported in search filters. Attribute "category" has an array value'
        );
      }
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("rejects unknown filter keys", async () => {
      expect.assertions(3);

      try {
        await new Search(storeSearchIndex).run("mugs", {
          scopeId: "123",
          filter: { unknownAttr: "value" }
        });
      } catch (e: any) {
        expect(e).toBeInstanceOf(FilterError);
        expect(e.message).toEqual(
          'Invalid search filter key "unknownAttr": attribute "unknownAttr" is not declared @SearchFilterable on the members of vector index store-search-index. Filterable attributes are: category'
        );
      }
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("rejects the type discriminator as a filter key", async () => {
      expect.assertions(2);

      try {
        await new Search(storeSearchIndex).run("mugs", {
          scopeId: "123",
          filter: { type: "Listing" } as unknown as SearchFilter
        });
      } catch (e: any) {
        expect(e).toBeInstanceOf(FilterError);
      }
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("rejects a filter on the index's scoping foreign key", async () => {
      expect.assertions(3);

      try {
        await new Search(scopedFilterIndex).run("products", {
          scopeId: "123",
          filter: { shopId: "456" }
        });
      } catch (e: any) {
        expect(e).toBeInstanceOf(FilterError);
        expect(e.message).toEqual(
          'Invalid search filter key "shopId": attribute "shopId" is the scope of vector index scoped-filter-index and is already constrained by the search\'s scope id'
        );
      }
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  it("lets AWS errors surface unchanged", async () => {
    expect.assertions(1);

    const awsError = new Error(
      "Vector search is only supported on tables with on-demand capacity mode"
    );
    mockSearchVectors.mockRejectedValueOnce(awsError);

    await expect(
      new Search(globalSearchIndex).run("articles")
    ).rejects.toBe(awsError);
  });

  describe("ordinary reads exclude the vector through the union-of-aliases projection", () => {
    const expectedProjectionNames = {
      "#__dyna_vector_hash": "__dyna_vector_hash",
      "#Body": "Body",
      "#Category": "Category",
      "#Content": "Content",
      "#CreatedAt": "CreatedAt",
      "#Description": "Description",
      "#Id": "Id",
      "#Name": "Name",
      "#PK": "PK",
      "#SK": "SK",
      "#StoreId": "StoreId",
      "#Title": "Title",
      "#Type": "Type",
      "#UpdatedAt": "UpdatedAt"
    };

    const expectedProjectionExpression =
      "#__dyna_vector_hash, #Body, #Category, #Content, #CreatedAt, #Description, #Id, #Name, #PK, #SK, #StoreId, #Title, #Type, #UpdatedAt";

    it("findById on a vector-indexed table projects every alias except the vector", async () => {
      expect.assertions(1);

      mockGet.mockResolvedValueOnce({
        Item: {
          PK: "Store#123",
          SK: "Store",
          Id: "123",
          Type: "Store",
          Name: "Mock Store",
          CreatedAt: "2023-10-01T00:00:00.000Z",
          UpdatedAt: "2023-10-02T00:00:00.000Z"
        }
      });

      await Store.findById("123");

      expect(mockedGetCommand.mock.calls).toEqual([
        [
          {
            TableName: "search-table",
            Key: { PK: "Store#123", SK: "Store" },
            ProjectionExpression: expectedProjectionExpression,
            ExpressionAttributeNames: expectedProjectionNames,
            ConsistentRead: false
          }
        ]
      ]);
    });

    it("query on a vector-indexed table projects every alias except the vector", async () => {
      expect.assertions(1);

      mockQuery.mockResolvedValueOnce({ Items: [] });

      await Listing.query("456");

      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "search-table",
            KeyConditionExpression: "#PK = :PK1",
            ExpressionAttributeNames: {
              ...expectedProjectionNames
            },
            ExpressionAttributeValues: { ":PK1": "Listing#456" },
            ProjectionExpression: expectedProjectionExpression,
            ConsistentRead: false
          }
        ]
      ]);
    });

    it("the update prefetch carries the projection, returning the stored content hash without the vector", async () => {
      expect.assertions(1);

      mockQuery.mockResolvedValueOnce({
        Items: [
          {
            PK: "Listing#456",
            SK: "Listing",
            Id: "456",
            Type: "Listing",
            Description: "Hand thrown ceramic mug",
            Category: "Mugs",
            StoreId: "123",
            __dyna_vector_hash: "stored-content-hash",
            CreatedAt: "2023-10-01T00:00:00.000Z",
            UpdatedAt: "2023-10-02T00:00:00.000Z"
          }
        ]
      });

      await Listing.update("456", { category: "Ceramics" });

      expect(mockedQueryCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ProjectionExpression: expectedProjectionExpression,
          ConsistentRead: true
        })
      );
    });
  });
});
