import Metadata from "../../metadata";
import type SingleTableDesign from "../../SingleTableDesign";
import type {
  EntityClass,
  ForeignKeyAttribute,
  NullableForeignKey,
  Optional
} from "../../types";
import { type ForeignEntityAttribute } from "../types";

interface BelongsToProps<T extends SingleTableDesign> {
  foreignKey: ForeignEntityAttribute<T>;
}

/**
 * If the relationship is linked by a NullableForeignKey then it allows the field to be optional, otherwise it ensures that is is not optional
 */
type BelongsToField<
  T extends SingleTableDesign,
  K extends SingleTableDesign,
  FK extends ForeignEntityAttribute<T>
> = FK extends keyof T
  ? T[FK] extends NullableForeignKey
    ? Optional<K>
    : K
  : never;

// TODO below is very close to working. It will ensure ForeignKeys cannot be undefed. And it ALLOWS NullableForeignKeys to be undefined but does not enforce it. I would love it to enforce this, open a stack overflow question or typescript github issue
/**
 * If the relationship is linked by a NullableForeignKey then it ensures the field is optional, otherwise it ensures that is is not
 */
// type BelongsToField<
//   T extends SingleTableDesign,
//   K extends SingleTableDesign,
//   FK extends ForeignEntityAttribute<T>
// > = FK extends keyof T
//   ? T[FK] extends NullableForeignKey
//     ? undefined extends K
//       ? Optional<K> // Ensures that K is optional
//       : never // Triggers a compile error if K is not optional
//     : K
//   : never;

// TODO should this be BelongsToOne?
//      In the future there could be a BelongsToMany which handles denormalizing links differently
function BelongsTo<T extends SingleTableDesign, K extends SingleTableDesign>(
  // Function to obtain Class to which relationship is applied
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
        const entity: SingleTableDesign = Object.getPrototypeOf(this);

        Metadata.addEntityRelationship(entity.constructor.name, {
          type: "BelongsTo",
          propertyName: context.name as keyof SingleTableDesign,
          target: getTarget(),
          foreignKey: props.foreignKey as ForeignKeyAttribute
        });
      });
    }
  };
}

export default BelongsTo;
