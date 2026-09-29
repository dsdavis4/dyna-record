import type {
  BelongsToRelationship,
  RelationshipMetadata
} from "./metadata/index.js";
import type { NativeScalarAttributeValue } from "@aws-sdk/util-dynamodb";
import type DynaRecord from "./DynaRecord.js";

/**
 * A utility type for branding primitives to ensure type safety with unique identifiers.
 *
 * dyna-record brands some attributes on its own behalf — {@link ForeignKey},
 * {@link NullableForeignKey}, {@link Searchable} — and strips those brands
 * from every caller-facing input, so `create`, `update`, and search filters
 * all accept the plain underlying value. A brand you define with this type is
 * treated as the opposite: it exists precisely so that a bare value fails, so
 * it is never stripped and a caller must supply the branded value.
 *
 * The rule in one line: dyna-record strips its own brands, never yours.
 */
export type Brand<K, T> = K & { __brand: T };

/**
 * A branded string type to represent sort keys in DynamoDB tables
 */
export type SortKey = Brand<string, "SortKey">;

/**
 * A branded string type to represent partition keys in DynamoDB tables
 */
export type PartitionKey = Brand<string, "PartitionKey">;

/**
 * A branded string type to represent foreign keys in DynamoDB tables.
 *
 * @typeParam T - The entity that the foreign key references. Defaults to {@link DynaRecord}.
 */
export type ForeignKey<T extends DynaRecord = DynaRecord> = Brand<
  string,
  { kind: "ForeignKey"; entity: T }
>;

/**
 * A branded string type to represent nullable foreign keys in DynamoDB tables, which can also be undefined.
 *
 * @typeParam T - The entity that the foreign key references. Defaults to {@link DynaRecord}.
 */
export type NullableForeignKey<T extends DynaRecord = DynaRecord> = Optional<
  Brand<string, { kind: "NullableForeignKey"; entity: T }>
>;

/**
 * Represents a foreign key property on an entity within a DynaRecord model
 */
export type ForeignKeyProperty = keyof DynaRecord & ForeignKey;

/**
 * Resolves an attribute's declared type to the value a caller may pass for it,
 * by stripping the brands dyna-record imposes on its own behalf.
 *
 * A consumer never asked for {@link ForeignKey} or {@link Searchable} — the
 * library added them to track a relationship or an embedded field — so
 * requiring a caller to satisfy them would be the library's leak to clean up.
 * A consumer's own {@link Brand}, by contrast, exists precisely so that a
 * plain value fails, and is therefore passed through untouched. The rule in
 * one line: dyna-record strips its own brands, never yours.
 *
 * Branch order is load-bearing twice over:
 *
 * - `undefined` is tested first because {@link NullableForeignKey} includes
 *   `undefined` in its own definition. Unguarded, an optional attribute's
 *   `undefined` member matches that branch and widens the whole property to
 *   `string`.
 * - The {@link SearchFilterable} payload is recovered after the brand
 *   branches, so a filterable that wraps a library brand
 *   (`SearchFilterable<ForeignKey<T>>`) strips through the outer branch while
 *   a plain `SearchFilterable<string>` still reduces to `string` rather than
 *   falling through to pass-through and keeping its brand.
 *
 * Distribution over unions is what lets the optional forms share the branches
 * above instead of needing duplicates of their own.
 *
 * @typeParam T - The attribute's declared type.
 */
export type LibraryBrandToValue<T> = T extends undefined
  ? undefined
  : T extends NullableForeignKey
    ? string
    : T extends ForeignKey
      ? string
      : T extends Searchable
        ? string
        : T extends { readonly __searchFilterable: infer U }
          ? LibraryBrandToValue<U>
          : T;

/**
 * A branded string type marking an attribute as the entity's searchable text
 * for vector search. Apply the `@Searchable()` decorator over a string
 * attribute decorator to a property of this type.
 *
 * The brand never leaks into consumer ergonomics: `Searchable` is assignable
 * to `string` on read, and `create`/`update` inputs accept plain strings
 * (the brand is stripped by the input mapped types).
 *
 * @typeParam T - The underlying string type. Defaults to `string`.
 */
export type Searchable<T extends string = string> = Brand<T, "Searchable">;

/**
 * Brand for attributes declared as inline filters on the vector indexes
 * containing the entity. Apply the `@SearchFilterable()` decorator over the
 * attribute's base decorator; the decorator requires this brand on the
 * property type, which is how filter typing knows the exact declared
 * filterable set at compile time.
 *
 * The brand uses its own phantom key (not the shared `Brand` utility)
 * because filterables compose with other branded types — a foreign key
 * filterable is both a `ForeignKey` and filterable, and two brands sharing
 * one `__brand` key would annihilate in the intersection. The phantom key
 * also carries the underlying type so create/update inputs recover it.
 *
 * The brand never leaks into consumer ergonomics: it is assignable to its
 * underlying type on read, and create/update inputs and search filter values
 * accept plain values. That stripping applies to dyna-record's own brands
 * only — a consumer-defined {@link Brand} survives into every caller-facing
 * input, since requiring it is the whole reason it was declared.
 *
 * Nullable attributes compose: instantiate with the optional form of the
 * underlying type (EX: `SearchFilterable<NullableForeignKey<Brand>>` or
 * `SearchFilterable<Optional<string>>`). The conditional distributes over
 * the union so the property stays optional while the present value carries
 * the brand. Filters always take a defined value — a row where the
 * attribute is absent simply never matches an equality filter.
 */
