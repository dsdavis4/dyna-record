import { type TransactWriteCommandInput } from "@aws-sdk/lib-dynamodb";
import DynamoClient from "../DynamoClient";
import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";

export class ConditionalCheckFailedError extends Error {
  public readonly code: "ConditionalCheckFailedError";
}

type TransactItems = NonNullable<TransactWriteCommandInput["TransactItems"]>;

export type ConditionCheck = NonNullable<
  TransactItems[number]["ConditionCheck"]
>;
export type Put = NonNullable<TransactItems[number]["Put"]>;

class TransactionBuilder {
  private readonly transactionItems: TransactItems = [];
  private readonly errorMessages: Record<number, string> = {};

  /**
   * Execute the transaction
   */
  public async executeTransaction(): Promise<void> {
    const dynamo = new DynamoClient();

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
  public addConditionCheck(
    item: ConditionCheck,
    conditionFailedMsg: string
  ): void {
    this.errorMessages[this.transactionItems.length] = conditionFailedMsg;
    this.transactionItems.push({ ConditionCheck: item });
  }

  /**
   * Add a put operation to the transaction
   * @param item
   */
  public addPut(item: Put, conditionFailedMsg?: string): void {
    if (conditionFailedMsg !== undefined) {
      this.errorMessages[this.transactionItems.length] = conditionFailedMsg;
    }
    this.transactionItems.push({ Put: item });
  }

  /**
   * Handle TransactionCanceledException, aggregating errors and applying friendly errors if provided.
   * @param error
   * @returns
   */
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
        return new AggregateError(
          conditionFailedErrs,
          "Failed Conditional Checks",
          { cause: error }
        );
      }
    }

    return error;
  }
}

export default TransactionBuilder;
