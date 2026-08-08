import type { FilterCapabilities } from "./types.js";

/**
 * Capability set of the query filter context — the full filter vocabulary:
 * `$or` blocks, "IN" arrays, `$beginsWith`, `$contains`, dot-path notation
 * for nested Map attributes, and any number of conditions per attribute.
 */
export const queryFilterCapabilities: FilterCapabilities = {
  context: "query",
  or: true,
  in: true,
  beginsWith: true,
  contains: true,
  nestedPaths: true,
  singleConditionPerAttribute: false
};

/**
 * Capability set of the vector search filter context. DynamoDB's
 * `SearchConditionExpression` is an equality-only conjunction: `attr = value`
 * conditions joined with AND, at most one condition per attribute, over
 * search-schema attributes only. `$or` blocks, "IN" arrays, `$beginsWith`,
 * `$contains`, and nested Map paths are not representable and are rejected
 * with a {@link FilterError}.
 */
export const searchFilterCapabilities: FilterCapabilities = {
  context: "search",
  or: false,
  in: false,
  beginsWith: false,
  contains: false,
  nestedPaths: false,
  singleConditionPerAttribute: true
};
