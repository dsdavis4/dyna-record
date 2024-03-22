import type DynaRecord from "../../DynaRecord";
import Metadata from "../../metadata";
import { type PrimaryKey } from "../../types";
import type { AttributeOptions } from "../types";

// TODO rename to partition key

/**
 * A decorator for designating the field for the partition key on the dynamo table.
 *
 * @template T The entity to which the decorator is applied.
 * @template K The type constraint ensuring the field is suitable to be a primary key.
 * @param props An optional object of {@link AttributeOptions}, providing additional configuration for the primary key attribute, such as custom metadata.
 * @returns A class field decorator function that targets and initializes the class's prototype to register the primary key with the ORM's metadata system.
 *
 * Usage example:
 * ```typescript
 * class User extends BaseEntity {
 *   @PrimaryKeyAttribute()
 *   public pk: PrimaryKey;
 * }
 * ```
 *
 * In this example, `@PrimaryKeyAttribute` decorates the `pk` field of `User`, marking it as the entity's primary key.
 */
function PrimaryKeyAttribute<T extends DynaRecord, K extends PrimaryKey>(
  props?: AttributeOptions
) {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<T, K>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity: DynaRecord = Object.getPrototypeOf(this);

        Metadata.addPrimaryKeyAttribute(entity, {
          attributeName: context.name.toString(),
          ...props
        });
      });
    }
  };
}

export default PrimaryKeyAttribute;
