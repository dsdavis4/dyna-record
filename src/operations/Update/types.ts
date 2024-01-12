import type SingleTableDesign from "../../SingleTableDesign";
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
 */
export type UpdateOptions<T extends SingleTableDesign> = Partial<
  AllowNullForNullable<EntityDefinedAttributes<T>>
>;
