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
  IncludedEntities,
  IndexSearchOptions,
  InferSearchResults,
  NarrowMembersByName,
  SearchQuery,
  SearchResults,
  SearchableAttributeKeys
} from "../operations/Search/types.js";
import { ValidationError } from "../errors.js";
import type { EntityClass, Optional } from "../types.js";

/**
 * Reserved prefix of library-managed vector attribute names. Every index's
 * `vectorAttribute` must be exactly this prefix or start with
 * `__dyna_vector_`, and no consumer-defined attribute name or table alias may
 * start with it (enforced at metadata initialization). Vectors are
 * intentionally never registered in any entity's attribute metadata, so
 * serialization and copy paths drop them automatically — they live on
 * canonical rows only.
 */
export const reservedVectorAttributePrefix = "__dyna_vector";

/**
 * Whether a `vectorAttribute` value satisfies the reserved-prefix rule: the
 * bare legacy value `__dyna_vector` or any name starting with
 * `__dyna_vector_`.
 * @param value - The candidate vector attribute name
 * @returns Whether the value is a valid vector attribute name
 */
export const isValidVectorAttributeName = (value: string): boolean =>
  value === reservedVectorAttributePrefix ||
  value.startsWith(`${reservedVectorAttributePrefix}_`);

/**
 * Internal transition shim for the pre-3.0 shared vector attribute. Write
 * paths that have not yet been generalized to per-index attributes still
 * read it; it is removed once they are. Not part of the public API.
 */
export const vectorSearchKeys = {
  vector: reservedVectorAttributePrefix
} as const;

/**
 * The valid shape of a vector attribute name: exactly the reserved prefix
 * (`__dyna_vector`, the pre-3.0 value that existing indexes keep) or any
 * name starting with `__dyna_vector_`.
 */
export type VectorAttributeName =
  | typeof reservedVectorAttributePrefix
  | `${typeof reservedVectorAttributePrefix}_${string}`;

/**
 * Options for defining a vector index through the static `vectorIndexes`
 * factory on a table class.
 */
export interface VectorIndexOptions {
  /**
   * The DynamoDB IndexName of the vector index.
   */
  name: string;
  /**
   * The table attribute the index's vectors are written under. Required and
   * explicit — the attribute is the index's physical membership surface, so
   * it must never change implicitly. Must satisfy
   * {@link VectorAttributeName} and be unique among the table's vector
   * indexes.
   */
  vectorAttribute: VectorAttributeName;
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
   * Entity thunks declaring the index's complete membership. Nothing is
   * derived — the list is the membership, there is no universal membership,
   * and every listed entity must carry a `@Searchable` attribute. Members of
   * a scoped index must also carry the scoping foreign key. Required and
   * non-empty on every index.
   */
  members: Array<() => EntityClass<DynaRecord>>;
}

/**
 * The member entity union of one index declaration: the entities of its
 * explicit `members:` list.
 */
export type VectorIndexMembers<O extends VectorIndexOptions> =
  IncludedEntities<O["members"]>;

/**
 * Whether one index declaration is scoped (`scopedBy` present), selecting the
 * scope-id-first `search` signature on its construct.
 */
export type VectorIndexScoped<O extends VectorIndexOptions> = O extends {
  scopedBy: () => EntityClass<DynaRecord>;
}
  ? true
  : false;

/**
 * The typed index constructs returned by the static `vectorIndexes` factory,
 * keyed as declared: each entry is a {@link VectorIndexMetadata} whose member
 * union and scopedness are inferred from its own declaration.
 */
export type VectorIndexConstructs<
  T extends Record<string, VectorIndexOptions>
> = {
  [K in keyof T]: VectorIndexMetadata<
    VectorIndexMembers<T[K]>,
    VectorIndexScoped<T[K]>
  >;
};

/**
 * Whether two literal types are exactly equal. Widened (non-literal) strings
 * never compare equal — a computed value cannot be checked at compile time,
 * so it is left to the runtime uniqueness backstop.
 */
type AreEqualLiterals<A, B> = string extends A
  ? false
  : string extends B
    ? false
    : [A] extends [B]
      ? [B] extends [A]
        ? true
        : false
      : false;

/**
 * The other declaration keys sharing one entry's `vectorAttribute` literal.
 */
type KeysSharingVectorAttribute<
  T extends Record<string, VectorIndexOptions>,
  K extends keyof T
> = {
  [J in Exclude<keyof T, K>]: AreEqualLiterals<
    T[J]["vectorAttribute"],
    T[K]["vectorAttribute"]
  > extends true
    ? J
    : never;
}[Exclude<keyof T, K>];

/**
 * The other declaration keys sharing one entry's index `name` literal.
 */
type KeysSharingIndexName<
  T extends Record<string, VectorIndexOptions>,
  K extends keyof T
> = {
  [J in Exclude<keyof T, K>]: AreEqualLiterals<
    T[J]["name"],
    T[K]["name"]
  > extends true
    ? J
    : never;
}[Exclude<keyof T, K>];

/**
 * Resolves `true` when an entity declares a `Searchable`-branded attribute.
 */
