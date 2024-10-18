import { z } from "zod";
import type DynaRecord from "../../DynaRecord";
import Metadata from "../../metadata";
import { type SortKey } from "../../types";
import type { NonNullAttributeOptions } from "../types";

/**
 * A decorator for designating the field for the sort key on the dynamo table.
 *
 * @template T The entity to which the decorator is applied.
 * @template K The type constraint ensuring the field is suitable to be a partition key.
 * @param props An optional object of {@link NonNullAttributeOptions}, providing additional configuration for the sort key attribute, such as custom metadata.
 * @returns A class field decorator function that targets and initializes the class's prototype to register the sort key with the ORM's metadata system.
 *
 * Usage example:
 * ```typescript
 * class User extends BaseEntity {
 *   @SortKeyAttribute()
 *   public sk: SortKey;
 * }
 * ```
 *
 * In this example, `@SortKeyAttribute` decorates the `sk` field of `User`, marking it as the entity's sort key.
 */
function SortKeyAttribute<T extends DynaRecord, K extends SortKey>(
  props?: NonNullAttributeOptions
) {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<T, K>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function (this: T) {
        Metadata.addSortKeyAttribute(this, {
          attributeName: context.name.toString(),
          type: z.string(),
          ...props
        });
      });
    }
  };
}

export default SortKeyAttribute;
