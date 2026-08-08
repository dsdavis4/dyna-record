/* eslint-disable @typescript-eslint/no-unused-vars */
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
import Metadata, { vectorSearchKeys } from "../../src/metadata/index.js";
import { TitanTextEmbedV2 } from "../../src/embedding/types.js";
import type {
  EmbeddingProvider,
  ForeignKey,
  PartitionKey,
  Searchable as SearchableText,
  SearchFilterable as FilterableText,
  SortKey
} from "../../src/index.js";

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
            inlineFilters: ["Category", "Type"]
          },
          fingerprint: fingerprintOf(
            "hash=StoreId;filters=Category,Type;dimensions=1024;distance=COSINE"
          ),
          scopedBy: "Store"
        },
        {
          name: "global-search-index",
          model: "amazon.titan-embed-text-v2:0",
          vectorAttribute: "__dyna_vector",
          dimensions: 1024,
          distanceFunction: "COSINE",
          projection: "ALL",
          searchSchema: {
            inlineFilters: ["Category", "Type"]
          },
          fingerprint: fingerprintOf(
            "hash=;filters=Category,Type;dimensions=1024;distance=COSINE"
          )
        }
      ]);
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
    it("resolves scoped index membership from the scope parent's declared adjacency union the include list", () => {
      expect.assertions(3);

      const [scopedIndex, globalIndex] =
        Metadata.getVectorIndexes("SearchTable");

      // Listing via Store's HasMany, Review via include
      expect(scopedIndex.memberEntities).toEqual(["Listing", "Review"]);
      expect(scopedIndex.hashAlias).toBe("StoreId");
      // Global indexes include every searchable entity of the table
      expect(globalIndex.memberEntities).toEqual([
        "Article",
        "Listing",
        "Review"
      ]);
    });

    it("returns the typed index construct from the factory", () => {
      expect.assertions(5);

      expect(storeSearchIndex.name).toBe("store-search-index");
      expect(storeSearchIndex.model).toBe(TitanTextEmbedV2);
      expect(storeSearchIndex.provider).toBe(mockEmbeddingProvider);
      expect(Metadata.getVectorIndexes("SearchTable")[0]).toBe(
        storeSearchIndex
      );
      expect(Metadata.getVectorIndexes("SearchTable")[1]).toBe(
        globalSearchIndex
      );
    });

    it("registers the content hash as a library-managed attribute on searchable entities", () => {
      expect.assertions(3);

      const attrs = Metadata.getEntityAttributes(Listing.name);

      expect(attrs[vectorSearchKeys.contentHash]).toMatchObject({
        name: vectorSearchKeys.contentHash,
        alias: vectorSearchKeys.contentHash,
        kind: "string",
        nullable: true
      });
      expect(
        Metadata.getEntityTableAttributes(Listing.name)[
          vectorSearchKeys.contentHash
        ]
      ).toBeDefined();
      // Non-searchable entities do not carry the content hash attribute
      expect(
        Metadata.getEntityAttributes(Store.name)[vectorSearchKeys.contentHash]
      ).toBeUndefined();
    });

    it("guardrail: the vector attribute alias never appears in any entity's attribute maps", () => {
      const tables = ["MockTable", "OtherTable", "SearchTable"];

      for (const table of tables) {
        for (const entityMeta of Object.values(
          Metadata.getEntitiesForTable(table)
        )) {
          expect(
            entityMeta.attributes[vectorSearchKeys.vector]
          ).toBeUndefined();
          expect(
            entityMeta.tableAttributes[vectorSearchKeys.vector]
          ).toBeUndefined();
          expect(
            Object.values(entityMeta.attributes).some(
              attr => attr.alias === vectorSearchKeys.vector
            )
          ).toBe(false);
        }
      }
    });

    it("registers the vector search aliases as reserved keys on every table", () => {
      expect.assertions(2);

      const { reservedKeys } = Metadata.getTable("MockTable");

      expect(reservedKeys[vectorSearchKeys.vector]).toBe(true);
      expect(reservedKeys[vectorSearchKeys.contentHash]).toBe(true);
    });

    it("throws when defining a vector index on a class that is not a table class", () => {
      expect.assertions(1);

      expect(() =>
        Listing.vectorIndex({
          name: "invalid-index",
          model: TitanTextEmbedV2,
          provider: mockEmbeddingProvider
        })
      ).toThrow(
        "vectorIndex can only be defined on a table class decorated with @Table. Listing is not a registered table"
      );
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

      FreshTable.vectorIndex({
        name: "fresh-index",
        model: TitanTextEmbedV2,
        provider: testProvider
      });

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

      FreshTable.vectorIndex({
        name: "fresh-index",
        model: TitanTextEmbedV2,
        provider: testProvider
      });

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

      FreshTable.vectorIndex({
        name: "fresh-index",
        model: TitanTextEmbedV2,
        provider: testProvider
      });

      @Entity
      class NumberSearchable extends FreshTable {
        declare readonly type: "NumberSearchable";

        // @ts-expect-error: @Searchable requires the Searchable brand, which is a string brand
        @Searchable()
        @NumberAttribute({ alias: "Count" })
        public readonly count: number;
      }

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

      FreshTable.vectorIndex({
        name: "fresh-index",
        model: TitanTextEmbedV2,
        provider: testProvider
      });

      @Entity
      class MissingBase extends FreshTable {
        declare readonly type: "MissingBase";

        @Searchable()
        public readonly text: SearchableText;
      }

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

      FreshTable.vectorIndex({
        name: "fresh-index",
        model: TitanTextEmbedV2,
        provider: testProvider
      });

      @Entity
      class EnumSearchable extends FreshTable {
        declare readonly type: "EnumSearchable";

        @Searchable()
        @EnumAttribute({ alias: "Status", values: ["draft", "published"] })
        public readonly status: SearchableText<"draft" | "published">;
      }

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

      FreshTable.vectorIndex({
        name: "fresh-index",
        model: TitanTextEmbedV2,
        provider: testProvider
      });

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

      expect(() => FreshTable.metadata()).toThrow(
        "@SearchFilterable on DateFilterable.publishedOn must be layered over a string, number, boolean, enum, or foreign key attribute decorator (EX: @StringAttribute)"
      );
    });

    it("rejects a searchable entity carrying the scoping foreign key that is neither declared nor included, naming the fix", async () => {
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
      class Vendor extends FreshTable {
        declare readonly type: "Vendor";

        @StringAttribute({ alias: "Name" })
        public readonly name: string;
      }

      @Entity
      class AuditNote extends FreshTable {
        declare readonly type: "AuditNote";

        @Searchable()
        @StringAttribute({ alias: "Note" })
        public readonly note: SearchableText;

        @ForeignKeyAttribute(() => Vendor, { alias: "VendorId" })
        public readonly vendorId: ForeignKey<Vendor>;
      }

      FreshTable.vectorIndex({
        name: "vendor-index",
        model: TitanTextEmbedV2,
        provider: testProvider,
        scopedBy: () => Vendor
      });

      expect(() => FreshTable.metadata()).toThrow(
        "Entity AuditNote is searchable and has a foreign key to Vendor but is not a member of vector index vendor-index. Declare a relationship from Vendor to AuditNote or add () => AuditNote to the index's include list"
      );
    });

    it("accepts an FK-only searchable entity added through the include list", async () => {
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
      class Vendor extends FreshTable {
        declare readonly type: "Vendor";

        @StringAttribute({ alias: "Name" })
        public readonly name: string;
      }

      @Entity
      class AuditNote extends FreshTable {
        declare readonly type: "AuditNote";

        @Searchable()
        @StringAttribute({ alias: "Note" })
        public readonly note: SearchableText;

        @ForeignKeyAttribute(() => Vendor, { alias: "VendorId" })
        public readonly vendorId: ForeignKey<Vendor>;
      }

      FreshTable.vectorIndex({
        name: "vendor-index",
        model: TitanTextEmbedV2,
        provider: testProvider,
        scopedBy: () => Vendor,
        include: [() => AuditNote]
      });

      const metadata = FreshTable.metadata();

      expect(metadata.vectorIndexes?.[0].searchSchema).toStrictEqual({
        hash: "VendorId",
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
      class Vendor extends FreshTable {
        declare readonly type: "Vendor";

        @StringAttribute({ alias: "Name" })
        public readonly name: string;

        @HasAndBelongsToMany(() => Tag, {
          targetKey: "vendors",
          through: () => ({ joinTable: VendorTag, foreignKey: "vendorId" })
        })
        public readonly tags: Tag[];
      }

      @Entity
      class Tag extends FreshTable {
        declare readonly type: "Tag";

        @Searchable()
        @StringAttribute({ alias: "Label" })
        public readonly label: SearchableText;

        @HasAndBelongsToMany(() => Vendor, {
          targetKey: "tags",
          through: () => ({ joinTable: VendorTag, foreignKey: "tagId" })
        })
        public readonly vendors: Vendor[];
      }

      class VendorTag extends JoinTable<Vendor, Tag> {
        public readonly vendorId: ForeignKey;
        public readonly tagId: ForeignKey;
      }

      FreshTable.vectorIndex({
        name: "vendor-index",
        model: TitanTextEmbedV2,
        provider: testProvider,
        scopedBy: () => Vendor
      });

      expect(() => FreshTable.metadata()).toThrow(
        "Entity Tag is a member of vector index vendor-index but has no foreign key attribute referencing Vendor on its own record (HasAndBelongsToMany relationships store foreign keys on the join table). Add a @ForeignKeyAttribute referencing Vendor to Tag"
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

      expect(() => FreshTable.metadata()).toThrow(
        "Table FreshTable has searchable entities (Note) but no vector index with an embedding provider. Define one with FreshTable.vectorIndex({ name, model, provider })"
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

      FreshTable.vectorIndex({
        name: "fresh-index",
        model: TitanTextEmbedV2,
        provider: undefined as unknown as EmbeddingProvider
      });

      @Entity
      class Note extends FreshTable {
        declare readonly type: "Note";

        @Searchable()
        @StringAttribute({ alias: "Text" })
        public readonly text: SearchableText;
      }

      expect(() => FreshTable.metadata()).toThrow(
        "Vector index fresh-index has no embedding provider configured. Set provider (an embed function) on FreshTable.vectorIndex"
      );
    });

    it("rejects a consumer attribute whose table alias collides with the vector alias", async () => {
      const {
        default: DynaRecord,
        Table,
        Entity,
        PartitionKeyAttribute,
        SortKeyAttribute,
        StringAttribute
      } = await loadFresh();

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      @Entity
      class Colliding extends FreshTable {
        declare readonly type: "Colliding";

        @StringAttribute({ alias: vectorSearchKeys.vector })
        public readonly sneaky: string;
      }

      expect(() => FreshTable.metadata()).toThrow(
        "Attribute Colliding.sneaky uses the table alias __dyna_vector, which is reserved for the library-managed vector search attributes"
      );
    });

    it("rejects a consumer attribute whose table alias collides with the content hash alias", async () => {
      const {
        default: DynaRecord,
        Table,
        Entity,
        PartitionKeyAttribute,
        SortKeyAttribute,
        StringAttribute
      } = await loadFresh();

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      @Entity
      class Colliding extends FreshTable {
        declare readonly type: "Colliding";

        @StringAttribute({ alias: vectorSearchKeys.contentHash })
        public readonly sneaky: string;
      }

      expect(() => FreshTable.metadata()).toThrow(
        "Attribute Colliding.sneaky uses the table alias __dyna_vector_hash, which is reserved for the library-managed vector search attributes"
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

      FreshTable.vectorIndex({
        name: "fresh-index",
        model: TitanTextEmbedV2,
        provider: testProvider
      });

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

      FreshTable.vectorIndex({
        name: "fresh-index",
        model: TitanTextEmbedV2,
        provider: testProvider
      });

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

      FreshTable.vectorIndex({
        name: "fresh-index",
        model: TitanTextEmbedV2,
        provider: testProvider
      });

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

      expect(() => FreshTable.metadata()).toThrow(
        "Vector index fresh-index declares 19 inline filters counting the entity type filter the library adds automatically. DynamoDB supports at most 18 inline filters per index"
      );
    });

    it("rejects more than 5 vector indexes on one table", async () => {
      const {
        default: DynaRecord,
        Table,
        PartitionKeyAttribute,
        SortKeyAttribute,
        TitanTextEmbedV2
      } = await loadFresh();

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      for (let i = 1; i <= 6; i++) {
        FreshTable.vectorIndex({
          name: `fresh-index-${i}`,
          model: TitanTextEmbedV2,
          provider: testProvider
        });
      }

      expect(() => FreshTable.metadata()).toThrow(
        "Table FreshTable defines 6 vector indexes. DynamoDB supports at most 5 vector indexes per table"
      );
    });
  });

  describe("initialization timing", () => {
    it("defining an index at module evaluation does not trigger metadata initialization", async () => {
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

      // Index defined before any entity module is evaluated — must neither
      // trigger initialization nor resolve membership eagerly
      const index = FreshTable.vectorIndex({
        name: "fresh-index",
        model: TitanTextEmbedV2,
        provider: testProvider
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

      // If defining the index had initialized metadata, Note would have been
      // frozen out of reconciliation and membership
      expect(
        FreshTable.metadata().vectorIndexes?.[0].searchSchema
      ).toStrictEqual({
        inlineFilters: ["Status", "type"]
      });
      expect(index.memberEntities).toEqual(["Note"]);
      expect(Metadata.getEntity("Note").searchableAttribute).toBeDefined();
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

      FreshTable.vectorIndex({
        name: "fresh-index",
        model: TitanTextEmbedV2,
        provider: testProvider
      });

      @Entity
      class Note extends FreshTable {
        declare readonly type: "Note";

        @Searchable()
        @StringAttribute({ alias: "Text" })
        public readonly text: SearchableText;
      }

      // Triggers metadata initialization
      FreshTable.metadata();
      expect(Metadata.getVectorIndexes("FreshTable")[0].memberEntities).toEqual(
        ["Note"]
      );

      // Evaluated after initialization: registered, but validation
      // completeness is scoped to the import graph evaluated at first
      // metadata access — this invalid entity is never reconciled and its
      // double @Searchable marks are never validated
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
        void SearchTable.vectorIndex({
          name: "typed-index",
          model: TitanTextEmbedV2,
          provider: mockEmbeddingProvider,
          // @ts-expect-error: unknown options are rejected
          unknownOption: true
        });
      };

      expect(_define).toBeDefined();
    });

    it("requires a provider", () => {
      const _define = (): void => {
        // @ts-expect-error: provider is required configuration
        void SearchTable.vectorIndex({
          name: "typed-index",
          model: TitanTextEmbedV2
        });
      };

      expect(_define).toBeDefined();
    });

    it("scopedBy must be a thunk returning an entity class", () => {
      const _define = (): void => {
        void SearchTable.vectorIndex({
          name: "typed-index",
          model: TitanTextEmbedV2,
          provider: mockEmbeddingProvider,
          // @ts-expect-error: scopedBy must be a thunk returning an entity class
          scopedBy: () => "Store"
        });
      };

      expect(_define).toBeDefined();
    });

    it("accepts a full valid configuration", () => {
      const _define = (): void => {
        // @ts-expect-no-error: valid configuration with scope and include thunks
        void SearchTable.vectorIndex({
          name: "typed-index",
          model: TitanTextEmbedV2,
          provider: mockEmbeddingProvider,
          scopedBy: () => Store,
          include: [() => Review]
        });
      };

      expect(_define).toBeDefined();
    });
  });
});
