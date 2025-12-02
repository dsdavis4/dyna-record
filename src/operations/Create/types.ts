import type DynaRecord from "../../DynaRecord";
import type { EntityDefinedAttributes } from "../types";

/**
 * Options for create operations
 */
export interface CreateOperationOptions {
  /**
   * Whether to perform referential integrity checks for foreign key references.
   * When `true` (default), condition checks are added to verify that referenced entities exist.
   * When `false`, these condition checks are skipped, allowing creation even if foreign key references don't exist.
   * @default true
   */
  referentialIntegrityCheck?: boolean;
}

/**
 * Entity attribute fields that can be set on create. Excludes that are managed by dyna-record
 */
export type CreateOptions<T extends DynaRecord> = EntityDefinedAttributes<T>;
