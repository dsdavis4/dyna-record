import type SingleTableDesign from "../../SingleTableDesign";
import { TransactWriteBuilder } from "../../dynamo-utils";
import type { EntityClass } from "../../metadata";
import OperationBase from "../OperationBase";

/**
 * TODO
 * Delete the entity and everything in its partition
 * - Make sure to update foreign keys linked on linked models
 * - If the foreign key is a required attribute, and as a value then I should throw an error through transactions.
 *      - I beleive I can get this info from the attribute decorator....
 *      - But should this even be allowed? In a SQL database what would happen?
 */

class Delete<T extends SingleTableDesign> extends OperationBase<T> {
  readonly #transactionBuilder: TransactWriteBuilder;

  constructor(Entity: EntityClass<T>) {
    super(Entity);
    this.#transactionBuilder = new TransactWriteBuilder();
  }

  public async run(id: string): Promise<void> {
    // TODO start here......

    debugger;
  }
}

export default Delete;
