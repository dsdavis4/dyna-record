import { z } from "zod";
import type DynaRecord from "../../DynaRecord";
import Metadata from "../../metadata";
import { type PartitionKey } from "../../types";
import type { NonNullAttributeOptions } from "../types";

/**
 * A decorator for designating the field for the partition key on the dynamo table.
 *
 * @template T The entity to which the decorator is applied.
 * @template K The type constraint ensuring the field is suitable to be a partition key.
 * @param props An optional object of {@link NonNullAttributeOptions}, providing additional configuration for the partition key attribute, such as custom metadata.
 * @returns A class field decorator function that targets and initializes the class's prototype to register the partition key with the ORM's metadata system.
 *
 * Usage example:
 * ```typescript
 * class User extends BaseEntity {
 *   @PartitionKeyAttribute()
 *   public pk: PartitionKey;
 * }
 * ```
 *
 * In this example, `@PartitionKeyAttribute` decorates the `pk` field of `User`, marking it as the entity's partition key.
 */
function PartitionKeyAttribute<T extends DynaRecord, K extends PartitionKey>(
  props?: NonNullAttributeOptions
) {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<T, K>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity: DynaRecord = Object.getPrototypeOf(this);

        Metadata.addPartitionKeyAttribute(entity, {
          attributeName: context.name.toString(),
          type: z.string(),
          ...props
        });
      });
    }
  };
}

export default PartitionKeyAttribute;
