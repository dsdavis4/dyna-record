import { type TransactWriteCommandInput } from "@aws-sdk/lib-dynamodb";
import DynamoClient from "../DynamoClient";
import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";

export class ConditionalCheckFailedError extends Error {
  public readonly code: "ConditionalCheckFailedError";
}

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
  private readonly errorMessages: Record<number, string> = {};

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
      if (error instanceof TransactionCanceledException) {
        throw this.buildTransactionCanceledException(error);
      }

      throw error;
    }
  }

  /**
   * Add a conditional check to the transaction
   * @param item
   */
  addConditionCheck(item: ConditionCheck, conditionFailedMsg: string): void {
    this.errorMessages[this.transactionItems.length] = conditionFailedMsg;
    this.transactionItems.push({ ConditionCheck: item });
  }

  /**
   * Add a put operation to the transaction
   * @param item
   */
  addPut(item: Put): void {
    this.transactionItems.push({ Put: item });
  }

  private buildTransactionCanceledException(
    error: TransactionCanceledException
  ): TransactionCanceledException | AggregateError {
    if (error.CancellationReasons !== undefined) {
      const reasons = error.CancellationReasons;
      const conditionFailedErrs = reasons.reduce<ConditionalCheckFailedError[]>(
        (errors, reason, idx) => {
          if (reason.Code === "ConditionalCheckFailed") {
            const failure = this.errorMessages[idx] ?? reason.Message;
            const msg = `${reason.Code}: ${failure}`;
            errors.push(new ConditionalCheckFailedError(msg));
          }
          return errors;
        },
        []
      );

      if (conditionFailedErrs.length > 0) {
        console.error(conditionFailedErrs.map(err => err.message));
        return new AggregateError(conditionFailedErrs);
      }
    }

    return error;
  }
}

export default TransactionBuilder;
