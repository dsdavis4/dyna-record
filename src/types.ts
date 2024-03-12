import { type NativeScalarAttributeValue } from "@aws-sdk/util-dynamodb";
import { type BelongsToLink } from "./relationships";
import type { BelongsToRelationship, RelationshipMetadata } from "./metadata";
import SingleTableDesign from "./SingleTableDesign";

// TODO Jsdoc for everything in here

export type Brand<K, T> = K & { __brand: T };

// TODO can I use symbols here?
// const ForeignKeyBrand = Symbol('ForeignKey');
// export type Brand<K, T extends symbol> = K & { readonly [P in T]: true };
// export type ForeignKey = Brand<string, typeof ForeignKeyBrand>;

export type SortKey = Brand<string, "SortKey">;
export type PrimaryKey = Brand<string, "PrimaryKey">;
export type ForeignKey = Brand<string, "ForeignKey">;
export type NullableForeignKey =
  | Brand<string, "NullableForeignKey">
  | undefined;

export type DynamoTableItem = Record<string, NativeScalarAttributeValue>;

export type StringObj = Record<string, string>;

export interface BelongsToLinkDynamoItem {
  Type: typeof BelongsToLink.name;
  [key: string]: NativeScalarAttributeValue;
}

export type Optional<T> = T | undefined;
export type Nullable<T> = T | null;

// TODO see if I a mstoring things the right way to determine if this is needed
/**
 * Object to lookup up Relationship metadata by related entity name (As defined by property key for the relationship)
 */
export type RelationshipLookup = Record<string, RelationshipMetadata>;

/**
 * Relationship metadata object to perform lookups and reduce iteration during processing
 */
export interface RelationshipMetaObj {
  relationsLookup: RelationshipLookup;
  belongsToRelationships: BelongsToRelationship[];
}

/**
 * Make some keys of an object nullable
 */
export type MakeOptional<T, K extends keyof T> = Omit<T, K> &
  Partial<Pick<T, K>>;

/**
 * Generic type representing an instance of a class decorated by the {@link Entity} decorator
 */
export type EntityClass<T> = (new () => T) & typeof SingleTableDesign;
