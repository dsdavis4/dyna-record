import type DynaRecord from "../../DynaRecord.js";
import type { SearchFilter } from "../../filter-utils/index.js";

/**
 * The query input of a vector search: either text, embedded through the
 * index's configured embedding provider, or a precomputed vector of the
 * index's dimensions (no embedding call is made).
 */
export type SearchQuery = string | { vector: number[] };

/**
 * Options for a vector search.
 */
export interface SearchOptions {
  /**
   * The scope value when searching a `scopedBy` vector index (EX: the parent
   * entity's id). Required for scoped indexes — a scoped index is queryable
   * only per scope value. Global indexes take no scope id.
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
  entity: E;
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
