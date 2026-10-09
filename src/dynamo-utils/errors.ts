/**
 * Error thrown if a condition within a dynamo operation fails. Delivered inside
 * a {@link TransactionWriteFailedError}, one per failed item.
 *
 * A check dyna-record adds itself is reported as this class: the entity's own
 * row is missing or already exists, a referenced entity does not exist, a
 * relationship was changed by a concurrent write, or an id is not related. A
 * failed write condition is reported as its subclass
 * {@link WriteConditionFailedError}, so an existing `instanceof
 * ConditionalCheckFailedError` check still catches it, and `instanceof
 * WriteConditionFailedError` tells the two apart.
 *
 * @example
 * ```typescript
 * try {
 *   await Order.update("order-1", { total: 90 });
 * } catch (error) {
 *   if (error instanceof TransactionWriteFailedError) {
 *     const libraryCheckFailed = error.errors.some(
 *       cause =>
 *         cause instanceof ConditionalCheckFailedError &&
 *         !(cause instanceof WriteConditionFailedError)
 *     );
 *     console.log(libraryCheckFailed);
 *   }
 * }
 * ```
 */
export class ConditionalCheckFailedError extends Error {
  /**
   * Widened to every subclass's code, so a subclass can narrow it. An instance
   * of this class itself always carries `"ConditionalCheckFailedError"`, and a
   * {@link WriteConditionFailedError} carries `"WriteConditionFailedError"`.
   * Comparing `code` and testing `instanceof` work for either class; only code
   * that assigns `code` to a variable typed as the single literal
   * `"ConditionalCheckFailedError"` needs to widen that variable.
   */
  public readonly code:
    | "ConditionalCheckFailedError"
    | "WriteConditionFailedError" = "ConditionalCheckFailedError";
}

/**
 * Identifies one consumer guard of a write condition, as listed in
 * {@link WriteConditionFailedError.guards}:
 * - `self` — the condition on the written entity's own row
 * - `relationship` — a condition on a related entity's row, named by the
 *   relationship property, with the related entity's id for a HasMany or
 *   HasAndBelongsToMany entry
 * - `foreignKey` — a `target` condition on the row a foreign key references,
 *   named by the foreign-key property. It carries no `id`: the referenced id
 *   is the foreign key's value
 *
 * @example
 * ```typescript
 * const guards: WriteConditionGuard[] = [
 *   { kind: "self" },
 *   { kind: "relationship", name: "customer" },
 *   { kind: "relationship", name: "orders", id: "order-1" },
 *   { kind: "foreignKey", name: "storeId" }
 * ];
 * ```
 */
export type WriteConditionGuard =
  | { readonly kind: "self" }
  | {
      readonly kind: "relationship";
      readonly name: string;
      readonly id?: string;
    }
  | {
      readonly kind: "foreignKey";
      readonly name: string;
    };

/**
 * The structured details of a {@link WriteConditionFailedError}
 *
 */
export interface WriteConditionFailure {
  /**
   * The name of the entity being written, or of the join table for a join
   * table's `create` or `delete`
   */
  readonly entity: string;
  /**
   * The id of the entity being written. For a join table, its keys, such as
   * `customerId=customer-1, storeId=store-1`
   */
  readonly id: string;
  /**
   * Every consumer guard on the row whose check failed
   */
  readonly guards: readonly WriteConditionGuard[];
}

/**
 * Error thrown, inside a {@link TransactionWriteFailedError}, when a consumer's
 * write condition does not hold and the write is not made.
 *
 * DynamoDB reports only that a row's combined check failed, so when more than
 * one consumer guard landed on that row, every one of them is named.
 *
 * A row that does not exist, a failed referential-integrity check, a
 * relationship that changed concurrently, or a HasMany or HasAndBelongsToMany
 * id that is not related is reported as a plain
 * {@link ConditionalCheckFailedError} instead, never as this error. A guard
 * whose target cannot be found in what is stored, such as a BelongsTo whose
 * foreign key is `null`, is reported as this error before anything is sent.
 *
 * Its message names the write and the guards, for example
 * `ConditionalCheckFailed: Write condition failed on Order with ID 'order-1': its own row`.
 *
 * @example
 * ```typescript
 * try {
 *   await Order.update(
 *     "order-1",
 *     { status: "cancelled" },
 *     { condition: { status: "pending", customer: { status: "active" } } }
 *   );
 * } catch (error) {
 *   if (error instanceof TransactionWriteFailedError) {
 *     for (const cause of error.errors) {
 *       if (cause instanceof WriteConditionFailedError) {
 *         // cause.entity === "Order", cause.id === "order-1", and cause.guards
 *         // names the failed row's guards: [{ kind: "self" }] or
 *         // [{ kind: "relationship", name: "customer" }]
 *         console.log(cause.entity, cause.id, cause.guards);
 *       }
 *     }
 *   }
 *   throw error;
 * }
 * ```
 */
export class WriteConditionFailedError extends ConditionalCheckFailedError {
  public override readonly code = "WriteConditionFailedError";
  /**
   * The name of the entity being written, or of the join table for a join
   * table's `create` or `delete`
   */
  public readonly entity: string;
  /**
   * The id of the entity being written. For a join table, its keys, such as
   * `customerId=customer-1, storeId=store-1`
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
 * AggregateError thrown if a transaction fails. Check `errors` for reasons:
 * a {@link ConditionalCheckFailedError} for each library check that failed, a
 * {@link WriteConditionFailedError} for each write-condition guard that failed,
 * or the validation errors that stopped the write before it was sent.
 */
export class TransactionWriteFailedError extends AggregateError {
  public readonly code = "TransactionWriteFailedError";
}
