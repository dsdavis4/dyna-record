import type DynaRecord from "../../DynaRecord.js";
import type { EntityDefinedAttributes } from "../types.js";
import type { CreateCondition } from "../WriteCondition/index.js";

/**
 * Options for {@link DynaRecord.create}.
 *
 * @typeParam T - The entity being created.
 *
 * @example
 * ```typescript
 * // Place an Order only for an active Customer at an open Store
 * const options: CreateOperationOptions<Order> = {
 *   condition: {
 *     customer: { status: "active" },
 *     storeId: { target: { status: "open" } }
 *   }
 * };
 * ```
 */
export interface CreateOperationOptions<T extends DynaRecord = DynaRecord> {
  /**
   * Whether to perform referential integrity checks for foreign key references.
   * When `true` (default), condition checks are added to verify that referenced entities exist.
   * When `false`, these condition checks are skipped, allowing creation even if foreign key references don't exist.
   * @default true
   */
  referentialIntegrityCheck?: boolean;
  /**
   * Guards on the rows the new entity references, checked in the same
   * transaction as the create: the entity is created only if every guard
   * holds. The keys are the entity's BelongsTo relationships and its other
   * foreign keys declared with their target type; the new row's own
   * attributes take no condition. A guard still requires its row to exist
   * when `referentialIntegrityCheck` is `false`. See {@link CreateCondition}.
   */
  condition?: CreateCondition<T>;
}

/**
 * Entity attribute fields that can be set on create. Excludes that are managed by dyna-record
 */
export type CreateOptions<T extends DynaRecord> = EntityDefinedAttributes<T>;
