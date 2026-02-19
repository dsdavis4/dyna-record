import { type QueryCommandInput } from "@aws-sdk/lib-dynamodb";
import { type NativeAttributeValue } from "@aws-sdk/util-dynamodb";

/**
 * Represents conditions used to specify the partition key and sort key (if applicable) for querying items in DynamoDB.
 *
 * @type {KeyConditions} - Derived from the `KeyConditions` part of the `QueryCommandInput` from AWS SDK, excluding the "undefined" type to ensure type safety.
 */
export type KeyConditions = Omit<
  QueryCommandInput["KeyConditions"],
  "undefined"
>;

/**
 * Defines the structure for a filter expression used in querying items, including the expression string and a record of values associated with the expression placeholders.
 *
 * @property {Record<string, NativeAttributeValue>} values - A mapping of placeholder tokens in the filter expression to their actual values.
 * @property {string} expression - The filter expression string, using DynamoDB's expression syntax.
 */
export interface FilterExpression {
  values: Record<string, NativeAttributeValue>;
  expression: string;
}

/**
 * Represents a filter condition specifying that a value must begin with a certain prefix.
 *
 * @type {BeginsWithFilter} - A record with "$beginsWith" key pointing to the prefix value.
 */
export type BeginsWithFilter = Record<"$beginsWith", NativeAttributeValue>;

/**
 * Represents a filter condition specifying that a list contains a given element, or a string contains a given substring.
 *
 * @type {ContainsFilter} - A record with "$contains" key pointing to the value to check for.
 */
export type ContainsFilter = Record<"$contains", NativeAttributeValue>;

/**
 * Defines possible types of values that can be used in a filter condition, including begins with, contains, exact value, or an array for "IN" conditions.
 *
 * @type {FilterTypes} - A union of `BeginsWithFilter`, `ContainsFilter`, a single scalar value, or an array of scalar values.
 */
export type FilterTypes =
  | BeginsWithFilter
  | ContainsFilter
  | NativeAttributeValue
  | NativeAttributeValue[];

/**
 * Represents a filter condition using an AND logical operator. All items in this record will be queried with "AND"
 *
 * @type {AndFilter} - A record mapping attribute names to their filter conditions, implying all conditions must be met (AND logic).
 */
export type AndFilter = Record<string, FilterTypes>;

/**
 * Represents a filter condition using an OR logical operator, allowing for grouping of multiple `AndFilter` conditions under a single '$or' key.
 *
 * @type {OrFilter} - A record with an "$or" key containing an array of `AndFilter` objects, indicating any of the conditions can be met (OR logic).
 */
export type OrFilter = Record<"$or", AndFilter[]>;

/**
 * Makes the '$or' key optional in an `OrFilter`, allowing for filters that primarily use AND logic but optionally include OR conditions.
 *
 * @type {OrOptional} - An `OrFilter` type with the '$or' key made optional.
 */
export type OrOptional = Omit<OrFilter, "$or"> & Partial<Pick<OrFilter, "$or">>;

/**
 * Combines `AndFilter` and `OrFilter` types, supporting complex filters that use both AND and OR logic within the same filter structure.
 *
 * @type {FilterParams} - A combination of `AndFilter` or `OrFilter` with optional OR conditions.
 */
export type FilterParams = (AndFilter | OrFilter) & OrOptional;

/**
 * Represents complex filters combining AND and OR logic, specifically allowing for an 'OrFilter' at the top level.
 *
 * @type {AndOrFilter} - A `FilterParams` type further combined with an `OrFilter` for additional flexibility.
 */
export type AndOrFilter = FilterParams & OrFilter;

/**
 * Defines the condition for a sort key in a query, allowing for exact matches or "begins with" conditions.
 *
 * @type {SortKeyCondition} - A `BeginsWithFilter` or a single scalar value, used for sort key conditions in queries.
 */
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
