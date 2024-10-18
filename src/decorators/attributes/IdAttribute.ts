import type DynaRecord from "../../DynaRecord";
import Metadata from "../../metadata";

/**
 * An optional decorator for marking class fields as the primary identifier (ID) within the context of a single-table design entity.
 *
 * By default, if no IdAttribute is specified on an entity, then a uuid is generated for each entity
 *
 * Use this decorator to specify the field you want to use as the id for each entity. For example, if you wanted a users email to be their id.
 *
 * This decorator registers the decorated field as the unique identifier for the entity, ensuring proper entity identity management within the ORM.
 *
 * IMPORTANT! - The ID field is a required field and must be a unique identifier for each entity instance. It cannot be applied to nullable attributes
 *
 * @template T The entity the decorator is applied to, extending {@link DynaRecord}.
 * @template K The type of the field being marked as the ID.
 * @param _value This parameter is unused but required for compatibility with the class field decorator structure.
 * @param context Provides metadata about the field being decorated, including its name and class.
 * @returns A class field decorator function that registers the decorated field as the entity's ID within the ORM metadata system.
 *
 * Usage example:
 * ```typescript
 * class User extends TableClass {
 *    @IdAttribute
 *    @StringAttribute({ alias: "Email" })
 *    public readonly email: string;
 * }
 * ```
 *
 * Here, `@IdAttribute` decorates `email` of `User` as the primary identifier, ensuring it is registered and managed as the entity's unique key.
 */
function IdAttribute<T extends DynaRecord, K extends string>(
  _value: undefined,
  context: ClassFieldDecoratorContext<T, K>
) {
  return function (this: T, value: K) {
    Metadata.addEntityIdField(this.constructor.name, context.name.toString());
    return value;
  };
}

export default IdAttribute;
