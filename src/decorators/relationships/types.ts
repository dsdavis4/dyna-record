import type DynaRecord from "../../DynaRecord";
import type { NullableForeignKey, Optional } from "../../types";
import type { ForeignEntityAttribute } from "../types";

export interface BelongsToProps<T extends DynaRecord> {
  foreignKey: ForeignEntityAttribute<T>;
}

/**
 * If the relationship is linked by a NullableForeignKey then it allows the field to be optional, otherwise it ensures that is is not optional
 */
export type BelongsToField<
  T extends DynaRecord,
  K extends DynaRecord,
  FK extends ForeignEntityAttribute<T>
> = FK extends keyof T
  ? T[FK] extends NullableForeignKey
    ? Optional<K>
    : K
  : never;
