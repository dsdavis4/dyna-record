import type DynaRecord from "../../DynaRecord";
import type {
  KeyConditions as QueryKeyConditions,
  QueryOptions as QueryBuilderOptions,
  SortKeyCondition,
  BeginsWithFilter
} from "../../query-utils";
import type { PartitionKey, SortKey } from "../../types";
import type { EntityAttributesInstance } from "../types";

/**
 * Extends the basic query builder options by adding an optional sort key condition for more precise querying capabilities.
 *
 * @extends QueryBuilderOptions - Base query options provided by the query utilities.
 * @property {SortKeyCondition?} skCondition - An optional condition for the sort key to further refine the query. This can be an exact match condition or a condition specifying a range or beginning match for the sort key.
 */
export type QueryOptions = QueryBuilderOptions & {
  /**
   * Condition to query sort key by
   */
  skCondition?: SortKeyCondition;
};

// TODO typedoc
export type OptionsWithoutIndex = Omit<QueryOptions, "indexName">;

// TODO typedoc
export type OptionsWithIndex = QueryBuilderOptions & {
  indexName: string;
  // If indexName is provided, consistentRead is not allowed (or must be false)
  consistentRead?: false;
};

/**
 * Defines key conditions for querying entities based on their keys.
 *
 * PartitionKey is required, SortKey is optional.
 *
 * @template T - The type of the entity being queried, extending `DynaRecord`.
 * @property {KeyConditions} - Conditions applied to entity keys. Each key in the entity can have conditions such as equality, range conditions, or begins with conditions.
 */
export type EntityKeyConditions<T> = {
  // For each key in T that is a PartitionKey, make it required.
  [K in keyof T as T[K] extends PartitionKey ? K : never]-?: string;
} & {
  // For each key in T that is a SortKey, make it optional.
  [K in keyof T as T[K] extends SortKey ? K : never]?:
    | string
    | BeginsWithFilter;
};

// TODO typedoc
export type KeyConditions<T> = {
  [K in keyof T]?: QueryKeyConditions;
};

/**
 * Asserts that a given type `E` extends `DynaRecord`. If `E` does not extend `DynaRecord`, it resolves to `never`.
 *
 * This is used to enforce that only valid `DynaRecord` types are included in relationships or other dependent types.
 *
 * @template E - The type to assert.
 */
export type AssertDynaRecord<E> = E extends DynaRecord ? E : never;

/**
 * Extracts the keys of a `DynaRecord` type `T` whose properties are either a `DynaRecord` or an array of `DynaRecord`.
 *
 * This type is used to identify properties in a `DynaRecord` that represent relationships to other entities.
 *
 * @template T - The `DynaRecord` type to evaluate.
 * @returns A union of property names in `T` that represent relationships.
 */
export type RelationshipProperties<T extends DynaRecord> = Extract<
  {
    [K in keyof T]: NonNullable<T[K]> extends DynaRecord | DynaRecord[]
      ? K
      : never;
  }[keyof T],
  string
>;

/**
 * Maps the relationship properties of a `DynaRecord` type `T` to their corresponding entity types.
 *
 * For array relationships, this resolves to the entity type of the array elements.
 * For single relationships, this resolves to the entity type of the property.
 *
 * @template T - The `DynaRecord` type to evaluate.
 * @returns A union of all entity types referenced by the relationships in `T`.
 */
export type RelationshipEntities<T extends DynaRecord> = {
  [K in RelationshipProperties<T>]: NonNullable<T[K]> extends Array<infer U>
    ? AssertDynaRecord<U>
    : AssertDynaRecord<NonNullable<T[K]>>;
}[RelationshipProperties<T>];

/**
 * Represents the results of a query operation for a `DynaRecord` entity `T`.
 *
 * The results include attributes of the queried entity as well as attributes of its related entities.
 * For related entities, their attributes are derived from their relationship definitions in `T`.
 *
 * @template T - The type of the entity being queried, extending `DynaRecord`.
 * @returns An array of objects representing the entity attributes of `T` or its related entities.
 */
export type QueryResults<T extends DynaRecord> = Array<
  | EntityAttributesInstance<T>
  | (RelationshipEntities<T> extends infer R
      ? R extends DynaRecord
        ? EntityAttributesInstance<R>
        : never
      : never)
>;

/**
 * A utility type that represents a single item in the query results, which can be either an entity or a associated entity. This type is derived from the `QueryResults` array type, providing a convenient way to refer to individual results from a query.
 *
 * @template T - The type of the entity being queried, extending `DynaRecord`.
 */
export type QueryResult<T extends DynaRecord> = QueryResults<T>[number];
