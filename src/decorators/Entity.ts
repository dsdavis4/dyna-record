import Metadata from "../metadata";
import type DynaRecord from "../DynaRecord";

/**
 * A class decorator for marking a class as an entity within the context of the ORM system. This decorator is essential for registering the class as a distinct entity in the ORM's metadata system, enabling the ORM to recognize and manage instances of this class as part of its data model. By designating classes as entities, it facilitates their integration into the ORM framework, allowing for operations such as querying, persisting, and managing relationships between entities.
 *
 * IMPORTANT - All entity classes should extend a table class decorated by {@link Table}
 *
 * Entities MUST declare their `type` property as a string literal matching the class name.
 * This enables compile-time type safety for query filters and return types.
 *
 * @template C The constructor of the class being decorated. The class must extend `DynaRecord`
 * and declare `readonly type` as a string literal (e.g., `declare readonly type: "Order"`).
 * @param target The constructor function of the class being decorated.
 * @param context The context in which the decorator is applied, provided by the TypeScript runtime.
 * @returns {void} The decorator does not return a value.
 *
 * Usage example:
 * ```typescript
 * @Entity
 * class User extends MyTable {
 *   declare readonly type: "User";
 *   // User entity implementation
 * }
 * ```
 */
function Entity<C extends abstract new (...args: never[]) => DynaRecord>(
  target: C &
    (string extends InstanceType<C>["type"]
      ? {
          __entityTypeError: 'Entity must declare: declare readonly type: "ClassName"';
        }
      : unknown),
  _context: ClassDecoratorContext<C>
): void {
  const tableClassName: string = (
    Object.getPrototypeOf(target) as { name: string }
  ).name;
  Metadata.addEntity(target as unknown as new () => DynaRecord, tableClassName);
}

export default Entity;
