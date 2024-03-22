import type DynaRecord from "../DynaRecord";
import Metadata, { type EntityMetadata, type TableMetadata } from "../metadata";
import type { EntityClass } from "../types";

/**
 * Serves as an abstract base class for various operation classes within the ORM system that perform actions on entities, such as creating, updating, querying, or deleting. This class provides shared properties and functionality that are common across different types of operations, centralizing the handling of entity and table metadata.
 *
 * @template T - The type of the entity that the operation will be performed on, extending `DynaRecord`.
 *
 * @method run
 * An abstract method that must be implemented by subclasses to execute the specific operation. The parameters and return type of this method can vary depending on the operation being performed.
 */
abstract class OperationBase<T extends DynaRecord> {
  /**
   * The class of the entity on which the operation is performed, providing static methods and properties related to the entity.
   */
  protected readonly EntityClass: EntityClass<T>;

  /**
   * Metadata for the entity, including information about its attributes and relationships.
   */
  protected readonly entityMetadata: EntityMetadata;

  /**
   *  Metadata for the table associated with the entity, including details about the table's structure and how the entity's attributes map to table columns.
   */
  protected readonly tableMetadata: TableMetadata;

  /**
   * The alias used for the entity's partition key attribute in the database table, derived from the table metadata.
   */
  protected readonly partitionKeyAlias: string;

  /**
   * The alias used for the entity's sort key attribute in the database table, if applicable, derived from the table metadata.
   */
  protected readonly sortKeyAlias: string;

  constructor(Entity: EntityClass<T>) {
    this.EntityClass = Entity;
    this.entityMetadata = Metadata.getEntity(Entity.name);
    this.tableMetadata = Metadata.getTable(this.entityMetadata.tableClassName);
    this.partitionKeyAlias = this.tableMetadata.partitionKeyAttribute.alias;
    this.sortKeyAlias = this.tableMetadata.sortKeyAttribute.alias;
  }

  public abstract run(...params: unknown[]): unknown;
}

export default OperationBase;
