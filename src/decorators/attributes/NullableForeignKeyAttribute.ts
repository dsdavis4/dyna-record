import type DynaRecord from "../../DynaRecord";
import Metadata from "../../metadata";
import type { NullableForeignKey } from "../../types";
import type { AttributeOptions } from "../types";

/**
 * A decorator for annotating class fields as nullable foreign keys within the context of a single-table design entity. This decorator is specifically designed for attributes that represent nullable foreign keys, facilitating the representation and management of relationships between entities.
 *
 * IMPORTANT - For optimal type safety mark the class field property as optional
 *
 * The entity can belong to its associated entity has a {@link HasOne} or {@link HasMany}
 *
 * @template T The entity the decorator is applied to.
 * @param props An optional object of {@link AttributeOptions}, including configuration options such as metadata attributes.
 * @returns A class field decorator function that targets and initializes the class's prototype to register the field with the ORM's metadata system.
 *
 * Usage example:
 * ```typescript
 * class User extends BaseEntity {
 *   @NullableForeignKeyAttribute({ alias: 'ProfileId' })
 *   public profileId?: NullableForeignKey; // Set to optional. Nullable foreign key to another entity (e.g., UserProfile)
 *
 *   @BelongsTo(() => Profile, { foreignKey: "profileId" })
 *   public readonly profile?: Profile; // Set to optional because its linked via a NullableForeignKey
 * }
 * ```
 *
 * Here, `@NullableForeignKeyAttribute` decorates `profileId` of `User`, indicating it as a nullable foreign key.
 */
function NullableForeignKeyAttribute<T extends DynaRecord>(
  props?: AttributeOptions
) {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<T, NullableForeignKey>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity: DynaRecord = Object.getPrototypeOf(this);

        Metadata.addEntityAttribute(entity.constructor.name, {
          attributeName: context.name.toString(),
          nullable: true,
          ...props
        });
      });
    }
  };
}

export default NullableForeignKeyAttribute;
