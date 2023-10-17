import { type TransactWriteCommandInput } from "@aws-sdk/lib-dynamodb";
import DynamoClient from "../DynamoClient";

type TransactItems = Exclude<
  TransactWriteCommandInput["TransactItems"],
  undefined
>;

export type ConditionCheck = Exclude<
  TransactItems[number]["ConditionCheck"],
  undefined
>;
export type Put = Exclude<TransactItems[number]["Put"], undefined>;

// TODO tsdoc throughout
class TransactionBuilder {
  private readonly transactionItems: TransactItems = [];

  /**
   * Add a conditional check to the transaction
   * @param item
   */
  addConditionCheck(item: ConditionCheck): void {
    this.transactionItems.push({ ConditionCheck: item });
  }

  /**
   * Add a put operation to the transaction
   * @param item
   */
  addPut(item: Put): void {
    this.transactionItems.push({ Put: item });
  }

  /**
   * Execute the transaction
   */
  async executeTransaction(): Promise<void> {
    // TODO remove hard coded name
    const dynamo = new DynamoClient("temp-table");

    try {
      const response = await dynamo.transactWriteItems({
        TransactItems: this.transactionItems
      });
      console.log("Transaction successful:", response);
    } catch (error) {
      debugger;
      console.error("Error executing transaction:", error);
    }
  }
}

export default TransactionBuilder;
