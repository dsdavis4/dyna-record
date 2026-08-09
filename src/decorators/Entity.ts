import Metadata from "../metadata/index.js";
import type DynaRecord from "../DynaRecord.js";
import type { HasMultipleSearchableAttributes } from "../operations/Search/types.js";

/**
 * A class decorator for marking a class as an entity within the context of the ORM system. This decorator is essential for registering the class as a distinct entity in the ORM's metadata system, enabling the ORM to recognize and manage instances of this class as part of its data model. By designating classes as entities, it facilitates their integration into the ORM framework, allowing for operations such as querying, persisting, and managing relationships between entities.
 *
 * IMPORTANT - All entity classes must extend a table class decorated by {@link Table}, either directly or through intermediate classes. The entity's table is resolved by walking the class hierarchy until a class decorated with {@link Table} is found, so entities can share attributes and relationships through abstract base classes. A base class that is not decorated with `Entity` is never registered as an entity itself — only the decorated subclasses are part of the table's metadata.
 *
 * Entities MUST declare their `type` property as a string literal matching the class name.
 * This enables compile-time type safety for query filters and return types.
 *
 * @template C The constructor of the class being decorated. The class must extend `DynaRecord`
 * and declare `readonly type` as a string literal (e.g., `declare readonly type: "Order"`).
 * @param target The constructor function of the class being decorated.
 * @param context The context in which the decorator is applied, provided by the TypeScript runtime.
 * @returns {void} The decorator does not return a value.
 * @throws Error if the decorated class does not extend a class decorated with {@link Table} anywhere in its class hierarchy.
 *
 * Usage example:
 * ```typescript
 * @Entity
 * class User extends MyTable {
 *   declare readonly type: "User";
 *   // User entity implementation
 * }
 * ```
 *
 * Sharing attributes through an abstract base class:
 * ```typescript
 * // Not decorated with Entity — never registered and never persisted itself
 * abstract class Vehicle extends MyTable {
 *   @StringAttribute({ alias: "Make" })
 *   public readonly make: string;
 * }
 *
 * @Entity
 * class Car extends Vehicle {
 *   declare readonly type: "Car";
 *   // Inherits the `make` attribute from Vehicle
 * }
 * ```
 *
 * Note: extending a concrete entity (rather than an abstract base class) is supported at runtime, but TypeScript will not allow the subclass to narrow the inherited `type` literal of its parent. Prefer abstract base classes for shared attributes.
 */
function Entity<C extends abstract new (...args: never[]) => DynaRecord>(
  target: C &
    (string extends InstanceType<C>["type"]
      ? {
          __entityTypeError: 'Entity must declare: declare readonly type: "ClassName"';
        }
      : unknown) &
    (HasMultipleSearchableAttributes<InstanceType<C>> extends true
      ? {
          __entitySearchableError: "Entities may declare at most one @Searchable attribute";
        }
      : unknown),
  _context: ClassDecoratorContext<C>
): void {
  Metadata.addEntity(target as unknown as new () => DynaRecord);
}

export default Entity;
