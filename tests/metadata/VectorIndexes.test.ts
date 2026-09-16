import { createHash } from "node:crypto";
import DynaRecordBase, {
  Table,
  Entity,
  PartitionKeyAttribute,
  SortKeyAttribute,
  StringAttribute,
  ForeignKeyAttribute,
  Searchable,
  TitanTextEmbedV2 as TitanModel
} from "../../index.js";
import type {
  ForeignKey,
  PartitionKey,
  Searchable as SearchableText,
  SortKey,
  VectorIndexMetadata
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
  describe("compile-time validation", () => {
    it("rejects invalid declarations and infers construct types at the type level", () => {
      // Never executed — the closure exists so the declarations below are
      // type-checked without registering metadata
      const _typeChecks = async (): Promise<void> => {
        @Table({ name: "type-table" })
        abstract class TypeTable extends DynaRecordBase {
          @PartitionKeyAttribute({ alias: "PK" })
          public readonly pk: PartitionKey;

          @SortKeyAttribute({ alias: "SK" })
          public readonly sk: SortKey;
        }

        @Entity
        class TStore extends TypeTable {
          declare readonly type: "TStore";
        }

        @Entity
        class TListing extends TypeTable {
          declare readonly type: "TListing";

          @ForeignKeyAttribute(() => TStore, { alias: "StoreId" })
          public readonly storeId: ForeignKey<TStore>;

          @Searchable()
          @StringAttribute({ alias: "Description" })
          public readonly description: SearchableText;
        }

        @Entity
        class TFaq extends TypeTable {
          declare readonly type: "TFaq";

          @Searchable()
          @StringAttribute({ alias: "Question" })
          public readonly question: SearchableText;
        }

        @Entity
        class TPlain extends TypeTable {
          declare readonly type: "TPlain";

          @StringAttribute({ alias: "Body" })
          public readonly body: string;
        }
        void TPlain;

        const base = {
          model: TitanModel,
          provider: testProvider
        };

        // Valid: distinct attributes and names; scoped and unscoped coexist
        const { scopedIdx, unscopedIdx } = TypeTable.vectorIndexes({
          scopedIdx: {
            ...base,
            name: "scoped-idx",
            vectorAttribute: "__dyna_vector",
            scopedBy: () => TStore,
            members: [() => TListing]
          },
          unscopedIdx: {
            ...base,
            name: "unscoped-idx",
            vectorAttribute: "__dyna_vector_faq",
            members: [() => TFaq]
          }
        });

        // Positive inference: the constructs carry their member unions and
        // scopedness
        const _scopedTyped: VectorIndexMetadata<TListing, true> = scopedIdx;
        const _unscopedTyped: VectorIndexMetadata<TFaq, false> = unscopedIdx;
        void _scopedTyped;
        void _unscopedTyped;

        // @ts-expect-error: a scoped index search takes the scope id first
        await scopedIdx.search("just a query");

        // @ts-expect-error: an unscoped index search takes no scope id
        await unscopedIdx.search("scope-id", "query");

        TypeTable.vectorIndexes({
          // @ts-expect-error: vectorAttribute duplicated by dupB
          dupA: {
            ...base,
            name: "dup-a",
            vectorAttribute: "__dyna_vector",
            members: [() => TListing]
          },
          // @ts-expect-error: vectorAttribute duplicated by dupA
          dupB: {
            ...base,
            name: "dup-b",
            vectorAttribute: "__dyna_vector",
            members: [() => TFaq]
          }
        });

        TypeTable.vectorIndexes({
          // @ts-expect-error: IndexName duplicated by sameNameB
          sameNameA: {
            ...base,
            name: "same-name",
            vectorAttribute: "__dyna_vector_a",
            members: [() => TListing]
          },
          // @ts-expect-error: IndexName duplicated by sameNameA
          sameNameB: {
            ...base,
            name: "same-name",
            vectorAttribute: "__dyna_vector_b",
            members: [() => TFaq]
          }
        });

        TypeTable.vectorIndexes({
          // @ts-expect-error: vectorAttribute is required
          missingAttribute: {
            ...base,
            name: "missing-attribute",
            members: [() => TListing]
          }
        });

        TypeTable.vectorIndexes({
          badPrefix: {
            ...base,
            name: "bad-prefix",
            // @ts-expect-error: vector attributes must use the reserved prefix
            vectorAttribute: "Embedding",
            members: [() => TListing]
          }
        });

        TypeTable.vectorIndexes({
          // @ts-expect-error: TPlain declares no @Searchable attribute
          nonSearchableMember: {
            ...base,
            name: "non-searchable-member",
            vectorAttribute: "__dyna_vector_plain",
            members: [() => TListing, () => TPlain]
          }
        });

        TypeTable.vectorIndexes({
          // @ts-expect-error: members is required on every index
          missingMembers: {
            ...base,
            name: "missing-members",
            vectorAttribute: "__dyna_vector_x"
          }
        });
      };

      expect(_typeChecks).toBeDefined();
    });
  });

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
      const { FreshTable, Listing } = buildDisjointFixture(modules);

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
            members: [() => Listing]
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
      const {
        default: DynaRecord,
        Table,
        PartitionKeyAttribute,
        SortKeyAttribute
      } = modules;

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
          // @ts-expect-error: duplicate vectorAttribute; this exercises the runtime backstop
          indexA: {
            name: "index-a",
            vectorAttribute: "__dyna_vector",
            model: TitanTextEmbedV2,
            provider: testProvider,
            scopedBy: () => Store,
            members: [() => Listing]
          },
          // @ts-expect-error: duplicate vectorAttribute; this exercises the runtime backstop
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
          // @ts-expect-error: duplicate IndexName; this exercises the runtime backstop
          indexA: {
            name: "same-index-name",
            vectorAttribute: "__dyna_vector_a",
            model: TitanTextEmbedV2,
            provider: testProvider,
            scopedBy: () => Store,
            members: [() => Listing]
          },
          // @ts-expect-error: duplicate IndexName; this exercises the runtime backstop
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
      const {
        default: DynaRecord,
        Table,
        PartitionKeyAttribute,
        SortKeyAttribute,
        TitanTextEmbedV2
      } = modules;

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
            // @ts-expect-error: vector attributes must use the reserved prefix; this exercises the runtime backstop
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

    it("throws on unknown options, so a plain-JS caller is not silently ignored", async () => {
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
      class Note extends FreshTable {
        declare readonly type: "Note";

        @Searchable()
        @StringAttribute({ alias: "Text" })
        public readonly text: SearchableText;
      }

      // Embedding settings belong on the model descriptor. Set on the index
      // they are meaningless — before this backstop the caller silently got
      // the model's COSINE/1024 instead of what they asked for
      expect(() =>
        FreshTable.vectorIndexes({
          freshIndex: {
            name: "fresh-index",
            vectorAttribute: "__dyna_vector",
            model: TitanTextEmbedV2,
            provider: testProvider,
            members: [() => Note],
            distanceFunction: "EUCLIDEAN",
            dimensions: 512
          }
        } as never)
      ).toThrow(
        "Vector index fresh-index declares unknown options (distanceFunction, dimensions). Valid options are name, vectorAttribute, model, provider, scopedBy, members — embedding settings such as dimensions and distance function belong on the model descriptor"
      );
    });

    it("throws when an index declares no members", async () => {
      expect.assertions(1);
      const modules = await loadFresh();
      const {
        default: DynaRecord,
        Table,
        Entity,
        PartitionKeyAttribute,
        SortKeyAttribute,
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
      expect(Metadata.getOwningVectorIndex("SupportArticle")).toBe(
        supportIndex
      );
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
        // @ts-expect-error: PlainNote has no @Searchable attribute; this exercises the runtime backstop
        listingIndex: {
          name: "listing-index",
          vectorAttribute: "__dyna_vector",
          model: TitanTextEmbedV2,
          provider: testProvider,
          scopedBy: () => Store,
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

    it("throws when an attribute's property NAME uses the reserved prefix", async () => {
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

        // The alias is innocuous; the property name is what collides
        @StringAttribute({ alias: "Fine" })
        public readonly __dyna_vector_sneaky: string;
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
        "Attribute Listing.__dyna_vector_sneaky uses __dyna_vector_sneaky, which starts with __dyna_vector — that prefix is reserved for library-managed vector attributes"
      );
    });

    it("reserves the prefix on tables that declare no vector indexes at all", async () => {
      expect.assertions(1);
      const modules = await loadFresh();
      const {
        default: DynaRecord,
        Table,
        Entity,
        PartitionKeyAttribute,
        SortKeyAttribute,
        StringAttribute
      } = modules;

      // No vectorIndexes call, no searchable attribute — the prefix is still
      // reserved, so adopting vector search later can never collide
      @Table({ name: "fresh-table" })
      abstract class FreshTable extends DynaRecord {
        @PartitionKeyAttribute({ alias: "PK" })
        public readonly pk: PartitionKey;

        @SortKeyAttribute({ alias: "SK" })
        public readonly sk: SortKey;
      }

      @Entity
      class Plain extends FreshTable {
        declare readonly type: "Plain";

        @StringAttribute({ alias: "__dyna_vector_future" })
        public readonly squatter: string;
      }
      void Plain;

      expect(() => FreshTable.metadata()).toThrow(
        "Attribute Plain.squatter uses __dyna_vector_future, which starts with __dyna_vector — that prefix is reserved for library-managed vector attributes"
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

    it("copies the declared members array so later caller mutation cannot rewrite membership", async () => {
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
      class Note extends FreshTable {
        declare readonly type: "Note";

        @Searchable()
        @StringAttribute({ alias: "Text" })
        public readonly text: SearchableText;
      }

      // The caller keeps a reference to the array they passed
      const declaredMembers = [() => Note];

      const { freshIndex } = FreshTable.vectorIndexes({
        freshIndex: {
          name: "fresh-index",
          vectorAttribute: "__dyna_vector",
          model: TitanTextEmbedV2,
          provider: testProvider,
          members: declaredMembers
        }
      });

      // Emptying it afterwards must not reach the index: membership was
      // validated at registration, and the construct holds its own copy
      declaredMembers.length = 0;

      expect(freshIndex.members).toHaveLength(1);
      expect(declaredMembers).toHaveLength(0);

      // Initialization still resolves the real membership
      FreshTable.metadata();
      expect(freshIndex.memberEntities).toEqual(["Note"]);
    });

    it("resolves a hierarchy: the scope parent is a member through its own parent pointer", async () => {
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

      // A tree. The foreign key is a genuine parent pointer to another row of
      // the same type — not a duplicate of the row's own id — so the scope
      // parent legitimately appears in its own index's membership
      @Entity
      class Folder extends FreshTable {
        declare readonly type: "Folder";

        @Searchable()
        @StringAttribute({ alias: "FolderName" })
        public readonly folderName: SearchableText;

        @ForeignKeyAttribute(() => Folder, { alias: "ParentId" })
        public readonly parentId: ForeignKey<Folder>;
      }

      @Entity
      class Document extends FreshTable {
        declare readonly type: "Document";

        @Searchable()
        @StringAttribute({ alias: "Body" })
        public readonly body: SearchableText;

        @ForeignKeyAttribute(() => Folder, { alias: "ParentId" })
        public readonly parentId: ForeignKey<Folder>;
      }

      const { treeIndex } = FreshTable.vectorIndexes({
        treeIndex: {
          name: "tree-index",
          vectorAttribute: "__dyna_vector",
          model: TitanTextEmbedV2,
          provider: testProvider,
          scopedBy: () => Folder,
          members: [() => Folder, () => Document]
        }
      });

      FreshTable.metadata();

      // Both members resolve, and the HASH is the shared parent pointer — so
      // one search returns the sub-folders and documents of a given folder
      expect(treeIndex.memberEntities).toEqual(["Document", "Folder"]);
      expect(treeIndex.hashAlias).toBe("ParentId");
      expect(treeIndex.inlineFilterAliases).toEqual(["type"]);
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
