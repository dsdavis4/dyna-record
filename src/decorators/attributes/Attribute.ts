import type NoOrm from "../../NoOrm";
import Metadata from "../../metadata";
import type { ForeignKey, NullableForeignKey } from "../../types";
import type { AttributeOptions } from "../types";
import { type NativeScalarAttributeValue } from "@aws-sdk/util-dynamodb";

/**
 * Do not allow ForeignKey or NullableForeignKey types when using the Attribute decorator
 */
type NotForeignKey<T> = T extends ForeignKey | NullableForeignKey ? never : T;

/**
 * A decorator for marking class fields as attributes within the context of a single-table design entity, with a specific restriction against using foreign key types.
 *
 * IMPORTANT! - This decorator explicitly disallows the use of {@link ForeignKey} and {@link NullableForeignKey} types to maintain clear separation between entity relationships and scalar attributes for improved data integrity and type safety.
 *
 * @template T The entity the decorator is applied to.
 * @template K The type of the attribute, restricted to native scalar attribute values and excluding foreign key types.
 * @param props An optional object of {@link AttributeOptions}, including configuration options such as metadata attributes and additional property characteristics.
 * @returns A class field decorator function that targets and initializes the class's prototype to register the attribute with the ORM's metadata system, ensuring proper handling and validation of the entity's scalar values.
 *
 * Usage example:
 * ```typescript
 * class Product extends BaseEntity {
 *   @Attribute({ alias: 'SKU' })
 *   public stockKeepingUnit: string; // Simple scalar attribute representing the product's SKU
 * }
 * ```
 *
 * Here, `@Attribute` decorates `stockKeepingUnit` of `Product` as a simple, non-foreign key attribute, facilitating its management within the ORM system.
 */
function Attribute<T extends NoOrm, K extends NativeScalarAttributeValue>(
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
          nullable: false,
          ...props
        });
      });
    }
  };
}

export default Attribute;
