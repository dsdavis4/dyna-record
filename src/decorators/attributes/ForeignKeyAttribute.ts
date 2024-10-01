import type DynaRecord from "../../DynaRecord";
import Metadata from "../../metadata";
import type { ForeignKey, NullableForeignKey } from "../../types";
import type { AttributeDecoratorContext, AttributeOptions } from "../types";

/**
 * A decorator for annotating class fields as foreign keys within the context of a single-table design entity, aimed at establishing and managing relationships between different entities in a relational manner. This decorator enables the clear and explicit declaration of foreign key relationships, contributing to the ORM's ability to navigate and resolve these associations efficiently.
 *
 * The entity can belong to its associated entity has a {@link HasOne} or {@link HasMany}
 *
 * Does not allow property to be optional.
 *
 * @template T The entity the decorator is applied to.
 * @param props An optional object of {@link AttributeOptions}, including configuration options such as metadata attributes. These options allow for additional customization of the foreign key attribute, including aliasing and metadata tagging.
 * @returns A class field decorator function that targets and initializes the class's prototype to register the foreign key with the ORM's metadata system. This registration is crucial for enabling the ORM to correctly interpret and manage the relationships between entities.
 *
 * Usage example:
 * ```typescript
 * class Order extends BaseEntity {
 *   @ForeignKeyAttribute({ alias: 'UserID' })
 *   public userId: ForeignKey; // Foreign key to the User entity. Cannot be optional.
 *
 *   @BelongsTo(() => User, { foreignKey: "userId" })
 *   public readonly user: User; // Cannot be optional
 *
 *   @ForeignKeyAttribute({ alias: 'ProfileId', nullable: true })
 *   public profileId?: NullableForeignKey; // Set to optional. Nullable foreign key to another entity (e.g., UserProfile)
 *
 *   @BelongsTo(() => Profile, { foreignKey: "profileId" })
 *   public readonly profile?: Profile; // Set to optional because its linked via a NullableForeignKey
 * }
 * ```
 *
 * Here, `@ForeignKeyAttribute` decorates `userId` of `Order`, designating it as a foreign key that references the `User` entity. This decoration not only clarifies the nature of the relationship but also empowers the ORM to enforce relational integrity and facilitate entity association operations.
 */
function ForeignKeyAttribute<T extends DynaRecord, P extends AttributeOptions>(
  props?: P
) {
  return function (
    _value: undefined,
    context: AttributeDecoratorContext<
      T,
      P["nullable"] extends true ? NullableForeignKey : ForeignKey,
      P
    >
  ) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity: DynaRecord = Object.getPrototypeOf(this);

        Metadata.addEntityAttribute(entity.constructor.name, {
          attributeName: context.name.toString(),
          nullable: props?.nullable,
          ...props
        });
      });
    }
  };
}

export default ForeignKeyAttribute;
