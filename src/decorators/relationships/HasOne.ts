import Metadata from "../../metadata";
import type NoOrm from "../../NoOrm";
import type { EntityClass, ForeignKeyAttribute, Optional } from "../../types";
import { type ForeignEntityAttribute } from "../types";

interface HasOneProps<T extends NoOrm> {
  foreignKey: ForeignEntityAttribute<T> & keyof T;
}

/**
 * A decorator for defining a one-to-one relationship between entities in a single-table design ORM system. This relationship implies that an instance of the entity to which this decorator is applied can be associated with at most one instance of another entity. The `HasOne` decorator plays a crucial role in establishing and managing such relationships by automatically registering the necessary metadata, thereby enabling the ORM to recognize and navigate these associations effectively.
 *
 * @template T The source entity class that has a one-to-one relationship with another entity. This is the class on which the decorator is applied.
 * @template K The target entity class that is related to `T` in a one-to-one relationship.
 * @param getTarget A function returning the constructor of the target entity class `T`. This function is essential for dynamically establishing the relationship, helping to circumvent circular dependency issues.
 * @param props Configuration options for the one-to-one relationship, particularly the foreign key within the target entity that links it back to the source entity. This setup is critical for accurately linking and managing the entities involved.
 * @returns A class field decorator function that, when applied to a field, registers the one-to-one relationship in the ORM's metadata system. The registration includes the target entity and the specified foreign key, ensuring that the ORM correctly interprets and maintains the relationship.
 *
 * Usage example:
 * ```typescript
 * class User extends BaseEntity {
 *   @HasOne(() => Profile, { foreignKey: 'userId' })
 *   public profile?: Profile;
 * }
 *
 * class Profile extends BaseEntity {
 *   @ForeignKeyAttribute()
 *   public readonly userId: ForeignKey;
 *
 *   @BelongsTo(() => User, { foreignKey: "userId" })
 *   public readonly user: User;
 * }
 * ```
 * Here, the `@HasOne` decorator is applied to the `profile` field of the `User` class, establishing a one-to-one relationship between a `User` and a `Profile`. The foreign key (`userId`) in the `Profile` entity points back to the `User` entity, enabling the ORM to manage this relationship by linking a user to at most one profile.
 */
function HasOne<T extends NoOrm, K extends NoOrm>(
  getTarget: () => EntityClass<T>,
  props: HasOneProps<T>
) {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<K, Optional<T>>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity: NoOrm = Object.getPrototypeOf(this);

        Metadata.addEntityRelationship(entity.constructor.name, {
          type: "HasOne",
          propertyName: context.name as keyof NoOrm,
          target: getTarget(),
          foreignKey: props.foreignKey as ForeignKeyAttribute
        });
      });
    }
  };
}

export default HasOne;
