import type DynaRecord from "../DynaRecord";
import { type DefaultFields } from "../metadata";
import type {
  ForeignKey,
  NullableForeignKey,
  Optional,
  PartitionKey,
  SortKey
} from "../types";

/**
 * Represents the type of the partition key attribute for a given entity. It identifies the specific property of the entity that is marked as the partition key, which uniquely identifies each instance of the entity in the database.
 *
 * @template T - The type of the entity being examined.
 * @returns The name of the partition key attribute as a string if one exists; otherwise, the result is `never`.
 */
export type PartitionKeyAttribute<T> = {
  [K in keyof T]: T[K] extends PartitionKey ? K : never;
}[keyof T];

/**
 * Represents the type of the sort key attribute for a given entity. It identifies the specific property of the entity that is marked as the sort key, used in conjunction with the partition key to provide additional sorting capability within the database.
 *
 * @template T - The type of the entity being examined.
 * @returns The name of the sort key attribute as a string if one exists; otherwise, the result is `never`.
 */
export type SortKeyAttribute<T> = {
  [K in keyof T]: T[K] extends SortKey ? K : never;
}[keyof T];

/**
 * Identifies all properties of a given entity type `T` that are functions. This type is useful for filtering out or working with only the function fields of an entity.
 *
 * @template T - The type of the entity being examined.
 * @returns The names of the function properties as strings if any exist; otherwise, the result is `never`.
 */
export type FunctionFields<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => unknown ? K : never;
}[keyof T];

/**
 * Allow ForeignKey attributes to be passes to the create method by using their inferred primitive type
 * Ex:
 *  If ModelA has: attr1: ForeignKey
 *  This allows" ModelA.create({ attr1: "someVal" })
 *  Instead of: ModelA.create({ attr1: "someVal" as ForeignKey })
 */
export type ForeignKeyToValue<T> = {
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
  [K in keyof T]: Exclude<T[K], undefined> extends DynaRecord | DynaRecord[]
    ? K
    : never;
}[keyof T];

/**
 * Entity class instance with attributes excluding relationship attributes
 */
export type EntityAttributesInstance<T extends DynaRecord> = Omit<
  T,
  RelationshipAttributeNames<T>
>;

/**
 * Entity attributes excluding relationship attributes
 * Represents the raw attributes of a class (no functions)
 */
export type EntityAttributesOnly<T extends DynaRecord> = Omit<
  T,
  RelationshipAttributeNames<T> | FunctionFields<T>
>;

/**
 * Entity attributes for default fields
 */
export type EntityAttributeDefaultFields = Pick<
  DynaRecord,
  Extract<keyof DynaRecord, DefaultFields>
>;

/**
 * Attributes that are defined on the Entity using the attribute decorators. This excludes:
 *   - relationship attributes
 *   - partition key attribute
 *   - sort key attribute
 *   - dyna-record default attributes
 *   - Functions defined on the entity
 */
export type EntityDefinedAttributes<T extends DynaRecord> = Omit<
  ForeignKeyToValue<T>,
  | keyof DynaRecord
  | RelationshipAttributeNames<T>
  | FunctionFields<T>
  | PartitionKeyAttribute<T>
  | SortKeyAttribute<T>
>;

/**
 * Recursively generates dot-separated key paths for plain object types.
 * Stops recursion at Date, arrays, DynaRecord, and functions.
 */
export type DotPathKeys<T> = T extends
  | Date
  | unknown[]
  | DynaRecord
  | ((...args: never[]) => unknown)
  ? never
  : T extends object
    ? {
        [K in keyof T & string]:
          | K
          | (DotPathKeys<T[K]> extends infer D extends string
              ? `${K}.${D}`
              : never);
      }[keyof T & string]
    : never;

/**
 * For a given entity, produces all dot-path keys for its ObjectAttribute fields.
 * Checks each property: if it's a plain object (not Date/array/DynaRecord/function),
 * generates "propName.nestedKey" paths.
 */
export type ObjectDotPaths<T extends DynaRecord> = {
  [K in keyof T & string]: Exclude<T[K], undefined> extends infer V
    ? V extends Date | unknown[] | DynaRecord | ((...args: never[]) => unknown)
      ? never
      : V extends object
        ? DotPathKeys<V> extends infer D extends string
          ? `${K}.${D}`
          : never
        : never
    : never;
}[keyof T & string];

/**
 * Union of: non-relationship/non-function/non-key attribute names + ObjectDotPaths.
 * This is the complete set of valid filter keys for a single entity.
 * Excludes PartitionKeyAttribute and SortKeyAttribute.
 */
export type EntityFilterableKeys<T extends DynaRecord> =
  | Exclude<
      keyof EntityAttributesOnly<T> & string,
      PartitionKeyAttribute<T> | SortKeyAttribute<T> | "type"
    >
  | ObjectDotPaths<T>;
