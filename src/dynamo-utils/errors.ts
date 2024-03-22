/**
 * Error thrown if a condition within a dynamo operation fails
 */
export class ConditionalCheckFailedError extends Error {
  public readonly code = "ConditionalCheckFailedError";
}

/**
 * AggregateError thrown if a transaction fails. Check errors for reasons
 */
export class TransactionWriteFailedError extends AggregateError {
  public readonly code = "TransactionWriteFailedError";
}
