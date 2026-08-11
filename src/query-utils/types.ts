import { type NativeAttributeValue } from "@aws-sdk/util-dynamodb";
import type {
  BeginsWithFilter,
  FilterParams,
  KeyConditions
} from "../filter-utils/index.js";

// The filter type family is shared with the vector search context and lives
// in filter-utils. Re-exported here so query consumers keep a single import
// site for query building types
export type {
  BeginsWithFilter,
  FilterExpression,
  FilterParams,
  FilterTypes,
  KeyConditions,
  OrFilter,
  OrOptional
} from "../filter-utils/index.js";

/**
 * Defines the condition for a sort key in a query, allowing for exact matches or "begins with" conditions.
 *
 * @type {SortKeyCondition} - A `BeginsWithFilter` or a single scalar value, used for sort key conditions in queries.
 */
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- NativeAttributeValue is 'any' from AWS SDK
export type SortKeyCondition = BeginsWithFilter | NativeAttributeValue;

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
