import type SingleTableDesign from "../SingleTableDesign";
import { TransactWriteBuilder } from "../dynamo-utils";
import type { EntityClass, EntityMetadata, TableMetadata } from "../metadata";
import Metadata from "../metadata";
import { type CreateOptions } from "./Create";

// TODO dry up this class from other operation classes

// TODO
/**
 * if a foreign key for a HasOne/HasMany is changed:
 *      - remove the existing BelongsToLink in that associaterd partition
 *      - check that the new one exists
 *      - create the new BelongsToLink
 */

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

  // TODO add tests that all fields are optional,
  // TODO add tests that it only updateable fields are updateable
  // TODO dont use CreateOptions... if they end up being the sanme then find a way to share them
  public async run(
    id: string,
    attributes: Partial<CreateOptions<T>>
  ): Promise<T> {
    // TODO start here

    debugger;

    return "bla" as any;
  }
}

export default Update;
