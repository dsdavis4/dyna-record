import { type NativeAttributeValue } from "@aws-sdk/util-dynamodb";

// TODO Jsdoc for everything in here

export type Brand<K, T> = K & { __brand: T };

export type SortKey = Brand<string, "SortKey">;
export type PrimaryKey = Brand<string, "PrimaryKey">;
export type ForeignKey = Brand<string, "ForeignKey">;

// TODO move this back to where it was before if its  not used
// TODO should this be the native scalar version type?
export type DynamoTableItem = Record<string, NativeAttributeValue>;

// TODO this is duplicated
export type StringObj = Record<string, string>;
