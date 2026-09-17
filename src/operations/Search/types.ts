import type DynaRecord from "../../DynaRecord.js";
import type {
  SearchFilter,
  SearchFilterParams
} from "../../filter-utils/index.js";
import type { EntityAttributesInstance } from "../types.js";
import type { AssertDynaRecord } from "../Query/types.js";

/**
 * The query input of a vector search: either text, embedded through the
 * index's configured embedding provider, or a precomputed vector of the
 * index's dimensions (no embedding call is made).
 */
export type SearchQuery = string | { vector: number[] };

/**
 * Type guard for {@link SearchQuery}. Backs the runtime dispatch of the
 * index construct's overloaded `search` signatures for plain JS callers.
 * @param value - The value to check
 * @returns Whether the value is a valid search query input
 */
export const isSearchQuery = (value: unknown): value is SearchQuery => {
  if (typeof value === "string") return true;

  return (
    typeof value === "object" &&
    value !== null &&
    "vector" in value &&
    Array.isArray(value.vector)
  );
};

/**
 * Options for a vector search.
 */
export interface SearchOptions {
  /**
   * The scope value when searching a `scopedBy` vector index (EX: the parent
   * entity's id). Required for scoped indexes — a scoped index is queryable
   * only per scope value. Unscoped indexes take no scope id.
   */
  scopeId?: string;
  /**
   * Narrows the search to a single member entity type of the index by name.
   * Omitted, the search spans every member entity. DynamoDB's search
   * condition grammar is equality-only, so exactly one entity type may be
   * named — multi-type subsets are inexpressible in one operation.
   */
  in?: string;
  /**
   * Equality filter conditions over the index's `@SearchFilterable`
   * attributes, merged into the search's single condition expression.
   */
  filter?: SearchFilter;
  /**
   * The number of most similar results to return. Defaults to 10; DynamoDB
   * supports at most 100. There is no pagination.
   */
  topK?: number;
}

/**
 * A single vector search result: the complete typed entity instance with the
 * search's similarity measures.
 */
export interface SearchResult<E extends DynaRecord = DynaRecord> {
  /**
   * The matched entity, hydrated from the index's projected attributes.
   */
  entity: EntityAttributesInstance<E>;
  /**
   * Similarity of the entity to the query, converted from the raw score by
   * the index model's distance function (higher is more similar).
   */
  similarity: number;
  /**
   * The raw score returned by DynamoDB. Its interpretation depends on the
   * index's distance function (EX: for COSINE it is a distance in [0, 2],
   * lower is more similar).
   */
  score: number;
}

/**
 * Vector search results, ordered most-similar-first.
 */
export type SearchResults<E extends DynaRecord = DynaRecord> = Array<
  SearchResult<E>
>;

// ─── Search Surface Inference ───────────────────────────────────────────────

/**
 * Keys of an entity carrying the `Searchable` brand — the attribute the
 * entity's vector embeds. At most one is valid per entity; the `@Entity`
 * decorator rejects entities declaring more at compile time and metadata
 * validation rejects them at runtime.
 */
export type SearchableAttributeKeys<E extends DynaRecord> = {
  [K in keyof E & string]: NonNullable<E[K]> extends { __brand: "Searchable" }
    ? K
    : never;
}[keyof E & string];

/**
 * Resolves whether a type is a union of more than one member.
 */
type IsUnion<T, U = T> = T extends unknown
  ? [U] extends [T]
    ? false
    : true
  : false;

/**
 * Resolves `true` when an entity declares more than one `Searchable`-branded
 * attribute. Consumed by the `@Entity` decorator constraint so the invalid
 * declaration is a compile error at the class site; metadata validation
 * remains the runtime backstop.
 *
 * The `never` guard matters: `IsUnion<never>` is `never`, and a `never`
 * condition is vacuously assignable to `true` — without the guard every
 * entity with no searchable attribute would trip the constraint.
 */
export type HasMultipleSearchableAttributes<E extends DynaRecord> = [
  SearchableAttributeKeys<E>
] extends [never]
  ? false
  : IsUnion<SearchableAttributeKeys<E>>;

/**
 * The entities named by a list of entity thunks — a vector index's
 * `members:` declaration.
 */
export type IncludedEntities<
  Inc extends ReadonlyArray<() => new () => DynaRecord>
> = Inc[number] extends () => new () => infer E ? AssertDynaRecord<E> : never;

/**
 * Narrows an index's member union to the entity named by `in:`; the full
 * union when `in:` is omitted.
 */
export type NarrowMembersByName<Members extends DynaRecord, Name> = [
  Name
] extends [never]
  ? Members
  : Extract<Members, { type: Name }>;

/**
 * Options of a vector index's `search`. `in:` accepts a member entity name,
 * drawn from the index's declared `members` — so every member is reachable,
 * including one that carries only the scoping foreign key. Scoped and
 * unscoped indexes narrow identically.
 */
export interface IndexSearchOptions<
  Members extends DynaRecord,
  In extends Members["type"]
> {
  /**
   * Narrows the search to a single member entity of the index by name.
   */
  in?: In;
  /**
   * Equality filter conditions over the searched members'
   * `@SearchFilterable` attributes.
   */
  filter?: string extends Members["type"]
    ? SearchFilter
    : SearchFilterParams<NarrowMembersByName<Members, In>>;
  /**
   * The number of most similar results to return. Defaults to 10; DynamoDB
   * supports at most 100.
   */
  topK?: number;
}

/**
 * Distributes {@link SearchResult} over a union of searched entities.
 */
export type InferSearchResults<Entities extends DynaRecord> = Array<
  Entities extends DynaRecord ? SearchResult<Entities> : never
>;
