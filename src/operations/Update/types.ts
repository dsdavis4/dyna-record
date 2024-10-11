import type DynaRecord from "../../DynaRecord";
import type { EntityDefinedAttributes } from "../types";

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
 * Transforms a type `T` by allowing `null` as an additional type for its nullable properties.
 *
 * @typeParam T - The type whose properties are to be transformed.
 * @returns A new type with properties of `T` where each nullable property is also allowed to be `null`.
 */
type AllowNullForNullable<T> = {
  [K in keyof T]: K extends NullableProperties<T> ? T[K] | null : T[K];
};

/**
 * Attributes of an entity to update. Not all properties are required. Setting a nullable property to null will remove the attribute from the item
 *
 * @example
 * await MockModel.update("123", {
 *   nonNullableAttr: "new val", // Sets new value
 *   nullableAttr: null // Remove the value. This will throw a compile time error if the property is not nullable
 * })
 */
export type UpdateOptions<T extends DynaRecord> = Partial<
  AllowNullForNullable<EntityDefinedAttributes<T>>
>;

/**
 * Attributes of an entity that were updated. Including the auto generated updatedAt date
 */
export type UpdatedAttributes<T extends DynaRecord> = Pick<
  Partial<T>,
  "updatedAt"
>;
