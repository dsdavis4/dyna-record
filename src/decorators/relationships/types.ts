import type DynaRecord from "../../DynaRecord";
import type { ForeignKey, NullableForeignKey, Optional } from "../../types";
import type { ForeignEntityAttribute } from "../types";

type NullableForeignKeyBrand<T extends DynaRecord> = NonNullable<
  NullableForeignKey<T>
>;

type NormalizedForeignKey<Value> = NonNullable<Value>;

type ExtractForeignKeyTarget<Value> =
  NormalizedForeignKey<Value> extends ForeignKey<infer Target>
    ? Target
    : NormalizedForeignKey<Value> extends NullableForeignKeyBrand<infer Target>
      ? Target
      : never;

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
