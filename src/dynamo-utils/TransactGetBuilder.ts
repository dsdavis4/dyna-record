import { type TransactGetCommandInput } from "@aws-sdk/lib-dynamodb";
import DynamoClient, { type TransactGetItemResponses } from "../DynamoClient";
import { chunkArray } from "../utils";

type TransactItems = NonNullable<TransactGetCommandInput["TransactItems"]>;

export type Get = NonNullable<TransactItems[number]["Get"]>;

// https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_TransactGetItems.html
const MAX_TRANSACTION_ITEMS = 100;

class TransactGetBuilder {
  private readonly transactionItems: TransactItems = [];

  /**
   * Execute the transaction
   */
  async executeTransaction(): Promise<TransactGetItemResponses> {
    const dynamo = new DynamoClient();

    const transactionChunks = chunkArray(
      this.transactionItems,
      MAX_TRANSACTION_ITEMS
    );

    // Break transaction into chunks of 100 due to Dynamo limit
    const res = await Promise.all(
      transactionChunks.map(
        async chunk => await dynamo.transactGetItems({ TransactItems: chunk })
      )
    );

    return res.flat();
  }

  /**
   * Add a get operation to the transaction
   * @param item
   */
  public addGet(item: Get): void {
    this.transactionItems.push({ Get: item });
  }
}

export default TransactGetBuilder;
