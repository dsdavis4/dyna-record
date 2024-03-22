import type DynaRecord from "../../DynaRecord";
import type {
  KeyConditions,
  QueryOptions as QueryBuilderOptions,
  SortKeyCondition
} from "../../query-utils";
import type { BelongsToLink } from "../../relationships";
import type { EntityAttributes } from "../types";

/**
 * Extends the basic query builder options by adding an optional sort key condition for more precise querying capabilities.
 *
 * @extends QueryBuilderOptions - Base query options provided by the query utilities.
 * @property {SortKeyCondition?} skCondition - An optional condition for the sort key to further refine the query. This can be an exact match condition or a condition specifying a range or beginning match for the sort key.
 */
export interface QueryOptions extends QueryBuilderOptions {
  /**
   * Condition to query sort key by
   */
  skCondition?: SortKeyCondition;
}

/**
 * Defines partition key conditions for querying entities based on their keys. This type is used to specify the conditions under which an entity or a set of entities can be queried from the database.
 *
 * @template T - The type of the entity being queried, extending `DynaRecord`.
 * @property {KeyConditions} - Conditions applied to entity keys. Each key in the entity can have conditions such as equality, range conditions, or begins with conditions.
 */
export type EntityKeyConditions<T> = {
  [K in keyof T]?: KeyConditions;
};

/**
 * Represents the results of a query operation, which can include both entity attributes and associated `BelongsToLink` objects.
 *
 * @template T - The type of the entity being queried, extending `DynaRecord`.
 */
export type QueryResults<T extends DynaRecord> = Array<
  EntityAttributes<T> | BelongsToLink
>;

/**
 * A utility type that represents a single item in the query results, which can be either an entity or a `BelongsToLink`. This type is derived from the `QueryResults` array type, providing a convenient way to refer to individual results from a query.
 *
 * @template T - The type of the entity being queried, extending `DynaRecord`.
 */
export type QueryResult<T extends DynaRecord> = QueryResults<T>[number];
