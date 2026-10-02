import type { FilterParams, KeyConditions } from "../filter-utils/index.js";

// The filter type family is shared with the vector search context and lives
// in filter-utils. Re-exported here so query consumers keep a single import
// site for query building types
export type {
  BeginsWithConditionFor,
  BeginsWithFilter,
  BetweenConditionFor,
  BetweenFilter,
  ComparisonFilter,
  ContainsConditionFor,
  ContainsFilter,
  ComparisonConditionFor,
  FilterConditionFor,
  SingleComparisonConditionFor,
  SingleComparisonFilter,
  FilterValue,
  FilterExpression,
  FilterParams,
  FilterTypes,
  KeyConditions,
  OrderedFilterValue,
  OrFilter,
  SortKeyCondition,
  StoredFilterTypes
} from "../filter-utils/index.js";

/**
 * Specifies additional options for querying items, including optional consistent read, index name and filter conditions.
 *
 * A filter is applied by DynamoDB **after** the read, so it narrows the result
 * set rather than the work: it saves bandwidth, not capacity. To narrow what is
 * read, put the condition in the key condition instead — a sort key accepts a
 * range for exactly this reason.
 *
 * Filter keys are the attributes of the queried entity and of its declared
 * relationships, and support dot-path notation for nested `@ObjectAttribute`
 * fields. Each key accepts an equality, an "IN" array, a comparison, a
 * `$between` range, a `$beginsWith` prefix or a `$contains` check — whichever
 * of those the form the table stores the attribute in can carry. Conditions
 * join with AND; `$or` takes an array of blocks.
 *
 * @property {string?} indexName - Optional name of the secondary index to use in the query.
 * @property {FilterParams?} filter - Optional filter conditions to apply to the query. See {@link FilterTypes} for the conditions a key accepts.
 * @property {boolean?} consistentRead - Whether to use consistent reads for the operation. Defaults to false. Cannot be used when indexName is provided ([Docs](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html#HowItWorks.ReadConsistency.Strongly))
 *
 * @example
 * ```typescript
 * // Everything created in January, by one entity type
 * await Customer.query("123", {
 *   filter: {
 *     type: "Order",
 *     createdAt: { $gte: new Date("2026-01-01"), $lt: new Date("2026-02-01") }
 *   }
 * });
 *
 * // An OR block, with a range in one arm
 * await Customer.query("123", {
 *   filter: {
 *     $or: [{ total: { $between: [50, 100] } }, { name: { $beginsWith: "Scale" } }]
 *   }
 * });
 * ```
 */
export type QueryOptions =
  | {
      indexName: string;
      filter?: FilterParams;
      consistentRead?: never;
    }
  | {
      indexName?: undefined;
      filter?: FilterParams;
      consistentRead?: boolean;
    };

/**
 * Combines key conditions and query options to define the properties for a query command.
 *
 * @property {string} entityClassName - The name of the entity class being queried.
 * @property {KeyConditions} key - The partition key conditions for the query.
 * @property {QueryOptions?} options - Optional additional query options.
 */
export interface QueryCommandProps {
  entityClassName: string;
  key: KeyConditions;
  options?: QueryOptions;
}
