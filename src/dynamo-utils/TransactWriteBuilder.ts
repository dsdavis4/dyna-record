import type DynamoClient from "./DynamoClient.js";
import {
  TransactionCanceledException,
  type CancellationReason
} from "@aws-sdk/client-dynamodb";
import { unmarshall, type NativeAttributeValue } from "@aws-sdk/util-dynamodb";
import {
  ConditionalCheckFailedError,
  TransactionWriteFailedError,
  WriteConditionFailedError,
  type WriteConditionGuard
} from "./errors.js";
import Logger from "../Logger.js";
import { parenthesize } from "./conditionExpression.js";
import type {
  TransactWriteItems,
  ConditionCheck,
  Put,
  Update,
  Delete
} from "./types.js";

/**
 * Identifies one row of a table: the table and the row's full primary key,
 * under the table's key aliases (EX: `{ PK: "Customer#1", SK: "Customer" }`)
 */
export interface TransactRowKey {
  TableName: string;
  Key: Record<string, NativeAttributeValue>;
}

/**
 * The row a write-condition guard or library pin is merged onto
 *
 * @property {string} missingRowMessage - Reported when the row does not exist at commit: a not-found message for the entity's own row, a referential-integrity or not-related message for any other row. The first one given for a row is kept
 */
export interface TransactConditionRow extends TransactRowKey {
  missingRowMessage: string;
}

/**
 * A compiled condition expression with the names and values it references,
 * ready to AND onto a queued item. Its value placeholders must not be bound
 * to another value on the item it lands on — draw a fresh prefix from
 * {@link TransactionBuilder.nextPlaceholderPrefix} for every fragment
 */
export interface ConditionFragment {
  ConditionExpression: string;
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: Record<string, NativeAttributeValue>;
}

/**
 * A consumer's write-condition guard on one row
 *
 * @property {string} entity - The name of the entity being written
 * @property {string} id - The id of the entity being written
 * @property {WriteConditionGuard} guard - Which guard this is, as the error names it
 * @property {ConditionFragment} condition - The compiled condition
 * @property {TransactRowKey} [pinnedBy] - The row carrying the library pin the guard's target was resolved through, when that pin sits on another row. A failed guard is not reported when its pin row fails a library check, because the guard may have been evaluated against the wrong row
 */
export interface ConsumerGuard {
  entity: string;
  id: string;
  guard: WriteConditionGuard;
  condition: ConditionFragment;
  pinnedBy?: TransactRowKey;
}

/**
 * A library equality pin on one row: the write only commits while the row's
 * attribute still holds the value the library resolved a guard through
 * (EX: the foreign key read before an update, or a child's foreign key
 * pointing at its parent)
 *
 * @property {string} attribute - The table attribute name, which must be a valid expression token
 * @property {string} value - The value the attribute must hold
 * @property {string} failureMessage - Reported when the row exists but the attribute no longer holds the value: a concurrent-change or not-related message
 */
export interface LibraryPin {
  attribute: string;
  value: string;
  failureMessage: string;
}

/**
 * A consumer guard as tracked on the item it was merged onto
 */
interface TrackedGuard extends Pick<ConsumerGuard, "entity" | "id" | "guard"> {
  /**
   * The index of the item carrying the guard's pin, when it sits on another
   * item
   */
  pinIndex?: number;
}

/**
 * What a queued item's failed condition is attributed to
 */
interface TransactItemDescriptor {
  /**
   * The library's message for the item's own condition
   */
  failureMessage?: string;
  /**
   * Reported when a guarded or pinned row does not exist
   */
  missingRowMessage?: string;
  pins: LibraryPin[];
  guards: TrackedGuard[];
}

/**
 * Any operation a transaction item carries. Each holds its own condition,
 * names and values
 */
type TransactOperation = Put | Update | Delete | ConditionCheck;

/**
 * An item queued on a row and the operation it carries
 */
interface QueuedOperation {
  index: number;
  operation: TransactOperation;
}

/**
 * Returns the operation a transaction item carries
 * @param item - The transaction item
 * @returns The item's operation
 */
const operationOf = (
  item: TransactWriteItems[number]
): TransactOperation | undefined =>
  item.Put ?? item.Update ?? item.Delete ?? item.ConditionCheck;

