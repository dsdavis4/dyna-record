import type SingleTableDesign from "../SingleTableDesign";
import { type EntityAttributes } from "../operations/types";
import { type FunctionFields } from "../types";

/**
 * Attributes of SingleTableDesign which are not relationships or functions
 */
export type ForeignEntityAttribute<T extends SingleTableDesign> = Omit<
  EntityAttributes<T>,
  FunctionFields<T>
>;
