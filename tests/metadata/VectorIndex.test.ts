import { createHash } from "node:crypto";
import {
  MockTable,
  SearchTable,
  Store,
  Listing,
  Review,
  mockEmbeddingProvider,
  storeSearchIndex,
  globalSearchIndex
} from "../integration/mockModels.js";
import Metadata, {
  reservedVectorAttributePrefix,
  isValidVectorAttributeName
} from "../../src/metadata/index.js";
import {
  isVectorAttributeKey,
  stripVectorAttributes
} from "../../src/metadata/VectorIndexMetadata.js";
// Statically imported for the compile-time tests below. They are used only
// inside closures that are never invoked, so no decorator ever executes.
import {
  Entity,
  Searchable,
  StringAttribute
} from "../../src/decorators/index.js";
import {
  TitanTextEmbedV2,
  TitanTextEmbedV2Dim512,
  TitanTextEmbedV2Dim256,
  type EmbeddingModelDescriptor
} from "../../src/embedding/types.js";
import type {
  EmbeddingProvider,
  ForeignKey,
  PartitionKey,
  Searchable as SearchableText,
  SearchFilterable as FilterableText,
  SortKey
} from "../../src/index.js";
// Imported as a plain named import on purpose: the entry point exports it
// with `export type`, so the name resolves for type positions while any
// value use of it is a compile error. The assertion is in the types block
import { VectorIndexMetadata as PublicVectorIndexMetadata } from "../../index.js";

/**
 * Loads a fresh module registry so each validation scenario gets its own
 * MetadataStorage instance — a cached initialization error would otherwise
 * poison every other test in the file
 */
const loadFresh = async () => {
  vi.resetModules();
  const dynaRecord = await import("../../index.js");
  const { default: Metadata } = await import("../../src/metadata/index.js");
  return { ...dynaRecord, Metadata };
};

const testProvider = (_text: string): Promise<number[]> =>
  Promise.resolve([0.1]);

const fingerprintOf = (input: string): string =>
  createHash("sha256").update(input).digest("hex");

const captureError = (fn: () => unknown): unknown => {
  try {
    fn();
    return undefined;
  } catch (error) {
    return error;
  }
};

