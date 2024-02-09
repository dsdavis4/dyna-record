import { type NativeScalarAttributeValue } from "@aws-sdk/util-dynamodb";
import { type BelongsToLink } from "./relationships";
import type { BelongsToRelationship, RelationshipMetadata } from "./metadata";

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

// TODO should this be the native scalar version type?
export type DynamoTableItem = Record<string, NativeScalarAttributeValue>;

export type StringObj = Record<string, string>;

export interface BelongsToLinkDynamoItem {
  Type: typeof BelongsToLink.name;
  [key: string]: NativeScalarAttributeValue;
}

export type Optional<T> = T | undefined;
export type Nullable<T> = T | null;

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
