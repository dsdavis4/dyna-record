import type SingleTableDesign from "../../SingleTableDesign";
import type { EntityDefinedAttributes } from "../types";

/**
 * Entity attribute fields that can be set on create. Excludes that are managed by no-orm
 */
export type CreateOptions<T extends SingleTableDesign> =
  EntityDefinedAttributes<T>;
