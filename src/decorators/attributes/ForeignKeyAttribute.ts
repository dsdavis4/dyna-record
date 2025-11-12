import { z } from "zod";
import type DynaRecord from "../../DynaRecord";
import Metadata from "../../metadata";
import type { EntityClass, ForeignKey, NullableForeignKey } from "../../types";
import type { AttributeDecoratorContext, AttributeOptions } from "../types";

/**
 * A decorator for annotating class fields as foreign keys within the context of a single-table design entity, aimed at establishing and managing relationships between different entities in a relational manner. This decorator enables the clear and explicit declaration of foreign key relationships, contributing to the ORM's ability to navigate and resolve these associations efficiently.
 *
 * The entity can belong to its associated entity has a {@link HasOne} or {@link HasMany}
 *
 * Does not allow property to be optional.
 *
 * Supplying the target entity enables DynaRecord to enforce referential integrity for the foreign key even when no relationship decorators are defined (for example when a foreign key is used purely for validation without denormalising related records).
 *
 * @template T The entity the decorator is applied to.
 * @template K The entity that the foreign key references.
 * @param getTarget A function returning the constructor for the entity referenced by the foreign key. This allows deferred resolution to avoid circular dependency issues.
 * @param props An optional object of {@link AttributeOptions}, including configuration options such as metadata attributes. These options allow for additional customization of the foreign key attribute, including aliasing and metadata tagging.
 * @returns A class field decorator function that targets and initializes the class's prototype to register the foreign key with the ORM's metadata system. This registration is crucial for enabling the ORM to correctly interpret and manage the relationships between entities.
 *
 * Usage example:
 * ```typescript
 * class Order extends TableClass {
 *   @ForeignKeyAttribute(() => User, { alias: 'UserID' })
 *   public userId: ForeignKey<User>; // Foreign key to the User entity. Cannot be optional.
 *
 *   @BelongsTo(() => User, { foreignKey: "userId" })
 *   public readonly user: User; // Cannot be optional
 *
 *   @ForeignKeyAttribute(() => Profile, { alias: 'ProfileId', nullable: true })
 *   public profileId?: NullableForeignKey<Profile>; // Set to optional. Nullable foreign key to another entity (e.g., UserProfile)
 *
 *   @BelongsTo(() => Profile, { foreignKey: "profileId" })
 *   public readonly profile?: Profile; // Set to optional because its linked via a NullableForeignKey
 * }
 * ```
 *
 * Here, `@ForeignKeyAttribute` decorates `userId` of `Order`, designating it as a foreign key that references the `User` entity. This decoration not only clarifies the nature of the relationship but also empowers the ORM to enforce relational integrity and facilitate entity association operations.
 */
function ForeignKeyAttribute<
  TargetEntity extends DynaRecord,
  T extends DynaRecord,
  P extends AttributeOptions
>(getTarget: () => EntityClass<TargetEntity>, props?: P) {
  return function (
    _value: undefined,
    context: AttributeDecoratorContext<
      T,
      P["nullable"] extends true
        ? NullableForeignKey<TargetEntity>
        : ForeignKey<TargetEntity>,
      P
    >
  ) {
    if (context.kind === "field") {
      context.addInitializer(function (this: T) {
        const targetEntity = getTarget();

        Metadata.addEntityAttribute(this.constructor.name, {
          attributeName: context.name.toString(),
          nullable: props?.nullable,
          type: z.string(),
          foreignKeyTarget: targetEntity,
          ...props
        });
      });
    }
  };
}

export default ForeignKeyAttribute;
