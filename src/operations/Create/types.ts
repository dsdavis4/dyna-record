import type NoOrm from "../../NoOrm";
import type { EntityDefinedAttributes } from "../types";

/**
 * Entity attribute fields that can be set on create. Excludes that are managed by no-orm
 */
export type CreateOptions<T extends NoOrm> = EntityDefinedAttributes<T>;
