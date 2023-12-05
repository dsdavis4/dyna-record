import SingleTableDesign from "../SingleTableDesign";
import Metadata, {
  type EntityClass,
  type EntityMetadata,
  type TableMetadata
} from "../metadata";

abstract class OperationBase<T extends SingleTableDesign> {
  protected readonly EntityClass: EntityClass<T>;
  protected readonly entityMetadata: EntityMetadata;
  protected readonly tableMetadata: TableMetadata;

  constructor(Entity: EntityClass<T>) {
    this.EntityClass = Entity;
    this.entityMetadata = Metadata.getEntity(Entity.name);
    this.tableMetadata = Metadata.getTable(this.entityMetadata.tableClassName);
  }

  public abstract run(...params: unknown[]): unknown;
}

export default OperationBase;
