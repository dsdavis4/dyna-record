import { createHash } from "node:crypto";
import type DynaRecord from "../DynaRecord.js";
import type {
  EmbeddingModelDescriptor,
  EmbeddingProvider
} from "../embedding/types.js";
// This import is circular (operations depend on metadata) but safe: both
// sides reference each other only inside function bodies, never during
// module evaluation
import { Search, isSearchQuery } from "../operations/Search/index.js";
import type {
  IndexSearchOptions,
  InferSearchResults,
  NarrowMembersByName,
  SearchQuery,
  SearchResults
} from "../operations/Search/types.js";
import { ValidationError } from "../errors.js";
import type { EntityClass, Optional } from "../types.js";

/**
 * Table alias of the library-managed vector attribute. The alias is reserved
 * by dyna-record and may not be used as the alias of a consumer-defined
 * attribute (enforced at metadata initialization). The vector is
 * intentionally never registered in any entity's attribute metadata, so
 * serialization and copy paths drop it automatically — it lives on canonical
 * rows only.
 */
export const vectorSearchKeys = {
  vector: "__dyna_vector"
} as const;

/**
 * Options for defining a vector index through the static `vectorIndex`
 * factory on a table class.
 */
export interface VectorIndexOptions {
  /**
   * The DynamoDB IndexName of the vector index.
   */
  name: string;
  /**
   * The embedding model descriptor (EX: `TitanTextEmbedV2`), carrying the
   * dimensions and distance function the index is provisioned with.
   */
  model: EmbeddingModelDescriptor;
  /**
   * The embed function used to generate vectors. Required — dyna-record
   * ships no embedding implementation; the provider owns credentials,
   * region, retry, and timeout posture.
   */
  provider: EmbeddingProvider;
  /**
   * Optional entity thunk selecting the scope parent. The foreign key
   * attribute referencing this entity becomes the index `HASH`, making the
   * index queryable only per scope value. Without `scopedBy` the index
   * compiles to no `HASH` and its searches are global.
   */
  scopedBy?: () => EntityClass<DynaRecord>;
  /**
   * Optional entity thunks adding FK-only members to a scoped index —
   * searchable entities that carry the scoping foreign key but have no
   * declared inverse relationship on the scope parent.
   */
  include?: Array<() => EntityClass<DynaRecord>>;
}

/**
 * Parameters resolving an index's search schema at metadata initialization.
 * See {@link VectorIndexMetadata.resolveSearchSchema}.
 */
interface ResolveSearchSchemaParams {
  /**
   * Class names of the searchable member entities of the index.
   */
  memberEntities: string[];
  /**
   * Table alias of the scoping foreign key attribute (the index `HASH`).
   * Undefined for global indexes.
   */
  hashAlias?: string;
  /**
   * Sorted table aliases of the index's inline filters, including the
   * entity type filter the library declares automatically.
   */
  inlineFilterAliases: string[];
}

/**
 * Represents the metadata for a vector index defined on a table class through
 * the static `vectorIndex` factory, and carries the index-anchored `search`
 * surface. Holds the consumer-supplied configuration (name, model descriptor,
 * provider, scope and membership thunks) plus the search schema resolved at
 * metadata initialization (members, `HASH` alias, inline filter aliases, and
 * the search-schema fingerprint).
 *
 * Entity thunks (`scopedBy`, `include`) are never resolved at definition
 * time — resolution happens during metadata initialization so index constants
 * can be declared at module evaluation without freezing metadata against a
 * partial entity graph.
 *
 * The type parameters are instantiated by the `vectorIndex` factory's
 * overloads and drive the `search` surface only: `Members` is the index's
 * member entity union (scope parent's searchable adjacency union the
 * `include:` list; unnarrowed for global indexes) and `Scoped` selects the
 * scope-id-first search signature. Metadata-internal code uses the defaults.
 *
 * @template Members - Union of the index's member entity types.
 * @template Scoped - Whether the index is scoped (`scopedBy`).
 * @param {string} tableClassName - Name of the table class the index is defined on.
 * @param {VectorIndexOptions} options - Configuration options for the vector index.
 */
class VectorIndexMetadata<
  Members extends DynaRecord = DynaRecord,
  Scoped extends boolean = boolean
