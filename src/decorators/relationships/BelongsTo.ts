import Metadata from "../../metadata";
import type NoOrm from "../../NoOrm";
import type {
  EntityClass,
  ForeignKeyAttribute,
  NullableForeignKey,
  Optional
} from "../../types";
import { type ForeignEntityAttribute } from "../types";

interface BelongsToProps<T extends NoOrm> {
  foreignKey: ForeignEntityAttribute<T>;
}

/**
 * If the relationship is linked by a NullableForeignKey then it allows the field to be optional, otherwise it ensures that is is not optional
 */
type BelongsToField<
  T extends NoOrm,
  K extends NoOrm,
  FK extends ForeignEntityAttribute<T>
> = FK extends keyof T
  ? T[FK] extends NullableForeignKey
    ? Optional<K>
    : K
  : never;

function BelongsTo<T extends NoOrm, K extends NoOrm>(
  getTarget: () => EntityClass<K>,
  props: BelongsToProps<T>
) {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<
      T,
      BelongsToField<T, K, typeof props.foreignKey>
    >
  ) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity: NoOrm = Object.getPrototypeOf(this);

        Metadata.addEntityRelationship(entity.constructor.name, {
          type: "BelongsTo",
          propertyName: context.name as keyof NoOrm,
          target: getTarget(),
          foreignKey: props.foreignKey as ForeignKeyAttribute
        });
      });
    }
  };
}

export default BelongsTo;
