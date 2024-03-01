import type SingleTableDesign from "../SingleTableDesign";
import type { DefaultEntityFields } from "../metadata";
import type {
  ForeignKey,
  NullableForeignKey,
  Optional,
  PrimaryKey,
  SortKey
} from "../types";

type PrimaryKeyAttribute<T> = {
  [K in keyof T]: T[K] extends PrimaryKey ? K : never;
}[keyof T];

type SortKeyAttribute<T> = {
  [K in keyof T]: T[K] extends SortKey ? K : never;
}[keyof T];

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
  | DefaultEntityFields
  | RelationshipAttributeNames<T>
  | FunctionFields<T>
  | PrimaryKeyAttribute<T>
  | SortKeyAttribute<T>
>;
