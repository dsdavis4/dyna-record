import type DynaRecord from "../../DynaRecord.js";
import type { ExtractForeignKeyTarget, Optional } from "../../types.js";
import type { ForeignEntityAttribute } from "../types.js";

export interface BelongsToProps<
  T extends DynaRecord,
  FK extends ForeignEntityAttribute<T>
> {
  foreignKey: FK;
}

export type BelongsToTarget<
  T extends DynaRecord,
  FK extends ForeignEntityAttribute<T>
> = FK extends keyof T ? ExtractForeignKeyTarget<T[FK]> : never;

/**
 * If the relationship is linked by a NullableForeignKey then it allows the field to be optional, otherwise it ensures that it is not optional
 */
export type BelongsToField<
  T extends DynaRecord,
  FK extends ForeignEntityAttribute<T>
> = FK extends keyof T
  ? BelongsToTarget<T, FK> extends never
    ? never
    : undefined extends T[FK]
      ? Optional<BelongsToTarget<T, FK>>
      : BelongsToTarget<T, FK>
  : never;
