import type { FilterParams, KeyConditions } from "../filter-utils/index.js";

// The filter type family is shared with the vector search context and lives
// in filter-utils. Re-exported here so query consumers keep a single import
// site for query building types
export type {
  BeginsWithFilter,
  BetweenFilter,
  ComparisonFilter,
  ContainsFilter,
  FilterConditionFor,
  FilterValue,
  FilterExpression,
  FilterParams,
  FilterTypes,
  KeyConditions,
  OrFilter,
  SortKeyCondition,
  StoredFilterTypes
} from "../filter-utils/index.js";

/**
 * Specifies additional options for querying items, including optional consistent read, index name and filter conditions.
 *
 *
 * @property {string?} indexName - Optional name of the secondary index to use in the query.
 * @property {FilterParams?} filter - Optional filter conditions to apply to the query.
 * @property {boolean?} consistentRead - Whether to use consistent reads for the operation. Defaults to false. Cannot be used when indexName is provided ([Docs](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html#HowItWorks.ReadConsistency.Strongly))
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
