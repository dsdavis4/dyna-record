import type DynaRecord from "../../DynaRecord.js";
import type { AllowNullInWholeValue } from "../../types.js";
import type { EntityDefinedAttributes } from "../types.js";
import type { WriteCondition } from "../WriteCondition/index.js";

/**
 * Extracts the keys of properties in type `T` that are explicitly allowed to be `undefined`.
 *
 * @typeParam T - The type whose properties are to be examined.
 * @returns A union type of the keys of `T` that can be `undefined`.
 */
type NullableProperties<T> = {
  [K in keyof T]: undefined extends T[K] ? K : never;
}[keyof T];

/**
 * Recursively resolves the value type for `AllowNullForNullable`.
 *
 * For plain object types (not `Date`, arrays, primitives, or functions),
 * wraps with `Partial<>` and recurses via {@link AllowNullForNullable} so that:
 * - All fields within `@ObjectAttribute` objects are optional in update payloads,
 *   matching the partial update semantics (only provided fields are modified).
 * - Nullable fields at any nesting depth receive `| null` during updates.
 *
 * Arrays resolve through {@link AllowNullInWholeValue}: a list is written whole
 * (`SET`, never a document path), so nothing inside it becomes `Partial` and
 * every non-nullable field of an element is still required, while a nullable
 * field at any depth inside an element takes `null`, as it does everywhere else
 * in an update; the element is stored without that field.
 *
 * Primitives, `Date`, and functions pass through unchanged.
 */
type AllowNullForNullableValue<T> = T extends
  | Date
  | string
  | number
  | boolean
  | null
  | undefined
  | ((...args: unknown[]) => unknown)
  ? T
  : T extends readonly unknown[]
    ? AllowNullInWholeValue<T>
    : T extends Record<string, unknown>
      ? Partial<AllowNullForNullable<T>>
      : T;

/**
 * Transforms a type `T` by allowing `null` as an additional type for its nullable properties.
 *
 * Recurses into plain object values (e.g. object schema attributes) so that
 * nullable fields at any depth receive `| null`, matching root-level nullable
 * attribute behavior during updates.
 *
 * @typeParam T - The type whose properties are to be transformed.
 * @returns A new type with properties of `T` where each nullable property is also allowed to be `null`.
 */
type AllowNullForNullable<T> = {
  [K in keyof T]: K extends NullableProperties<T>
    ? AllowNullForNullableValue<NonNullable<T[K]>> | null | undefined
    : AllowNullForNullableValue<T[K]>;
};

/**
 * Attributes of an entity to update. Not all properties are required. Setting a nullable property to null will remove the attribute from the item.
 *
 * For `@ObjectAttribute` fields, all nested fields are `Partial` — you only need to provide the
 * fields you want to change. Omitted fields are preserved in DynamoDB via document path expressions.
 *
 * @example
 * await MockModel.update("123", {
 *   nonNullableAttr: "new val", // Sets new value
 *   nullableAttr: null // Remove the value. This will throw a compile time error if the property is not nullable
 * })
 *
 * @example Partial ObjectAttribute update
 * await MockModel.update("123", {
 *   address: { street: "456 Oak Ave" } // Only updates street, preserves other fields
 * })
 */
export type UpdateOptions<T extends DynaRecord> = Partial<
  AllowNullForNullable<EntityDefinedAttributes<T>>
>;

/**
 * Options for update operations
 *
 * @typeParam T - The entity being updated.
 */
export interface UpdateOperationOptions<T extends DynaRecord = DynaRecord> {
  /**
   * Whether to perform referential integrity checks for foreign key references.
   * When `true` (default), condition checks are added to verify that referenced entities exist.
   * When `false`, these condition checks are skipped, allowing updates even if foreign key references don't exist.
   * @default true
   */
  referentialIntegrityCheck?: boolean;
  /**
   * Embed the searchable attribute even when its value appears unchanged.
   * By default an update whose searchable value matches the stored value
   * skips the embedding call and the vector write. Pass `true` to embed
   * anyway — the affordance for indexing rows that predate searchability
   * (backfills) and for re-embedding after an embedding model change.
   * @default false
   */
  forceEmbed?: boolean;
  /**
   * A guard on the entity's own row and on its related rows, checked in the
   * same transaction as the update: the entity is updated only if every part
   * holds. A relationship guard still requires its row to exist when
   * `referentialIntegrityCheck` is `false`. See {@link WriteCondition}.
   */
  condition?: WriteCondition<T>;
}

/**
 * Attributes of an entity that were updated. Including the auto generated updatedAt date
 */
export type UpdatedAttributes<T extends DynaRecord> = Pick<
  Partial<T>,
  "updatedAt"
>;
