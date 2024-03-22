import type NoOrm from "../../NoOrm";
import Metadata from "../../metadata";
import type { ForeignKey } from "../../types";
import type { AttributeOptions } from "../types";

/**
 * A decorator for annotating class fields as foreign keys within the context of a single-table design entity, aimed at establishing and managing relationships between different entities in a relational manner. This decorator enables the clear and explicit declaration of foreign key relationships, contributing to the ORM's ability to navigate and resolve these associations efficiently.
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
 *   public userId: string; // Foreign key to the User entity
 * }
 * ```
 *
 * Here, `@ForeignKeyAttribute` decorates `userId` of `Order`, designating it as a foreign key that references the `User` entity. This decoration not only clarifies the nature of the relationship but also empowers the ORM to enforce relational integrity and facilitate entity association operations.
 */
function ForeignKeyAttribute<T>(props?: AttributeOptions) {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<T, ForeignKey>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity: NoOrm = Object.getPrototypeOf(this);

        Metadata.addEntityAttribute(entity.constructor.name, {
          attributeName: context.name.toString(),
          nullable: false,
          ...props
        });
      });
    }
  };
}

export default ForeignKeyAttribute;
