import { type NativeScalarAttributeValue } from "@aws-sdk/util-dynamodb";
import { type BelongsToLink } from "./relationships";
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
 * A branded string type to represent primary keys in DynamoDB tables
 */
export type PrimaryKey = Brand<string, "PrimaryKey">;

/**
 * A branded string type to represent foreign keys in DynamoDB tables
 */
export type ForeignKey = Brand<string, "ForeignKey">;

/**
 * A branded string type to represent nullable foreign keys in DynamoDB tables, which can also be undefined.
 */
export type NullableForeignKey = Optional<Brand<string, "NullableForeignKey">>;

/**
 * Represents a foreign key attribute on an entity within a DynaRecord model
 */
export type ForeignKeyAttribute = keyof DynaRecord & ForeignKey;

/**
 * Defines a general type for items stored in a DynamoDB table, using string keys and native scalar attribute values.
 */
export type DynamoTableItem = Record<string, NativeScalarAttributeValue>;

/**
 * A utility type for objects with string keys and string values.
 */
export type StringObj = Record<string, string>;

/**
 * Describes the shape of a DynamoDB item representing a `BelongsToLink`, enforcing type consistency.
 */
export interface BelongsToLinkDynamoItem {
  Type: typeof BelongsToLink.name;
  [key: string]: NativeScalarAttributeValue;
}

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
 * Represents an instance of a class decorated with the `Entity` decorator in DynaRecord, encapsulating entity logic.
 */
export type EntityClass<T> = (new () => T) & typeof DynaRecord;
