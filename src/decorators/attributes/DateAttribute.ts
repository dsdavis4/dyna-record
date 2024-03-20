import type SingleTableDesign from "../../SingleTableDesign";
import Metadata from "../../metadata";
import type { AttributeOptions } from "../types";
import { dateSerializer } from "./serializers";

/**
 * Similar to '@Attribute' but specific to Dates since Dates are not native types to dynamo
 *
 * Does not allow property to be optional.
 *
 * @template T The class type that the decorator is applied to, ensuring type safety and integration within specific class instances.
 * @template K A type constraint extending `Date`, ensuring that the decorator is only applied to class fields specifically intended to represent dates.
 * @param props An {@link AttributeOptions} object providing configuration options for the attribute, such as its `alias` which allows the attribute to be referred to by an alternative name in the database context. The `nullable` property is also set to `false` by default; the attribute must not be empty.
 * @returns A class field decorator function that operates within the class field's context. It configures the field as a date attribute and defines how it should be serialized and deserialized to/from DynamoDB.
 *
 * Usage example:
 * ```typescript
 * class MyEntity extends MyTable {
 *   @DateAttribute({ alias: 'MyField' })
 *   public myField: string;
 * }
 * ```
 *
 * Here, `@Attribute` decorates `myField` of `MyEntity`, marking it as an entity attribute with an alias 'MyField' for ORM purposes.
 */
function DateAttribute<T, K extends Date>(props?: AttributeOptions) {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<T, K>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity: SingleTableDesign = Object.getPrototypeOf(this);

        Metadata.addEntityAttribute(entity.constructor.name, {
          attributeName: context.name.toString(),
          nullable: false,
          serializers: dateSerializer,
          ...props
        });
      });
    }
  };
}

export default DateAttribute;
