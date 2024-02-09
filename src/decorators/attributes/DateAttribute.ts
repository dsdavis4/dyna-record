import { type NativeScalarAttributeValue } from "@aws-sdk/util-dynamodb";
import type SingleTableDesign from "../../SingleTableDesign";
import Metadata from "../../metadata";
import type { AttributeProps } from "../types";

/**
 * Similar to '@Attribute' but specific to Dates since Dates are not native types to dynamo
 *
 *
 * @template T The class type that the decorator is applied to, ensuring type safety and integration within specific class instances.
 * @template K A type constraint extending `Date`, ensuring that the decorator is only applied to class fields specifically intended to represent dates.
 * @param props An `AttributeProps` object providing configuration options for the attribute, such as its `alias` which allows the attribute to be referred to by an alternative name in the database context. The `nullable` property is also set to `false` by default, indicating that the date attribute must not be empty.
 * @returns A class field decorator function that operates within the class field's context. It configures the field as a date attribute and defines how it should be serialized and deserialized to/from DynamoDB.
 *
 * The decorator internally checks if it's applied to a class field (`context.kind === "field"`) and then proceeds to add an initializer function. This initializer function captures the class prototype and uses it to register attribute metadata through `Metadata.addEntityAttribute`.
 *
 * Usage example:
 * ```typescript
 * class MyEntity extends MyTable {
 *   @DateAttribute({ alias: 'MyField', nullable: true })
 *   myField: string;
 * }
 * ```
 *
 * Here, `@Attribute` decorates `myField` of `MyEntity`, marking it as an entity attribute with an alias 'MyField' for ORM purposes.
 */
function DateAttribute<T, K extends Date>(props: AttributeProps) {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<T, K>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity: SingleTableDesign = Object.getPrototypeOf(this);

        Metadata.addEntityAttribute(entity.constructor.name, {
          attributeName: context.name.toString(),
          alias: props.alias,
          nullable: false,
          serializer: (val: NativeScalarAttributeValue) => {
            if (typeof val === "string") {
              return new Date(val);
            }
            return val;
          }
        });
      });
    }
  };
}

export default DateAttribute;
