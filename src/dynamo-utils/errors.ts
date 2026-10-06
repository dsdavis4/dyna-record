/**
 * Error thrown if a condition within a dynamo operation fails
 */
export class ConditionalCheckFailedError extends Error {
  /**
   * Widened to every subclass's code, so a subclass can narrow it. An instance
   * of this class itself always carries `"ConditionalCheckFailedError"`
   */
  public readonly code:
    | "ConditionalCheckFailedError"
    | "WriteConditionFailedError" = "ConditionalCheckFailedError";
}

/**
 * Identifies one consumer guard of a write condition:
 * - `self` — the condition on the written entity's own row
 * - `relationship` — a condition on a related entity's row, named by the
 *   relationship property, with the related entity's id for a HasMany or
 *   HasAndBelongsToMany entry
 * - `foreignKey` — a `target` condition on the row a foreign key references,
 *   named by the foreign-key property, with the referenced id where one applies
 */
export type WriteConditionGuard =
  | { readonly kind: "self" }
  | {
      readonly kind: "relationship" | "foreignKey";
      readonly name: string;
      readonly id?: string;
    };

/**
 * The structured details of a {@link WriteConditionFailedError}
 *
 * @property {string} entity - The name of the entity being written
 * @property {string} id - The id of the entity being written
 * @property {WriteConditionGuard[]} guards - Every consumer guard on the row whose check failed
 */
export interface WriteConditionFailure {
  readonly entity: string;
  readonly id: string;
  readonly guards: readonly WriteConditionGuard[];
}

/**
 * Error thrown, inside a {@link TransactionWriteFailedError}, when a consumer's
 * write condition does not hold and the write is not made.
 *
 * DynamoDB reports only that a row's combined check failed, so when more than
 * one consumer guard landed on that row, every one of them is named.
 *
 * A row that does not exist, a failed referential-integrity check, or a
 * relationship that changed concurrently is reported as a plain
 * {@link ConditionalCheckFailedError} instead, never as this error.
 */
export class WriteConditionFailedError extends ConditionalCheckFailedError {
  public override readonly code = "WriteConditionFailedError";
  /**
   * The name of the entity being written
   */
  public readonly entity: string;
  /**
   * The id of the entity being written
   */
  public readonly id: string;
  /**
   * Every consumer guard on the row whose check failed
   */
  public readonly guards: readonly WriteConditionGuard[];

  /**
   * @param message - The error message
   * @param failure - The write and the consumer guards on the failed row
   */
  constructor(message: string, failure: WriteConditionFailure) {
    super(message);
    this.entity = failure.entity;
    this.id = failure.id;
    this.guards = failure.guards;
  }
}

/**
 * AggregateError thrown if a transaction fails. Check errors for reasons
 */
export class TransactionWriteFailedError extends AggregateError {
  public readonly code = "TransactionWriteFailedError";
}
