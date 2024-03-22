import type DynaRecord from "../../DynaRecord";
import type { EntityDefinedAttributes } from "../types";

/**
 * Entity attribute fields that can be set on create. Excludes that are managed by dyna-record
 */
export type CreateOptions<T extends DynaRecord> = EntityDefinedAttributes<T>;