/**
 * Whether a transaction item writes or checks the given row. A Put's key
 * sits inside its `Item`; every other operation carries a `Key`
 * @param item - The transaction item
 * @param row - The row to match
 * @returns Whether the item targets the row
 */
const targetsRow = (
  item: TransactWriteItems[number],
  row: TransactRowKey
): boolean => {
  const attributes =
    item.Put?.Item ??
    item.Update?.Key ??
    item.Delete?.Key ??
    item.ConditionCheck?.Key;
  const operation = operationOf(item);

  return (
    operation?.TableName === row.TableName &&
    attributes !== undefined &&
    Object.entries(row.Key).every(([name, value]) => attributes[name] === value)
  );
};

/**
 * Returns the bindings of a merged item: the item's own with the fragment's
 * added, in a fresh map, so a map the item shares with other items is never
 * written into
 * @param row - The row being merged onto, for the error message
 * @param existing - The item's bindings
 * @param added - The fragment's bindings
 * @returns The merged bindings, or undefined when the fragment binds nothing
 * @throws When a placeholder already on the item would be bound to a different value
 */
const mergeBindings = <V>(
  row: TransactRowKey,
  existing: Record<string, V> | undefined,
  added: Record<string, V> | undefined
): Record<string, V> | undefined => {
  if (added === undefined || Object.keys(added).length === 0) return undefined;

  for (const [placeholder, value] of Object.entries(added)) {
    if (existing !== undefined && placeholder in existing) {
      if (existing[placeholder] !== value) {
        throw new Error(
          `Write condition merge would rebind '${placeholder}' on the item for key ${JSON.stringify(row.Key)} to a different value`
        );
      }
    }
  }

  return { ...existing, ...added };
};

/**
 * Converts a cancellation reason's returned row to native values.
 *
 * lib-dynamodb unmarshalls only a successful command's output, so the row on
 * a cancellation reason arrives as raw `AttributeValue`s. The row is read for
 * attribution only; it is never logged or attached to an error
 * @param reason - The cancellation reason
 * @returns The returned row, or undefined when the reason carries none
 */
const returnedRow = (
  reason: CancellationReason
): Record<string, NativeAttributeValue> | undefined =>
  reason.Item === undefined ? undefined : unmarshall(reason.Item);

/**
 * Describes a consumer guard for an error message
 * @param guard - The guard
 * @returns The description
 */
const describeGuard = (guard: WriteConditionGuard): string => {
  if (guard.kind === "self") return "its own row";

  if (guard.kind === "foreignKey") return `foreign key '${guard.name}'`;

  const id = guard.id === undefined ? "" : ` (ID '${guard.id}')`;
  return `relationship '${guard.name}'${id}`;
};

/**
 * Build and executes a [TransactWriteItems](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_TransactWriteItems.html) request
 *
 * Write-condition guards and library pins are merged onto the item already
 * queued on their row ({@link TransactionBuilder.addGuard},
 * {@link TransactionBuilder.addPin}), after every library
 * item is queued. A transaction with neither sends exactly the items queued.
 */
class TransactionBuilder {
  readonly #transactionItems: TransactWriteItems = [];
  readonly #descriptors = new Map<number, TransactItemDescriptor>();
  /**
   * The rows of the ConditionChecks added only to carry a guard or pin, which
   * no library item may share
   */
  readonly #guardOnlyRows: TransactRowKey[] = [];
  #placeholderPrefixCount = 0;
  readonly #dynamo: DynamoClient;

  /**
   * @param dynamo - The client of the table this transaction writes to
   */
  constructor(dynamo: DynamoClient) {
    this.#dynamo = dynamo;
  }

