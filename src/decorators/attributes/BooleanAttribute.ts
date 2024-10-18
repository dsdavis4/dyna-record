import { z } from "zod";
import type DynaRecord from "../../DynaRecord";
import Metadata from "../../metadata";
import type { AttributeDecoratorContext, AttributeOptions } from "../types";

/**
 * A decorator for marking class fields as boolean attributes within the context of a single-table design entity
 *
 * Can be set to nullable via decorator props
 *
 * @template T The class type that the decorator is applied to, ensuring type safety and integration within specific class instances.
 * @template K A type constraint extending `boolean`, ensuring that the decorator is only applied to class fields specifically intended to represent booleans.
 * @param props An {@link AttributeOptions} object providing configuration options for the attribute, such as its `alias` which allows the attribute to be referred to by an alternative name in the database context. The `nullable` property is also set to `false` by default.
 * @returns A class field decorator function that operates within the class field's context. It configures the field as a boolean attribute and defines how it should be serialized and deserialized to/from DynamoDB.
 *
 * Usage example:
 * ```typescript
 * class MyEntity extends MyTable {
 *   @BooleanAttribute({ alias: 'MyField' })
 *   public myField: boolean;
 *
 *   @BooleanAttribute({ alias: 'MyNullableField', nullable: true })
 *   public myField?: boolean; // Set to Optional
 * }
 * ```
 *
 * Here, `@BooleanAttribute` decorates `myField` of `MyEntity`, marking it as an entity attribute with an alias 'MyField' for ORM purposes.
 */
function BooleanAttribute<
  T extends DynaRecord,
  K extends boolean,
  P extends AttributeOptions
>(props?: P) {
  return function (
    _value: undefined,
    context: AttributeDecoratorContext<T, K, P>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function (this: T) {
        Metadata.addEntityAttribute(this.constructor.name, {
          attributeName: context.name.toString(),
          nullable: props?.nullable,
          type: z.boolean(),
          ...props
        });
      });
    }
  };
}

export default BooleanAttribute;
