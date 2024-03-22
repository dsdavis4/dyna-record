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

/**
 * A decorator for defining a "BelongsTo" relationship between entities in a single-table design using NoOrm. This relationship indicates that the decorated field is a reference to another entity, effectively establishing a parent-child linkage. The decorator dynamically enforces the presence or optionality of this reference based on the nature of the foreign key, enhancing type safety and relationship integrity within the ORM model.
 *
 * The decorator must reference a foreign key defined on the model.
 *
 * IMPORTANT - If referenced through a {@link NullableForeignKey} then set the belongs to attribute to optional.
 *
 * The decorator takes into consideration whether the relationship is defined by a `NullableForeignKey`, allowing the field to be optional if so, otherwise ensuring it is not optional. This behavior aligns with relational database design principles, where a foreign key can either strictly enforce a relationship or allow for its absence.
 *
 * @template T The source entity type, from which the relationship originates.
 * @template K The target entity type, to which the relationship points.
 * @template FK The type of the foreign key attribute within the source entity, used to establish the relationship. Must be defined on the model.
 * @param getTarget A function returning the class (constructor function) of the target entity. This enables late binding and avoids circular dependency issues.
 * @param props Configuration object for the relationship, including the name of the foreign key attribute.
 * @returns A class field decorator function that initializes the source entity's class prototype, registering the relationship with the ORM's metadata system. This registration process includes specifying the relationship type as "BelongsTo", along with detailing the target entity and foreign key.
 *
 * Usage example:
 * ```typescript
 * class Order extends BaseEntity {
 *   @ForeignKeyAttribute({ alias: "UserId" })
 *   public readonly userId: ForeignKey;
 *
 *   @BelongsTo(() => User, { foreignKey: 'userId' })
 *   public user: User;
 * }
 * ```
 * In this example, `@BelongsTo` decorates the `user` field of the `Order` entity, establishing a "BelongsTo" relationship with the `User` entity via the `userId` foreign key. This decoration signifies that each `Order` instance is related to a specific `User` instance.
 */
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
