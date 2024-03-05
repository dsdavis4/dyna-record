import type SingleTableDesign from "../../SingleTableDesign";
import Metadata from "../../metadata";
import type { Optional } from "../../types";
import type { AttributeProps } from "../types";
import { dateSerializer } from "./serializers";

// TODO I am missing a unit test where a DateNullable attribute is serialized

/**
 * Similar to '@Attribute' but specific to Dates since Dates are not native types to dynamo
 *
 * IMPORTANT - Highly recommended to define property as optional.
 *
 * @template T The class type that the decorator is applied to, ensuring type safety and integration within specific class instances.
 * @template K A type constraint extending `Date`, ensuring that the decorator is only applied to class fields specifically intended to represent dates.
 * @param props An {@link AttributeProps} object providing configuration options for the attribute, such as its `alias` which allows the attribute to be referred to by an alternative name in the database context. The `nullable` property is also set to `false` by default, indicating that the date attribute must not be empty.
 * @returns A class field decorator function that operates within the class field's context. It configures the field as a date attribute and defines how it should be serialized and deserialized to/from DynamoDB.
 *
 * Usage example:
 * ```typescript
 * class MyEntity extends MyTable {
 *   @DateNullableAttribute({ alias: 'MyField' })
 *   public myField?: Date; // Set to Optional
 * }
 * ```
 *
 * Here, `@Attribute` decorates `myField` of `MyEntity`, marking it as an entity attribute with an alias 'MyField' for ORM purposes.
 */
function DateNullableAttribute<T, K extends Date>(props?: AttributeProps) {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<T, Optional<K>>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity: SingleTableDesign = Object.getPrototypeOf(this);

        Metadata.addEntityAttribute(entity.constructor.name, {
          attributeName: context.name.toString(),
          nullable: true,
          serializers: dateSerializer,
          ...props
        });
      });
    }
  };
}

export default DateNullableAttribute;
