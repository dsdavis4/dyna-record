import { z } from "zod";
import type DynaRecord from "../../DynaRecord";
import Metadata from "../../metadata";
import type { AttributeDecoratorContext, AttributeOptions } from "../types";

// TODO add docs, and links to readme

interface EnumAttributeOptions extends AttributeOptions {
  // track this issue for supporting more than strings with zod runtime validations
  // https://github.com/colinhacks/zod/issues/2686
  values: [string, ...string[]];
}

// TODO update the typedoc
// TODO make sure to mention that this is not a real enum, but a union type...
/**
 * A decorator for marking class fields as string attributes within the context of a single-table design entity, with a specific restriction against using foreign key types.
 *
 * IMPORTANT! - This decorator explicitly disallows the use of {@link ForeignKey} type to maintain clear separation between entity relationships and string attributes for improved data integrity and type safety.
 *
 * @template T The entity the decorator is applied to.
 * @template K The type of the attribute, restricted to string attribute values and excluding foreign key types.
 * @param props An optional object of {@link AttributeOptions}, including configuration options such as metadata attributes and additional property characteristics.
 * @returns A class field decorator function that targets and initializes the class's prototype to register the attribute with the ORM's metadata system, ensuring proper handling and validation of the entity's string values.
 *
 * Usage example:
 * ```typescript
 * class Product extends BaseEntity {
 *   @EnumAttribute({ alias: 'SKU' })
 *   public stockKeepingUnit: string; // Simple string attribute representing the product's SKU
 *
 *   @EnumAttribute({ alias: 'MyNullableField', nullable: true })
 *   public myField?: string; // Set to Optional
 * }
 * ```
 *
 * Here, `@EnumAttribute` decorates `stockKeepingUnit` of `Product` as a simple, non-foreign key attribute, facilitating its management within the ORM system.
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
      context.addInitializer(function () {
        const entity: DynaRecord = Object.getPrototypeOf(this);

        Metadata.addEntityAttribute(entity.constructor.name, {
          attributeName: context.name.toString(),
          nullable: props?.nullable,
          // TODO add runtime tests with multiple types
          // TODO add runtime test for nullable option
          type: z.enum(props.values),
          ...props
        });
      });
    }
  };
}

export default EnumAttribute;
