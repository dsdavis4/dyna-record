import { createHash } from "node:crypto";
import type {
  ForeignKey,
  PartitionKey,
  Searchable as SearchableText,
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

type FreshModules = Awaited<ReturnType<typeof loadFresh>>;

/**
 * Builds the standard disjoint two-index fixture on a fresh registry: a
 * Store scope parent and two searchable entities (Listing, SupportArticle), each
 * owned by its own Store-scoped index over its own vector attribute
 */
const buildDisjointFixture = (modules: FreshModules) => {
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
    TitanTextEmbedV2Dim512
  } = modules;

  @Table({ name: "fresh-table" })
  abstract class FreshTable extends DynaRecord {
    @PartitionKeyAttribute({ alias: "PK" })
    public readonly pk: PartitionKey;

    @SortKeyAttribute({ alias: "SK" })
    public readonly sk: SortKey;
  }

  @Entity
  class Store extends FreshTable {
    declare readonly type: "Store";
  }

  @Entity
  class Listing extends FreshTable {
    declare readonly type: "Listing";

    @ForeignKeyAttribute(() => Store, { alias: "StoreId" })
    public readonly storeId: ForeignKey<Store>;

    @Searchable()
    @StringAttribute({ alias: "Description" })
    public readonly description: SearchableText;
  }

  @Entity
  class SupportArticle extends FreshTable {
    declare readonly type: "SupportArticle";

    @ForeignKeyAttribute(() => Store, { alias: "StoreId" })
    public readonly storeId: ForeignKey<Store>;

    @Searchable()
    @StringAttribute({ alias: "Question" })
    public readonly question: SearchableText;
  }

  const indexes = FreshTable.vectorIndexes({
    listingIndex: {
      name: "listing-index",
      vectorAttribute: "__dyna_vector",
      model: TitanTextEmbedV2,
      provider: testProvider,
      scopedBy: () => Store,
      members: [() => Listing]
    },
    supportIndex: {
      name: "support-index",
      vectorAttribute: "__dyna_vector_support",
      model: TitanTextEmbedV2Dim512,
      provider: testProvider,
      scopedBy: () => Store,
      members: [() => SupportArticle]
    }
  });

  return { FreshTable, Store, Listing, SupportArticle, ...indexes };
};

