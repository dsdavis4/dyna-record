import type NoOrm from "../NoOrm";
import { type EntityAttributes } from "../operations/types";
import type { NullableForeignKey, ForeignKey, Optional } from "../types";

/**
 * Returns attributes on the provided model which are EntityAttributes of type ForeignKey
 */
export type ForeignEntityAttribute<T extends NoOrm> = {
  [K in keyof T]: T[K] extends ForeignKey
    ? K
    : T[K] extends NullableForeignKey
      ? Optional<K>
      : never;
}[keyof EntityAttributes<T>];

/**
 * Represents the properties of an attribute that are configurable via the {@link Attribute} decorator.
 */
export interface AttributeOptions {
  /**
   * An optional alias for the attribute as represented in the database table.
   *
   * This alias is used as the column name in the database table corresponding to
   * the entity. If omitted, the ORM defaults to using the attribute's key as defined
   * within the entity model. Specifying an alias allows for mapping between the
   * entity's attribute names in the code and their respective column names in
   * the database, providing flexibility in naming conventions and supporting
   * scenarios where column names in the database differ from attribute names in the code.
   */
  alias?: string;
}
