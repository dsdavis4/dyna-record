import Metadata from "../metadata";
import type NoOrm from "../NoOrm";

/**
 * A class decorator for marking a class as an entity within the context of the ORM system. This decorator is essential for registering the class as a distinct entity in the ORM's metadata system, enabling the ORM to recognize and manage instances of this class as part of its data model. By designating classes as entities, it facilitates their integration into the ORM framework, allowing for operations such as querying, persisting, and managing relationships between entities.
 *
 * IMPORTANT - All entity classes should extend a table class decorated by {@link Table}
 *
 * @template T The class being decorated, which extends from the base `NoOrm` entity class. This ensures that only classes that are part of the ORM system can be decorated as entities.
 * @param target The constructor function of the class being decorated. This function is used to instantiate objects of the class.
 * @param context The context in which the decorator is applied, provided by the TypeScript runtime. This includes metadata about the class, such as its kind and other relevant information. The decorator uses this context to perform its registration logic.
 * @returns {void} The decorator does not return a value. Instead, it performs side effects by registering the class with the ORM's metadata system.
 *
 * Usage example:
 * ```typescript
 * @Entity
 * class User extends MyTable {
 *   // User entity implementation
 * }
 * ```
 * In this example, the `User` class is marked as an entity using the `@Entity` decorator. This designation registers the `User` class within the ORM's metadata system, making it a recognized entity for the ORM to manage. The registration process involves associating the class with its corresponding table name and any additional metadata required by the ORM to handle instances of this class effectively.
 */
function Entity<T extends NoOrm>(
  target: new () => T,
  context: ClassDecoratorContext
): void {
  if (context.kind === "class") {
    const tableClassName: string = Object.getPrototypeOf(target).name;
    Metadata.addEntity(target, tableClassName);
  }
}

export default Entity;
