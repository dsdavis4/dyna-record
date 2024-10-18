import { z } from "zod";
import type DynaRecord from "../../DynaRecord";
import Metadata from "../../metadata";
import type { AttributeDecoratorContext, AttributeOptions } from "../types";

/**
 * Extends {@link AttributeOptions} but requires that the allowed values are set on `values`
 */
export interface EnumAttributeOptions extends AttributeOptions {
  // track this issue for supporting more than strings with zod runtime validations
  // https://github.com/colinhacks/zod/issues/2686
  values: [string, ...string[]];
}

/**
 * A decorator for marking class fields as enum attributes within the context of a single-table design entity. Only the types specified in `values` are allowed via both the type system and runtime schema checks.
 *
 * This enforces a union type of the specified fields listed in `values`
 *
 * @template T The entity the decorator is applied to.
 * @template K The type of the attribute, restricted to the values listed in `values` prop of EnumAttributeOptions
 * @param props An optional object of {@link EnumAttributeOptions}, including the allowed values, configuration options such as metadata attributes and additional property characteristics.
 * @returns A class field decorator function that targets and initializes the class's prototype to register the attribute with the ORM's metadata system, ensuring proper handling and validation of the entity's enum values.
 *
 * Usage example:
 * ```typescript
 * class Product extends BaseEntity {
 *   @EnumAttribute({ alias: 'SomeField', values: ["val-1", "val-2"] })
 *   public someField: "val-1" | "val-2"; // Attribute representing the union/enum types specified in `values`. In this case the only allowed values are "val-1" and "val-2"
 *
 *   @EnumAttribute({ alias: 'MyNullableField', nullable: true, values: ["val-1", "val-2"] })
 *   public myNullableField?: "val-1" | "val-2"; // Set to Optional for nullable attributes
 * }
 * ```
 */
function EnumAttribute<
  T extends DynaRecord,
  const K extends P["values"][number],
  const P extends EnumAttributeOptions
>(props: P) {
  return function (
    _value: undefined,
    context: AttributeDecoratorContext<T, K, P>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function (this: T) {
        Metadata.addEntityAttribute(this.constructor.name, {
          attributeName: context.name.toString(),
          nullable: props?.nullable,
          type: z.enum(props.values),
          ...props
        });
      });
    }
  };
}

export default EnumAttribute;
