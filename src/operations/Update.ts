import type SingleTableDesign from "../SingleTableDesign";
import { TransactWriteBuilder } from "../dynamo-utils";
import type { EntityClass, EntityMetadata, TableMetadata } from "../metadata";
import Metadata from "../metadata";
import { CreateOptions } from "./Create";

class Update<T extends SingleTableDesign> {
  readonly #entityMetadata: EntityMetadata;
  readonly #tableMetadata: TableMetadata;
  readonly #transactionBuilder: TransactWriteBuilder;

  private readonly EntityClass: EntityClass<T>;

  constructor(Entity: EntityClass<T>) {
    this.EntityClass = Entity;
    this.#entityMetadata = Metadata.getEntity(Entity.name);
    this.#tableMetadata = Metadata.getTable(
      this.#entityMetadata.tableClassName
    );
    this.#transactionBuilder = new TransactWriteBuilder();
  }

  // TODO dont use CreateOptions... if they end up being the sanme then find a way to share them
  public async run(attributes: CreateOptions<T>): Promise<T> {
    // TODO start here

    return "bla" as any;
  }
}

export default Update;
