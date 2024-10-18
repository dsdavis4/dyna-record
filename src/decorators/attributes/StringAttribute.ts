import { z } from "zod";
import type DynaRecord from "../../DynaRecord";
import Metadata from "../../metadata";
import type {
  AttributeDecoratorContext,
  AttributeOptions,
  NotForeignKey
} from "../types";

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
 * class Product extends TableClass {
 *   @StringAttribute({ alias: 'SKU' })
 *   public stockKeepingUnit: string; // Simple string attribute representing the product's SKU
 *
 *   @StringAttribute({ alias: 'MyNullableField', nullable: true })
 *   public myField?: string; // Set to Optional
 * }
 * ```
 *
 * Here, `@StringAttribute` decorates `stockKeepingUnit` of `Product` as a simple, non-foreign key attribute, facilitating its management within the ORM system.
 */
function StringAttribute<
  T extends DynaRecord,
  K extends string,
  P extends AttributeOptions
>(props?: P) {
  return function (
    _value: undefined,
    context: AttributeDecoratorContext<T, NotForeignKey<K>, P>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function (this: T) {
        Metadata.addEntityAttribute(this.constructor.name, {
          attributeName: context.name.toString(),
          nullable: props?.nullable,
          type: z.string(),
          ...props
        });
      });
    }
  };
}

export default StringAttribute;
