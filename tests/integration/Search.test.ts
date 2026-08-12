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
  mockEmbeddingProvider,
  mockEmbeddingProviderCalls,
  globalSearchIndex,
  storeSearchIndex
} from "./mockModels.js";
import {
  type SearchResult,
  type SearchResults
} from "../../src/operations/index.js";
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
import Metadata from "../../src/metadata/index.js";
import { Search } from "../../src/operations/index.js";
import { type SearchFilter } from "../../src/filter-utils/index.js";
import {
  EmbeddingError,
  FilterError,
  ValidationError
} from "../../src/errors.js";
import type {
  ForeignKey,
  NullableForeignKey,
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

  // A second searchable relationship, so the no-in result union spans
  // multiple entity types
  @HasMany(() => ScopedNote, { foreignKey: "shopId" })
  public readonly notes: ScopedNote[];

  // A relationship to a non-searchable entity — invalid as a search in: value
  @HasMany(() => ScopedSupplier, { foreignKey: "shopId" })
  public readonly suppliers: ScopedSupplier[];
}

@Entity
class ScopedNote extends ScopedFilterTable {
  declare readonly type: "ScopedNote";

  @Searchable()
  @StringAttribute({ alias: "NoteBody" })
  public readonly noteBody: SearchableText;

  @ForeignKeyAttribute(() => ScopedShop, { alias: "ShopId" })
  public readonly shopId: ForeignKey<ScopedShop>;

  @BelongsTo(() => ScopedShop, { foreignKey: "shopId" })
  public readonly shop: ScopedShop;
}

@Entity
class ScopedSupplier extends ScopedFilterTable {
  declare readonly type: "ScopedSupplier";

  @StringAttribute({ alias: "Name" })
  public readonly name: string;

  @ForeignKeyAttribute(() => ScopedShop, { alias: "ShopId" })
  public readonly shopId: ForeignKey<ScopedShop>;

  @BelongsTo(() => ScopedShop, { foreignKey: "shopId" })
  public readonly shop: ScopedShop;
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

  // Nullable filterable foreign key: the brand composes with the optional
  // form — the property stays optional; rows without a supplier simply never
  // match a supplier filter
  @SearchFilterable()
  @ForeignKeyAttribute(() => ScopedSupplier, {
    alias: "SupplierId",
    nullable: true
  })
  public readonly supplierId?: SearchFilterableText<
    NullableForeignKey<ScopedSupplier>
  >;

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

