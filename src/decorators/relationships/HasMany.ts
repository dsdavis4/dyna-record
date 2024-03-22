import Metadata from "../../metadata";
import type DynaRecord from "../../DynaRecord";
import type { EntityClass, ForeignKeyProperty } from "../../types";
import { type ForeignEntityAttribute } from "../types";

interface HasManyProps<T extends DynaRecord> {
  foreignKey: ForeignEntityAttribute<T>;
}

/**
 * A decorator for establishing a one-to-many relationship between entities in a single-table design ORM system. This relationship indicates that a single instance of the entity where this decorator is applied can be associated with multiple instances of another entity. The decorator facilitates the definition and management of such relationships by automatically handling the necessary metadata registration, thereby simplifying the implementation of relational data models.
 *
 * @template T The source entity class that has many instances of another entity. This is the entity class to which the decorator is applied.
 * @template K The target entity class that is related to `T` through a one-to-many relationship.
 * @param getTarget A function that returns the constructor of the target entity class `T`. This function is crucial for establishing the relationship dynamically and avoids issues related to circular dependencies.
 * @param props Configuration options for the one-to-many relationship, specifically the foreign key in the target entity that links back to the source entity. This configuration ensures the correct association and navigation between related entities.
 * @returns A class field decorator function that, when applied to a field of type array of `T`, registers the one-to-many relationship in the ORM's metadata system. This registration is essential for the ORM to recognize and correctly handle the relationship between the source and target entities, facilitating operations such as retrieval and update of related entities.
 *
 * Usage example:
 * ```typescript
 * class User extends BaseEntity {
 *   @HasMany(() => Post, { foreignKey: 'userId' })
 *   public posts: Post[];
 * }
 *
 * class Post extends BaseEntity {
 *   @ForeignKeyProperty()
 *   public readonly userId: ForeignKey;
 *
 *   @BelongsTo(() => User, { foreignKey: "userId" })
 *   public readonly user: User;
 * }
 * ```
 * In this example, each `User` entity is associated with multiple `Post` entities through a one-to-many relationship. The `@HasMany` decorator is applied to the `posts` field of the `User` class, indicating that a user can have many posts. The `foreignKey` property specifies the attribute in the `Post` entity that establishes the connection back to the `User` entity, enabling the ORM to manage the relationship effectively.
 */
function HasMany<T extends DynaRecord, K extends DynaRecord>(
  getTarget: () => EntityClass<T>,
  props: HasManyProps<T>
) {
  return (_value: undefined, context: ClassFieldDecoratorContext<K, T[]>) => {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity: DynaRecord = Object.getPrototypeOf(this);

        Metadata.addEntityRelationship(entity.constructor.name, {
          type: "HasMany",
          propertyName: context.name as keyof DynaRecord,
          target: getTarget(),
          foreignKey: props.foreignKey as ForeignKeyProperty
        });
      });
    }
  };
}

export default HasMany;