  /**
   * Execute the transaction
   */
  public async executeTransaction(): Promise<void> {
    try {
      const response = await this.#dynamo.transactWriteItems({
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
    this.queue({ ConditionCheck: item }, conditionFailedMsg);
  }

  /**
   * Add a put operation to the transaction
   * @param item
   */
  public addPut(item: Put, conditionFailedMsg?: string): void {
    this.queue({ Put: item }, conditionFailedMsg);
  }

  /**
   * Add an update operation to the transaction
   * @param item
   */
  public addUpdate(item: Update, conditionFailedMsg?: string): void {
    this.queue({ Update: item }, conditionFailedMsg);
  }

  /**
   * Replaces the tracked condition-failure message for an already-queued
   * update item, for conditions appended to the item after it was queued
   * @param item The queued update item, matched by reference
   * @param errMsg The replacement error message
   */
  public overrideConditionFailedMsg(item: Update, errMsg: string): void {
    const idx = this.#transactionItems.findIndex(
      transactionItem => transactionItem.Update === item
    );
    if (idx !== -1) {
      this.descriptorAt(idx).failureMessage = errMsg;
    }
  }

  /**
   * Add a delete operation to the transaction
   * @param item
   */
  public addDelete(item: Delete, conditionFailedMsg?: string): void {
    this.queue({ Delete: item }, conditionFailedMsg);
  }

  /**
   * Returns a value placeholder prefix no other fragment or pin of this
   * transaction uses (EX: `wc1_`), for compiling one condition fragment. A
   * filter builder numbers placeholders from zero per instance, so two
   * fragments compiled separately would otherwise bind the same placeholder
   */
  public nextPlaceholderPrefix(): string {
    return `wc${String(++this.#placeholderPrefixCount)}_`;
  }

  /**
   * Merges a consumer's write-condition guard onto its row.
   *
   * The guard's condition is parenthesized and ANDed onto the item queued on
   * the row, or onto a new ConditionCheck requiring the row's existence when
   * nothing is queued there. The item returns the row it failed on, so a
   * cancellation can be attributed.
   *
   * Call only in an operation that carries a condition, after every library
   * item is queued: an item queued later onto a guard-only row throws.
   * @param row - The row the guard checks
   * @param guard - The guard
   * @throws When the guard's pin row holds no queued item, or a placeholder would be rebound
   */
  public addGuard(row: TransactConditionRow, guard: ConsumerGuard): void {
    const pinIndex =
      guard.pinnedBy === undefined
        ? undefined
        : this.pinIndexOf(guard.pinnedBy);
    const index = this.mergeOntoRow(row, guard.condition);

    this.descriptorAt(index).guards.push({
      entity: guard.entity,
      id: guard.id,
      guard: guard.guard,
      ...(pinIndex !== undefined && { pinIndex })
    });
  }

  /**
   * Merges a library equality pin onto its row, the same way as
   * {@link addGuard}. The pin is compiled here, so the expression and the
   * check run against a returned row on cancellation can never disagree.
   * @param row - The row the pin checks
   * @param pin - The pin
   * @throws When a placeholder would be rebound
   */
  public addPin(row: TransactConditionRow, pin: LibraryPin): void {
    const valuePlaceholder = `:${this.nextPlaceholderPrefix()}${pin.attribute}`;
    const index = this.mergeOntoRow(row, {
      ConditionExpression: `#${pin.attribute} = ${valuePlaceholder}`,
      ExpressionAttributeNames: { [`#${pin.attribute}`]: pin.attribute },
      ExpressionAttributeValues: { [valuePlaceholder]: pin.value }
    });

    this.descriptorAt(index).pins.push(pin);
  }

  /**
   * Queues a library item, tracking its condition-failure message
   * @param item - The transaction item
   * @param conditionFailedMsg - The custom error message to return if there is a ConditionalCheckFailed exception
   * @throws When the item targets a row holding a guard-only ConditionCheck, which would put two operations on one item
   */
  private queue(
    item: TransactWriteItems[number],
    conditionFailedMsg?: string
  ): void {
    const guardOnlyRow = this.#guardOnlyRows.find(row => targetsRow(item, row));
    if (guardOnlyRow !== undefined) {
      throw new Error(
        `Cannot queue a second operation on the item for key ${JSON.stringify(guardOnlyRow.Key)}, which already holds a write condition check`
      );
    }

    this.trackErrorMessage(conditionFailedMsg);
    this.#transactionItems.push(item);
  }

