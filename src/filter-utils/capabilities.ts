import type { FilterCapabilities } from "./types.js";

/**
 * Capability set of the query filter context — the full filter vocabulary:
 * `$or` blocks, "IN" arrays, `$beginsWith`, `$contains`, the comparison
 * operators, `$between`, dot-path notation for nested Map attributes, and any
 * number of conditions per attribute.
 */
export const queryFilterCapabilities: FilterCapabilities = {
  context: "query filters",
  or: true,
  in: true,
  beginsWith: true,
  contains: true,
  comparison: true,
  composedComparisons: true,
  between: true,
  nestedPaths: true,
  singleConditionPerAttribute: false,
  dropUndefinedConditions: true,
  nullMeansNotSet: false,
  dropEmptyOr: true
};

/**
 * Capability set of the key condition context. DynamoDB's
 * `KeyConditionExpression` is narrower than a filter in every direction except
 * the comparators: the partition key takes an equality, and the sort key takes
 * one of `=`, `<`, `<=`, `>`, `>=`, `BETWEEN` or `begins_with`.
 *
 * So `$or`, "IN" arrays, `$contains` and nested Map paths are not
 * representable, and neither are composed comparisons — a two-sided key range
 * is `$between`, because the expression has room for exactly one sort key
 * condition. A range is otherwise the point of a key condition rather than a
 * filter: it narrows what DynamoDB reads instead of discarding rows after
 * reading them.
 *
 * Which attribute is the partition key is not a capability, because it is not a
 * property of the context — `QueryBuilder` enforces that from table metadata,
 * where it is known.
 */
export const keyConditionCapabilities: FilterCapabilities = {
  context: "key conditions",
  or: false,
  in: false,
  beginsWith: true,
  contains: false,
  comparison: true,
  composedComparisons: false,
  between: true,
  nestedPaths: false,
  singleConditionPerAttribute: false,
  // Dropping a key condition would widen the query to the whole partition
  dropUndefinedConditions: false,
  nullMeansNotSet: false,
  // Moot: $or is not supported at all, and that rejection comes first
  dropEmptyOr: false
};

/**
 * Capability set of the vector search filter context. DynamoDB's
 * `SearchConditionExpression` is an equality-only conjunction: `attr = value`
 * conditions joined with AND, at most one condition per attribute, over
 * search-schema attributes only. `$or` blocks, "IN" arrays, `$beginsWith`,
 * `$contains`, the comparison operators, `$between`, and nested Map paths are
 * not representable and are rejected with a {@link FilterError}.
 */
export const searchFilterCapabilities: FilterCapabilities = {
  context: "search filters",
  or: false,
  in: false,
  beginsWith: false,
  contains: false,
  comparison: false,
  composedComparisons: false,
  between: false,
  nestedPaths: false,
  singleConditionPerAttribute: true,
  dropUndefinedConditions: true,
  nullMeansNotSet: false,
  // Moot: $or is not supported at all, and that rejection comes first
  dropEmptyOr: false
};

/**
 * Capability set of the write condition context — the condition a write
 * carries to guard the row it lands on.
 *
 * DynamoDB's `ConditionExpression` has the same grammar as a
 * `FilterExpression`, so the vocabulary is the query filter's in full. What
 * differs is what a condition means when it says nothing: a filter that drops
 * one returns more rows, while a guard that drops one lets through a write it
 * was meant to stop. So a condition set to `undefined` and an empty `$or` are
 * rejected rather than dropped, and `null` means "not set" — the state
 * dyna-record leaves an attribute in when it is nulled — on an attribute
 * declared nullable.
 */
export const writeConditionCapabilities: FilterCapabilities = {
  ...queryFilterCapabilities,
  context: "write conditions",
  dropUndefinedConditions: false,
  nullMeansNotSet: true,
  dropEmptyOr: false
};
