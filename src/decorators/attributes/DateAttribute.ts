import { z } from "zod";
import type DynaRecord from "../../DynaRecord";
import Metadata from "../../metadata";
import type { AttributeDecoratorContext, AttributeOptions } from "../types";
import { dateSerializer } from "./serializers";

/**
 * A decorator for marking class fields as date attributes within the context of a single-table design entity
 *
 * Because dates are not natively supported data types in dynamo, they will be converted to iso string's within dynamo, and serialized to date objects on the entity class
 *
 * Can be set to nullable via decorator props
 *
 * @template T The class type that the decorator is applied to, ensuring type safety and integration within specific class instances.
 * @template K A type constraint extending `Date`, ensuring that the decorator is only applied to class fields specifically intended to represent dates.
 * @param props An {@link AttributeOptions} object providing configuration options for the attribute, such as its `alias` which allows the attribute to be referred to by an alternative name in the database context. The `nullable` property is also set to `false` by default.
 * @returns A class field decorator function that operates within the class field's context. It configures the field as a date attribute and defines how it should be serialized and deserialized to/from DynamoDB.
 *
 * Usage example:
 * ```typescript
 * class MyEntity extends MyTable {
 *   @DateAttribute({ alias: 'MyField' })
 *   public myField: Date;
 *
 *   @DateAttribute({ alias: 'MyNullableField', nullable: true })
 *   public myField?: Date; // Set to Optional
 * }
 * ```
 *
 * Here, `@DateAttribute` decorates `myField` of `MyEntity`, marking it as an entity attribute with an alias 'MyField' for ORM purposes.
 */
function DateAttribute<
  T extends DynaRecord,
  K extends Date,
  P extends AttributeOptions
>(props?: P) {
  return function (
    _value: undefined,
    context: AttributeDecoratorContext<T, K, P>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity: DynaRecord = Object.getPrototypeOf(this);

        Metadata.addEntityAttribute(entity.constructor.name, {
          attributeName: context.name.toString(),
          nullable: props?.nullable,
          serializers: dateSerializer,
          type: z.date(),
          ...props
        });
      });
    }
  };
}

export default DateAttribute;
