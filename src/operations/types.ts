import type DynaRecord from "../DynaRecord.js";
import { type DefaultFields } from "../metadata/index.js";
import type {
  ForeignKey,
  NullableForeignKey,
  Optional,
  PartitionKey,
  Searchable,
  SortKey
} from "../types.js";

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
 * Allow branded attributes (ForeignKey, Searchable) to be passed to the create/update
 * methods by using their inferred primitive type
 * Ex:
 *  If ModelA has: attr1: ForeignKey
 *  This allows" ModelA.create({ attr1: "someVal" })
 *  Instead of: ModelA.create({ attr1: "someVal" as ForeignKey })
 *
 * Each brand needs both a plain and an optional/nullable branch — a single
 * conditional fails against the optional form (EX: `Searchable | undefined`),
 * the same reason ForeignKey needs the separate NullableForeignKey branch
 */
export type ForeignKeyToValue<T> = {
  [K in keyof T]: T[K] extends NullableForeignKey
    ? Optional<string>
    : T[K] extends ForeignKey
      ? string
      : T[K] extends Searchable
        ? string
        : T[K] extends Optional<Searchable>
          ? Optional<string>
          : T[K] extends { readonly __searchFilterable: infer U }
            ? U
            : T[K] extends Optional<{ readonly __searchFilterable: infer U }>
              ? Optional<U>
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
 * Types that terminate dot-path recursion. These are considered leaf types
 * that should not be recursed into when generating filter key paths.
 */
export type NonRecursiveLeaf =
  | Date
  | unknown[]
  | DynaRecord
  | ((...args: never[]) => unknown);

/**
 * Maximum recursion depth for {@link DotPathKeys}.
 * Set to 5 to cover realistic DynamoDB Map attribute nesting (typically 2-3 levels)
 * while staying well below TypeScript's internal instantiation depth limit of 50.
 * Higher values risk combinatorial explosion with wide object schemas.
 */
type MaxDotPathDepth = 5;

/**
 * The list indexes a dot path may name.
 *
 * Literal indexes rather than `${number}`. A pattern template literal in the
 * key union becomes a pattern index signature on the filter record, and a
 * record with an index signature accepts any key when `query` infers its
 * `const F extends TypedFilterParams<T>` — which silently costs every entity
 * its unknown-key, wrong-key and wrong-type errors, not just the indexed ones.
 * Literal keys keep the record closed.
 *
 * Ten is the cap, so a filter can name one of the first ten elements. A
 * condition on a specific element is in practice a condition on an early one;
 * beyond that the question is "does any element match", which is `$contains`.
 * The expression builder itself has no cap — a higher index compiles and runs,
 * it just is not offered by the type.
 */
type ListIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/**
 * Recursively generates dot-separated key paths for plain object types.
 * Stops recursion at {@link NonRecursiveLeaf} types and at {@link MaxDotPathDepth} levels
 * to prevent "Type instantiation is excessively deep" errors.
 *
 * An array-valued field yields `name[n]` paths into its elements, for each
 * {@link ListIndex}, which is DynamoDB's document-path syntax for one element of
 * a List. A path *through* an array with no index is deliberately absent:
 * DynamoDB has no path meaning "every element", so such a condition can only
 * match nothing.
 *
 * @template T - The object type to generate paths for.
 * @template Depth - Internal depth counter (tuple). Do not provide externally.
 */
export type DotPathKeys<
  T,
  Depth extends unknown[] = []
> = Depth["length"] extends MaxDotPathDepth
  ? never
  : T extends NonRecursiveLeaf
    ? never
    : T extends object
      ? {
          [K in keyof T & string]:
            | K
            | (NonNullable<T[K]> extends readonly (infer Element)[]
                ?
                    | `${K}[${ListIndex}]`
                    | (DotPathKeys<
                        Element,
                        [...Depth, unknown]
                      > extends infer D extends string
                        ? `${K}[${ListIndex}].${D}`
                        : never)
                : DotPathKeys<T[K], [...Depth, unknown]> extends infer D extends
                      string
                  ? `${K}.${D}`
                  : never);
        }[keyof T & string]
      : never;

/**
 * For a given entity, produces all dot-path keys for its ObjectAttribute fields.
 * Checks each property: if it's a plain object (not a {@link NonRecursiveLeaf}),
 * generates "propName.nestedKey" paths.
 */
export type ObjectDotPaths<T extends DynaRecord> = {
  [K in keyof T & string]: Exclude<T[K], undefined> extends infer V
    ? V extends NonRecursiveLeaf
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
 *
 * Excludes:
 * - Relationship properties (via {@link EntityAttributesOnly})
 * - Function fields (via {@link EntityAttributesOnly})
 * - PartitionKeyAttribute and SortKeyAttribute
 * - `type` (handled separately by {@link AndFilterForEntities} for discriminated union narrowing)
 */
export type EntityFilterableKeys<T extends DynaRecord> =
  | Exclude<
      keyof EntityAttributesOnly<T> & string,
      PartitionKeyAttribute<T> | SortKeyAttribute<T> | "type"
    >
  | ObjectDotPaths<T>;
