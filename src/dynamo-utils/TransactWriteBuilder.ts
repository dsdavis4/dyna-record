import DynamoClient from "./DynamoClient";
import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import {
  ConditionalCheckFailedError,
  TransactionWriteFailedError
} from "./errors";
import Logger from "../Logger";
import type {
  TransactWriteItems,
  ConditionCheck,
  Put,
  Update,
  Delete
} from "./types";

/**
 * Build and executes a [TransactWriteItems](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_TransactWriteItems.html) request
 */
class TransactionBuilder {
  readonly #transactionItems: TransactWriteItems = [];
  readonly #errorMessages: Record<number, string> = {};

  /**
   * Execute the transaction
   */
  public async executeTransaction(): Promise<void> {
    try {
      const response = await DynamoClient.transactWriteItems({
        TransactItems: this.#transactionItems
      });
      Logger.log("Transaction successful:", response);
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
    this.trackErrorMessage(conditionFailedMsg);
    this.#transactionItems.push({ ConditionCheck: item });
  }

  /**
   * Add a put operation to the transaction
   * @param item
   */
  public addPut(item: Put, conditionFailedMsg?: string): void {
    this.trackErrorMessage(conditionFailedMsg);
    this.#transactionItems.push({ Put: item });
  }

  /**
   * Add an update operation to the transaction
   * @param item
   */
  public addUpdate(item: Update, conditionFailedMsg?: string): void {
    this.trackErrorMessage(conditionFailedMsg);
    this.#transactionItems.push({ Update: item });
  }

  /**
   * Add a delete operation to the transaction
   * @param item
   */
  public addDelete(item: Delete, conditionFailedMsg?: string): void {
    this.trackErrorMessage(conditionFailedMsg);
    this.#transactionItems.push({ Delete: item });
  }

  /**
   * Track error messages to return if there is a ConditionalCheckFailed exception
   *
   * IMPORTANT - Call this before adding the transaction to this.#transactionItems
   * @param errMsg The custom error message to return if there is a ConditionalCheckFailed exception
   */
  private trackErrorMessage(errMsg?: string): void {
    if (errMsg !== undefined) {
      this.#errorMessages[this.#transactionItems.length] = errMsg;
    }
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
            const failure = this.#errorMessages[idx] ?? reason.Message;
            const msg = `${reason.Code}: ${failure}`;
            errors.push(new ConditionalCheckFailedError(msg));
          }
          return errors;
        },
        []
      );

      if (conditionFailedErrs.length > 0) {
        Logger.error(conditionFailedErrs.map(err => err.message));
        return new TransactionWriteFailedError(
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
