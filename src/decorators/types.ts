import type SingleTableDesign from "../SingleTableDesign";
import { type EntityAttributes } from "../operations/types";
import { type ForeignKey } from "../types";

/**
 * Returns attributes on the provided model which are EntityAttributes of type ForeignKey
 */
export type ForeignEntityAttribute<T extends SingleTableDesign> = {
  [K in keyof T]: T[K] extends ForeignKey ? K : never;
}[keyof EntityAttributes<T>];
