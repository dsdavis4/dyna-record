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

// TODO start here...
// Get rid of NullableAttribute and enforce like this instead
// Open a github issue to be able to support this..
// Then make DateDecorator, NumberDecorator etc
// And this means that I lose the NullableAttribute optional enforcement
//   I should think of apply the same rule to NullableforeignKey Attrbute

export interface AttributeProps {
  alias: string;
  nullable?: boolean;
}
