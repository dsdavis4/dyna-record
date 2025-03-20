import Metadata, { type TableMetadataOptions } from "../metadata";
import type DynaRecord from "../DynaRecord";

/**
 * A class decorator for defining and customizing the table metadata associated with an entity class within the ORM system. This decorator enriches the entity with additional metadata, specifying how the entity relates to the underlying database table. By providing custom table options, such as table names or schema definitions, this decorator plays a crucial role in bridging the gap between the ORM's abstract entities and their concrete database representations.
 *
 * IMPORTANT - All entity classes should extend a table
 *
 * @param props The {@link TableMetadataOptions} object containing metadata configuration for the table. This can include options like the table's name, delimiter and default field customizations.
 * @returns A class decorator factory function that takes a target class extending `DynaRecord` and a context object provided by the TypeScript runtime. The decorator function registers the provided metadata options with the ORM's metadata system, ensuring the entity is properly configured and recognized by the ORM.
 *
 * Usage example:
 * ```typescript
 * @Table({ name: 'my-table' })
 * class MyTable extends DynaRecord {
 *   // User entity implementation
 * }
 * ```
 * In this example, the `@Table` decorator is applied to the `User` class, specifying custom table metadata options, including the table name (`users`) and the schema (`public`). These options are registered with the ORM, which then uses them to correctly map the `User` entity to the corresponding table in the database. This mapping is critical for executing ORM operations such as querying, inserting, and updating records in the `users` table.
 */
function Table(props: TableMetadataOptions) {
  return function (target: typeof DynaRecord, context: ClassDecoratorContext) {
    if (context.kind === "class") {
      Metadata.addTable(target.name, props);
    }
  };
}

export default Table;
