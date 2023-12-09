import type SingleTableDesign from "../../SingleTableDesign";
import type { EntityDefinedAttributes } from "../types";

export type UpdateOptions<T extends SingleTableDesign> = Partial<
  EntityDefinedAttributes<T>
>;