    it("rejects prototype-chain filter keys with the same guard as unknown keys", async () => {
      expect.assertions(3);

      try {
        await new Search(storeSearchIndex).run("mugs", {
          scopeId: "123",
          filter: { constructor: "x" } as unknown as SearchFilter
        });
      } catch (e: any) {
        expect(e).toBeInstanceOf(FilterError);
        expect(e.message).toEqual(
          'Invalid search filter key "constructor": attribute "constructor" is not declared @SearchFilterable on the members of vector index store-search-index. Filterable attributes are: category'
        );
      }
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("rejects a null filter value with a FilterError rather than a TypeError", async () => {
      expect.assertions(3);

      try {
        await new Search(storeSearchIndex).run("mugs", {
          scopeId: "123",
          filter: { category: null } as unknown as SearchFilter
        });
      } catch (e: any) {
        expect(e).toBeInstanceOf(FilterError);
        expect(e.message).toEqual(
          'Invalid filter value for attribute "category": the value does not match the attribute\'s type'
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

  describe("nullable filterable attributes", () => {
    it("registers a nullable filterable foreign key as an inline filter", () => {
      expect.assertions(2);

      expect(scopedFilterIndex.inlineFilterAliases).toContain("SupplierId");
      expect(
        Metadata.getEntity("ScopedProduct").searchFilterableAttributes.map(
          attrMeta => attrMeta.name
        )
      ).toContain("supplierId");
    });

    it("compiles a filter on a nullable filterable foreign key", async () => {
      expect.assertions(1);

      mockScopedEmbed.mockResolvedValueOnce(
        new Array<number>(1024).fill(0.1)
      );
      mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });

      await scopedFilterIndex.search("123", "products", {
        filter: { supplierId: "supplier-9" }
      });

      expect(mockedSearchVectorsCommand.mock.calls).toEqual([
        [
          {
            TableName: "scoped-filter-table",
            IndexName: "scoped-filter-index",
            SearchVector: new Array<number>(1024).fill(0.1),
            TopK: 10,
            SearchConditionExpression:
              "#ShopId = :ShopId AND #SupplierId = :SupplierId1",
            ExpressionAttributeNames: {
              "#ShopId": "ShopId",
              "#SupplierId": "SupplierId"
            },
            ExpressionAttributeValues: {
              ":ShopId": "123",
              ":SupplierId1": "supplier-9"
            }
          }
        ]
      ]);
    });
  });

  it("lets AWS errors surface unchanged", async () => {
    expect.assertions(1);

    const awsError = new Error(
      "Vector search is only supported on tables with on-demand capacity mode"
    );
    mockSearchVectors.mockRejectedValueOnce(awsError);

    await expect(new Search(globalSearchIndex).run("articles")).rejects.toBe(
      awsError
    );
  });

  describe("malformed SearchVectors responses are rejected with clear errors", () => {
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

    it("rejects an item whose entity type discriminator is missing or not a string", async () => {
      expect.assertions(2);

      mockSearchVectors.mockResolvedValueOnce({
        SearchResults: [
          {
            Item: {
              PK: "Article#1",
              SK: "Article",
              Id: "1",
              Type: 123, // non-string discriminator
              Title: "T"
            },
            Score: 0.2
          }
        ]
      });

      try {
        await new Search(globalSearchIndex).run("articles");
      } catch (e: any) {
        expect(e).toBeInstanceOf(Error);
        expect(e.message).toEqual(
          "Malformed data. Unable to infer entity type"
        );
      }
    });
  });

  describe("ordinary reads exclude the vector through the union-of-aliases projection", () => {
    const expectedProjectionNames = {
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
      "#Body, #Category, #Content, #CreatedAt, #Description, #Id, #Name, #PK, #SK, #StoreId, #Title, #Type, #UpdatedAt";

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

    it("the update prefetch carries the projection, returning the stored searchable value without the vector", async () => {
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

// A table whose parent scopes two vector indexes — the parent search surface
// is ambiguous and errors with guidance
@Table({
  name: "dual-index-table",
  defaultFields: {
    id: { alias: "Id" },
    type: { alias: "Type" },
    createdAt: { alias: "CreatedAt" },
    updatedAt: { alias: "UpdatedAt" }
  }
})
abstract class DualIndexTable extends DynaRecord {
  @PartitionKeyAttribute({ alias: "PK" })
  public readonly pk: PartitionKey;

  @SortKeyAttribute({ alias: "SK" })
  public readonly sk: SortKey;
}

@Entity
class DualParent extends DualIndexTable {
  declare readonly type: "DualParent";

  @StringAttribute({ alias: "Name" })
  public readonly name: string;

  @HasMany(() => DualChild, { foreignKey: "parentId" })
  public readonly children: DualChild[];
}

@Entity
class DualChild extends DualIndexTable {
  declare readonly type: "DualChild";

  @Searchable()
  @StringAttribute({ alias: "Body" })
  public readonly body: SearchableText;

  @ForeignKeyAttribute(() => DualParent, { alias: "ParentId" })
  public readonly parentId: ForeignKey<DualParent>;

  @BelongsTo(() => DualParent, { foreignKey: "parentId" })
  public readonly parent: DualParent;
}

DualIndexTable.vectorIndex({
  name: "dual-index-one",
  model: TitanTextEmbedV2,
  provider: mockEmbeddingProvider,
  scopedBy: () => DualParent
});

DualIndexTable.vectorIndex({
  name: "dual-index-two",
  model: TitanTextEmbedV2,
  provider: mockEmbeddingProvider,
  scopedBy: () => DualParent
});

describe("public search surfaces", () => {
  const expectedTitanVector = new Array<number>(1024).fill(0.1);

  afterEach(() => {
    vi.clearAllMocks();
    mockEmbeddingProviderCalls.length = 0;
  });

  it("static parent search compiles the scoped search through the parent's index", async () => {
    expect.assertions(3);

    mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });

    const results = await Store.search("123", "hand thrown mugs");

    expect(results).toEqual([]);
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

  it("static parent search maps the in relationship property to its entity type and merges filters", async () => {
    expect.assertions(1);

    mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });

    await Store.search("123", "mugs", {
      in: "listings",
      filter: { category: "Mugs" },
      topK: 25
    });

    expect(mockedSearchVectorsCommand.mock.calls).toEqual([
      [
        {
          TableName: "search-table",
          IndexName: "store-search-index",
          SearchVector: expectedTitanVector,
          TopK: 25,
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

  it("compiles an empty filter to no condition", async () => {
    expect.assertions(1);

    mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });

    await Store.search("123", "mugs", { filter: {} });

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

  it("treats explicitly-undefined filter values as no condition and omits their attribute names", async () => {
    expect.assertions(1);

    mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });

    await Store.search("123", "mugs", { filter: { category: undefined } });

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

  it("index construct search on a scoped index takes the scope id first and narrows by member entity name", async () => {
    expect.assertions(1);

    mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });

    // Review is an include: member — it has no relationship property on
    // Store, so the index construct is where it is searchable by name
    await storeSearchIndex.search("123", "sturdy handle", { in: "Review" });

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
            ":Type": "Review"
          }
        }
      ]
    ]);
  });

  it("index construct search on a global index takes the query first", async () => {
    expect.assertions(1);

    mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });

    await globalSearchIndex.search("fresh articles", { topK: 5 });

    expect(mockedSearchVectorsCommand.mock.calls).toEqual([
      [
        {
          TableName: "search-table",
          IndexName: "global-search-index",
          SearchVector: expectedTitanVector,
          TopK: 5
        }
      ]
    ]);
  });

  it("errors when searching a parent with no vector index scoped by it", async () => {
    expect.assertions(3);

    try {
      // @ts-expect-error: search is unavailable on parents without searchable relationships (AE6)
      await Listing.search("123", "anything");
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual(
        "Listing has no vector index scoped by it — search is unavailable. Define one with scopedBy: () => Listing"
      );
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("errors with guidance when the parent scopes more than one vector index", async () => {
    expect.assertions(3);

    try {
      await DualParent.search("123", "anything");
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual(
        "DualParent scopes more than one vector index (dual-index-one, dual-index-two) — the parent search surface is ambiguous. Search through the index construct instead: myIndex.search(...)"
      );
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("errors at runtime when in names a non-relationship (plain JS backstop)", async () => {
    expect.assertions(3);

    try {
      await Store.search("123", "mugs", { in: "unknown" as "listings" });
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual(
        'Invalid search option in: "unknown" is not a relationship of Store'
      );
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("errors when a scoped index construct is called with the global signature (plain JS backstop)", async () => {
    expect.assertions(3);

    try {
      // @ts-expect-error: a scoped index search takes the scope id first
      await storeSearchIndex.search("mugs");
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual(
        "Vector index store-search-index is scoped — search takes the scope id first: search(scopeId, query, options)"
      );
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("errors when a global index construct is called with the scoped signature (plain JS backstop)", async () => {
    expect.assertions(3);

    try {
      // @ts-expect-error: a global index takes no scope id
      await globalSearchIndex.search("123", "fresh articles");
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual(
        "Vector index global-search-index is global — it does not take a scope id: search(query, options)"
      );
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("errors at runtime when in is a prototype-chain key rather than an own relationship (plain JS backstop)", async () => {
    expect.assertions(3);

    try {
      await Store.search("123", "mugs", { in: "constructor" as "listings" });
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual(
        'Invalid search option in: "constructor" is not a relationship of Store'
      );
    }
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe("types", () => {
  it("in accepts only searchable relationship property names on the parent surfaces", () => {
    const _test = async (): Promise<void> => {
      // @ts-expect-no-error: searchable relationship name
      await Store.search("1", "q", { in: "listings" });

      // @ts-expect-error: suppliers targets a non-searchable entity
      await ScopedShop.search("1", "q", { in: "suppliers" });

      // @ts-expect-error: unknown relationship name
      await Store.search("1", "q", { in: "unknown" });

      // @ts-expect-error: the array form is reserved for future widening
      await Store.search("1", "q", { in: ["listings"] });
    };

    expect(_test).toBeDefined();
  });

  it("search is unavailable on parents without searchable relationships", () => {
    const _test = async (): Promise<void> => {
      // @ts-expect-error: Listing has no searchable relationships (AE6)
      await Listing.search("1", "q");
    };

    expect(_test).toBeDefined();
  });

  it("result unions infer from the searched relationships and index members", () => {
    const _test = async (): Promise<void> => {
      // Parent search results are exactly the searchable adjacency (Listing).
      // Include members (Review) are absent from parent-level unions — they
      // have no relationship property on the parent to infer from
      const results = await Store.search("1", "q");
      // @ts-expect-no-error: exactly the searchable adjacency
      const _parentExact: Array<SearchResult<Listing>> = results;
      // @ts-expect-error: Review is not part of the parent-level union
      const _parentNoReview: Array<SearchResult<Review>> = results;

      const narrowed = await Store.search("1", "q", { in: "listings" });
      // @ts-expect-no-error: narrowed to the relationship's target entity
      const _narrowedExact: Array<SearchResult<Listing>> = narrowed;

      // Index-construct results are the full member union — including the
      // include: member Review (AE4)
      const indexResults = await storeSearchIndex.search("1", "q");
      // @ts-expect-no-error: exact member union
      const _indexExact: Array<SearchResult<Listing> | SearchResult<Review>> =
        indexResults;
      // @ts-expect-error: NOT assignable to one member — the union is wider
      const _indexNotNarrowed: Array<SearchResult<Listing>> = indexResults;

      const reviews = await storeSearchIndex.search("1", "q", {
        in: "Review"
      });
      // @ts-expect-no-error: include members narrow like any other member
      const _reviewExact: Array<SearchResult<Review>> = reviews;
      // @ts-expect-error: narrowed away from Listing
      const _reviewNoListing: Array<SearchResult<Listing>> = reviews;

      // Global-construct results are the unnarrowed base type — the member
      // set is only known at runtime
      const everything = await globalSearchIndex.search("q");
      // @ts-expect-no-error: the base result type
      const _globalBase: SearchResults = everything;
      // @ts-expect-error: never silently narrowed to a specific entity
      const _globalNotNarrowed: Array<SearchResult<Listing>> = everything;
    };

    expect(_test).toBeDefined();
  });

  it("result unions widen across the parent's searchable relationships and narrow by in", () => {
    const _test = async (): Promise<void> => {
      // No in: the union spans every searchable relationship target
      const widened = await ScopedShop.search("1", "q");
      // @ts-expect-no-error: exactly the union of both searchable targets
      const _exact: Array<
        SearchResult<ScopedProduct> | SearchResult<ScopedNote>
      > = widened;
      // @ts-expect-error: NOT assignable to just ScopedProduct — the union is wider
      const _notJustProducts: Array<SearchResult<ScopedProduct>> = widened;
      // @ts-expect-error: NOT assignable to just ScopedNote — the union is wider
      const _notJustNotes: Array<SearchResult<ScopedNote>> = widened;

      // in: narrows the union to the one relationship's target
      const products = await ScopedShop.search("1", "q", { in: "products" });
      // @ts-expect-no-error: narrowed to ScopedProduct
      const _productsExact: Array<SearchResult<ScopedProduct>> = products;
      // @ts-expect-error: ScopedNote narrowed away
      const _productsNoNotes: Array<SearchResult<ScopedNote>> = products;

      const notes = await ScopedShop.search("1", "q", { in: "notes" });
      // @ts-expect-no-error: narrowed to ScopedNote
      const _notesExact: Array<SearchResult<ScopedNote>> = notes;
      // @ts-expect-error: ScopedProduct narrowed away
      const _notesNoProducts: Array<SearchResult<ScopedProduct>> = notes;
    };

    expect(_test).toBeDefined();
  });

  it("filter keys narrow to the searched entities' filterable attributes", () => {
    const _test = async (): Promise<void> => {
      // @ts-expect-no-error: category is @SearchFilterable on Listing
      await Store.search("1", "q", { filter: { category: "Mugs" } });

      // @ts-expect-error: description is searchable, not filterable
      await Store.search("1", "q", { filter: { description: "x" } });

      await Store.search("1", "q", {
        // @ts-expect-error: operator objects are not searchable filters
        filter: { category: { $beginsWith: "M" } }
      });

      // @ts-expect-error: $or is not supported in search filters
      await Store.search("1", "q", { filter: { $or: [{ category: "M" }] } });

      // @ts-expect-no-error: filterable foreign key equality
      await scopedFilterIndex.search("1", "q", { filter: { shopId: "5" } });

      // @ts-expect-no-error: NULLABLE filterable foreign key — the brand
      // composes with the optional form; the filter takes a defined value
      await scopedFilterIndex.search("1", "q", {
        filter: { supplierId: "s1" }
      });

      // @ts-expect-no-error: create input accepts a plain string for the
      // nullable filterable foreign key, and accepts omitting it entirely
      await ScopedProduct.create({
        description: "d",
        shopId: "1",
        supplierId: "s1"
      });
      await ScopedProduct.create({ description: "d", shopId: "1" });

      // @ts-expect-no-error: nullable filterables clear like any nullable
      await ScopedProduct.update("p1", { supplierId: null });
    };

    expect(_test).toBeDefined();
  });

  it("the query input is text or a vector, never both", () => {
    const _test = async (): Promise<void> => {
      // @ts-expect-no-error: precomputed vector input
      await globalSearchIndex.search({ vector: [1] });

      // @ts-expect-error: text and vector cannot be combined
      await globalSearchIndex.search({ vector: [1], text: "x" });
    };

    expect(_test).toBeDefined();
  });

  it("scoped index search requires the scope id first; global indexes take none", () => {
    const _test = async (): Promise<void> => {
      // @ts-expect-error: a scoped index search takes the scope id first
      await storeSearchIndex.search("q");

      // @ts-expect-no-error: scope id first on a scoped index
      await storeSearchIndex.search("id", "q");

      // @ts-expect-error: a global index takes no scope id
      await globalSearchIndex.search("id", "q");
    };

    expect(_test).toBeDefined();
  });

  it("index search in values are the index's member entity names", () => {
    const _test = async (): Promise<void> => {
      // @ts-expect-no-error: Listing is a member of the scoped index
      await storeSearchIndex.search("1", "q", { in: "Listing" });

      // @ts-expect-error: Article is not a member of the store-scoped index
      await storeSearchIndex.search("1", "q", { in: "Article" });
    };

    expect(_test).toBeDefined();
  });
});