describe("VectorIndex", () => {
  describe("metadata() emission", () => {
    it("emits the vector index provisioning definitions", () => {
      expect.assertions(1);

      expect(SearchTable.metadata().vectorIndexes).toStrictEqual([
        {
          name: "store-search-index",
          model: "amazon.titan-embed-text-v2:0",
          vectorAttribute: "__dyna_vector",
          dimensions: 1024,
          distanceFunction: "COSINE",
          projection: "ALL",
          searchSchema: {
            hash: "StoreId",
            inlineFilters: ["Category", "Rating", "Tier", "Type"]
          },
          fingerprint: fingerprintOf(
            "hash=StoreId;filters=Category,Rating,Tier,Type;dimensions=1024;distance=COSINE;vectorAttribute=__dyna_vector"
          ),
          scopedBy: "Store"
        },
        {
          name: "global-search-index",
          model: "amazon.titan-embed-text-v2:0",
          vectorAttribute: "__dyna_vector_articles",
          dimensions: 1024,
          distanceFunction: "COSINE",
          projection: "ALL",
          searchSchema: {
            inlineFilters: ["Type"]
          },
          fingerprint: fingerprintOf(
            "hash=;filters=Type;dimensions=1024;distance=COSINE;vectorAttribute=__dyna_vector_articles"
          )
        }
      ]);
    });

    it("serializes a migrated 2.0.1-shape index identically except its fingerprint", () => {
      expect.assertions(2);

      // The exact entry dyna-record 2.0.1 emitted for store-search-index,
      // pinned here so a future change to the serialized provisioning
      // contract cannot pass by updating an expectation alongside it. R15
      // promises a mechanically-migrated index re-provisions nothing: every
      // field must match, and only the fingerprint may differ (its preimage
      // gained the vector attribute in 3.0.0)
      const pinned201Entry = {
        name: "store-search-index",
        model: "amazon.titan-embed-text-v2:0",
        vectorAttribute: "__dyna_vector",
        dimensions: 1024,
        distanceFunction: "COSINE",
        projection: "ALL",
        searchSchema: {
          hash: "StoreId",
          inlineFilters: ["Category", "Rating", "Tier", "Type"]
        },
        fingerprint: fingerprintOf(
          "hash=StoreId;filters=Category,Type;dimensions=1024;distance=COSINE"
        ),
        scopedBy: "Store"
      };

      const [current] = SearchTable.metadata().vectorIndexes ?? [];

      expect({ ...current, fingerprint: null }).toStrictEqual({
        ...pinned201Entry,
        fingerprint: null
      });
      expect(current.fingerprint).not.toBe(pinned201Entry.fingerprint);
    });

    it("serializes the model as the descriptor name and never emits provider or credential material", () => {
      expect.assertions(3);

      const serialized = JSON.stringify(SearchTable.metadata());

      expect(serialized).toContain("amazon.titan-embed-text-v2:0");
      expect(serialized).not.toContain("provider");
      expect(serialized).not.toContain("scoreToSimilarity");
    });

    it("does not emit a vectorIndexes field for tables without vector indexes", () => {
      expect.assertions(1);

      expect(MockTable.metadata().vectorIndexes).toBeUndefined();
    });
  });

  describe("index registration", () => {
    it("resolves each index's membership from its explicit members list", () => {
      expect.assertions(4);

      const [scopedIndex, articleIndex] =
        Metadata.getVectorIndexes("SearchTable");

      expect(scopedIndex.memberEntities).toEqual(["Listing", "Review"]);
      expect(scopedIndex.hashAlias).toBe("StoreId");
      // The unscoped index owns only its declared corpus — membership is
      // never derived from the table's searchable entities
      expect(articleIndex.memberEntities).toEqual(["Article"]);
      expect(articleIndex.hashAlias).toBeUndefined();
    });

    it("returns the typed index constructs from the factory", () => {
      expect.assertions(6);

      expect(storeSearchIndex.name).toBe("store-search-index");
      // The construct holds a frozen COPY of the descriptor, not the caller's
      // object: `dimensions` gates vector validation, so a later edit to a
      // shared descriptor must not reach a live index
      expect(storeSearchIndex.model).toStrictEqual(TitanTextEmbedV2);
      expect(storeSearchIndex.model).not.toBe(TitanTextEmbedV2);
      expect(storeSearchIndex.provider).toBe(mockEmbeddingProvider);
      expect(Metadata.getVectorIndexes("SearchTable")[0]).toBe(
        storeSearchIndex
      );
      expect(Metadata.getVectorIndexes("SearchTable")[1]).toBe(
        globalSearchIndex
      );
    });

    it("guardrail: no entity attribute name or alias uses the reserved vector prefix", () => {
      const tables = ["MockTable", "OtherTable", "SearchTable"];

      for (const table of tables) {
        for (const entityMeta of Object.values(
          Metadata.getEntitiesForTable(table)
        )) {
          for (const attrMeta of Object.values(entityMeta.attributes)) {
            expect(
              attrMeta.name.startsWith(reservedVectorAttributePrefix)
            ).toBe(false);
            expect(
              attrMeta.alias.startsWith(reservedVectorAttributePrefix)
            ).toBe(false);
          }
        }
      }
    });

    it("ships Titan V2 dimension variants sharing the model identity", () => {
      expect.assertions(3);

      expect(TitanTextEmbedV2).toMatchObject({
        name: "amazon.titan-embed-text-v2:0",
        dimensions: 1024,
        distanceFunction: "COSINE"
      });
      expect(TitanTextEmbedV2Dim512).toMatchObject({
        name: "amazon.titan-embed-text-v2:0",
        dimensions: 512,
        distanceFunction: "COSINE"
      });
      expect(TitanTextEmbedV2Dim256).toMatchObject({
        name: "amazon.titan-embed-text-v2:0",
        dimensions: 256,
        distanceFunction: "COSINE"
      });
    });

    it("emits a dimension variant's dimensions through the provisioning contract", async () => {
      const {
        default: DynaRecord,
        Table,
        Entity,
        PartitionKeyAttribute,
        SortKeyAttribute,
        StringAttribute,
        Searchable,
        TitanTextEmbedV2Dim512: variant
      } = await loadFresh();

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      @Entity
      class Doc extends FreshTable {
        declare readonly type: "Doc";

        @Searchable()
        @StringAttribute({ alias: "Body" })
        public readonly body: SearchableText;
      }
      void Doc;

      FreshTable.vectorIndexes({
        freshIndex: {
          name: "fresh-index",
          vectorAttribute: "__dyna_vector",
          model: variant,
          provider: testProvider,
          members: [() => Doc]
        }
      });

      const [index] = FreshTable.metadata().vectorIndexes ?? [];
      expect(index).toMatchObject({
        name: "fresh-index",
        model: "amazon.titan-embed-text-v2:0",
        dimensions: 512
      });
    });

    it("emits every AWS distance function and dimension variant through the contract", async () => {
      expect.assertions(1);

      const {
        default: DynaRecord,
        Table,
        Entity,
        PartitionKeyAttribute,
        SortKeyAttribute,
        StringAttribute,
        Searchable,
        TitanTextEmbedV2Dim256: small
      } = await loadFresh();

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      @Entity
      class Doc extends FreshTable {
        declare readonly type: "Doc";

        @Searchable()
        @StringAttribute({ alias: "Body" })
        public readonly body: SearchableText;
      }

      @Entity
      class Note extends FreshTable {
        declare readonly type: "Note";

        @Searchable()
        @StringAttribute({ alias: "NoteBody" })
        public readonly noteBody: SearchableText;
      }

      @Entity
      class Memo extends FreshTable {
        declare readonly type: "Memo";

        @Searchable()
        @StringAttribute({ alias: "MemoBody" })
        public readonly memoBody: SearchableText;
      }

      FreshTable.vectorIndexes({
        dotIndex: {
          name: "dot-index",
          vectorAttribute: "__dyna_vector",
          model: {
            name: "dot-model",
            dimensions: 4096, // the AWS per-vector dimension ceiling
            distanceFunction: "DOT_PRODUCT",
            scoreToSimilarity: (score: number) => score
          },
          provider: testProvider,
          members: [() => Doc]
        },
        euclideanIndex: {
          name: "euclidean-index",
          vectorAttribute: "__dyna_vector_euclidean",
          model: {
            name: "euclidean-model",
            dimensions: 1, // the smallest vector AWS accepts
            distanceFunction: "EUCLIDEAN",
            scoreToSimilarity: (score: number) => 1 / (1 + score)
          },
          provider: testProvider,
          members: [() => Note]
        },
        smallIndex: {
          name: "small-index",
          vectorAttribute: "__dyna_vector_small",
          model: small,
          provider: testProvider,
          members: [() => Memo]
        }
      });

      // Asserting the whole contract, not just the distance fields: the
      // fingerprint preimage carries the distance function and dimensions, so
      // a full assertion also proves a non-COSINE index fingerprints correctly
      expect(FreshTable.metadata().vectorIndexes).toStrictEqual([
        {
          name: "dot-index",
          model: "dot-model",
          vectorAttribute: "__dyna_vector",
          dimensions: 4096,
          distanceFunction: "DOT_PRODUCT",
          projection: "ALL",
          searchSchema: { inlineFilters: ["type"] },
          fingerprint: fingerprintOf(
            "hash=;filters=type;dimensions=4096;distance=DOT_PRODUCT;vectorAttribute=__dyna_vector"
          )
        },
        {
          name: "euclidean-index",
          model: "euclidean-model",
          vectorAttribute: "__dyna_vector_euclidean",
          dimensions: 1,
          distanceFunction: "EUCLIDEAN",
          projection: "ALL",
          searchSchema: { inlineFilters: ["type"] },
          fingerprint: fingerprintOf(
            "hash=;filters=type;dimensions=1;distance=EUCLIDEAN;vectorAttribute=__dyna_vector_euclidean"
          )
        },
        {
          name: "small-index",
          model: "amazon.titan-embed-text-v2:0",
          vectorAttribute: "__dyna_vector_small",
          dimensions: 256,
          distanceFunction: "COSINE",
          projection: "ALL",
          searchSchema: { inlineFilters: ["type"] },
          fingerprint: fingerprintOf(
            "hash=;filters=type;dimensions=256;distance=COSINE;vectorAttribute=__dyna_vector_small"
          )
        }
      ]);
    });

    it("throws when declaring vector indexes on a class that is not a table class", () => {
      expect.assertions(1);

      expect(() =>
        Listing.vectorIndexes({
          invalidIndex: {
            name: "invalid-index",
            vectorAttribute: "__dyna_vector",
            model: TitanTextEmbedV2,
            provider: mockEmbeddingProvider,
            members: [() => Listing]
          }
        })
      ).toThrow(
        "vectorIndexes can only be defined on a table class decorated with @Table. Listing is not a registered table"
      );
    });
  });

  describe("isValidVectorAttributeName", () => {
    // The runtime twin of the VectorAttributeName template literal type. Both
    // encode one rule — exactly the reserved prefix, or the prefix plus a "_"
    // separator — so the same cases are asserted on both sides.
    it.each([
      ["__dyna_vector", true], // the bare reserved prefix
      ["__dyna_vector_support", true], // prefix plus a suffix
      ["__dyna_vector_", true], // boundary: empty suffix after the separator
      ["__dyna_vectorx", false], // boundary: prefix without the separator
      ["__dyna_vecto", false], // boundary: one char short of the prefix
      ["_dyna_vector", false], // boundary: one leading underscore short
      ["__DYNA_VECTOR", false], // the rule is case sensitive
      ["embedding", false], // not under the prefix at all
      ["", false], // empty
      ["x__dyna_vector", false] // prefix present but not at the start
    ])("%p is %p", (value, expected) => {
      expect.assertions(1);
      expect(isValidVectorAttributeName(value)).toBe(expected);
    });

    it("exposes the reserved prefix that the rule is built from", () => {
      expect.assertions(2);
      expect(reservedVectorAttributePrefix).toBe("__dyna_vector");
      expect(isValidVectorAttributeName(reservedVectorAttributePrefix)).toBe(
        true
      );
    });
  });

  describe("vector attribute key helpers", () => {
    // These back the guarantee that vectors never reach a denormalized copy
    // or a link record: both are built from raw canonical rows that bypass
    // entity serialization, so the strip is what keeps them vector-free.
    describe("isVectorAttributeKey", () => {
      it.each([
        ["__dyna_vector", true],
        ["__dyna_vector_support", true],
        ["__dyna_vector_", true],
        ["__dyna_vectorx", true], // prefix match is broader than the NAME rule
        ["Description", false],
        ["_dyna_vector", false],
        ["", false],
        ["x__dyna_vector", false] // must be a prefix, not a substring
      ])("%p is %p", (key, expected) => {
        expect.assertions(1);
        expect(isVectorAttributeKey(key)).toBe(expected);
      });

      it("matches more keys than isValidVectorAttributeName accepts", () => {
        expect.assertions(2);
        // A retired index's attribute must still be recognized for stripping
        // even if it could no longer be declared
        expect(isVectorAttributeKey("__dyna_vectorx")).toBe(true);
        expect(isValidVectorAttributeName("__dyna_vectorx")).toBe(false);
      });
    });

    describe("stripVectorAttributes", () => {
      it("removes every vector attribute and keeps everything else", () => {
        expect.assertions(1);

        expect(
          stripVectorAttributes({
            PK: "Listing#1",
            SK: "Listing",
            Description: "mug",
            __dyna_vector: [0.1, 0.2],
            __dyna_vector_support: [0.3],
            __dyna_vector_archive: [0.4]
          })
        ).toEqual({
          PK: "Listing#1",
          SK: "Listing",
          Description: "mug"
        });
      });

      it("returns an equal item when there is nothing to strip", () => {
        expect.assertions(1);

        expect(
          stripVectorAttributes({ PK: "Listing#1", Description: "mug" })
        ).toEqual({ PK: "Listing#1", Description: "mug" });
      });

      it("handles an empty item", () => {
        expect.assertions(1);
        expect(stripVectorAttributes({})).toEqual({});
      });

      it("strips an item that is nothing but vectors down to empty", () => {
        expect.assertions(1);
        expect(
          stripVectorAttributes({
            __dyna_vector: [0.1],
            __dyna_vector_b: [0.2]
          })
        ).toEqual({});
      });

      it("does not mutate the item it strips", () => {
        expect.assertions(2);

        const item = { PK: "Listing#1", __dyna_vector: [0.1] };
        const stripped = stripVectorAttributes(item);

        expect(item).toEqual({ PK: "Listing#1", __dyna_vector: [0.1] });
        expect(stripped).not.toBe(item);
      });
    });
  });

  describe("validations", () => {
    it("rejects multiple @Searchable attributes on one entity, naming the entity, both attributes and the rule", async () => {
      const {
        default: DynaRecord,
        Table,
        Entity,
        PartitionKeyAttribute,
        SortKeyAttribute,
        StringAttribute,
        Searchable,
        TitanTextEmbedV2
      } = await loadFresh();

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      // @ts-expect-error: the compile-time assist rejects a second @Searchable attribute; these tests exercise the runtime backstop
      @Entity
      class DoubleSearchable extends FreshTable {
        declare readonly type: "DoubleSearchable";

        @Searchable()
        @StringAttribute({ alias: "A" })
        public readonly a: SearchableText;

        @Searchable()
        @StringAttribute({ alias: "B" })
        public readonly b: SearchableText;
      }

      FreshTable.vectorIndexes({
        freshIndex: {
          name: "fresh-index",
          vectorAttribute: "__dyna_vector",
          model: TitanTextEmbedV2,
          provider: testProvider,
          members: [() => DoubleSearchable]
        }
      });

      expect(() => FreshTable.metadata()).toThrow(
        "Entity DoubleSearchable declares @Searchable on multiple attributes (a, b). Only one searchable attribute is allowed per entity"
      );
    });

    it("caches a validation failure and re-throws it on every subsequent metadata access", async () => {
      const {
        default: DynaRecord,
        Table,
        Entity,
        PartitionKeyAttribute,
        SortKeyAttribute,
        StringAttribute,
        Searchable,
        TitanTextEmbedV2,
        Metadata
      } = await loadFresh();

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      // @ts-expect-error: the compile-time assist rejects a second @Searchable attribute; these tests exercise the runtime backstop
      @Entity
      class DoubleSearchable extends FreshTable {
        declare readonly type: "DoubleSearchable";

        @Searchable()
        @StringAttribute({ alias: "A" })
        public readonly a: SearchableText;

        @Searchable()
        @StringAttribute({ alias: "B" })
        public readonly b: SearchableText;
      }

      FreshTable.vectorIndexes({
        freshIndex: {
          name: "fresh-index",
          vectorAttribute: "__dyna_vector",
          model: TitanTextEmbedV2,
          provider: testProvider,
          members: [() => DoubleSearchable]
        }
      });

      const first = captureError(() => FreshTable.metadata());
      const second = captureError(() => FreshTable.metadata());
      const third = captureError(() => Metadata.getEntity("DoubleSearchable"));

      expect(first).toBeInstanceOf(Error);
      expect(second).toBe(first);
      expect(third).toBe(first);
    });

    it("rejects @Searchable layered over a non-string attribute", async () => {
      const {
        default: DynaRecord,
        Table,
        Entity,
        PartitionKeyAttribute,
        SortKeyAttribute,
        NumberAttribute,
        Searchable,
        TitanTextEmbedV2
      } = await loadFresh();

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      @Entity
      class NumberSearchable extends FreshTable {
        declare readonly type: "NumberSearchable";

        // @ts-expect-error: @Searchable requires the Searchable brand, which is a string brand
        @Searchable()
        @NumberAttribute({ alias: "Count" })
        public readonly count: number;
      }

      FreshTable.vectorIndexes({
        // @ts-expect-error: NumberSearchable carries no Searchable brand; this exercises the runtime backstop
        freshIndex: {
          name: "fresh-index",
          vectorAttribute: "__dyna_vector",
          model: TitanTextEmbedV2,
          provider: testProvider,
          members: [() => NumberSearchable]
        }
      });

      expect(() => FreshTable.metadata()).toThrow(
        "@Searchable on NumberSearchable.count must be layered over a string or enum attribute decorator (EX: @StringAttribute, @EnumAttribute)"
      );
    });

    it("rejects @Searchable without a base attribute decorator", async () => {
      const {
        default: DynaRecord,
        Table,
        Entity,
        PartitionKeyAttribute,
        SortKeyAttribute,
        Searchable,
        TitanTextEmbedV2
      } = await loadFresh();

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      @Entity
      class MissingBase extends FreshTable {
        declare readonly type: "MissingBase";

        @Searchable()
        public readonly text: SearchableText;
      }

      FreshTable.vectorIndexes({
        freshIndex: {
          name: "fresh-index",
          vectorAttribute: "__dyna_vector",
          model: TitanTextEmbedV2,
          provider: testProvider,
          members: [() => MissingBase]
        }
      });

      expect(() => FreshTable.metadata()).toThrow(
        "@Searchable on MissingBase.text must be layered over a string or enum attribute decorator (EX: @StringAttribute, @EnumAttribute)"
      );
    });

    it("resolves @Searchable layered over an enum attribute", async () => {
      const {
        default: DynaRecord,
        Table,
        Entity,
        PartitionKeyAttribute,
        SortKeyAttribute,
        EnumAttribute,
        Searchable,
        TitanTextEmbedV2,
        Metadata
      } = await loadFresh();

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      @Entity
      class EnumSearchable extends FreshTable {
        declare readonly type: "EnumSearchable";

        @Searchable()
        @EnumAttribute({ alias: "Status", values: ["draft", "published"] })
        public readonly status: SearchableText<"draft" | "published">;
      }

      FreshTable.vectorIndexes({
        freshIndex: {
          name: "fresh-index",
          vectorAttribute: "__dyna_vector",
          model: TitanTextEmbedV2,
          provider: testProvider,
          members: [() => EnumSearchable]
        }
      });

      expect(() => FreshTable.metadata()).not.toThrow();
      expect(
        Metadata.getEntity("EnumSearchable").searchableAttribute?.name
      ).toBe("status");
    });

    it("rejects @SearchFilterable layered over a date attribute", async () => {
      const {
        default: DynaRecord,
        Table,
        Entity,
        PartitionKeyAttribute,
        SortKeyAttribute,
        StringAttribute,
        DateAttribute,
        Searchable,
        SearchFilterable,
        TitanTextEmbedV2
      } = await loadFresh();

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      @Entity
      class DateFilterable extends FreshTable {
        declare readonly type: "DateFilterable";

        @Searchable()
        @StringAttribute({ alias: "Text" })
        public readonly text: SearchableText;

        // @ts-expect-error: Date properties cannot carry the SearchFilterable brand - the runtime check must agree
        @SearchFilterable()
        @DateAttribute({ alias: "PublishedOn" })
        public readonly publishedOn: Date;
      }

      FreshTable.vectorIndexes({
        freshIndex: {
          name: "fresh-index",
          vectorAttribute: "__dyna_vector",
          model: TitanTextEmbedV2,
          provider: testProvider,
          members: [() => DateFilterable]
        }
      });

      expect(() => FreshTable.metadata()).toThrow(
        "@SearchFilterable on DateFilterable.publishedOn must be layered over a string, number, boolean, enum, or foreign key attribute decorator (EX: @StringAttribute)"
      );
    });

    it("resolves searchSchema for a scoped index declared through members", async () => {
      const {
        default: DynaRecord,
        Table,
        Entity,
        PartitionKeyAttribute,
        SortKeyAttribute,
        StringAttribute,
        ForeignKeyAttribute,
        Searchable,
        TitanTextEmbedV2
      } = await loadFresh();

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      @Entity
      class Shop extends FreshTable {
        declare readonly type: "Shop";

        @StringAttribute({ alias: "Name" })
        public readonly name: string;
      }

      @Entity
      class ShopNote extends FreshTable {
        declare readonly type: "ShopNote";

        @Searchable()
        @StringAttribute({ alias: "Note" })
        public readonly note: SearchableText;

        @ForeignKeyAttribute(() => Shop, { alias: "ShopId" })
        public readonly shopId: ForeignKey<Shop>;
      }

      FreshTable.vectorIndexes({
        shopIndex: {
          name: "shop-index",
          vectorAttribute: "__dyna_vector",
          model: TitanTextEmbedV2,
          provider: testProvider,
          scopedBy: () => Shop,
          members: [() => ShopNote]
        }
      });

      const metadata = FreshTable.metadata();

      expect(metadata.vectorIndexes?.[0].searchSchema).toStrictEqual({
        hash: "ShopId",
        inlineFilters: ["type"]
      });
    });

    it("rejects a declared member without the scoping foreign key on its canonical row (HasAndBelongsToMany), naming the fix", async () => {
      const {
        default: DynaRecord,
        Table,
        Entity,
        PartitionKeyAttribute,
        SortKeyAttribute,
        StringAttribute,
        HasAndBelongsToMany,
        JoinTable,
        Searchable,
        TitanTextEmbedV2
      } = await loadFresh();

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      @Entity
      class Shop extends FreshTable {
        declare readonly type: "Shop";

        @StringAttribute({ alias: "Name" })
        public readonly name: string;

        @HasAndBelongsToMany(() => Tag, {
          targetKey: "shops",
          through: () => ({ joinTable: ShopTag, foreignKey: "shopId" })
        })
        public readonly tags: Tag[];
      }

      @Entity
      class Tag extends FreshTable {
        declare readonly type: "Tag";

        @Searchable()
        @StringAttribute({ alias: "Label" })
        public readonly label: SearchableText;

        @HasAndBelongsToMany(() => Shop, {
          targetKey: "tags",
          through: () => ({ joinTable: ShopTag, foreignKey: "tagId" })
        })
        public readonly shops: Shop[];
      }

      class ShopTag extends JoinTable<Shop, Tag> {
        public readonly shopId: ForeignKey;
        public readonly tagId: ForeignKey;
      }

      FreshTable.vectorIndexes({
        shopIndex: {
          name: "shop-index",
          vectorAttribute: "__dyna_vector",
          model: TitanTextEmbedV2,
          provider: testProvider,
          scopedBy: () => Shop,
          members: [() => Tag]
        }
      });

      expect(() => FreshTable.metadata()).toThrow(
        "Entity Tag is a member of vector index shop-index but has no foreign key attribute referencing Shop on its own record (HasAndBelongsToMany relationships store foreign keys on the join table). Add a @ForeignKeyAttribute referencing Shop to Tag"
      );
    });

    it("rejects a table with searchable entities but no vector index, naming the fix", async () => {
      const {
        default: DynaRecord,
        Table,
        Entity,
        PartitionKeyAttribute,
        SortKeyAttribute,
        StringAttribute,
        Searchable
      } = await loadFresh();

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      @Entity
      class Note extends FreshTable {
        declare readonly type: "Note";

        @Searchable()
        @StringAttribute({ alias: "Text" })
        public readonly text: SearchableText;
      }
      void Note;

      expect(() => FreshTable.metadata()).toThrow(
        "Table FreshTable has searchable entities (Note) but no vector index with an embedding provider. Define one with FreshTable.vectorIndexes({ myIndex: { name, vectorAttribute, model, provider } })"
      );
    });

    it("rejects a vector index without a provider when the table has searchable entities, naming the fix", async () => {
      const {
        default: DynaRecord,
        Table,
        Entity,
        PartitionKeyAttribute,
        SortKeyAttribute,
        StringAttribute,
        Searchable,
        TitanTextEmbedV2
      } = await loadFresh();

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      @Entity
      class Note extends FreshTable {
        declare readonly type: "Note";

        @Searchable()
        @StringAttribute({ alias: "Text" })
        public readonly text: SearchableText;
      }

      FreshTable.vectorIndexes({
        freshIndex: {
          name: "fresh-index",
          vectorAttribute: "__dyna_vector",
          model: TitanTextEmbedV2,
          provider: undefined as unknown as EmbeddingProvider,
          members: [() => Note]
        }
      });

      expect(() => FreshTable.metadata()).toThrow(
        "Vector index fresh-index has no embedding provider configured. Set provider (an embed function) on the index's entry in FreshTable.vectorIndexes"
      );
    });

    it("rejects a @SearchFilterable property resolving to different table aliases across an index's members", async () => {
      const {
        default: DynaRecord,
        Table,
        Entity,
        PartitionKeyAttribute,
        SortKeyAttribute,
        StringAttribute,
        Searchable,
        SearchFilterable,
        TitanTextEmbedV2
      } = await loadFresh();

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      @Entity
      class EntityOne extends FreshTable {
        declare readonly type: "EntityOne";

        @Searchable()
        @StringAttribute({ alias: "TextOne" })
        public readonly text: SearchableText;

        @SearchFilterable()
        @StringAttribute({ alias: "Status" })
        public readonly status: FilterableText;
      }

      @Entity
      class EntityTwo extends FreshTable {
        declare readonly type: "EntityTwo";

        @Searchable()
        @StringAttribute({ alias: "TextTwo" })
        public readonly text: SearchableText;

        @SearchFilterable()
        @StringAttribute({ alias: "State" })
        public readonly status: FilterableText;
      }

      FreshTable.vectorIndexes({
        freshIndex: {
          name: "fresh-index",
          vectorAttribute: "__dyna_vector",
          model: TitanTextEmbedV2,
          provider: testProvider,
          members: [() => EntityOne, () => EntityTwo]
        }
      });

      expect(() => FreshTable.metadata()).toThrow(
        "@SearchFilterable property status resolves to different table aliases (Status, State) across members of vector index fresh-index. One inline filter is one table attribute; align the alias across entities"
      );
    });

    it("accepts 18 inline filters counting the auto-added entity type filter", async () => {
      const {
        default: DynaRecord,
        Table,
        Entity,
        PartitionKeyAttribute,
        SortKeyAttribute,
        StringAttribute,
        Searchable,
        SearchFilterable,
        TitanTextEmbedV2
      } = await loadFresh();

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      @Entity
      class WideFilterEntity extends FreshTable {
        declare readonly type: "WideFilterEntity";

        @Searchable()
        @StringAttribute({ alias: "Text" })
        public readonly text: SearchableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F01" })
        public readonly f01: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F02" })
        public readonly f02: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F03" })
        public readonly f03: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F04" })
        public readonly f04: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F05" })
        public readonly f05: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F06" })
        public readonly f06: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F07" })
        public readonly f07: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F08" })
        public readonly f08: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F09" })
        public readonly f09: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F10" })
        public readonly f10: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F11" })
        public readonly f11: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F12" })
        public readonly f12: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F13" })
        public readonly f13: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F14" })
        public readonly f14: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F15" })
        public readonly f15: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F16" })
        public readonly f16: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F17" })
        public readonly f17: FilterableText;
      }

      FreshTable.vectorIndexes({
        freshIndex: {
          name: "fresh-index",
          vectorAttribute: "__dyna_vector",
          model: TitanTextEmbedV2,
          provider: testProvider,
          members: [() => WideFilterEntity]
        }
      });

      const metadata = FreshTable.metadata();

      expect(
        metadata.vectorIndexes?.[0].searchSchema.inlineFilters
      ).toHaveLength(18);
    });

    it("rejects 19 inline filters counting the auto-added entity type filter", async () => {
      const {
        default: DynaRecord,
        Table,
        Entity,
        PartitionKeyAttribute,
        SortKeyAttribute,
        StringAttribute,
        Searchable,
        SearchFilterable,
        TitanTextEmbedV2
      } = await loadFresh();

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      @Entity
      class WideFilterEntity extends FreshTable {
        declare readonly type: "WideFilterEntity";

        @Searchable()
        @StringAttribute({ alias: "Text" })
        public readonly text: SearchableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F01" })
        public readonly f01: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F02" })
        public readonly f02: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F03" })
        public readonly f03: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F04" })
        public readonly f04: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F05" })
        public readonly f05: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F06" })
        public readonly f06: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F07" })
        public readonly f07: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F08" })
        public readonly f08: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F09" })
        public readonly f09: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F10" })
        public readonly f10: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F11" })
        public readonly f11: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F12" })
        public readonly f12: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F13" })
        public readonly f13: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F14" })
        public readonly f14: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F15" })
        public readonly f15: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F16" })
        public readonly f16: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F17" })
        public readonly f17: FilterableText;

        @SearchFilterable()
        @StringAttribute({ alias: "F18" })
        public readonly f18: FilterableText;
      }

      FreshTable.vectorIndexes({
        freshIndex: {
          name: "fresh-index",
          vectorAttribute: "__dyna_vector",
          model: TitanTextEmbedV2,
          provider: testProvider,
          members: [() => WideFilterEntity]
        }
      });

      expect(() => FreshTable.metadata()).toThrow(
        "Vector index fresh-index declares 19 inline filters counting the entity type filter the library adds automatically. DynamoDB supports at most 18 inline filters per index"
      );
    });

    it("rejects more than 5 vector indexes on one table", async () => {
      const {
        default: DynaRecord,
        Table,
        Entity,
        PartitionKeyAttribute,
        SortKeyAttribute,
        StringAttribute,
        Searchable,
        TitanTextEmbedV2
      } = await loadFresh();

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      // One entity per index, so the 5-index cap is the only rule this
      // declaration can break — the one-owner rule now rejects a shared
      // member at compile time, and a fixture violating two rules at once
      // would pass or fail on whichever happens to fire first
      @Entity
      class DocOne extends FreshTable {
        declare readonly type: "DocOne";

        @Searchable()
        @StringAttribute({ alias: "Body" })
        public readonly body: SearchableText;
      }

      @Entity
      class DocTwo extends FreshTable {
        declare readonly type: "DocTwo";

        @Searchable()
        @StringAttribute({ alias: "Body" })
        public readonly body: SearchableText;
      }

      @Entity
      class DocThree extends FreshTable {
        declare readonly type: "DocThree";

        @Searchable()
        @StringAttribute({ alias: "Body" })
        public readonly body: SearchableText;
      }

      @Entity
      class DocFour extends FreshTable {
        declare readonly type: "DocFour";

        @Searchable()
        @StringAttribute({ alias: "Body" })
        public readonly body: SearchableText;
      }

      @Entity
      class DocFive extends FreshTable {
        declare readonly type: "DocFive";

        @Searchable()
        @StringAttribute({ alias: "Body" })
        public readonly body: SearchableText;
      }

      @Entity
      class DocSix extends FreshTable {
        declare readonly type: "DocSix";

        @Searchable()
        @StringAttribute({ alias: "Body" })
        public readonly body: SearchableText;
      }

      FreshTable.vectorIndexes({
        indexOne: {
          name: "fresh-index-1",
          vectorAttribute: "__dyna_vector_1",
          model: TitanTextEmbedV2,
          provider: testProvider,
          members: [() => DocOne]
        },
        indexTwo: {
          name: "fresh-index-2",
          vectorAttribute: "__dyna_vector_2",
          model: TitanTextEmbedV2,
          provider: testProvider,
          members: [() => DocTwo]
        },
        indexThree: {
          name: "fresh-index-3",
          vectorAttribute: "__dyna_vector_3",
          model: TitanTextEmbedV2,
          provider: testProvider,
          members: [() => DocThree]
        },
        indexFour: {
          name: "fresh-index-4",
          vectorAttribute: "__dyna_vector_4",
          model: TitanTextEmbedV2,
          provider: testProvider,
          members: [() => DocFour]
        },
        indexFive: {
          name: "fresh-index-5",
          vectorAttribute: "__dyna_vector_5",
          model: TitanTextEmbedV2,
          provider: testProvider,
          members: [() => DocFive]
        },
        indexSix: {
          name: "fresh-index-6",
          vectorAttribute: "__dyna_vector_6",
          model: TitanTextEmbedV2,
          provider: testProvider,
          members: [() => DocSix]
        }
      });

      expect(() => FreshTable.metadata()).toThrow(
        "Table FreshTable defines 6 vector indexes. DynamoDB supports at most 5 vector indexes per table"
      );
    });

    it("rejects a scoped index whose members store the scope foreign key under different aliases", async () => {
      const {
        default: DynaRecord,
        Table,
        Entity,
        PartitionKeyAttribute,
        SortKeyAttribute,
        StringAttribute,
        Searchable,
        ForeignKeyAttribute,
        HasMany,
        BelongsTo,
        TitanTextEmbedV2
      } = await loadFresh();

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      @Entity
      class Shop extends FreshTable {
        declare readonly type: "Shop";

        @HasMany(() => Product, { foreignKey: "shopId" })
        public readonly products: Product[];

        @HasMany(() => Coupon, { foreignKey: "shopId" })
        public readonly coupons: Coupon[];
      }

      @Entity
      class Product extends FreshTable {
        declare readonly type: "Product";

        @Searchable()
        @StringAttribute({ alias: "Description" })
        public readonly description: SearchableText;

        @ForeignKeyAttribute(() => Shop, { alias: "ShopId" })
        public readonly shopId: ForeignKey<Shop>;

        @BelongsTo(() => Shop, { foreignKey: "shopId" })
        public readonly shop: Shop;
      }

      // The scoping foreign key resolves to a different table alias than
      // Product's — the scoped HASH cannot be one table attribute
      @Entity
      class Coupon extends FreshTable {
        declare readonly type: "Coupon";

        @Searchable()
        @StringAttribute({ alias: "Blurb" })
        public readonly blurb: SearchableText;

        @ForeignKeyAttribute(() => Shop, { alias: "OwnerShopId" })
        public readonly shopId: ForeignKey<Shop>;

        @BelongsTo(() => Shop, { foreignKey: "shopId" })
        public readonly shop: Shop;
      }

      FreshTable.vectorIndexes({
        freshIndex: {
          name: "fresh-index",
          vectorAttribute: "__dyna_vector",
          model: TitanTextEmbedV2,
          provider: testProvider,
          scopedBy: () => Shop,
          members: [() => Product, () => Coupon]
        }
      });

      expect(() => FreshTable.metadata()).toThrow(
        "The foreign key referencing Shop resolves to different table aliases (OwnerShopId, ShopId) across members of vector index fresh-index. The scoped HASH is one table attribute; align the alias across entities"
      );
    });

    it("rejects a scoped index whose scopedBy resolves to an unregistered class", async () => {
      const {
        default: DynaRecord,
        Table,
        Entity,
        PartitionKeyAttribute,
        SortKeyAttribute,
        StringAttribute,
        Searchable,
        TitanTextEmbedV2
      } = await loadFresh();

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      // Never passed through @Entity — a plausible authoring mistake for the
      // scopedBy thunk (plain class, typo'd reference, missing decorator)
      class UndecoratedParent extends FreshTable {
        declare readonly type: "UndecoratedParent";
      }

      @Entity
      class Doc extends FreshTable {
        declare readonly type: "Doc";

        @Searchable()
        @StringAttribute({ alias: "Body" })
        public readonly body: SearchableText;
      }
      void Doc;

      FreshTable.vectorIndexes({
        freshIndex: {
          name: "fresh-index",
          vectorAttribute: "__dyna_vector",
          model: TitanTextEmbedV2,
          provider: testProvider,
          scopedBy: () => UndecoratedParent,
          members: [() => Doc]
        }
      });

      expect(() => FreshTable.metadata()).toThrow(
        "Vector index fresh-index is scoped by UndecoratedParent, which is not a registered entity"
      );
    });
  });

  describe("initialization timing", () => {
    it("declaring indexes at module evaluation does not trigger metadata initialization", async () => {
      const {
        default: DynaRecord,
        Table,
        Entity,
        PartitionKeyAttribute,
        SortKeyAttribute,
        StringAttribute,
        Searchable,
        SearchFilterable,
        TitanTextEmbedV2,
        Metadata
      } = await loadFresh();

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      // Indexes declared before the entity module is evaluated — must
      // neither trigger initialization nor resolve the member thunks eagerly
      const { freshIndex } = FreshTable.vectorIndexes({
        freshIndex: {
          name: "fresh-index",
          vectorAttribute: "__dyna_vector",
          model: TitanTextEmbedV2,
          provider: testProvider,
          members: [() => Note]
        }
      });

      @Entity
      class Note extends FreshTable {
        declare readonly type: "Note";

        @Searchable()
        @StringAttribute({ alias: "Text" })
        public readonly text: SearchableText;

        @SearchFilterable()
        @StringAttribute({ alias: "Status" })
        public readonly status: FilterableText;
      }

      // If declaring the indexes had initialized metadata, Note would have
      // been frozen out of reconciliation and membership
      expect(
        FreshTable.metadata().vectorIndexes?.[0].searchSchema
      ).toStrictEqual({
        inlineFilters: ["Status", "type"]
      });
      expect(freshIndex.memberEntities).toEqual(["Note"]);
      expect(Metadata.getEntity("Note").searchableAttribute).toBeDefined();
    });

    it("an index declared after initialization is registered but never resolved, and its search fails closed", async () => {
      expect.assertions(4);

      const {
        default: DynaRecord,
        Table,
        Entity,
        PartitionKeyAttribute,
        SortKeyAttribute,
        StringAttribute,
        ForeignKeyAttribute,
        Searchable,
        TitanTextEmbedV2,
        Metadata
      } = await loadFresh();

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      @Entity
      class Shop extends FreshTable {
        declare readonly type: "Shop";

        @StringAttribute({ alias: "Name" })
        public readonly name: string;
      }

      @Entity
      class Note extends FreshTable {
        declare readonly type: "Note";

        @Searchable()
        @StringAttribute({ alias: "Text" })
        public readonly text: SearchableText;

        @ForeignKeyAttribute(() => Shop, { alias: "ShopId" })
        public readonly shopId: ForeignKey<Shop>;
      }

      FreshTable.vectorIndexes({
        first: {
          name: "first-index",
          vectorAttribute: "__dyna_vector",
          model: TitanTextEmbedV2,
          provider: testProvider,
          scopedBy: () => Shop,
          members: [() => Note]
        }
      });

      // Triggers metadata initialization, which resolves `first`
      FreshTable.metadata();
      expect(Metadata.getVectorIndexes("FreshTable")[0].hashAlias).toBe(
        "ShopId"
      );

      // A second table whose indexes are declared only AFTER that first
      // access. Registration still succeeds — it never touches metadata — but
      // resolution has already run, so the index keeps its placeholders.
      @Table({ name: "late-table" })
      abstract class LateTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      @Entity
      class LateShop extends LateTable {
        declare readonly type: "LateShop";

        @StringAttribute({ alias: "Name" })
        public readonly name: string;
      }

      @Entity
      class LateNote extends LateTable {
        declare readonly type: "LateNote";

        @Searchable()
        @StringAttribute({ alias: "Text" })
        public readonly text: SearchableText;

        @ForeignKeyAttribute(() => LateShop, { alias: "ShopId" })
        public readonly shopId: ForeignKey<LateShop>;
      }

      const { late } = LateTable.vectorIndexes({
        late: {
          name: "late-index",
          vectorAttribute: "__dyna_vector",
          model: TitanTextEmbedV2,
          provider: testProvider,
          scopedBy: () => LateShop,
          members: [() => LateNote]
        }
      });

      // Unresolved: the scoped HASH was never computed
      expect(late.hashAlias).toBeUndefined();
      expect(late.memberEntities).toEqual([]);

      // The consequence that matters: an unresolved scoped index has no HASH,
      // so the search layer treats it as unscoped and refuses the scope id
      // rather than silently searching without tenant isolation
      await expect(late.search("shop-1", "anything")).rejects.toThrow(
        "is unscoped"
      );
    });

    it("an entity module loaded after initialization is registered but never reconciled or validated", async () => {
      const {
        default: DynaRecord,
        Table,
        Entity,
        PartitionKeyAttribute,
        SortKeyAttribute,
        StringAttribute,
        Searchable,
        TitanTextEmbedV2,
        Metadata
      } = await loadFresh();

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      @Entity
      class Note extends FreshTable {
        declare readonly type: "Note";

        @Searchable()
        @StringAttribute({ alias: "Text" })
        public readonly text: SearchableText;
      }

      FreshTable.vectorIndexes({
        freshIndex: {
          name: "fresh-index",
          vectorAttribute: "__dyna_vector",
          model: TitanTextEmbedV2,
          provider: testProvider,
          members: [() => Note]
        }
      });

      // Triggers metadata initialization
      FreshTable.metadata();
      expect(Metadata.getVectorIndexes("FreshTable")[0].memberEntities).toEqual(
        ["Note"]
      );

      // Evaluated after initialization: registered, but validation
      // completeness is scoped to the import graph evaluated at first
      // metadata access — this invalid entity is never reconciled and its
      // double @Searchable marks are never validated
      // @ts-expect-error: the compile-time assist rejects a second @Searchable attribute; this test exercises late registration
      @Entity
      class LateEntity extends FreshTable {
        declare readonly type: "LateEntity";

        @Searchable()
        @StringAttribute({ alias: "A" })
        public readonly a: SearchableText;

        @Searchable()
        @StringAttribute({ alias: "B" })
        public readonly b: SearchableText;
      }
      void LateEntity;

      expect(() => FreshTable.metadata()).not.toThrow();
      expect(Metadata.getEntity("LateEntity")).toBeDefined();
      expect(
        Metadata.getEntity("LateEntity").searchableAttribute
      ).toBeUndefined();
      expect(Metadata.getVectorIndexes("FreshTable")[0].memberEntities).toEqual(
        ["Note"]
      );
    });
  });

  describe("types", () => {
    it("rejects unknown options", () => {
      const _define = (): void => {
        void SearchTable.vectorIndexes({
          // @ts-expect-error: unknown options are rejected
          typedIndex: {
            name: "typed-index",
            vectorAttribute: "__dyna_vector_typed",
            model: TitanTextEmbedV2,
            provider: mockEmbeddingProvider,
            members: [() => Review],
            unknownOption: true
          }
        });
      };

      expect(_define).toBeDefined();
    });

    it("requires a provider", () => {
      const _define = (): void => {
        void SearchTable.vectorIndexes({
          // @ts-expect-error: provider is required configuration
          typedIndex: {
            name: "typed-index",
            vectorAttribute: "__dyna_vector_typed",
            model: TitanTextEmbedV2,
            members: [() => Review]
          }
        });
      };

      expect(_define).toBeDefined();
    });

    it("scopedBy must be a thunk returning an entity class", () => {
      const _define = (): void => {
        void SearchTable.vectorIndexes({
          typedIndex: {
            name: "typed-index",
            vectorAttribute: "__dyna_vector_typed",
            model: TitanTextEmbedV2,
            provider: mockEmbeddingProvider,
            // @ts-expect-error: scopedBy must be a thunk returning an entity class
            scopedBy: () => "Store",
            members: [() => Review]
          }
        });
      };

      expect(_define).toBeDefined();
    });

    it("rejects an entity declaring more than one @Searchable attribute", () => {
      // The compile-time twin of the metadata-initialization error asserted in
      // "rejects multiple @Searchable attributes on one entity". Declared
      // inside a closure that is never invoked, so no decorator ever runs and
      // no entity is registered.
      const _define = (): void => {
        // @ts-expect-error: entities may declare at most one @Searchable
        @Entity
        class TwoSearchable extends SearchTable {
          declare readonly type: "TwoSearchable";

          @Searchable()
          @StringAttribute({ alias: "First" })
          public readonly first: SearchableText;

          @Searchable()
          @StringAttribute({ alias: "Second" })
          public readonly second: SearchableText;
        }
        void TwoSearchable;

        // @ts-expect-no-error: exactly one is the rule, not zero-or-one
        @Entity
        class OneSearchable extends SearchTable {
          declare readonly type: "OneSearchable";

          @Searchable()
          @StringAttribute({ alias: "Only" })
          public readonly only: SearchableText;
        }
        void OneSearchable;
      };

      expect(_define).toBeDefined();
    });

    it("model descriptors require every field, with the declared shapes", () => {
      const _define = (): void => {
        // @ts-expect-error: dimensions is required
        const _noDimensions: EmbeddingModelDescriptor = {
          name: "m",
          distanceFunction: "COSINE",
          scoreToSimilarity: (score: number) => 1 - score
        };

        const _badDistance: EmbeddingModelDescriptor = {
          name: "m",
          dimensions: 8,
          // @ts-expect-error: distanceFunction must be one AWS supports
          distanceFunction: "MANHATTAN",
          scoreToSimilarity: (score: number) => 1 - score
        };

        const _badConversion: EmbeddingModelDescriptor = {
          name: "m",
          dimensions: 8,
          distanceFunction: "COSINE",
          // @ts-expect-error: scoreToSimilarity maps a number to a number
          scoreToSimilarity: (score: number) => `${String(score)}`
        };

        const _badDimensions: EmbeddingModelDescriptor = {
          name: "m",
          // @ts-expect-error: dimensions is a number
          dimensions: "8",
          distanceFunction: "COSINE",
          scoreToSimilarity: (score: number) => 1 - score
        };

        // @ts-expect-no-error: every AWS distance function is accepted
        const _dotProduct: EmbeddingModelDescriptor = {
          name: "m",
          dimensions: 8,
          distanceFunction: "DOT_PRODUCT",
          scoreToSimilarity: (score: number) => score
        };

        // @ts-expect-no-error
        const _euclidean: EmbeddingModelDescriptor = {
          name: "m",
          dimensions: 8,
          distanceFunction: "EUCLIDEAN",
          scoreToSimilarity: (score: number) => 1 / (1 + score)
        };
      };

      expect(_define).toBeDefined();
    });

    it("vectorAttribute accepts exactly the reserved prefix forms", () => {
      const base = {
        model: TitanTextEmbedV2,
        provider: mockEmbeddingProvider,
        members: [() => Review]
      };

      const _define = (): void => {
        // @ts-expect-no-error: the bare reserved prefix
        void SearchTable.vectorIndexes({
          a: { ...base, name: "a", vectorAttribute: "__dyna_vector" }
        });

        // @ts-expect-no-error: prefix followed by a suffix
        void SearchTable.vectorIndexes({
          b: { ...base, name: "b", vectorAttribute: "__dyna_vector_support" }
        });

        // @ts-expect-no-error: boundary — an empty suffix after the separator
        void SearchTable.vectorIndexes({
          c: { ...base, name: "c", vectorAttribute: "__dyna_vector_" }
        });

        void SearchTable.vectorIndexes({
          // @ts-expect-error: boundary — prefix without the "_" separator
          d: { ...base, name: "d", vectorAttribute: "__dyna_vectorx" }
        });

        void SearchTable.vectorIndexes({
          // @ts-expect-error: not under the reserved prefix at all
          e: { ...base, name: "e", vectorAttribute: "embedding" }
        });

        void SearchTable.vectorIndexes({
          // @ts-expect-error: a computed string is not a valid literal
          f: { ...base, name: "f", vectorAttribute: String("__dyna_vector") }
        });
      };

      expect(_define).toBeDefined();
    });

    it("accepts a full valid configuration", () => {
      const _define = (): void => {
        // @ts-expect-no-error: valid configuration with scope and member thunks
        void SearchTable.vectorIndexes({
          typedIndex: {
            name: "typed-index",
            vectorAttribute: "__dyna_vector_typed",
            model: TitanTextEmbedV2,
            provider: mockEmbeddingProvider,
            scopedBy: () => Store,
            members: [() => Review]
          }
        });
      };

      expect(_define).toBeDefined();
    });

    it("VectorIndexMetadata is exported as a type, never as a constructor", () => {
      const _test = (
        index: import("../../index.js").VectorIndexMetadata
      ): string => {
        // @ts-expect-no-error: a consumer typing a helper around a construct
        // reads every documented field
        const read = `${index.name}:${index.vectorAttribute}:${String(
          index.hashAlias
        )}:${index.memberEntities.join(",")}:${index.fingerprint}`;

        // @ts-expect-error: type-only — a construct is produced by
        // Table.vectorIndexes(), which registers and resolves it. A
        // hand-constructed index would be unregistered and unresolved, and
        // would fail confusingly on its first search
        void new PublicVectorIndexMetadata();

        return read;
      };

      expect(_test).toBeDefined();
    });

    it("the declaration types are nameable from the entry point", () => {
      const _test = (): void => {
        // The names a consumer writes when typing their own wrapper around
        // the declaration surface, rather than inlining the literal
        const attribute: import("../../index.js").VectorAttributeName =
          "__dyna_vector_support";
        // @ts-expect-error: must use the reserved prefix
        const _badAttribute: import("../../index.js").VectorAttributeName =
          "embedding";

        const model: import("../../index.js").EmbeddingModelDescriptor =
          TitanTextEmbedV2;
        const provider: import("../../index.js").EmbeddingProvider = async () =>
          await Promise.resolve([0.1]);

        // @ts-expect-no-error: the option shape a declaration is built from
        const _options: import("../../index.js").VectorIndexOptions = {
          name: "support-index",
          vectorAttribute: attribute,
          model,
          provider,
          members: []
        };
      };

      expect(_test).toBeDefined();
    });
  });

  describe("the index construct's public surface", () => {
    it("exposes the resolved declaration as frozen, read-only fields", () => {
      expect.assertions(4);

      // The construct a consumer holds IS the registry's resolved index, so
      // a consumer reading its metadata cannot reach in and repoint the
      // search it compiles
      expect(Object.isFrozen(storeSearchIndex)).toBe(true);
      expect(storeSearchIndex.name).toBe("store-search-index");
      expect(storeSearchIndex.hashAlias).toBe("StoreId");
      expect(storeSearchIndex.memberEntities).toStrictEqual([
        "Listing",
        "Review"
      ]);
    });

    it("rejects writes to the resolved fields at compile time", () => {
      const _test = (): void => {
        // @ts-expect-error: getters with no setters — resolution is the
        // registry's job, not a caller's
        storeSearchIndex.hashAlias = "TenantId";
        // @ts-expect-error: read-only
        storeSearchIndex.memberEntities = [];
        // @ts-expect-error: read-only
        storeSearchIndex.fingerprint = "";
        // @ts-expect-error: the members array itself is readonly
        storeSearchIndex.memberEntities.push("Article");
      };

      expect(_test).toBeDefined();
    });
  });
});
