import type DynaRecord from "../../DynaRecord.js";
import type { WriteCondition } from "../WriteCondition/index.js";

export interface DeleteOptions {
  errorMessage: string;
  /**
   * A condition the item's row must meet for the delete to commit
   */
  conditionExpression?: string;
}

/**
 * Options for delete operations
 *
 * @typeParam T - The entity being deleted.
 */
export interface DeleteOperationOptions<T extends DynaRecord> {
  /**
   * A guard on the entity's own row and on its related rows, checked in the
   * same transaction as the delete: the entity is deleted only if every part
   * holds, and only if its own row still exists. See {@link WriteCondition}.
   */
  condition?: WriteCondition<T>;
}
