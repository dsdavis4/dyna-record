import type SingleTableDesign from "../../SingleTableDesign";
import Metadata from "../../metadata";
import type { ForeignKey, NullableForeignKey } from "../../types";
import type { AttributeProps } from "../types";
import { type NativeScalarAttributeValue } from "@aws-sdk/util-dynamodb";

// TODO should this be named NativeAttribute ? DynamoNativeAttribute?

/**
 * Do not allow ForeignKey or NullableForeignKey types when using the Attribute decorator
 */
type NotForeignKey<T> = T extends ForeignKey | NullableForeignKey ? never : T;

/**
 * A decorator to annotate class fields as attributes of a single-table design entity, adding metadata for ORM (Object-Relational Mapping) purposes.
 * This decorator is restricted to attributes with types native to DynamoDB. For attributes of other types, please use the 'PropNameAttribute' decorators, such as @DateAttribute.
 *
 * This decorator function takes an object of `AttributeProps` which defines the configuration for the attribute, such as its alias. It is intended to be used on class fields representing attributes of entities in a single-table design pattern. When applied, it registers the attribute with metadata, including its name and alias, and whether it is nullable.
 *
 * @template T The class type that the decorator is applied to.
 * @template K The type of the attribute, extending [See NativeScalarAttributeValue Docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-util-dynamodb/TypeAlias/NativeScalarAttributeValue/), ensuring it is compatible with scalar values supported natively by Dynamo.
 * @param props An object of `AttributeProps`, which includes configuration options like `alias`, specifying an alternative name for the attribute in the database.
 * @returns A class field decorator function that takes the target class instance and the field's context to apply metadata enhancements. It specifically targets fields by adding initializers to the class's prototype, registering each field with the ORM's metadata management.
 *
 * The decorator internally checks if it's applied to a class field (`context.kind === "field"`) and then proceeds to add an initializer function. This initializer function captures the class prototype and uses it to register attribute metadata through `Metadata.addEntityAttribute`.
 *
 * Usage example:
 * ```typescript
 * class MyEntity extends MyTable {
 *   @Attribute({ alias: 'customName', nullable: true })
 *   myField: string;
 * }
 * ```
 *
 * Here, `@Attribute` decorates `myField` of `MyEntity`, marking it as an entity attribute with an alias 'customName' for ORM purposes.
 */
function Attribute<T, K extends NativeScalarAttributeValue>(
  props: AttributeProps
) {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<T, NotForeignKey<K>>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity: SingleTableDesign = Object.getPrototypeOf(this);

        Metadata.addEntityAttribute(entity.constructor.name, {
          attributeName: context.name.toString(),
          alias: props.alias,
          nullable: false
        });
      });
    }
  };
}

export default Attribute;