describe("vectorIndexes", () => {
  describe("definition time", () => {
    it("registers a table's indexes in one call and returns constructs keyed as declared", async () => {
      expect.assertions(4);
      const modules = await loadFresh();

      const { listingIndex, supportIndex } = buildDisjointFixture(modules);

      expect(listingIndex.name).toBe("listing-index");
      expect(listingIndex.vectorAttribute).toBe("__dyna_vector");
      expect(supportIndex.name).toBe("support-index");
      expect(supportIndex.vectorAttribute).toBe("__dyna_vector_support");
    });

    it("throws when declaring vector indexes on a class that is not a table class", async () => {
      expect.assertions(1);
      const modules = await loadFresh();
      const { Entity, TitanTextEmbedV2 } = modules;
      const { FreshTable } = buildDisjointFixture(modules);

      @Entity
      class Widget extends FreshTable {
        declare readonly type: "Widget";
      }

      expect(() =>
        Widget.vectorIndexes({
          invalidIndex: {
            name: "invalid-index",
            vectorAttribute: "__dyna_vector",
            model: TitanTextEmbedV2,
            provider: testProvider,
            members: [() => Widget]
          }
        })
      ).toThrow(
        "vectorIndexes can only be defined on a table class decorated with @Table. Widget is not a registered table"
      );
    });

    it("throws on a second vectorIndexes call for the same table", async () => {
      expect.assertions(1);
      const modules = await loadFresh();
      const { FreshTable, Store, Listing } = buildDisjointFixture(modules);
      const { TitanTextEmbedV2 } = modules;

      expect(() =>
        FreshTable.vectorIndexes({
          stragglerIndex: {
            name: "straggler-index",
            vectorAttribute: "__dyna_vector_straggler",
            model: TitanTextEmbedV2,
            provider: testProvider,
            scopedBy: () => Store,
            members: [() => Listing]
          }
        })
      ).toThrow(
        "vectorIndexes was already called for table FreshTable. A table declares all of its vector indexes in one vectorIndexes call — merge the declarations into that call"
      );
    });

    it("throws when the call declares no indexes", async () => {
      expect.assertions(1);
      const modules = await loadFresh();
      const { default: DynaRecord, Table, PartitionKeyAttribute, SortKeyAttribute } =
        modules;

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      expect(() => FreshTable.vectorIndexes({})).toThrow(
        "vectorIndexes on table FreshTable declares no indexes. Declare at least one index, or remove the call"
      );
    });

    it("throws when two indexes declare the same vectorAttribute", async () => {
      expect.assertions(1);
      const modules = await loadFresh();
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
      } = modules;

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      @Entity
      class Store extends FreshTable {
        declare readonly type: "Store";
      }

      @Entity
      class Listing extends FreshTable {
        declare readonly type: "Listing";

        @ForeignKeyAttribute(() => Store, { alias: "StoreId" })
        public readonly storeId: ForeignKey<Store>;

        @Searchable()
        @StringAttribute({ alias: "Description" })
        public readonly description: SearchableText;
      }

      expect(() =>
        FreshTable.vectorIndexes({
          indexA: {
            name: "index-a",
            vectorAttribute: "__dyna_vector",
            model: TitanTextEmbedV2,
            provider: testProvider,
            scopedBy: () => Store,
            members: [() => Listing]
          },
          indexB: {
            name: "index-b",
            vectorAttribute: "__dyna_vector",
            model: TitanTextEmbedV2,
            provider: testProvider,
            scopedBy: () => Store,
            members: [() => Listing]
          }
        })
      ).toThrow(
        "Vector indexes indexA and indexB on table FreshTable both declare vectorAttribute __dyna_vector. The vector attribute is an index's physical membership surface — give each index its own"
      );
    });

    it("throws when two indexes declare the same IndexName", async () => {
      expect.assertions(1);
      const modules = await loadFresh();
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
      } = modules;

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      @Entity
      class Store extends FreshTable {
        declare readonly type: "Store";
      }

      @Entity
      class Listing extends FreshTable {
        declare readonly type: "Listing";

        @ForeignKeyAttribute(() => Store, { alias: "StoreId" })
        public readonly storeId: ForeignKey<Store>;

        @Searchable()
        @StringAttribute({ alias: "Description" })
        public readonly description: SearchableText;
      }

      expect(() =>
        FreshTable.vectorIndexes({
          indexA: {
            name: "same-index-name",
            vectorAttribute: "__dyna_vector_a",
            model: TitanTextEmbedV2,
            provider: testProvider,
            scopedBy: () => Store,
            members: [() => Listing]
          },
          indexB: {
            name: "same-index-name",
            vectorAttribute: "__dyna_vector_b",
            model: TitanTextEmbedV2,
            provider: testProvider,
            scopedBy: () => Store,
            members: [() => Listing]
          }
        })
      ).toThrow(
        "Vector indexes indexA and indexB on table FreshTable both declare the IndexName same-index-name. Give each index its own name"
      );
    });

    it("throws when a vectorAttribute does not use the reserved prefix", async () => {
      expect.assertions(1);
      const modules = await loadFresh();
      const { default: DynaRecord, Table, PartitionKeyAttribute, SortKeyAttribute, TitanTextEmbedV2 } =
        modules;

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      expect(() =>
        FreshTable.vectorIndexes({
          badIndex: {
            name: "bad-index",
            vectorAttribute: "Embedding",
            model: TitanTextEmbedV2,
            provider: testProvider,
            members: []
          }
        })
      ).toThrow(
        "Vector index bad-index declares vectorAttribute Embedding. A vector attribute must be __dyna_vector or start with __dyna_vector_"
      );
    });

    it("allows a scoped and an unscoped index to coexist with disjoint members", async () => {
      expect.assertions(3);
      const modules = await loadFresh();
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
      } = modules;

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      @Entity
      class Store extends FreshTable {
        declare readonly type: "Store";
      }

      @Entity
      class Listing extends FreshTable {
        declare readonly type: "Listing";

        @ForeignKeyAttribute(() => Store, { alias: "StoreId" })
        public readonly storeId: ForeignKey<Store>;

        @Searchable()
        @StringAttribute({ alias: "Description" })
        public readonly description: SearchableText;
      }

      @Entity
      class Faq extends FreshTable {
        declare readonly type: "Faq";

        @Searchable()
        @StringAttribute({ alias: "Question" })
        public readonly question: SearchableText;
      }

      const { scopedIndex, unscopedIndex } = FreshTable.vectorIndexes({
        scopedIndex: {
          name: "scoped-index",
          vectorAttribute: "__dyna_vector",
          model: TitanTextEmbedV2,
          provider: testProvider,
          scopedBy: () => Store,
          members: [() => Listing]
        },
        unscopedIndex: {
          name: "unscoped-index",
          vectorAttribute: "__dyna_vector_faq",
          model: TitanTextEmbedV2,
          provider: testProvider,
          members: [() => Faq]
        }
      });

      expect(() => FreshTable.metadata()).not.toThrow();
      expect(scopedIndex.memberEntities).toStrictEqual(["Listing"]);
      expect(unscopedIndex.memberEntities).toStrictEqual(["Faq"]);
    });

    it("throws when an index declares no members", async () => {
      expect.assertions(1);
      const modules = await loadFresh();
      const { default: DynaRecord, Table, Entity, PartitionKeyAttribute, SortKeyAttribute, TitanTextEmbedV2 } =
        modules;

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      @Entity
      class Store extends FreshTable {
        declare readonly type: "Store";
      }

      expect(() =>
        FreshTable.vectorIndexes({
          // @ts-expect-error: members is required on every index; this exercises the runtime backstop
          memberlessIndex: {
            name: "memberless-index",
            vectorAttribute: "__dyna_vector",
            model: TitanTextEmbedV2,
            provider: testProvider,
            scopedBy: () => Store
          }
        })
      ).toThrow(
        "Vector index memberless-index declares no members. An index's members list is its complete membership — list every searchable entity the index owns"
      );
    });
  });

  describe("metadata initialization", () => {
    it("resolves disjoint membership and assigns each searchable entity its owning index", async () => {
      expect.assertions(4);
      const modules = await loadFresh();
      const { Metadata } = modules;
      const { FreshTable, listingIndex, supportIndex } =
        buildDisjointFixture(modules);

      FreshTable.metadata();

      expect(listingIndex.memberEntities).toStrictEqual(["Listing"]);
      expect(supportIndex.memberEntities).toStrictEqual(["SupportArticle"]);
      expect(Metadata.getOwningVectorIndex("Listing")).toBe(listingIndex);
      expect(Metadata.getOwningVectorIndex("SupportArticle")).toBe(supportIndex);
    });

    it("allows indexes on one table to declare different embedding configs", async () => {
      expect.assertions(2);
      const modules = await loadFresh();
      const { FreshTable, listingIndex, supportIndex } =
        buildDisjointFixture(modules);

      FreshTable.metadata();

      expect(listingIndex.model.dimensions).toBe(1024);
      expect(supportIndex.model.dimensions).toBe(512);
    });

    it("includes the vectorAttribute in each index's fingerprint", async () => {
      expect.assertions(2);
      const modules = await loadFresh();
      const { FreshTable, listingIndex, supportIndex } =
        buildDisjointFixture(modules);

      FreshTable.metadata();

      expect(listingIndex.fingerprint).toBe(
        fingerprintOf(
          "hash=StoreId;filters=type;dimensions=1024;distance=COSINE;vectorAttribute=__dyna_vector"
        )
      );
      expect(supportIndex.fingerprint).toBe(
        fingerprintOf(
          "hash=StoreId;filters=type;dimensions=512;distance=COSINE;vectorAttribute=__dyna_vector_support"
        )
      );
    });

    it("throws when a searchable entity is a member of no index, naming the candidates", async () => {
      expect.assertions(1);
      const modules = await loadFresh();
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
      } = modules;

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      @Entity
      class Store extends FreshTable {
        declare readonly type: "Store";
      }

      @Entity
      class Listing extends FreshTable {
        declare readonly type: "Listing";

        @ForeignKeyAttribute(() => Store, { alias: "StoreId" })
        public readonly storeId: ForeignKey<Store>;

        @Searchable()
        @StringAttribute({ alias: "Description" })
        public readonly description: SearchableText;
      }

      @Entity
      class Orphan extends FreshTable {
        declare readonly type: "Orphan";

        @ForeignKeyAttribute(() => Store, { alias: "StoreId" })
        public readonly storeId: ForeignKey<Store>;

        @Searchable()
        @StringAttribute({ alias: "Notes" })
        public readonly notes: SearchableText;
      }
      void Orphan;

      FreshTable.vectorIndexes({
        listingIndex: {
          name: "listing-index",
          vectorAttribute: "__dyna_vector",
          model: TitanTextEmbedV2,
          provider: testProvider,
          scopedBy: () => Store,
          members: [() => Listing]
        }
      });

      expect(() => FreshTable.metadata()).toThrow(
        "Entity Orphan is searchable but is not a member of any vector index on table FreshTable (listing-index). Add () => Orphan to the members list of the index that should own it"
      );
    });

    it("throws when an entity is a member of multiple indexes", async () => {
      expect.assertions(1);
      const modules = await loadFresh();
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
      } = modules;

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      @Entity
      class Store extends FreshTable {
        declare readonly type: "Store";
      }

      @Entity
      class Listing extends FreshTable {
        declare readonly type: "Listing";

        @ForeignKeyAttribute(() => Store, { alias: "StoreId" })
        public readonly storeId: ForeignKey<Store>;

        @Searchable()
        @StringAttribute({ alias: "Description" })
        public readonly description: SearchableText;
      }

      FreshTable.vectorIndexes({
        indexA: {
          name: "index-a",
          vectorAttribute: "__dyna_vector_a",
          model: TitanTextEmbedV2,
          provider: testProvider,
          scopedBy: () => Store,
          members: [() => Listing]
        },
        indexB: {
          name: "index-b",
          vectorAttribute: "__dyna_vector_b",
          model: TitanTextEmbedV2,
          provider: testProvider,
          scopedBy: () => Store,
          members: [() => Listing]
        }
      });

      expect(() => FreshTable.metadata()).toThrow(
        "Entity Listing is a member of multiple vector indexes (index-a, index-b) on table FreshTable. Multi-index membership is not currently supported — each searchable entity belongs to exactly one index; remove it from all but one members list"
      );
    });

    it("throws when a listed member is not a searchable entity of the table", async () => {
      expect.assertions(1);
      const modules = await loadFresh();
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
      } = modules;

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      @Entity
      class Store extends FreshTable {
        declare readonly type: "Store";
      }

      @Entity
      class Listing extends FreshTable {
        declare readonly type: "Listing";

        @ForeignKeyAttribute(() => Store, { alias: "StoreId" })
        public readonly storeId: ForeignKey<Store>;

        @Searchable()
        @StringAttribute({ alias: "Description" })
        public readonly description: SearchableText;
      }

      @Entity
      class PlainNote extends FreshTable {
        declare readonly type: "PlainNote";

        @ForeignKeyAttribute(() => Store, { alias: "StoreId" })
        public readonly storeId: ForeignKey<Store>;

        @StringAttribute({ alias: "Body" })
        public readonly body: string;
      }

      FreshTable.vectorIndexes({
        listingIndex: {
          name: "listing-index",
          vectorAttribute: "__dyna_vector",
          model: TitanTextEmbedV2,
          provider: testProvider,
          scopedBy: () => Store,
          // PlainNote has no @Searchable attribute — this exercises the
          // runtime backstop (the compile-time rejection is asserted in the
          // vectorIndexes type tests)
          members: [() => Listing, () => PlainNote]
        }
      });

      expect(() => FreshTable.metadata()).toThrow(
        "Entity PlainNote is listed in the members of vector index listing-index but is not a searchable entity of table FreshTable. Members must be entities of the index's table that declare a @Searchable attribute"
      );
    });

    it("throws when an entity attribute name or alias uses the reserved prefix", async () => {
      expect.assertions(1);
      const modules = await loadFresh();
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
      } = modules;

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      @Entity
      class Store extends FreshTable {
        declare readonly type: "Store";
      }

      @Entity
      class Listing extends FreshTable {
        declare readonly type: "Listing";

        @ForeignKeyAttribute(() => Store, { alias: "StoreId" })
        public readonly storeId: ForeignKey<Store>;

        @Searchable()
        @StringAttribute({ alias: "Description" })
        public readonly description: SearchableText;

        @StringAttribute({ alias: "__dyna_vector_custom" })
        public readonly sneaky: string;
      }

      FreshTable.vectorIndexes({
        listingIndex: {
          name: "listing-index",
          vectorAttribute: "__dyna_vector",
          model: TitanTextEmbedV2,
          provider: testProvider,
          scopedBy: () => Store,
          members: [() => Listing]
        }
      });

      expect(() => FreshTable.metadata()).toThrow(
        "Attribute Listing.sneaky uses __dyna_vector_custom, which starts with __dyna_vector — that prefix is reserved for library-managed vector attributes"
      );
    });

    it("still throws when a member has no foreign key referencing the scope parent", async () => {
      expect.assertions(1);
      const modules = await loadFresh();
      const {
        default: DynaRecord,
        Table,
        Entity,
        PartitionKeyAttribute,
        SortKeyAttribute,
        StringAttribute,
        Searchable,
        TitanTextEmbedV2
      } = modules;

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      @Entity
      class Store extends FreshTable {
        declare readonly type: "Store";
      }

      @Entity
      class Tag extends FreshTable {
        declare readonly type: "Tag";

        @Searchable()
        @StringAttribute({ alias: "Label" })
        public readonly label: SearchableText;
      }

      FreshTable.vectorIndexes({
        supportIndex: {
          name: "support-index",
          vectorAttribute: "__dyna_vector",
          model: TitanTextEmbedV2,
          provider: testProvider,
          scopedBy: () => Store,
          members: [() => Tag]
        }
      });

      expect(() => FreshTable.metadata()).toThrow(
        "Entity Tag is a member of vector index support-index but has no foreign key attribute referencing Store on its own record (HasAndBelongsToMany relationships store foreign keys on the join table). Add a @ForeignKeyAttribute referencing Store to Tag"
      );
    });

    it("resolves an unscoped index's explicit membership without requiring a scoping foreign key", async () => {
      expect.assertions(3);
      const modules = await loadFresh();
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
      } = modules;

      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      @Entity
      class Article extends FreshTable {
        declare readonly type: "Article";

        @Searchable()
        @StringAttribute({ alias: "Body" })
        public readonly body: SearchableText;
      }

      @Entity
      class Note extends FreshTable {
        declare readonly type: "Note";

        @Searchable()
        @StringAttribute({ alias: "Text" })
        public readonly text: SearchableText;
      }

      const { unscopedIndex } = FreshTable.vectorIndexes({
        unscopedIndex: {
          name: "unscoped-index",
          vectorAttribute: "__dyna_vector",
          model: TitanTextEmbedV2,
          provider: testProvider,
          members: [() => Article, () => Note]
        }
      });

      FreshTable.metadata();

      expect(unscopedIndex.memberEntities).toStrictEqual(["Article", "Note"]);
      expect(Metadata.getOwningVectorIndex("Article")).toBe(unscopedIndex);
      expect(Metadata.getOwningVectorIndex("Note")).toBe(unscopedIndex);
    });
  });
});
