import {
  type ForeignKey,
  type NullableForeignKey,
  type PartitionKey,
  type SortKey
} from "../../src";
import type DynaRecord from "../../src/DynaRecord";
import { type MockTable } from "./mockModels";

/**
 * Capitalize the first letter of a string
 */
export type CapitalizeFirst<T extends string> =
  T extends `${infer First}${infer Rest}` ? `${Uppercase<First>}${Rest}` : T;

/**
 * Represents an entity a table item for MockTable classes which use pascal cases aliases
 * Utility to assist with making test mocks
 * Mapping rules:
 * - Exclude attributes that are Functions, DynaRecord, or DynaRecord[]
 * - Map "pk" to "PK" and "sk" to "SK" (string)
 * - Map ForeignKey to string
 * - Map NullableForeignKey to string | undefined
 * - Convert other keys to PascalCase
 * - Map Date attributes to ISO strings
 */
export type MockTableEntityTableItem<T extends MockTable> = {
  // eslint-disable-next-line @typescript-eslint/ban-types
  [K in keyof T as T[K] extends Function | DynaRecord | DynaRecord[]
    ? never
    : K extends "pk"
      ? "PK"
      : K extends "sk"
        ? "SK"
        : CapitalizeFirst<string & K>]: T[K] extends ForeignKey
    ? string
    : T[K] extends NullableForeignKey
      ? string | undefined
      : T[K] extends Date
        ? string
        : K extends "pk" | "sk"
          ? string
          : T[K];
};

/**
 * Represents an entity a table item for OtherTable classes which do not use table aliases
 * Utility to assist with making test mocks
 * Mapping rules:
 * - Exclude attributes that are Functions, DynaRecord, or DynaRecord[]
 * - Map PartitionKey, SortKey and ForeignKey to string
 * - Map NullableForeignKey to string | undefined
 * - Map Date attributes to ISO strings
 */
export type OtherTableEntityTableItem<T> = {
  // eslint-disable-next-line @typescript-eslint/ban-types
  [K in keyof T as T[K] extends Function | DynaRecord | DynaRecord[]
    ? never
    : K]: T[K] extends PartitionKey
    ? string
    : T[K] extends SortKey
      ? string
      : T[K] extends ForeignKey
        ? string
        : T[K] extends NullableForeignKey
          ? string | undefined
          : T[K] extends Date
            ? string
            : T[K];
};
