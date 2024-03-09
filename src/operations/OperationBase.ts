import type SingleTableDesign from "../SingleTableDesign";
import Metadata, {
  type EntityClass,
  type EntityMetadata,
  type TableMetadata
} from "../metadata";

abstract class OperationBase<T extends SingleTableDesign> {
  protected readonly EntityClass: EntityClass<T>;
  protected readonly entityMetadata: EntityMetadata;
  protected readonly tableMetadata: TableMetadata;

  // TODO see if these are still used or needed...
  protected readonly primaryKeyAlias: string;
  protected readonly sortKeyAlias: string;

  constructor(Entity: EntityClass<T>) {
    this.EntityClass = Entity;
    this.entityMetadata = Metadata.getEntity(Entity.name);
    this.tableMetadata = Metadata.getTable(this.entityMetadata.tableClassName);
    this.primaryKeyAlias = this.tableMetadata.primaryKeyAttribute.alias;
    this.sortKeyAlias = this.tableMetadata.sortKeyAttribute.alias;
  }

  public abstract run(...params: unknown[]): unknown;
}

export default OperationBase;
