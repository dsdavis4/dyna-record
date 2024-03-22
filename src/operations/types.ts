import type NoOrm from "../NoOrm";
import type {
  ForeignKey,
  NullableForeignKey,
  Optional,
  PrimaryKey,
  SortKey
} from "../types";

/**
 * Represents the type of the primary key attribute for a given entity. It identifies the specific property of the entity that is marked as the primary key, which uniquely identifies each instance of the entity in the database.
 *
 * @template T - The type of the entity being examined.
 * @returns The name of the primary key attribute as a string if one exists; otherwise, the result is `never`.
 */
type PrimaryKeyAttribute<T> = {
  [K in keyof T]: T[K] extends PrimaryKey ? K : never;
}[keyof T];

/**
 * Represents the type of the sort key attribute for a given entity. It identifies the specific property of the entity that is marked as the sort key, used in conjunction with the primary key to provide additional sorting capability within the database.
 *
 * @template T - The type of the entity being examined.
 * @returns The name of the sort key attribute as a string if one exists; otherwise, the result is `never`.
 */
type SortKeyAttribute<T> = {
  [K in keyof T]: T[K] extends SortKey ? K : never;
}[keyof T];

/**
 * Identifies all properties of a given entity type `T` that are functions. This type is useful for filtering out or working with only the function fields of an entity.
 *
 * @template T - The type of the entity being examined.
 * @returns The names of the function properties as strings if any exist; otherwise, the result is `never`.
 */
type FunctionFields<T> = {
  // eslint-disable-next-line @typescript-eslint/ban-types
  [K in keyof T]: T[K] extends Function ? K : never;
}[keyof T];

/**
 * Allow ForeignKey attributes to be passes to the create method by using their inferred primitive type
 * Ex:
 *  If ModelA has: attr1: ForeignKey
 *  This allows" ModelA.create({ attr1: "someVal" })
 *  Instead of: ModelA.create({ attr1: "someVal" as ForeignKey })
 */
type ForeignKeyToValue<T> = {
  [K in keyof T]: T[K] extends NullableForeignKey
    ? Optional<string>
    : T[K] extends ForeignKey
      ? string
      : T[K];
};

/**
 * Returns Keys of T which are HasMany, BelongsTo or HasOne relationships
 */
export type RelationshipAttributeNames<T> = {
  [K in keyof T]: Exclude<T[K], undefined> extends NoOrm | NoOrm[] ? K : never;
}[keyof T];

/**
 * Entity attributes excluding relationship attributes
 */
export type EntityAttributes<T extends NoOrm> = Omit<
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
export type EntityDefinedAttributes<T extends NoOrm> = Omit<
  ForeignKeyToValue<T>,
  | keyof NoOrm
  | RelationshipAttributeNames<T>
  | FunctionFields<T>
  | PrimaryKeyAttribute<T>
  | SortKeyAttribute<T>
>;
