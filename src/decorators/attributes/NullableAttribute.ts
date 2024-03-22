import type NoOrm from "../../NoOrm";
import Metadata from "../../metadata";
import type { ForeignKey, NullableForeignKey, Optional } from "../../types";
import type { AttributeOptions } from "../types";
import { type NativeScalarAttributeValue } from "@aws-sdk/util-dynamodb";

/**
 * Do not allow ForeignKey or NullableForeignKey types when using the Attribute decorator
 */
type NotForeignKey<T> = T extends ForeignKey | NullableForeignKey
  ? never
  : Optional<T>;

/**
 * Similar to '@Attribute' but specific to Dates since Dates are not native types to dynamo
 *
 * IMPORTANT - For optimal type safety mark the class field property as optional
 *
 * @template T The class type that the decorator is applied to, ensuring type safety and integration within specific class instances.
 * @template K A type constraint extending `Date`, ensuring that the decorator is only applied to class fields specifically intended to represent dates.
 * @param props An {@link AttributeOptions} object providing configuration options for the attribute, such as its `alias` which allows the attribute to be referred to by an alternative name in the database context. The `nullable` property is also set to `true` by default, indicating that the date attribute can be empty.
 * @returns A class field decorator function that operates within the class field's context. It configures the field as a date attribute and defines how it should be serialized and deserialized to/from DynamoDB.
 *
 * Usage example:
 * ```typescript
 * class MyEntity extends MyTable {
 *   @NullableAttribute({ alias: 'MyField' })
 *   public myField?: string; // Set to Optional
 * }
 * ```
 *
 * Here, `@Attribute` decorates `myField` of `MyEntity`, marking it as an entity attribute with an alias 'MyField' for ORM purposes.
 */
function NullableAttribute<T, K extends NativeScalarAttributeValue>(
  props?: AttributeOptions
) {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<T, NotForeignKey<K>>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity: NoOrm = Object.getPrototypeOf(this);

        Metadata.addEntityAttribute(entity.constructor.name, {
          attributeName: context.name.toString(),
          nullable: true,
          ...props
        });
      });
    }
  };
}

export default NullableAttribute;
