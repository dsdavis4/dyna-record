import { type TransactGetCommandInput } from "@aws-sdk/lib-dynamodb";
import DynamoClient, { type TransactGetItemResponses } from "../DynamoClient";

type TransactItems = NonNullable<TransactGetCommandInput["TransactItems"]>;

export type Get = NonNullable<TransactItems[number]["Get"]>;

// TODO need to handle more than 100 requests
class TransactGetBuilder {
  private readonly transactionItems: TransactItems = [];

  /**
   * Execute the transaction
   */
  async executeTransaction(): Promise<TransactGetItemResponses> {
    // TODO remove hard coded name
    const dynamo = new DynamoClient("temp-table");

    return await dynamo.transactGetItems({
      TransactItems: this.transactionItems
    });
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
