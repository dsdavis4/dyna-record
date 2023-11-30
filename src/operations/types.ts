import type SingleTableDesign from "../SingleTableDesign";
import type { Brand, PrimaryKey, SortKey } from "../types";

// TODO does this belong in this file?
// TODO "type" key might be too generic
// TODO how to make the fields shared so they arent repeeated in other files?
type DefaultFields = "id" | "type" | "createdAt" | "updatedAt";

type PrimaryKeyAttribute<T> = {
  [K in keyof T]: T[K] extends PrimaryKey ? K : never;
}[keyof T];

type SortKeyAttribute<T> = {
  [K in keyof T]: T[K] extends SortKey ? K : never;
}[keyof T];

// TODO add unit test for this
type FunctionFields<T> = {
  // eslint-disable-next-line @typescript-eslint/ban-types
  [K in keyof T]: T[K] extends Function ? K : never;
}[keyof T];

/**
 * Infer the primitive type of the branded type
 */
type ExtractForeignKeyType<T> = T extends Brand<infer U, "ForeignKey">
  ? U
  : never;

/**
 * Allow ForeignKey attributes to be passes to the create method by using their inferred primitive type
 * Ex:
 *  If ModelA has: attr1: ForeignKey
 *  This allows" ModelA.create({ attr1: "someVal" })
 *  Instead of: ModelA.create({ attr1: "someVal" as ForeignKey })
 */
type ForeignKeyToValue<T> = {
  [K in keyof T]: ExtractForeignKeyType<T[K]> extends never ? T[K] : string;
};

/**
 * Returns Keys of T which are HasMany, BelongsTo or HasOne relationships
 */
export type RelationshipAttributeNames<T> = {
  [K in keyof T]: Exclude<T[K], undefined> extends
    | SingleTableDesign
    | SingleTableDesign[]
    ? K
    : never;
}[keyof T];

/**
 * Entity attributes excluding relationship attributes
 */
export type EntityAttributes<T extends SingleTableDesign> = Omit<
  T,
  RelationshipAttributeNames<T>
>;

/**
 * Attributes that are defined on the Entity using the @Attribute decorators. This excludes:
 *   - relationship attributes
 *   - primary key attribute
 *   - sort key attribute
 *   - no-orm default attributes
 *   - Functions defined on the entity
 */
export type EntityDefinedAttributes<T extends SingleTableDesign> = Omit<
  ForeignKeyToValue<T>,
  | DefaultFields
  | RelationshipAttributeNames<T>
  | FunctionFields<T>
  | PrimaryKeyAttribute<T>
  | SortKeyAttribute<T>
>;