  /**
   * Track error messages to return if there is a ConditionalCheckFailed exception
   *
   * IMPORTANT - Call this before adding the transaction to this.#transactionItems
   * @param errMsg The custom error message to return if there is a ConditionalCheckFailed exception
   */
  private trackErrorMessage(errMsg?: string): void {
    if (errMsg !== undefined) {
      this.descriptorAt(this.#transactionItems.length).failureMessage = errMsg;
    }
  }

  /**
   * Returns the descriptor of the item at an index, creating it if needed
   * @param index - The item's index
   * @returns The descriptor
   */
  private descriptorAt(index: number): TransactItemDescriptor {
    const existing = this.#descriptors.get(index);
    if (existing !== undefined) return existing;

    const descriptor: TransactItemDescriptor = { pins: [], guards: [] };
    this.#descriptors.set(index, descriptor);
    return descriptor;
  }

  /**
   * Returns the index of the queued item a guard's pin sits on
   * @param row - The pin's row
   * @returns The item's index
   * @throws When no item is queued on the row
   */
  private pinIndexOf(row: TransactRowKey): number {
    const queued = this.queuedOnRow(row);
    if (queued === undefined) {
      throw new Error(
        `A write condition's pin must be queued before its guard: no item for key ${JSON.stringify(row.Key)}`
      );
    }
    return queued.index;
  }

  /**
   * Returns the first item queued on a row, with the operation it carries
   * @param row - The row
   * @returns The item's index and operation, or undefined when none is queued
   */
  private queuedOnRow(row: TransactRowKey): QueuedOperation | undefined {
    for (const [index, item] of this.#transactionItems.entries()) {
      const operation = operationOf(item);
      if (operation !== undefined && targetsRow(item, row)) {
        return { index, operation };
      }
    }
    return undefined;
  }

  /**
   * ANDs a parenthesized fragment onto the item queued on a row, or onto a new
   * ConditionCheck requiring the row's existence, and makes the item return
   * the row on a failed condition.
   *
   * The item's own condition is kept; its names and values are replaced with
   * fresh merged maps rather than written into, because a canonical update's
   * maps are shared with its link-row updates. An empty map is never attached.
   * @param row - The row to merge onto
   * @param fragment - The fragment to AND on
   * @returns The index of the item the fragment landed on
   */
  private mergeOntoRow(
    row: TransactConditionRow,
    fragment: ConditionFragment
  ): number {
    const { index, operation } =
      this.queuedOnRow(row) ?? this.queueGuardOnlyCheck(row);

    const names = mergeBindings(
      row,
      operation.ExpressionAttributeNames,
      fragment.ExpressionAttributeNames
    );
    const values = mergeBindings(
      row,
      operation.ExpressionAttributeValues,
      fragment.ExpressionAttributeValues
    );

    const expression = parenthesize(fragment.ConditionExpression);
    operation.ConditionExpression =
      operation.ConditionExpression === undefined
        ? expression
        : `${operation.ConditionExpression} AND ${expression}`;
    if (names !== undefined) operation.ExpressionAttributeNames = names;
    if (values !== undefined) operation.ExpressionAttributeValues = values;
    operation.ReturnValuesOnConditionCheckFailure = "ALL_OLD";

    this.descriptorAt(index).missingRowMessage ??= row.missingRowMessage;

    return index;
  }

  /**
   * Queues a ConditionCheck requiring a row's existence, to carry the guards
   * and pins of a row no library item is queued on. Any key attribute proves
   * existence, since every item holds its whole primary key
   * @param row - The row
   * @returns The check's index and operation
   */
  private queueGuardOnlyCheck(row: TransactRowKey): QueuedOperation {
    const [keyAttribute] = Object.keys(row.Key);
    const check: ConditionCheck = {
      TableName: row.TableName,
      Key: { ...row.Key },
      ConditionExpression: `attribute_exists(${keyAttribute})`
    };

    this.#guardOnlyRows.push({ TableName: row.TableName, Key: row.Key });
    this.#transactionItems.push({ ConditionCheck: check });
    return { index: this.#transactionItems.length - 1, operation: check };
  }

  /**
   * Handle TransactionCanceledException, aggregating errors and applying friendly errors if provided.
   *
   * Returned rows are read for attribution, then removed from every
   * cancellation reason, so neither the wrapped cause nor a passed-through
   * exception carries stored data.
   * @param error
   * @returns
   */
  private buildTransactionCanceledException(
    error: TransactionCanceledException
  ): TransactionCanceledException | AggregateError {
    if (error.CancellationReasons !== undefined) {
      const reasons = error.CancellationReasons;
      const conditionFailedErrs = this.attributeFailures(reasons);

      for (const reason of reasons) {
        delete reason.Item;
      }

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

  /**
   * Builds an error for each failed condition. An item without a guard or pin
   * reports its library message. A guarded or pinned item reports, in order:
   * - nothing, when every guard on it was resolved through a pin row that
   *   failed a library check and it carries no pin of its own
   * - its missing-row message, when it returned no row
   * - a failed pin's message, when the returned row no longer holds it
   * - a {@link WriteConditionFailedError} naming every remaining guard
   * - otherwise its library message
   * @param reasons - The cancellation reasons, in item order
   * @returns The errors
   */
  private attributeFailures(
    reasons: CancellationReason[]
  ): ConditionalCheckFailedError[] {
    const libraryFailures = new Map<number, string>();
    reasons.forEach((reason, idx) => {
      const descriptor = this.#descriptors.get(idx);
      if (reason.Code !== "ConditionalCheckFailed" || descriptor === undefined)
        return;

      const failure = this.libraryFailure(reason, descriptor);
      if (failure !== undefined) libraryFailures.set(idx, failure);
    });

    return reasons.reduce<ConditionalCheckFailedError[]>(
      (errors, reason, idx) => {
        if (reason.Code !== "ConditionalCheckFailed") return errors;

        const error = this.attributeFailure(
          reason.Code,
          reason,
          idx,
          libraryFailures
        );
        if (error !== undefined) errors.push(error);

        return errors;
      },
      []
    );
  }

  /**
   * Builds the error for one failed item, as {@link attributeFailures}
   * describes
   * @param code - The reason's code, which prefixes the message
   * @param reason - The item's cancellation reason
   * @param index - The item's index
   * @param libraryFailures - The library failure of each failed guarded or pinned item, by index
   * @returns The error, or undefined when the item's failure is reported by its guards' pin rows
   */
  private attributeFailure(
    code: string,
    reason: CancellationReason,
    index: number,
    libraryFailures: Map<number, string>
  ): ConditionalCheckFailedError | undefined {
    const descriptor = this.#descriptors.get(index);
    const libraryMessage = descriptor?.failureMessage ?? reason.Message;
    const plain = (failure?: string): ConditionalCheckFailedError =>
      new ConditionalCheckFailedError(`${code}: ${String(failure)}`);

    if (
      descriptor === undefined ||
      (descriptor.guards.length === 0 && descriptor.pins.length === 0)
    ) {
      return plain(libraryMessage);
    }

    const guards = descriptor.guards.filter(
      tracked =>
        tracked.pinIndex === undefined || !libraryFailures.has(tracked.pinIndex)
    );
    if (guards.length === 0 && descriptor.pins.length === 0) return undefined;

    const failure = libraryFailures.get(index);
    if (failure !== undefined) return plain(failure);
    if (guards.length === 0) return plain(libraryMessage);

    const [{ entity, id }] = guards;
    const guardList = guards.map(tracked => tracked.guard);
    return new WriteConditionFailedError(
      `${code}: Write condition failed on ${entity} with ID '${id}': ${guardList.map(describeGuard).join(", ")}`,
      { entity, id, guards: guardList }
    );
  }

  /**
   * Returns the library failure a guarded or pinned item's failed condition
   * is attributed to: its missing-row message when no row was returned, or
   * the message of the first pin the returned row no longer holds
   * @param reason - The item's cancellation reason
   * @param descriptor - The item's descriptor
   * @returns The failure message, or undefined when the row exists and holds every pin
   */
  private libraryFailure(
    reason: CancellationReason,
    descriptor: TransactItemDescriptor
  ): string | undefined {
    if (descriptor.guards.length === 0 && descriptor.pins.length === 0) {
      return undefined;
    }

    const row = returnedRow(reason);
    if (row === undefined) return descriptor.missingRowMessage;

    return descriptor.pins.find(pin => row[pin.attribute] !== pin.value)
      ?.failureMessage;
  }
}

export default TransactionBuilder;
