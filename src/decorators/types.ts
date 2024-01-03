import type SingleTableDesign from "../SingleTableDesign";
import { type EntityAttributes } from "../operations/types";
import type { NullableForeignKey, ForeignKey, Optional } from "../types";

/**
 * Returns attributes on the provided model which are EntityAttributes of type ForeignKey
 */
export type ForeignEntityAttribute<T extends SingleTableDesign> = {
  [K in keyof T]: T[K] extends ForeignKey
    ? K
    : T[K] extends NullableForeignKey
    ? Optional<K>
    : never;
}[keyof EntityAttributes<T>];

// type Optional<T> = T | undefined;
// // type NotOptional<T> = NonNullable<T>;

// class MyClass {
//   val1: Optional<string>;
//   val2: string; // TODO find out how to enforce this.... EX: if this is optional it shoudl error
// }

// const instance = new MyClass();
// instance.val1 = "bla";
// instance.val1 = undefined; // good....
// // instance.val3 = "blaaa";

// instance.val2 = "bla";
// instance.val2 = undefined; // good....
// // instance.val3 = undefined;
