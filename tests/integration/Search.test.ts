import DynaRecord from "../../index.js";
import {
  GetCommand,
  QueryCommand,
  SearchVectorsCommand
} from "@aws-sdk/lib-dynamodb";
import {
  Article,
  Listing,
  Review,
  Store,
  mockEmbeddingProvider,
  mockEmbeddingProviderCalls,
  mockArticleEmbeddingProviderCalls,
  globalSearchIndex,
  storeSearchIndex
} from "./mockModels.js";
import { type SearchResult } from "../../src/operations/index.js";
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
import {
  TitanTextEmbedV2,
  TitanTextEmbedV2Dim512,
  type EmbeddingModelDescriptor
} from "../../src/embedding/types.js";
import Metadata from "../../src/metadata/index.js";
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

const { scopedFilterIndex } = ScopedFilterTable.vectorIndexes({
  scopedFilterIndex: {
    name: "scoped-filter-index",
    vectorAttribute: "__dyna_vector",
    model: TitanTextEmbedV2,
    provider: async (text: string) => await mockScopedEmbed(text),
    scopedBy: () => ScopedShop,
    members: [() => ScopedNote, () => ScopedProduct]
  }
});

// The article index declares its own provider, so its query embeds differ
const expectedArticleVector = new Array<number>(1024).fill(0.7);

