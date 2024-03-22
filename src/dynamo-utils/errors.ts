export class ConditionalCheckFailedError extends Error {
  public readonly code = "ConditionalCheckFailedError";
}

export class TransactionWriteFailedError extends AggregateError {
  public readonly code = "TransactionWriteFailedError";
}
