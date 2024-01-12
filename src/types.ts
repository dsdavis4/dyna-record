import { type NativeAttributeValue } from "@aws-sdk/util-dynamodb";
import { type BelongsToLink } from "./relationships";

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

// class MyClass {
//   key1: ForeignKey;
//   key2: NullableForeignKey;
// }

// const instance = new MyClass();
// instance.key1 = "bla" as ForeignKey;
// instance.key2 = "bla" as NullableForeignKey;

// instance.key1 = undefined as ForeignKey;
// instance.key2 = undefined as NullableForeignKey;

// TODO would something like this help with determing if a foreign key is required? or not?
//     - If so I would want to update the name of the ForeignKey type to indicate its nullable
//     - This might not be needed if I can determine optional or not from the decorator
//     - But even then... this might be more clear....
// Building off this... I could make
//    - Decorator - ForeignKeyAttribute
//       - Which takes an option of nullable true false, and stores that in meta data
//      - Only accepts one a type of ForeignKey or nullable Foreign key
//       - For the nullable ones it requires attributes to be optional
// export type NullableForeignKey = Brand<NonNullable<string>, "ForeignKey">;

// TODO move this back to where it was before if its  not used
// TODO should this be the native scalar version type?
export type DynamoTableItem = Record<string, NativeAttributeValue>;

export type StringObj = Record<string, string>;

export interface BelongsToLinkDynamoItem {
  Type: typeof BelongsToLink.name;
  [key: string]: NativeAttributeValue;
}

export type Optional<T> = T | undefined;
export type Nullable<T> = T | null;
