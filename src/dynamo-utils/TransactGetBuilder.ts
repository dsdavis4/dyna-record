import DynamoClient from "./DynamoClient";
import { chunkArray } from "../utils";
import type { Get, TransactGetItemResponses, TransactGetItems } from "./types";

// https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_TransactGetItems.html
const MAX_TRANSACTION_ITEMS = 100;

/**
 * Build and executes a [TransactGetItems](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_TransactGetItems.html) request
 */
class TransactGetBuilder {
  readonly #transactionItems: TransactGetItems = [];

  /**
   * Execute the transaction
   */
  public async executeTransaction(): Promise<TransactGetItemResponses> {
    const transactionChunks = chunkArray(
      this.#transactionItems,
      MAX_TRANSACTION_ITEMS
    );

    // Break transaction into chunks of 100 due to Dynamo limit
    const res = await Promise.all(
      transactionChunks.map(
        async chunk =>
          await DynamoClient.transactGetItems({ TransactItems: chunk })
      )
    );

    return res.flat();
  }

  /**
   * Add a get operation to the transaction
   * @param item
   */
  public addGet(item: Get): void {
    this.#transactionItems.push({ Get: item });
  }

  /**
   * Returns true if there are transactions to execute
   */
  public hasTransactions(): boolean {
    return this.#transactionItems.length > 0;
  }
}

export default TransactGetBuilder;