export type SearchFilterable<T extends Optional<string | number> = string> =
  T extends undefined
    ? undefined
    : T & {
        readonly __searchFilterable: T;
      };

/**
 * Mutual assignability. Both sides are wrapped in tuples so a union does not
 * distribute, which would let a strict subset pass.
 *
 * Internal: exported so drift assertions elsewhere in `src` can use it, never
 * from the package entry point.
 */
export type Equals<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false;

/**
 * Whether `A` is assignable to `B`. The one-directional counterpart to
 * {@link Equals}, for types dyna-record deliberately narrows.
 */
export type Extends<A, B> = [A] extends [B] ? true : false;

/**
 * Fails compilation unless its argument is `true`.
 */
export type Assert<T extends true> = T;

/**
 * A single, indivisible value DynamoDB can store: the types its scalar
 * attribute comparisons, sort key conditions, and filter operands accept.
 *
 * dyna-record's own union rather than the SDK's `NativeScalarAttributeValue`,
 * which ends in an `InstanceType<{ new (...args: any[]): any }>` branch that
 * collapses the whole type to `any`. Owning it is what lets a filter value be
 * checked at all — a `Date`, a function, or a class instance is rejected here
 * rather than failing when the document client marshals it.
 *
 * `Date` is deliberately absent: dyna-record stores dates as ISO strings, so a
 * date is filtered and compared as the string it is stored as.
 */
export type DynamoScalarValue =
  | string
  | number
  | bigint
  | boolean
  | null
  | Uint8Array;

/**
 * Holds {@link DynamoScalarValue} within the SDK's own scalar union, so a type
 * the service stops supporting fails the build here rather than reaching
 * DynamoDB.
 *
 * One-directional on purpose: dyna-record's union is deliberately the narrower
 * one. It omits `undefined` (which belongs to {@link DynamoNativeValue}, since
 * only a whole attribute can be absent), the `NumberValue` wrapper (which
 * appears only under `unmarshallOptions.wrapNumbers`, rejected on a supplied
 * client), and the wider binary union, since dyna-record models no binary
 * attribute type.
 *
 * Type-only and unexported: nothing is emitted for it, so the SDK type is named
 * without reappearing in dyna-record's published declarations.
 */
type _DynamoScalarValueIsStorable = Assert<
  Extends<DynamoScalarValue, NativeScalarAttributeValue>
>;

/**
 * Any value DynamoDB can store under an attribute, including the documents and
 * sets it composes from {@link DynamoScalarValue}.
 *
 * The recursive counterpart to the scalar union, and the type of a table
 * item's values. Mirrors the SDK's `NativeAttributeValue` minus the two
 * branches that made it `any`: the class-instance escape hatch, and the
 * `NumberValue` wrapper that only appears under `unmarshallOptions.wrapNumbers`,
 * which dyna-record rejects on a supplied client.
 */
export type DynamoNativeValue =
  | DynamoScalarValue
  | undefined
  | DynamoNativeValue[]
  | Set<string>
  | Set<number>
  | Set<bigint>
  | Set<Uint8Array>
  | { [key: string]: DynamoNativeValue };

/**
 * Defines a general type for items stored in a DynamoDB table, using string keys and native attribute values.
 */
export type DynamoTableItem = Record<string, DynamoNativeValue>;

/**
 * A utility type for objects with string keys and string values.
 */
export type StringObj = Record<string, string>;

/**
 * A utility type for making a type optional, allowing it to be undefined.
 */
export type Optional<T> = T | undefined;

/**
 * A utility type for making a type nullable, allowing it to be null.
 */
export type Nullable<T> = T | null;

/**
 * Represents a lookup object to access relationship metadata by related entity name for DynaRecord models.
 */
export type RelationshipLookup = Record<string, RelationshipMetadata>;

/**
 * An object structure for holding relationship metadata, aimed at optimizing lookup operations and iterations.
 */
export interface RelationshipMetaObj {
  relationsLookup: RelationshipLookup;
  belongsToRelationships: BelongsToRelationship[];
}

/**
 * A utility type for modifying certain keys of an object type to be optional.
 */
export type MakeOptional<T, K extends keyof T> = Omit<T, K> &
  Partial<Pick<T, K>>;

/**
 * Detects the `any` type. Resolves to `true` when T is `any`, `false` otherwise.
 * Used internally to guard against `any` propagation from third-party types.
 */
export type IsAny<T> = 0 extends 1 & T ? true : false;

/**
 * Represents the constructor type of a class decorated with the `@Entity` decorator.
 *
 * The `@Entity` decorator enforces at compile time that each entity declares
 * `readonly type` as a string literal matching the class name. If the declaration
 * is missing, the decorator produces a type error. See {@link Entity} for details.
 */
export type EntityClass<T> = (new () => T) & typeof DynaRecord;

/**
 * Make a single property of an object required
 */
export type WithRequired<T, K extends keyof T> = Omit<T, K> & {
  [P in K]-?: T[P];
};
