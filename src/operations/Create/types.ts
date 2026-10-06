import type DynaRecord from "../../DynaRecord.js";
import type { EntityDefinedAttributes } from "../types.js";
import type { CreateCondition } from "../WriteCondition/index.js";

/**
 * Options for create operations
 *
 * @typeParam T - The entity being created.
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
   * holds. A guard still requires its row to exist when
   * `referentialIntegrityCheck` is `false`. See {@link CreateCondition}.
   */
  condition?: CreateCondition<T>;
}

/**
 * Entity attribute fields that can be set on create. Excludes that are managed by dyna-record
 */
export type CreateOptions<T extends DynaRecord> = EntityDefinedAttributes<T>;