describe("Search", () => {
  const expectedTitanVector = new Array<number>(1024).fill(0.1);

  afterEach(() => {
    vi.clearAllMocks();
    mockEmbeddingProviderCalls.length = 0;
    mockArticleEmbeddingProviderCalls.length = 0;
  });

  it("searches a scoped index with query text: embeds through the provider and compiles the HASH-only condition", async () => {
    expect.assertions(4);

    mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });

    const res = await storeSearchIndex.search("123", "hand thrown mugs");

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

    await storeSearchIndex.search("123", "hand thrown mugs", {
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

    await storeSearchIndex.search("123", "hand thrown mugs", {
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

  it("searches an unscoped index with no condition expression at all", async () => {
    expect.assertions(1);

    mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });

    await globalSearchIndex.search("fresh articles");

    expect(mockedSearchVectorsCommand.mock.calls).toEqual([
      [
        {
          TableName: "search-table",
          IndexName: "global-search-index",
          SearchVector: expectedArticleVector,
          TopK: 10
        }
      ]
    ]);
  });

  it("compiles only the type predicate when narrowing an unscoped index", async () => {
    expect.assertions(1);

    mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });

    await globalSearchIndex.search("fresh articles", {
      in: "Article"
    });

    expect(mockedSearchVectorsCommand.mock.calls).toEqual([
      [
        {
          TableName: "search-table",
          IndexName: "global-search-index",
          SearchVector: expectedArticleVector,
          TopK: 10,
          SearchConditionExpression: "#Type = :Type",
          ExpressionAttributeNames: { "#Type": "Type" },
          ExpressionAttributeValues: { ":Type": "Article" }
        }
      ]
    ]);
  });

  it("hydrates results into typed entity instances with similarity and the raw score, preserving response order", async () => {
    expect.assertions(9);

    // Vector indexes are provisioned with projection ALL and SearchVectors
    // takes no ProjectionExpression, so real responses carry the vector
    // attribute — hydration must drop it rather than surface it on the entity
    const listingItem = {
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
    };

    const reviewItem = {
      PK: "Review#789",
      SK: "Review",
      Id: "789",
      Type: "Review",
      Body: "Beautiful glaze, sturdy handle",
      StoreId: "123",
      CreatedAt: "2023-10-03T00:00:00.000Z",
      UpdatedAt: "2023-10-04T00:00:00.000Z",
      __dyna_vector: [0.4, 0.5, 0.6]
    };

    mockSearchVectors.mockResolvedValueOnce({
      SearchResults: [
        { Item: listingItem, Score: 0.2 },
        { Item: reviewItem, Score: 0.5 }
      ]
    });

    const res = await storeSearchIndex.search("123", "mug");

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
    // No vector attribute survives onto a hydrated entity, under any name
    res.forEach(({ entity }) => {
      expect(
        Object.keys(entity).filter(key => key.startsWith("__dyna_vector"))
      ).toEqual([]);
    });
    // COSINE: similarity = 1 - score; the raw score stays accessible
    expect(res.map(r => r.similarity)).toEqual([0.8, 0.5]);
    expect(res.map(r => r.score)).toEqual([0.2, 0.5]);
  });

  it("accepts a precomputed vector without calling the provider", async () => {
    expect.assertions(3);

    mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });

    const vector = new Array<number>(1024).fill(0.25);
    await globalSearchIndex.search({ vector });

    expect(mockEmbeddingProviderCalls).toEqual([]);
    expect(mockSend.mock.calls).toEqual([[{ name: "SearchVectorsCommand" }]]);
    expect(mockedSearchVectorsCommand).toHaveBeenCalledWith(
      expect.objectContaining({ SearchVector: vector })
    );
  });

  it("rejects a precomputed vector with the wrong dimensions before any AWS call", async () => {
    expect.assertions(3);

    try {
      await globalSearchIndex.search({ vector: [0.1, 0.2] });
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
      await globalSearchIndex.search("");
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
      await scopedFilterIndex.search("123", "products");
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

    await globalSearchIndex.search("articles", { topK: 100 });

    expect(mockedSearchVectorsCommand).toHaveBeenCalledWith(
      expect.objectContaining({ TopK: 100 })
    );
  });

  it.each([0, -1, 101, 1.5, NaN, Infinity, -Infinity])(
    "rejects invalid topK %p before any AWS call",
    async invalidTopK => {
      expect.assertions(3);

      try {
        await globalSearchIndex.search("articles", {
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

  it.each([1, 100])(
    "accepts topK %p — the inclusive bounds of the valid range",
    async validTopK => {
      expect.assertions(1);

      mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });

      await globalSearchIndex.search("articles", { topK: validTopK });

      expect(mockedSearchVectorsCommand.mock.calls).toEqual([
        [
          {
            TableName: "search-table",
            IndexName: "global-search-index",
            SearchVector: expectedArticleVector,
            TopK: validTopK
          }
        ]
      ]);
    }
  );

  it("rejects an empty precomputed vector before any AWS call", async () => {
    expect.assertions(3);

    try {
      await globalSearchIndex.search({ vector: [] });
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual(
        "Search vector has 0 dimensions; vector index global-search-index requires 1024 dimensions"
      );
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("accepts a precomputed vector of exactly the index's dimensions", async () => {
    expect.assertions(2);

    mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });
    const exact = new Array<number>(1024).fill(0.5);

    await globalSearchIndex.search({ vector: exact });

    expect(mockedSearchVectorsCommand.mock.calls).toEqual([
      [
        {
          TableName: "search-table",
          IndexName: "global-search-index",
          SearchVector: exact,
          TopK: 10
        }
      ]
    ]);
    expect(mockArticleEmbeddingProviderCalls).toEqual([]);
  });

  it("requires a non-empty scope id when searching a scoped index", async () => {
    expect.assertions(3);

    try {
      // An empty scope id satisfies the signature but not the search
      await storeSearchIndex.search("", "mugs");
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
      // @ts-expect-error: unscoped options carry no scopeId (plain JS backstop)
      await globalSearchIndex.search("articles", { scopeId: "123" });
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual(
        "Vector index global-search-index is unscoped — it does not take a scope id"
      );
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("keeps the positional scope value when options smuggle a scopeId (plain JS backstop)", async () => {
    expect.assertions(1);

    mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });

    await storeSearchIndex.search("tenant-a", "mugs", {
      // @ts-expect-error: options carry no scopeId, but an untyped caller can
      // still pass one — this pins that doing so cannot redirect the search
      scopeId: "tenant-b"
    });

    // The scoped HASH is the enforced isolation boundary: it is set from the
    // positional scope value and cannot be overridden through the options
    // object. Asserting the whole command, rather than matching parts of it,
    // is what proves "tenant-b" reaches no field at all
    expect(mockedSearchVectorsCommand.mock.calls).toEqual([
      [
        {
          TableName: "search-table",
          IndexName: "store-search-index",
          SearchVector: expectedTitanVector,
          TopK: 10,
          SearchConditionExpression: "#StoreId = :StoreId",
          ExpressionAttributeNames: { "#StoreId": "StoreId" },
          ExpressionAttributeValues: { ":StoreId": "tenant-a" }
        }
      ]
    ]);
  });

  it("cannot reach the other same-parent index's member through in: (negative leakage)", async () => {
    expect.assertions(6);

    // Positive direction is covered above; this asserts the boundary holds in
    // BOTH directions, so neither same-parent index can name the other's
    // member and quietly search the wrong corpus
    try {
      // @ts-expect-error: DualDoc belongs to dual-index-two
      await dualIndexOne.search("parent-1", "q", { in: "DualDoc" });
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual(
        'Invalid search option in: "DualDoc" is not a member of vector index dual-index-one. Members are: DualChild'
      );
    }

    try {
      // @ts-expect-error: DualChild belongs to dual-index-one
      await dualIndexTwo.search("parent-1", "q", { in: "DualChild" });
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual(
        'Invalid search option in: "DualChild" is not a member of vector index dual-index-two. Members are: DualDoc'
      );
    }

    expect(mockSend).not.toHaveBeenCalled();
    expect(mockedSearchVectorsCommand.mock.calls).toEqual([]);
  });

  it("rejects a non-string scope id on a scoped index (plain JS backstop)", async () => {
    expect.assertions(3);

    try {
      // The untyped path most likely to carry a tenant id straight from a
      // request body: it must fail closed rather than coerce
      // @ts-expect-error: the scope id is a string
      await storeSearchIndex.search(123, "mugs");
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual(
        "Vector index store-search-index is scoped — search takes the scope id first: search(scopeId, query, options)"
      );
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("rejects a third argument to an unscoped index (plain JS backstop)", async () => {
    expect.assertions(3);

    try {
      // The guard's second disjunct: an options object in the third position
      // means the caller used the scoped shape on an unscoped index
      // @ts-expect-error: an unscoped search takes no third argument
      await globalSearchIndex.search("articles", { topK: 5 }, { topK: 5 });
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual(
        "Vector index global-search-index is unscoped — it does not take a scope id: search(query, options)"
      );
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("rejects an in option naming an entity that is not a member of the index", async () => {
    expect.assertions(3);

    try {
      // Article is searchable but not a member of the store-scoped index
      await storeSearchIndex.search("123", "mugs", {
        // @ts-expect-error: compile-time rejection too; this is the JS backstop
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
        await storeSearchIndex.search("123", "mugs", {
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
        await storeSearchIndex.search("123", "mugs", {
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
        await storeSearchIndex.search("123", "mugs", {
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
        await storeSearchIndex.search("123", "mugs", {
          // @ts-expect-error: compile-time rejection too; this is the JS backstop
          filter: { unknownAttr: "value" }
        });
      } catch (e: any) {
        expect(e).toBeInstanceOf(FilterError);
        expect(e.message).toEqual(
          'Invalid search filter key "unknownAttr": attribute "unknownAttr" is not declared @SearchFilterable on the members of vector index store-search-index. Filterable attributes are: category, tier, rating'
        );
      }
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("rejects a real attribute that is not declared @SearchFilterable", async () => {
      expect.assertions(3);

      // Distinct from the unknown-key case above: `description` is a genuine
      // attribute on Listing, carrying @Searchable. The resolver builds its
      // map from searchFilterableAttributes alone, so existing on the entity
      // is not enough — and this asserts the search path is wired to that
      // resolver, which the resolver's own unit tests cannot show.
      try {
        await storeSearchIndex.search("123", "mugs", {
          // @ts-expect-error: compile-time rejection too; this is the JS backstop
          filter: { description: "text" }
        });
      } catch (e: any) {
        expect(e).toBeInstanceOf(FilterError);
        expect(e.message).toEqual(
          'Invalid search filter key "description": attribute "description" is not declared @SearchFilterable on the members of vector index store-search-index. Filterable attributes are: category, tier, rating'
        );
      }
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("rejects prototype-chain filter keys with the same guard as unknown keys", async () => {
      expect.assertions(3);

      try {
        await storeSearchIndex.search("123", "mugs", {
          filter: { constructor: "x" } as unknown as SearchFilter
        });
      } catch (e: any) {
        expect(e).toBeInstanceOf(FilterError);
        expect(e.message).toEqual(
          'Invalid search filter key "constructor": attribute "constructor" is not declared @SearchFilterable on the members of vector index store-search-index. Filterable attributes are: category, tier, rating'
        );
      }
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("rejects a null filter value with a FilterError rather than a TypeError", async () => {
      expect.assertions(3);

      try {
        await storeSearchIndex.search("123", "mugs", {
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
        await storeSearchIndex.search("123", "mugs", {
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
        await scopedFilterIndex.search("123", "products", {
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

      mockScopedEmbed.mockResolvedValueOnce(new Array<number>(1024).fill(0.1));
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

    await expect(globalSearchIndex.search("articles")).rejects.toBe(awsError);
  });

  describe("malformed SearchVectors responses are rejected with clear errors", () => {
    it("rejects a result missing Item or Score", async () => {
      expect.assertions(2);

      mockSearchVectors.mockResolvedValueOnce({
        SearchResults: [{ Score: 0.2 }]
      });

      try {
        await globalSearchIndex.search("articles");
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
        await globalSearchIndex.search("articles");
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
      "#Rating": "Rating",
      "#SK": "SK",
      "#StoreId": "StoreId",
      "#Tier": "Tier",
      "#Title": "Title",
      "#Type": "Type",
      "#UpdatedAt": "UpdatedAt"
    };

    const expectedProjectionExpression =
      "#Body, #Category, #Content, #CreatedAt, #Description, #Id, #Name, #PK, #Rating, #SK, #StoreId, #Tier, #Title, #Type, #UpdatedAt";

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

// Second corpus so the two same-parent indexes stay disjoint under the
// one-owner rule
@Entity
class DualDoc extends DualIndexTable {
  declare readonly type: "DualDoc";

  @Searchable()
  @StringAttribute({ alias: "DocBody" })
  public readonly docBody: SearchableText;

  @ForeignKeyAttribute(() => DualParent, { alias: "ParentId" })
  public readonly parentId: ForeignKey<DualParent>;
}

/**
 * The doc index's own provider — the two same-parent indexes deliberately
 * differ in model and provider so per-index embedding is observable
 */
const mockDualDocEmbed = vi.fn(
  async (_text: string): Promise<number[]> =>
    await Promise.resolve(
      new Array<number>(TitanTextEmbedV2Dim512.dimensions).fill(0.2)
    )
);

/**
 * The doc index's model: same dimensions as the Titan 512 variant, but a
 * different distance function AND a different score conversion, so a search
 * through this index cannot silently borrow the other index's model
 */
const DualDocModel = {
  name: "dual-doc-euclidean-512",
  dimensions: TitanTextEmbedV2Dim512.dimensions,
  distanceFunction: "EUCLIDEAN",
  scoreToSimilarity: (score: number) => 1 / (1 + score)
} as const satisfies EmbeddingModelDescriptor;

const { dualIndexOne, dualIndexTwo } = DualIndexTable.vectorIndexes({
  dualIndexOne: {
    name: "dual-index-one",
    vectorAttribute: "__dyna_vector",
    model: TitanTextEmbedV2,
    provider: mockEmbeddingProvider,
    scopedBy: () => DualParent,
    members: [() => DualChild]
  },
  dualIndexTwo: {
    name: "dual-index-two",
    vectorAttribute: "__dyna_vector_two",
    model: DualDocModel,
    provider: mockDualDocEmbed,
    scopedBy: () => DualParent,
    members: [() => DualDoc]
  }
});

describe("public search surfaces", () => {
  const expectedTitanVector = new Array<number>(1024).fill(0.1);

  afterEach(() => {
    vi.clearAllMocks();
    mockEmbeddingProviderCalls.length = 0;
  });

  it("a scoped index compiles the scope value into the search condition", async () => {
    expect.assertions(3);

    mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });

    const results = await storeSearchIndex.search("123", "hand thrown mugs");

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

  it("merges the scope value, the in type predicate, and filters into one condition", async () => {
    expect.assertions(1);

    mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });

    await storeSearchIndex.search("123", "mugs", {
      in: "Listing",
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

    await storeSearchIndex.search("123", "mugs", { filter: {} });

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

    await storeSearchIndex.search("123", "mugs", {
      filter: { category: undefined }
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

  it("index construct search on an unscoped index takes the query first", async () => {
    expect.assertions(1);

    mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });

    await globalSearchIndex.search("fresh articles", { topK: 5 });

    expect(mockedSearchVectorsCommand.mock.calls).toEqual([
      [
        {
          TableName: "search-table",
          IndexName: "global-search-index",
          SearchVector: expectedArticleVector,
          TopK: 5
        }
      ]
    ]);
  });

  it("disjoint same-parent indexes each search their own IndexName over the shared scope value", async () => {
    expect.assertions(3);

    mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });
    mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });

    await dualIndexOne.search("parent-1", "spare parts");
    await dualIndexTwo.search("parent-1", "assembly guide");

    // Each index embeds through its own provider and model
    expect(mockEmbeddingProviderCalls).toEqual(["spare parts"]);
    expect(mockDualDocEmbed.mock.calls).toEqual([["assembly guide"]]);

    expect(mockedSearchVectorsCommand.mock.calls).toEqual([
      [
        {
          TableName: "dual-index-table",
          IndexName: "dual-index-one",
          SearchVector: expectedTitanVector,
          TopK: 10,
          SearchConditionExpression: "#ParentId = :ParentId",
          ExpressionAttributeNames: { "#ParentId": "ParentId" },
          ExpressionAttributeValues: { ":ParentId": "parent-1" }
        }
      ],
      [
        {
          TableName: "dual-index-table",
          IndexName: "dual-index-two",
          SearchVector: new Array<number>(512).fill(0.2),
          TopK: 10,
          SearchConditionExpression: "#ParentId = :ParentId",
          ExpressionAttributeNames: { "#ParentId": "ParentId" },
          ExpressionAttributeValues: { ":ParentId": "parent-1" }
        }
      ]
    ]);
  });

  it("validates a precomputed vector against the invoked index's dimensions when same-table indexes differ", async () => {
    expect.assertions(4);

    // 1024 dimensions satisfies index one but not index two
    const titanSizedVector = new Array<number>(1024).fill(0.25);

    mockSearchVectors.mockResolvedValueOnce({ SearchResults: [] });
    await dualIndexOne.search("parent-1", { vector: titanSizedVector });
    expect(mockedSearchVectorsCommand.mock.calls).toEqual([
      [
        {
          TableName: "dual-index-table",
          IndexName: "dual-index-one",
          SearchVector: titanSizedVector,
          TopK: 10,
          SearchConditionExpression: "#ParentId = :ParentId",
          ExpressionAttributeNames: { "#ParentId": "ParentId" },
          ExpressionAttributeValues: { ":ParentId": "parent-1" }
        }
      ]
    ]);

    try {
      await dualIndexTwo.search("parent-1", { vector: titanSizedVector });
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual(
        "Search vector has 1024 dimensions; vector index dual-index-two requires 512 dimensions"
      );
    }
    // Neither index's provider is consulted for precomputed vectors
    expect(mockDualDocEmbed).not.toHaveBeenCalled();
  });

  it("converts score to similarity with the INVOKED index's model, not a sibling index's", async () => {
    expect.assertions(4);

    // dualIndexOne is COSINE (1 - score); dualIndexTwo is EUCLIDEAN
    // (1 / (1 + score)). The same raw score must convert differently.
    const docItem = {
      PK: "DualDoc#1",
      SK: "DualDoc",
      Id: "1",
      Type: "DualDoc",
      DocBody: "assembly guide",
      ParentId: "parent-1",
      CreatedAt: "2023-10-01T00:00:00.000Z",
      UpdatedAt: "2023-10-01T00:00:00.000Z"
    };
    const childItem = {
      PK: "DualChild#1",
      SK: "DualChild",
      Id: "1",
      Type: "DualChild",
      Description: "spare parts",
      ParentId: "parent-1",
      CreatedAt: "2023-10-01T00:00:00.000Z",
      UpdatedAt: "2023-10-01T00:00:00.000Z"
    };

    mockSearchVectors.mockResolvedValueOnce({
      SearchResults: [{ Item: docItem, Score: 0.25 }]
    });
    const docs = await dualIndexTwo.search("parent-1", "assembly guide");
    // EUCLIDEAN conversion: 1 / (1 + 0.25) = 0.8
    expect(docs[0].similarity).toBe(0.8);
    expect(docs[0].score).toBe(0.25);

    mockSearchVectors.mockResolvedValueOnce({
      SearchResults: [{ Item: childItem, Score: 0.25 }]
    });
    const children = await dualIndexOne.search("parent-1", "spare parts");
    // COSINE conversion of the SAME raw score: 1 - 0.25 = 0.75
    expect(children[0].similarity).toBe(0.75);
    expect(children[0].score).toBe(0.25);
  });

  it("emits each index's own distance function through the provisioning contract", () => {
    expect.assertions(4);

    const indexes = DualIndexTable.metadata().vectorIndexes ?? [];
    const one = indexes.find(i => i.name === "dual-index-one");
    const two = indexes.find(i => i.name === "dual-index-two");

    expect(one?.distanceFunction).toBe("COSINE");
    expect(one?.dimensions).toBe(1024);
    // A non-COSINE distance function reaches the contract unchanged
    expect(two?.distanceFunction).toBe("EUCLIDEAN");
    expect(two?.dimensions).toBe(512);
  });

  it("rejects an in option naming the other index's member — membership is per index", async () => {
    expect.assertions(2);

    try {
      await dualIndexOne.search("parent-1", "spare parts", {
        // @ts-expect-error: DualDoc belongs to the other index; this exercises the runtime backstop
        in: "DualDoc"
      });
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toContain("DualDoc");
    }
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

  it("errors when an unscoped index construct is called with the scoped signature (plain JS backstop)", async () => {
    expect.assertions(3);

    try {
      // @ts-expect-error: a global index takes no scope id
      await globalSearchIndex.search("123", "fresh articles");
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual(
        "Vector index global-search-index is unscoped — it does not take a scope id: search(query, options)"
      );
    }
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe("types", () => {
  it("in accepts only the index's own member entity names", () => {
    const _test = async (): Promise<void> => {
      // @ts-expect-no-error: a declared member of this index
      await storeSearchIndex.search("1", "q", { in: "Listing" });

      // @ts-expect-error: ScopedSupplier is not searchable, so never a member
      await scopedFilterIndex.search("1", "q", { in: "ScopedSupplier" });

      // @ts-expect-error: unknown entity name
      await storeSearchIndex.search("1", "q", { in: "unknown" });

      // @ts-expect-error: the array form is reserved for future widening
      await storeSearchIndex.search("1", "q", { in: ["Listing"] });
    };

    expect(_test).toBeDefined();
  });

  it("search is reached through the index construct, never an entity class", () => {
    const _test = async (): Promise<void> => {
      // @ts-expect-error: entities carry no search surface — search the index
      await Listing.search("1", "q");

      // @ts-expect-error: nor do scope parents
      await Store.search("1", "q");
    };

    expect(_test).toBeDefined();
  });

  it("result unions infer from the index's declared members", () => {
    const _test = async (): Promise<void> => {
      // Un-narrowed results are the index's declared membership, exactly —
      // including Review, which carries the scoping foreign key but has no
      // relationship on Store (AE4)
      const indexResults = await storeSearchIndex.search("1", "q");
      // @ts-expect-no-error: exact member union
      const _indexExact: Array<SearchResult<Listing> | SearchResult<Review>> =
        indexResults;
      // @ts-expect-error: NOT assignable to one member — the union is wider
      const _indexNotNarrowed: Array<SearchResult<Listing>> = indexResults;

      const reviews = await storeSearchIndex.search("1", "q", {
        in: "Review"
      });
      // @ts-expect-no-error: a member with no relationship on the parent narrows like any other
      const _reviewExact: Array<SearchResult<Review>> = reviews;
      // @ts-expect-error: narrowed away from Listing
      const _reviewNoListing: Array<SearchResult<Listing>> = reviews;

      // An unscoped index declares its members explicitly, so its results are
      // typed exactly like a scoped index's — not the widened base type
      const everything = await globalSearchIndex.search("q");
      // @ts-expect-no-error: typed to the declared membership
      const _unscopedExact: Array<SearchResult<Article>> = everything;
      // @ts-expect-error: Listing belongs to the other index, not this one
      const _unscopedNotListing: Array<SearchResult<Listing>> = everything;

      // in: narrows an unscoped index by member entity name
      const articlesOnly = await globalSearchIndex.search("q", {
        in: "Article"
      });
      // @ts-expect-no-error: narrowed to the named member
      const _articlesExact: Array<SearchResult<Article>> = articlesOnly;
      // @ts-expect-error: Listing is not a member of the unscoped index
      await globalSearchIndex.search("q", { in: "Listing" });

      // filter keys narrow to the unscoped index's own members
      // @ts-expect-error: category is a Listing filterable, not an Article one
      await globalSearchIndex.search("q", { filter: { category: "Mugs" } });
    };

    expect(_test).toBeDefined();
  });

  it("result unions widen across a multi-member index and narrow by in", () => {
    const _test = async (): Promise<void> => {
      // No in: the union spans every declared member
      const widened = await scopedFilterIndex.search("1", "q");
      // @ts-expect-no-error: exactly the union of both members
      const _exact: Array<
        SearchResult<ScopedProduct> | SearchResult<ScopedNote>
      > = widened;
      // @ts-expect-error: NOT assignable to just ScopedProduct — the union is wider
      const _notJustProducts: Array<SearchResult<ScopedProduct>> = widened;
      // @ts-expect-error: NOT assignable to just ScopedNote — the union is wider
      const _notJustNotes: Array<SearchResult<ScopedNote>> = widened;

      // in: narrows the union to the one named member
      const products = await scopedFilterIndex.search("1", "q", {
        in: "ScopedProduct"
      });
      // @ts-expect-no-error: narrowed to ScopedProduct
      const _productsExact: Array<SearchResult<ScopedProduct>> = products;
      // @ts-expect-error: ScopedNote narrowed away
      const _productsNoNotes: Array<SearchResult<ScopedNote>> = products;

      const notes = await scopedFilterIndex.search("1", "q", {
        in: "ScopedNote"
      });
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
      await storeSearchIndex.search("1", "q", { filter: { category: "Mugs" } });

      // @ts-expect-error: description is searchable, not filterable
      await storeSearchIndex.search("1", "q", { filter: { description: "x" } });

      await storeSearchIndex.search("1", "q", {
        // @ts-expect-error: operator objects are not searchable filters
        filter: { category: { $beginsWith: "M" } }
      });

      await storeSearchIndex.search("1", "q", {
        // @ts-expect-error: $or is not supported in search filters
        filter: { $or: [{ category: "M" }] }
      });

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

  it("filter values narrow to the attribute's declared type", () => {
    const _test = async (): Promise<void> => {
      // @ts-expect-no-error: category is a plain string filterable
      await storeSearchIndex.search("1", "q", { filter: { category: "Mugs" } });

      // @ts-expect-error: category is declared string, not number
      await storeSearchIndex.search("1", "q", { filter: { category: 42 } });

      // @ts-expect-no-error: rating is declared number
      await storeSearchIndex.search("1", "q", { filter: { rating: 5 } });

      // @ts-expect-error: rating is declared number, not string
      await storeSearchIndex.search("1", "q", { filter: { rating: "5" } });

      // @ts-expect-no-error: a foreign key filterable takes a plain string —
      // the library's own brand never reaches the caller
      await scopedFilterIndex.search("1", "q", { filter: { shopId: "5" } });

      // @ts-expect-error: a foreign key filterable is still a string
      await scopedFilterIndex.search("1", "q", { filter: { shopId: 5 } });
    };

    expect(_test).toBeDefined();
  });

  it("an enum filterable accepts only its declared members", () => {
    const _test = async (): Promise<void> => {
      // @ts-expect-no-error: "gold" is declared on Listing.tier
      await storeSearchIndex.search("1", "q", {
        in: "Listing",
        filter: { tier: "gold" }
      });

      // @ts-expect-error: "platinum" is not a declared member of either tier
      await storeSearchIndex.search("1", "q", { filter: { tier: "platinum" } });

      const widened: string = "gold";
      // @ts-expect-error: a widened string cannot satisfy an enum filterable
      await storeSearchIndex.search("1", "q", { filter: { tier: widened } });
    };

    expect(_test).toBeDefined();
  });

  it("a shared filter key unions its members' declared types, and `in:` narrows it", () => {
    const _test = async (): Promise<void> => {
      // Listing.tier is "gold" | "silver"; Review.tier is "bronze" | "copper".
      // One table attribute, two declared types.

      // @ts-expect-no-error: with no `in:`, either member's values are in range
      await storeSearchIndex.search("1", "q", { filter: { tier: "gold" } });
      // @ts-expect-no-error: the other member's values too
      await storeSearchIndex.search("1", "q", { filter: { tier: "bronze" } });

      // @ts-expect-no-error: `in:` narrows the union to the named member
      await storeSearchIndex.search("1", "q", {
        in: "Listing",
        filter: { tier: "silver" }
      });

      await storeSearchIndex.search("1", "q", {
        in: "Listing",
        // @ts-expect-error: "bronze" belongs to Review, not Listing
        filter: { tier: "bronze" }
      });

      await storeSearchIndex.search("1", "q", {
        in: "Review",
        // @ts-expect-error: "gold" belongs to Listing, not Review
        filter: { tier: "gold" }
      });
    };

    expect(_test).toBeDefined();
  });

  it("filter keys follow `in:` narrowing to the named member's declarations", () => {
    const _test = async (): Promise<void> => {
      // @ts-expect-no-error: category is declared on Listing only, and with no
      // `in:` a key present on one member is in range for the whole index
      await storeSearchIndex.search("1", "q", { filter: { category: "Mugs" } });

      // @ts-expect-no-error: narrowing to the member that declares it
      await storeSearchIndex.search("1", "q", {
        in: "Listing",
        filter: { category: "Mugs" }
      });

      await storeSearchIndex.search("1", "q", {
        in: "Review",
        // @ts-expect-error: category is not declared on Review
        filter: { category: "Mugs" }
      });

      // @ts-expect-no-error: rating is declared on Review only
      await storeSearchIndex.search("1", "q", {
        in: "Review",
        filter: { rating: 4 }
      });

      await storeSearchIndex.search("1", "q", {
        in: "Listing",
        // @ts-expect-error: rating is not declared on Listing
        filter: { rating: 4 }
      });
    };

    expect(_test).toBeDefined();
  });

  it("search options reject unknown keys and wrong option shapes", () => {
    const _test = async (): Promise<void> => {
      // @ts-expect-no-error: the complete valid option set
      await storeSearchIndex.search("1", "q", {
        in: "Listing",
        filter: { category: "Mugs" },
        topK: 25
      });

      await storeSearchIndex.search("1", "q", {
        // @ts-expect-error: topK is a number
        topK: "25"
      });

      await storeSearchIndex.search("1", "q", {
        // @ts-expect-error: unknown option keys are rejected
        limit: 25
      });

      await storeSearchIndex.search("1", "q", {
        // @ts-expect-error: filter is an object of equality conditions
        filter: "category = Mugs"
      });

      // A union-typed in: is accepted, and a consumer reaches this without
      // any cast — a conditional simply infers the union. The runtime value is
      // still one member name, so the result union widens to cover both
      const chosen = Math.random() > 0.5 ? "Listing" : "Review";
      const eitherMember = await storeSearchIndex.search("1", "q", {
        in: chosen
      });
      // @ts-expect-no-error: widened to both, exactly as an omitted in: would be
      const _either: Array<SearchResult<Listing> | SearchResult<Review>> =
        eitherMember;
      // @ts-expect-error: NOT narrowed to one — which member is unknown statically
      const _notNarrowed: Array<SearchResult<Listing>> = eitherMember;

      // @ts-expect-error: the query is required
      await storeSearchIndex.search("1");

      // @ts-expect-error: a number is not a valid query input
      await storeSearchIndex.search("1", 42);
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

  it("a result exposes the hydrated entity plus both similarity measures", () => {
    const _test = async (): Promise<void> => {
      const [result] = await storeSearchIndex.search("1", "q", {
        in: "Listing"
      });

      // @ts-expect-no-error: the documented result shape
      const _similarity: number = result.similarity;
      const _score: number = result.score;

      // @ts-expect-error: similarity is a number, not a string
      const _similarityString: string = result.similarity;

      // @ts-expect-error: there is no rank, distance, or cursor on a result
      const _rank = result.rank;

      // @ts-expect-error: there is no pagination token — search has none
      const _cursor = result.nextToken;
    };

    expect(_test).toBeDefined();
  });

  it("a result's entity carries attributes only — never relationships, vectors, or methods", () => {
    const _test = async (): Promise<void> => {
      const [result] = await storeSearchIndex.search("1", "q", {
        in: "Listing"
      });

      // @ts-expect-no-error: declared attributes, including the keys and
      // the table's default fields, are all present
      const _description: string = result.entity.description;
      const _category: string = result.entity.category;
      const _storeId: string = result.entity.storeId;
      const _id: string = result.entity.id;
      const _type: "Listing" = result.entity.type;
      const _createdAt: Date = result.entity.createdAt;

      // @ts-expect-error: relationships are not projected onto a search result
      const _store = result.entity.store;

      // @ts-expect-error: the vector attribute is never projected or typed
      const _vector = result.entity.__dyna_vector;

      // ...and because relationships are stripped, the projected entity is
      // deliberately NOT assignable to the full entity class
      // @ts-expect-error: a hydrated result is attributes plus instance methods
      const _whole: Listing = result.entity;

      // @ts-expect-no-error: instance methods survive — a result is a real
      // instance, so it can be updated or deleted without a re-read
      const _update: typeof result.entity.update = result.entity.update;
    };

    expect(_test).toBeDefined();
  });

  it("results are an ordinary array of results, awaited from a promise", () => {
    const _test = async (): Promise<void> => {
      const pending = storeSearchIndex.search("1", "q");

      // @ts-expect-error: the results must be awaited before use
      const _notAwaited: number = pending.length;

      const results = await pending;
      // @ts-expect-no-error: an array, ordered most-similar-first
      const _count: number = results.length;
      const _first: SearchResult<Listing> | SearchResult<Review> | undefined =
        results[0];
      for (const _each of results) {
        // @ts-expect-no-error: every element is a result
        const _s: number = _each.similarity;
      }
    };

    expect(_test).toBeDefined();
  });

  it("the entity-anchored parent search surface is gone from the public types", () => {
    const _test = async (): Promise<void> => {
      // Removed in 3.0.0: the parent typed its results from the parent's
      // declared RELATIONSHIPS while the runtime searched the index's
      // MEMBERS, so the two disagreed whenever a member was reachable only
      // by foreign key. Search is now reached through the index alone
      // @ts-expect-error: removed in 3.0.0
      const _a: import("../../index.js").ParentSearchOptions<never, never> =
        undefined as never;
      // @ts-expect-error: removed in 3.0.0
      const _b: import("../../index.js").ParentSearchedEntities<never, never> =
        undefined as never;
      // @ts-expect-error: removed in 3.0.0
      const _c: import("../../index.js").ParentSearchRuntimeOptions =
        undefined as never;
      // @ts-expect-error: removed in 3.0.0
      const _d: import("../../index.js").SearchableRelationshipProperties<never> =
        undefined as never;
      // @ts-expect-error: removed in 3.0.0
      const _e: import("../../index.js").SearchableRelationshipEntities<never> =
        undefined as never;
      // @ts-expect-error: removed in 3.0.0
      const _f: import("../../index.js").HasSearchableRelationships<never> =
        undefined as never;
      // @ts-expect-error: removed in 3.0.0
      const _g: import("../../index.js").SearchNotAvailable =
        undefined as never;
    };

    expect(_test).toBeDefined();
  });

  it("SearchResult and SearchResults are nameable from the entry point", () => {
    const _test = (): void => {
      // A consumer typing their own wrapper around search reaches both names
      // @ts-expect-no-error: exported for exactly this use
      const _one: import("../../index.js").SearchResult<Listing> =
        undefined as never;
      const _many: import("../../index.js").SearchResults<Listing> =
        undefined as never;

      // @ts-expect-no-error: both default their entity parameter
      const _anyOne: import("../../index.js").SearchResult = undefined as never;
      const _anyMany: import("../../index.js").SearchResults =
        undefined as never;
    };

    expect(_test).toBeDefined();
  });
});

describe("the parent search surface no longer exists at runtime", () => {
  it("entity classes carry no search method, scope parents included", () => {
    expect.assertions(4);

    // The compile-time half is asserted in the types block above. At runtime
    // the static must be genuinely absent, not merely untyped — a plain-JS
    // caller reaching for it gets an ordinary "not a function", never a
    // half-working search typed from the wrong source of truth
    expect("search" in Store).toBe(false);
    expect("search" in Listing).toBe(false);
    expect(
      (Store as unknown as Record<string, unknown>).search
    ).toBeUndefined();
    expect(
      (Listing as unknown as Record<string, unknown>).search
    ).toBeUndefined();
  });

  it("a parent may now scope any number of indexes", () => {
    expect.assertions(3);

    // The "parent scopes more than one vector index" rule existed only to
    // keep the parent's single search surface unambiguous. With that surface
    // gone the rule is retired: two indexes may share a scope parent, because
    // each search names its own index at the call
    const scopedByDualParent = DualIndexTable.metadata().vectorIndexes?.filter(
      index => index.scopedBy === "DualParent"
    );

    expect(scopedByDualParent).toHaveLength(2);
    // ...and they stay physically disjoint: different IndexNames over
    // different vector attributes
    expect(scopedByDualParent?.map(index => index.name)).toStrictEqual([
      "dual-index-one",
      "dual-index-two"
    ]);
    expect(
      scopedByDualParent?.map(index => index.vectorAttribute)
    ).toStrictEqual(["__dyna_vector", "__dyna_vector_two"]);
  });
});
