import { type NativeAttributeValue } from "@aws-sdk/util-dynamodb";
import type { BelongsToRelationship, RelationshipMetadata } from "./metadata";
import type DynaRecord from "./DynaRecord";

/**
 * A utility type for branding primitives to ensure type safety with unique identifiers.
 */
export type Brand<K, T> = K & { __brand: T };

/**
 * A branded string type to represent sort keys in DynamoDB tables
 */
export type SortKey = Brand<string, "SortKey">;

/**
 * A branded string type to represent partition keys in DynamoDB tables
 */
export type PartitionKey = Brand<string, "PartitionKey">;

/**
 * A branded string type to represent foreign keys in DynamoDB tables.
 *
 * @typeParam T - The entity that the foreign key references. Defaults to {@link DynaRecord}.
 */
export type ForeignKey<T extends DynaRecord = DynaRecord> = Brand<
  string,
  { kind: "ForeignKey"; entity: T }
>;

/**
 * A branded string type to represent nullable foreign keys in DynamoDB tables, which can also be undefined.
 *
 * @typeParam T - The entity that the foreign key references. Defaults to {@link DynaRecord}.
 */
export type NullableForeignKey<T extends DynaRecord = DynaRecord> = Optional<
  Brand<string, { kind: "NullableForeignKey"; entity: T }>
>;

/**
 * Represents a foreign key property on an entity within a DynaRecord model
 */
export type ForeignKeyProperty = keyof DynaRecord & ForeignKey;

/**
 * Defines a general type for items stored in a DynamoDB table, using string keys and native scalar attribute values.
 */
export type DynamoTableItem = Record<string, NativeAttributeValue>;

/**
 * A utility type for objects with string keys and string values.
 */
export type StringObj = Record<string, string>;

/**
 * A utility type for making a type optional, allowing it to be undefined.
 */
export type Optional<T> = T | undefined;

/**
 * A utility type for making a type nullable, allowing it to be null.
 */
export type Nullable<T> = T | null;

/**
 * Represents a lookup object to access relationship metadata by related entity name for DynaRecord models.
 */
export type RelationshipLookup = Record<string, RelationshipMetadata>;

/**
 * An object structure for holding relationship metadata, aimed at optimizing lookup operations and iterations.
 */
export interface RelationshipMetaObj {
  relationsLookup: RelationshipLookup;
  belongsToRelationships: BelongsToRelationship[];
}

/**
 * A utility type for modifying certain keys of an object type to be optional.
 */
export type MakeOptional<T, K extends keyof T> = Omit<T, K> &
  Partial<Pick<T, K>>;

/**
 * Detects the `any` type. Resolves to `true` when T is `any`, `false` otherwise.
 * Used internally to guard against `any` propagation from AWS SDK's `NativeAttributeValue`.
 */
export type IsAny<T> = 0 extends 1 & T ? true : false;

/**
 * Represents the constructor type of a class decorated with the `@Entity` decorator.
 *
 * The `@Entity` decorator enforces at compile time that each entity declares
 * `readonly type` as a string literal matching the class name. If the declaration
 * is missing, the decorator produces a type error. See {@link Entity} for details.
 */
export type EntityClass<T> = (new () => T) & typeof DynaRecord;

/**
 * Make a single property of an object required
 */
export type WithRequired<T, K extends keyof T> = Omit<T, K> & {
  [P in K]-?: T[P];
};
