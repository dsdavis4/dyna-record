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

// TODO make alias nullable now that defaults are applied in metadata.
//    - Update tests where passible to not pass the option
//    - make type tests
export interface AttributeProps {
  alias: string;
  nullable?: boolean;
}