> {
  /**
   * Phantom type markers carrying the factory-instantiated type parameters.
   * `declare` emits nothing at runtime — they exist so the overloaded
   * `search` signatures can select on scopedness and so member typing
   * survives assignment. Never assigned or read
   */
  declare readonly __members?: Members;
  declare readonly __scoped?: Scoped;

  /**
   * The name of the table class the index is defined on
   */
  public readonly tableClassName: string;
  /**
   * The DynamoDB IndexName of the vector index
   */
  public readonly name: string;
  /**
   * The embedding model descriptor the index is provisioned with
   */
  public readonly model: EmbeddingModelDescriptor;
  /**
   * The consumer-supplied embed function. Typed as required configuration;
   * optional here so a missing provider (EX: plain JS consumers) is caught by
   * metadata validation rather than a runtime crash.
   */
  public readonly provider: Optional<EmbeddingProvider>;
  /**
   * Entity thunk selecting the scope parent, when the index is scoped
   */
  public readonly scopedBy?: () => EntityClass<DynaRecord>;
  /**
   * Entity thunks adding FK-only members to a scoped index
   */
  public readonly include?: ReadonlyArray<() => EntityClass<DynaRecord>>;

  /**
   * Class names of the searchable member entities of the index. Placeholder,
   * resolved at metadata initialization
   */
  public memberEntities: string[];
  /**
   * Table alias of the scoping foreign key attribute (the index `HASH`).
   * Undefined for global indexes. Placeholder, resolved at metadata
   * initialization
   */
  public hashAlias?: string;
  /**
   * Sorted table aliases of the index's inline filters, including the
   * auto-declared entity type filter. Placeholder, resolved at metadata
   * initialization
   */
  public inlineFilterAliases: string[];
  /**
   * Stable fingerprint of the search-schema configuration (`HASH` alias,
   * sorted inline filter aliases, dimensions, distance function) so IaC can
   * detect that a decorator change implies a destructive index replacement.
   * Placeholder, resolved at metadata initialization
   */
  public fingerprint: string;

  constructor(tableClassName: string, options: VectorIndexOptions) {
    this.tableClassName = tableClassName;
    this.name = options.name;
    this.model = options.model;
    this.provider = options.provider;
    this.scopedBy = options.scopedBy;
    this.include = options.include;
    // Placeholders, these are set later
    this.memberEntities = [];
    this.inlineFilterAliases = [];
    this.fingerprint = "";
  }

  /**
   * Resolves the index's search schema. Called during metadata
   * initialization once membership and inline filters have been validated.
   * @param params - {@link ResolveSearchSchemaParams}
   */
  public resolveSearchSchema(params: ResolveSearchSchemaParams): void {
    this.memberEntities = params.memberEntities;
    this.hashAlias = params.hashAlias;
    this.inlineFilterAliases = params.inlineFilterAliases;
    this.fingerprint = createHash("sha256")
      .update(
        [
          `hash=${params.hashAlias ?? ""}`,
          `filters=${params.inlineFilterAliases.join(",")}`,
          `dimensions=${String(this.model.dimensions)}`,
          `distance=${this.model.distanceFunction}`
        ].join(";")
      )
      .digest("hex");
  }

  /**
   * Searches the vector index. Compiles to exactly one `SearchVectors`
   * operation; results carry complete typed entity instances with
   * `similarity` and the raw `score`, ordered most-similar-first.
   *
   * The return type is inferred from `in:`: present, results narrow to that
   * member entity; omitted, results are the index's full member union
   * (including `include:` members), discriminated via `entity.type`. Global
   * indexes return the base result type — their member set is only known at
   * runtime.
   *
   * Scoped indexes take the scope value first — they are searchable only per
   * scope value. Global indexes take the query first and no scope id.
   *
   * @example Scoped index
   * ```typescript
   * const results = await storeSearchIndex.search("storeId", "ceramic mugs", {
   *   in: "Listing",
   *   filter: { category: "Mugs" },
   *   topK: 25
   * });
   * ```
   *
   * @example Global index
   * ```typescript
   * const results = await globalSearchIndex.search("fresh articles");
   * ```
   *
   * @param scopeId - The scope value to search within (scoped indexes only).
   * @param query - The query text to embed, or `{ vector }` with a precomputed vector.
   * @param options - {@link IndexSearchOptions}
   * @returns A promise resolving to the typed search results.
   */
  public async search<const In extends Members["type"] = never>(
    this: VectorIndexMetadata<Members, true>,
    scopeId: string,
    query: SearchQuery,
    options?: IndexSearchOptions<Members, In>
  ): Promise<InferSearchResults<NarrowMembersByName<Members, In>>>;

  public async search<const In extends Members["type"] = never>(
    this: VectorIndexMetadata<Members, false>,
    query: SearchQuery,
    options?: IndexSearchOptions<Members, In>
  ): Promise<InferSearchResults<NarrowMembersByName<Members, In>>>;

  public async search(
    scopeIdOrQuery: string | SearchQuery,
    queryOrOptions?: SearchQuery | IndexSearchOptions<Members, never>,
    maybeOptions?: IndexSearchOptions<Members, never>
  ): Promise<SearchResults> {
    // Scopedness is known from the definition options alone — resolving the
    // signature shape never triggers metadata initialization. The guards
    // back the overload dispatch for plain JS callers
    if (this.scopedBy !== undefined) {
      if (
        typeof scopeIdOrQuery !== "string" ||
        !isSearchQuery(queryOrOptions)
      ) {
        throw new ValidationError(
          `Vector index ${this.name} is scoped — search takes the scope id first: search(scopeId, query, options)`
        );
      }

      return await new Search(this).run(queryOrOptions, {
        ...maybeOptions,
        scopeId: scopeIdOrQuery
      });
    }

    // Mirror of the scoped guard above: a scoped-shape call on a global
    // index would otherwise silently embed the scope id as the query text
    if (isSearchQuery(queryOrOptions) || maybeOptions !== undefined) {
      throw new ValidationError(
        `Vector index ${this.name} is global — it does not take a scope id: search(query, options)`
      );
    }

    return await new Search(this).run(scopeIdOrQuery, queryOrOptions);
  }
}

/**
 * The search-schema surface of a vector index, independent of the factory's
 * instantiated type parameters. The search runtime and embedding helpers
 * consume this shape so every index instantiation is accepted.
 */
export type VectorIndexSchema = Omit<
  VectorIndexMetadata,
  "search" | "__members" | "__scoped"
>;

export default VectorIndexMetadata;