type HasSearchableAttribute<E extends DynaRecord> = [
  SearchableAttributeKeys<E>
] extends [never]
  ? false
  : true;

/**
 * The members of one declaration whose entities declare no `Searchable`
 * attribute (distributive over the member union).
 */
type NonSearchableMembers<O extends VectorIndexOptions> =
  VectorIndexMembers<O> extends infer E
    ? E extends DynaRecord
      ? HasSearchableAttribute<E> extends true
        ? never
        : E
      : never
    : never;

/**
 * The error surface presented when two index declarations share a
 * `vectorAttribute`. The attribute is an index's physical membership
 * surface, so each index must have its own.
 */
export interface DuplicateVectorAttributeError<A> {
  __vectorIndexError: "another index on this table declares the same vectorAttribute";
  vectorAttribute: A;
}

/**
 * The error surface presented when two index declarations share an
 * IndexName.
 */
export interface DuplicateIndexNameError<N> {
  __vectorIndexError: "another index on this table declares the same IndexName";
  indexName: N;
}

/**
 * The error surface presented when a members entry names an entity with no
 * `@Searchable` attribute.
 */
export interface NonSearchableMemberError<E> {
  __vectorIndexError: "every members entry must be an entity with a @Searchable attribute";
  nonSearchableMembers: E;
}

/**
 * The error surface presented when a declaration carries options
 * {@link VectorIndexOptions} does not define. Restores excess-property
 * rejection, which the factory's generic inference position would otherwise
 * bypass.
 */
export interface UnknownVectorIndexOptionError<K> {
  __vectorIndexError: "unknown option — see VectorIndexOptions for the valid declaration shape";
  unknownOptions: K;
}

/**
 * Compile-time validation of a table's vector index declarations: an entry
 * whose `vectorAttribute` or `name` is also declared by another entry, or
 * whose members include a non-searchable entity, resolves to a branded error
 * surface so compilation fails on the offending declaration. Widened
 * (non-literal) values pass — the metadata-initialization backstop validates
 * them at runtime.
 */
export type ValidateVectorIndexes<
  T extends Record<string, VectorIndexOptions>
> = {
  [K in keyof T]: [Exclude<keyof T[K], keyof VectorIndexOptions>] extends [
    never
  ]
    ? [KeysSharingVectorAttribute<T, K>] extends [never]
      ? [KeysSharingIndexName<T, K>] extends [never]
        ? [NonSearchableMembers<T[K]>] extends [never]
          ? T[K]
          : NonSearchableMemberError<NonSearchableMembers<T[K]>>
        : DuplicateIndexNameError<T[K]["name"]>
      : DuplicateVectorAttributeError<T[K]["vectorAttribute"]>
    : UnknownVectorIndexOptionError<Exclude<keyof T[K], keyof VectorIndexOptions>>;
};

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
 * the static `vectorIndexes` factory, and carries the index-anchored `search`
 * surface. Holds the consumer-supplied configuration (name, vector attribute,
 * model descriptor, provider, scope and membership thunks) plus the search
 * schema resolved at metadata initialization (members, `HASH` alias, inline
 * filter aliases, and the search-schema fingerprint).
 *
 * Entity thunks (`scopedBy`, `members`) are never resolved at definition
 * time — resolution happens during metadata initialization so index constants
 * can be declared at module evaluation without freezing metadata against a
 * partial entity graph.
 *
 * The type parameters are instantiated by the `vectorIndexes` factory and
 * drive the `search` surface only: `Members` is the index's member entity
 * union (the explicit `members:` list) and `Scoped` selects the
 * scope-id-first search signature. Metadata-internal code uses the
 * defaults.
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
   * The table attribute the index's vectors are written under — the index's
   * physical membership surface. The narrow type is truthful: registration
   * validates the reserved-prefix rule before any construct is built
   */
  public readonly vectorAttribute: VectorAttributeName;
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
   * Entity thunks declaring the index's complete membership
   */
  public readonly members: ReadonlyArray<() => EntityClass<DynaRecord>>;

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
   * sorted inline filter aliases, dimensions, distance function, vector
   * attribute) so IaC can detect that a declaration change implies a
   * destructive index replacement. Placeholder, resolved at metadata
   * initialization
   */
  public fingerprint: string;

  constructor(tableClassName: string, options: VectorIndexOptions) {
    this.tableClassName = tableClassName;
    this.name = options.name;
    this.vectorAttribute = options.vectorAttribute;
    this.model = options.model;
    this.provider = options.provider;
    this.scopedBy = options.scopedBy;
    this.members = options.members;
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
          `distance=${this.model.distanceFunction}`,
          `vectorAttribute=${this.vectorAttribute}`
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
   * member entity; omitted, results are the index's full member union,
   * discriminated via `entity.type`.
   *
   * Scoped indexes take the scope value first — they are searchable only per
   * scope value. Unscoped indexes take the query first and no scope id.
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
   * @example Unscoped index
   * ```typescript
   * const results = await supportSearchIndex.search("how do refunds work");
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
