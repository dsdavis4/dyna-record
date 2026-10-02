import { type ZodType } from "zod";
import type { AttributeKind, Serializers } from "../metadata/types.js";
import type { ObjectSchema } from "../decorators/attributes/types.js";
import type DynaRecord from "../DynaRecord.js";
import type { EntityAttributesOnly } from "../operations/types.js";
import type {
  AtLeastOne,
  ExactlyOne,
  DynamoNativeValue,
  DynamoScalarValue,
  LibraryBrandToValue,
  Optional
} from "../types.js";

/**
 * The condition an attribute must satisfy in a key condition.
 *
 * The value it equals, a {@link BeginsWithFilter} prefix, a single comparison,
 * or a {@link BetweenFilter} range — the vocabulary DynamoDB accepts on a sort
 * key. The comparison does not compose, because the expression has room for one
 * condition there; a two-sided range is `$between`.
 *
 * Built from the same per-operator gates {@link FilterConditionFor} uses, which
 * makes it a structural subset of {@link FilterTypes} — so one compilation path
 * can take either without widening a value to `any`.
 */
export type SortKeyCondition =
  | BeginsWithConditionFor<FilterValue>
  | SingleComparisonConditionFor<FilterValue>
  | BetweenConditionFor<FilterValue>
  | FilterValue;

/**
 * Represents conditions used to specify the partition key and sort key (if applicable) for querying items in DynamoDB.
 *
 * Keys are attribute names; each value is that attribute's
 * {@link SortKeyCondition}.
 */
export type KeyConditions = Record<string, Optional<SortKeyCondition>>;

/**
 * Defines the structure for a filter expression used in querying items, including the expression string and a record of values associated with the expression placeholders.
 *
 * @property {Record<string, DynamoNativeValue>} values - A mapping of placeholder tokens in the filter expression to their actual values.
 * @property {string} expression - The filter expression string, using DynamoDB's expression syntax.
 */
export interface FilterExpression {
  values: Record<string, DynamoNativeValue>;
  expression: string;
}

/**
 * Matches values starting with a given prefix. Maps to the DynamoDB
 * `begins_with()` function.
 *
 * The prefix is a fragment of the **stored** form, not a value of the
 * attribute, so it stays a string whatever the attribute declares. That is how
 * a date is matched by partial value: a date attribute is stored as an ISO 8601
 * string, so a year is a prefix of it.
 *
 * Offered only where the stored form can carry a prefix — a String — so it is
 * absent from a number, boolean or Map attribute. See
 * {@link BeginsWithConditionFor}.
 *
 * @example
 * ```typescript
 * // Everything in a given year, on an attribute declared as a Date
 * filter: { createdAt: { $beginsWith: "2026" } }
 *
 * // A prefix of a nested string field
 * filter: { "address.street": { $beginsWith: "123" } }
 *
 * // Narrow a query to one entity type within the partition
 * skCondition: { $beginsWith: "Order" }
 * ```
 */
export type BeginsWithFilter = Record<"$beginsWith", string>;

/**
 * Represents a filter condition specifying that a list contains a given element, or a string contains a given substring.
 * Maps to the DynamoDB `contains()` function.
 *
 * Works with both top-level attributes and nested `@ObjectAttribute` fields via dot-path notation.
 *
 * Offered only where the stored form can carry it — a String, a List or a Set —
 * so it is absent from a number, boolean or Map attribute. See
 * {@link ContainsConditionFor}.
 *
 * @type {ContainsFilter} - A record with "$contains" key pointing to the value to check for.
 *
 * @example
 * ```typescript
 * // Check if a List attribute contains an element
 * filter: { tags: { $contains: "vip" } }
 *
 * // Check on a nested List via dot-path
 * filter: { "address.tags": { $contains: "home" } }
 *
 * // Check if a string attribute contains a substring
 * filter: { name: { $contains: "john" } }
 * ```
 */
export type ContainsFilter = Record<"$contains", DynamoScalarValue>;

/**
 * A value a filter condition may carry, named as the entity declares it.
 *
 * Wider than {@link DynamoScalarValue}, which is what the table stores: a
 * caller filters a date attribute with a `Date`, and the expression builder
 * converts it to the ISO string the table holds through the attribute's
 * serializers.
 */
export type FilterValue = DynamoScalarValue | Date;

/**
 * A value an ordered comparison may carry: a {@link FilterValue} DynamoDB can
 * order.
 *
 * `<`, `<=`, `>`, `>=` and `BETWEEN` require *comparable* operands, which
 * DynamoDB defines as String, Number and Binary. A boolean is excluded because
 * there is no ordering between two of them, and `null` because dyna-record
 * removes a nulled attribute rather than storing DynamoDB's NULL — so a
 * comparison against either asks for something no row can satisfy.
 *
 * A `Date` is included through its stored form: an ISO 8601 string orders
 * lexicographically exactly as the `Date` orders chronologically.
 *
 * Equality still accepts whatever the attribute's own type admits. This narrows
 * only the operators that impose an order.
 */
export type OrderedFilterValue = Exclude<FilterValue, boolean | null>;

/**
 * Comparison conditions on one attribute, compiling to DynamoDB's `<`, `<=`,
 * `>` and `>=`.
 *
 * Several may be supplied together and compose with AND, which is how a
 * half-open range is written: `{ $gte: start, $lt: end }`. At least one is
 * required — an empty object is no condition at all.
 *
 * Every operand is a whole value of the attribute, so each is validated and
 * converted the way an equality value is. `null` is not among them:
 * {@link FilterConditionFor} excludes it, because dyna-record removes a nulled
 * attribute rather than storing DynamoDB's NULL, leaving nothing for an ordered
 * comparison to match.
 *
 * @example
 * ```typescript
 * // One bound
 * filter: { total: { $gte: 50 } }
 *
 * // Two compose with AND, which is how a half-open range is written
 * filter: { createdAt: { $gte: new Date("2026-01-01"), $lt: new Date("2026-02-01") } }
 * ```
 */
export type ComparisonFilter<V> = AtLeastOne<{
  $gt: V;
  $gte: V;
  $lt: V;
  $lte: V;
}>;

/**
 * A single comparison condition, for a context with room for exactly one.
 *
 * A key condition's sort key takes one condition, so the operators that compose
 * in a filter cannot compose there — a two-sided key range is
 * {@link BetweenFilter}. {@link ExactlyOne} makes the second operand an error
 * rather than leaving it to the runtime rejection.
 *
 * @example
 * ```typescript
 * // Valid: one condition on the sort key
 * skCondition: { $gte: "Order#100" }
 *
 * // A compile error: use $between for a two-sided key range
 * skCondition: { $gte: "Order#100", $lt: "Order#200" }
 * ```
 */
export type SingleComparisonFilter<V> = ExactlyOne<{
  $gt: V;
  $gte: V;
  $lt: V;
  $lte: V;
}>;

/**
 * A condition matching values within an inclusive range, compiling to
 * DynamoDB's `BETWEEN`.
 *
 * The pair is ordered: the first bound is the lower one. DynamoDB accepts an
 * inverted pair and silently matches nothing, so the expression builder rejects
 * it instead.
 *
 * Both bounds are operands of the same kind as an equality value — whole values
 * of the attribute, and never `null` — so both are validated and converted. A
 * half-open range is expressed with {@link ComparisonFilter} instead:
 * `{ $gte: start, $lt: end }`.
 *
 * @example
 * ```typescript
 * // Inclusive on both bounds
 * filter: { total: { $between: [50, 100] } }
 *
 * // On an attribute declared as a Date, the bounds are Dates
 * filter: { createdAt: { $between: [new Date("2026-01-01"), new Date("2026-12-31")] } }
 *
 * // A two-sided range on a sort key, where the comparators cannot compose
 * skCondition: { $between: ["Order#100", "Order#200"] }
 * ```
 */
export type BetweenFilter<V> = Record<"$between", readonly [V, V]>;

/**
 * The comparison operators, offered only where DynamoDB can order the
 * attribute's stored form.
 *
 * `<`, `<=`, `>`, `>=` take comparable operands — String, Number and Binary. A
 * boolean, a Map and a List have no ordering, so a comparison on one holds for
 * no row and DynamoDB reports nothing about it. A date keeps its comparisons
 * through its stored form, as an ISO string that orders chronologically.
 *
 * Each branch tests `V` directly so the conditional distributes, for the same
 * reason {@link BeginsWithConditionFor} does: an unresolved dot path takes the
 * whole scalar union and stays unconstrained. Distribution is also what
 * excludes `null` and `boolean` without an explicit `Exclude` — neither extends
 * the comparable set, so both fall to the final branch.
 *
 * @typeParam V - The attribute's declared type.
 */
export type ComparisonConditionFor<V> = V extends Date
  ? ComparisonFilter<V>
  : V extends string | number | bigint | Uint8Array
    ? ComparisonFilter<V>
    : never;

/**
 * A single comparison, offered only where DynamoDB can order the attribute's
 * stored form.
 *
 * The key condition counterpart of {@link ComparisonConditionFor}: same
 * comparability rule, but the operators do not compose, because the expression
 * has room for one condition on the sort key.
 *
 * @typeParam V - The attribute's declared type.
 */
export type SingleComparisonConditionFor<V> = V extends Date
  ? SingleComparisonFilter<V>
  : V extends string | number | bigint | Uint8Array
    ? SingleComparisonFilter<V>
    : never;

/**
 * `$between`, offered only where DynamoDB can order the attribute's stored
 * form.
 *
 * `BETWEEN` is a pair of comparisons, so it takes exactly the operands
 * {@link ComparisonConditionFor} does.
 *
 * @typeParam V - The attribute's declared type.
 */
export type BetweenConditionFor<V> = V extends Date
  ? BetweenFilter<V>
  : V extends string | number | bigint | Uint8Array
    ? BetweenFilter<V>
    : never;

/**
 * `$beginsWith`, offered only where the table stores the attribute in a form
 * `begins_with` applies to.
 *
 * DynamoDB's `begins_with` takes a String or a Binary attribute. The **stored**
 * form decides, not the declared one, which is why a date attribute keeps it:
 * declared `Date`, stored as an ISO string, and matching a date by year prefix
 * is what the operator is for there. A number, a boolean, a Map or a List has
 * no prefix, so `begins_with` on one matches nothing and DynamoDB reports no
 * error — the condition is better removed from the type than compiled.
 *
 * Each branch tests `V` directly so the conditional distributes. That matters
 * for a value whose type is a union: an unresolved dot path takes the whole
 * scalar union, which includes `string`, and stays unconstrained — the
 * behavior such a path has always had. Testing a mapped form of `V` instead
 * would compare the union as a whole and drop the operator from every one.
 *
 * @typeParam V - The attribute's declared type.
 */
export type BeginsWithConditionFor<V> = V extends Date
  ? BeginsWithFilter
  : V extends string | Uint8Array
    ? BeginsWithFilter
    : never;

/**
 * `$contains`, offered only where the table stores the attribute in a form
 * `contains` applies to.
 *
 * DynamoDB's `contains` tests a substring of a String, or membership of a List
 * or a Set. A String-stored attribute — including a date, an enum and a foreign
 * key — takes the substring reading; an array-typed field takes the membership
 * one. A number, a boolean and a Map take neither.
 *
 * Distributes for the same reason {@link BeginsWithConditionFor} does.
 *
 * @typeParam V - The attribute's declared type.
 */
export type ContainsConditionFor<V> = V extends Date
  ? ContainsFilter
  : V extends string
    ? ContainsFilter
    : V extends readonly unknown[]
      ? ContainsFilter
      : never;

/**
 * The conditions a filter key accepts for a value of type `V`: the value
 * itself, a list of them for an `IN` condition, or an operator object.
 *
 * Parameterized because the same members are offered over three different
 * value domains — what a caller may write ({@link FilterTypes}), what a nested
 * field must be written as ({@link StoredFilterTypes}), and what one attribute
 * declares (`QueryFilterValue`). Naming the shape once is what keeps a new
 * operator from reaching two of them and not the third.
 *
 * Two kinds of operand live here, and which kind an operator takes is the one
 * rule that decides whether its value is validated against the attribute's
 * schema and converted to the form the table stores:
 *
 * - A **whole value** of the attribute — an equality value, every `IN` element,
 *   every {@link ComparisonFilter} operand, both {@link BetweenFilter} bounds.
 *   Named the way the entity declares the attribute, so a date attribute takes
 *   a `Date`. Validated and converted.
 * - A **fragment** of the stored form — {@link BeginsWithFilter}'s prefix, and
 *   {@link ContainsFilter}'s substring. There is no "Date that starts with
 *   2026", so these stay strings and scalars whatever the attribute declares,
 *   and are neither validated nor converted. Being a piece of the stored form
 *   also decides *whether* the operator is offered: see
 *   {@link BeginsWithConditionFor} and {@link ContainsConditionFor}.
 *
 * An operator added here declares which kind it takes and gets both behaviors
 * from that, rather than each compilation branch deciding for itself.
 */
export type FilterConditionFor<V> =
  | BeginsWithConditionFor<V>
  | ContainsConditionFor<V>
  | ComparisonConditionFor<V>
  | BetweenConditionFor<V>
  | V
  | V[];

/**
 * Every condition a filter key accepts, over the values a caller may write.
 *
 * A value to match, an array of them for an "IN" condition, a comparison, a
 * `$between` range, a `$beginsWith` prefix or a `$contains` check. Which of
 * those a given attribute actually offers depends on the form the table stores
 * it in — see {@link FilterConditionFor}.
 *
 * Filter keys support dot-path notation for nested `@ObjectAttribute` Map
 * fields (e.g., `"address.city"`).
 *
 * @example
 * ```typescript
 * filter: { name: "Scale-A" }                    // equality
 * filter: { name: ["Scale-A", "Scale-B"] }       // IN
 * filter: { total: { $gte: 50, $lt: 100 } }      // a half-open range
 * filter: { total: { $between: [50, 100] } }     // an inclusive range
 * filter: { createdAt: { $beginsWith: "2026" } } // a prefix of the stored form
 * filter: { tags: { $contains: "vip" } }         // List membership
 * ```
 */
export type FilterTypes = FilterConditionFor<FilterValue>;

/**
 * The conditions a key accepts when it names no single declared field — a dot
 * path descending through an array element or a discriminated union variant,
 * which one path does not identify.
 *
 * The expression builder neither validates nor converts such a value, so it has
 * to be written the way the table stores it.
 */
export type StoredFilterTypes = FilterConditionFor<DynamoScalarValue>;

/**
 * Represents a filter condition using an AND logical operator. All items in this record will be queried with "AND"
 *
 * @type {AndFilter} - A record mapping attribute names to their filter conditions, implying all conditions must be met (AND logic).
 */
export type AndFilter = Record<string, FilterTypes | undefined>;

/**
 * Represents a filter condition using an OR logical operator, allowing for grouping of multiple `AndFilter` conditions under a single '$or' key.
 *
 * @type {OrFilter} - A record with an "$or" key containing an array of `AndFilter` objects, indicating any of the conditions can be met (OR logic).
 */
export type OrFilter = Record<"$or", AndFilter[]>;

/**
 * Combines `AndFilter` and `OrFilter` types, supporting complex filters that use both AND and OR logic within the same filter structure.
 *
 * @type {FilterParams} - A combination of `AndFilter` or `OrFilter` with optional OR conditions.
 */
export type FilterParams = {
  /**
   * Condition blocks combined with OR. Declared alongside the index signature
   * because its value is a list of blocks rather than an attribute condition
   */
  $or?: AndFilter[];
  [attributeName: string]: FilterTypes | AndFilter[] | undefined;
};

/**
 * Represents complex filters combining AND and OR logic, specifically allowing for an 'OrFilter' at the top level.
 *
 * @type {AndOrFilter} - A `FilterParams` type further combined with an `OrFilter` for additional flexibility.
 */
export type AndOrFilter = FilterParams & OrFilter;

// ─── Capability-Parameterized Expression Building ───────────────────────────

/**
 * The context a rejection names, as a full noun phrase.
 *
 * A phrase rather than an adjective because a key condition is not a filter,
 * and a message reading "key condition filters" would name something that does
 * not exist. A closed union rather than `string` because these are every
 * context there is — `capabilities.ts` is the only place a capability set is
 * constructed — so a new context must be declared here before a message can
 * name it, and a typo cannot reach a caller.
 */
export type FilterContext =
  | "query filters"
  | "search filters"
  | "key conditions";

/**
 * Declares the filter vocabulary a context supports. The
 * {@link FilterExpressionBuilder} enforces the capability set at runtime,
 * rejecting any condition outside it with a {@link FilterError} — the
 * compile-time filter typings are erased for plain JS callers, so every
 * context-specific restriction is backed by a capability here.
 *
 * @property {FilterContext} context - The context a rejection names.
 * @property {boolean} or - Whether `$or` condition blocks are supported.
 * @property {boolean} in - Whether "IN" conditions (array values) are supported.
 * @property {boolean} beginsWith - Whether `$beginsWith` conditions are supported.
 * @property {boolean} contains - Whether `$contains` conditions are supported.
 * @property {boolean} nestedPaths - Whether dot-path notation for nested Map attributes is supported.
 * @property {boolean} singleConditionPerAttribute - When true, at most one condition may target a given attribute across the lifetime of a builder instance.
 */
export interface FilterCapabilities {
  context: FilterContext;
  or: boolean;
  in: boolean;
  beginsWith: boolean;
  contains: boolean;
  /**
   * Whether `$gt`, `$gte`, `$lt` and `$lte` conditions are supported.
   */
  comparison: boolean;
  /**
   * Whether several comparison operators on one attribute may compose with AND.
   *
   * A filter may: `{ $gte: start, $lt: end }` is how a half-open range is
   * written. A key condition may not — DynamoDB allows exactly one condition on
   * the sort key, so a two-sided key range is `$between` instead.
   */
  composedComparisons: boolean;
  /**
   * Whether `$between` conditions are supported.
   */
  between: boolean;
  nestedPaths: boolean;
  singleConditionPerAttribute: boolean;
}

/**
 * A filter attribute resolved through a context's attribute-metadata resolver.
 *
 * @property {string} alias - The name of the attribute as defined in the database table.
 * @property {ZodType?} type - Optional zod validator applied to condition values on the attribute. When present, condition values that do not match the schema are rejected with a {@link FilterError}.
 */
export interface FilterAttribute {
  alias: string;
  type?: ZodType;
  /**
   * The attribute's kind, which decides the form the table stores it in and so
   * which fragment operators apply to it. Optional because a context whose
   * capability set rejects those operators outright — vector search — has no
   * use for it.
   */
  kind?: AttributeKind;
  /**
   * The attribute's serializers, when its stored form differs from its declared
   * one. See `FilterExpressionBuilder.toStoredValue` for where they are applied
   * and to which parts of a condition.
   */
  serializers?: Serializers;
  /**
   * The attribute's object schema, when it is an `@ObjectAttribute`. A dot-path
   * condition resolves through this to the field it names, so a nested value is
   * validated and converted as that field rather than as the whole object.
   */
  objectSchema?: ObjectSchema;
}

/**
 * Resolves a filter attribute key to its {@link FilterAttribute}. Each filter
 * context supplies its own resolver (EX: an entity-and-relationships resolver
 * for queries, an index-member resolver for vector searches). Rejects keys
 * that are not filterable in the context by throwing.
 *
 * @param attributeKey - The attribute key being filtered on. For dot-path keys this is the top level segment.
 * @param filterKey - The full filter key as provided by the caller, for error messages.
 */
export type FilterAttributeResolver = (
  attributeKey: string,
  filterKey: string
) => FilterAttribute;

// ─── Search Filter Types ────────────────────────────────────────────────────

/**
 * Scalar values a vector search filter condition may take.
 *
 * Two constraints narrow this. DynamoDB's `SearchConditionExpression` is an
 * equality-only conjunction, so operator objects (`$beginsWith`,
 * `$contains`), "IN" arrays, and `$or` blocks are not representable. And
 * every inline filter attribute must be declared in the table's
 * `AttributeDefinitions`, whose `ScalarAttributeType` set is `B | N | S` — so
 * a filter value is a string or a number, never a boolean, and binary is not
 * modeled by this library.
 *
 * This is the bound on what a filterable attribute may declare, not the type
 * a given filter key accepts; {@link SearchFilterParams} resolves that from
 * the attribute's own declaration.
 */
export type SearchFilterValue = string | number;

/**
 * The runtime shape of vector search filter conditions: equality-only
 * scalar conditions keyed by attribute name. `$or` blocks and the `type`
 * discriminator are rejected at the type level (and at runtime for plain JS
 * callers — operator objects and arrays are likewise rejected by the search
 * capability set). The public search surfaces narrow the accepted keys to the
 * searched entities' `@SearchFilterable` attributes via
 * {@link SearchFilterParams}.
 */
export type SearchFilter = Record<string, Optional<SearchFilterValue>> & {
  type?: never;
  $or?: never;
};

/**
 * Union of a single entity's attribute keys that can appear in a search
 * filter: exactly the attributes carrying the `SearchFilterable` brand,
 * which the `@SearchFilterable()` decorator requires on the property type.
 * The declared filterable set is therefore enforced at compile time; the
 * runtime guard remains authoritative for plain JS callers.
 */
type SearchFilterableKeys<E extends DynaRecord> = {
  [K in keyof EntityAttributesOnly<E> & string]: NonNullable<
    EntityAttributesOnly<E>[K]
  > extends { readonly __searchFilterable: unknown }
    ? K
    : never;
}[keyof EntityAttributesOnly<E> & string];

/**
 * Union of search filterable keys across a set of entities (distributive).
 */
type SearchFilterableKeysFor<Entities extends DynaRecord> =
  Entities extends DynaRecord ? SearchFilterableKeys<Entities> : never;

/**
 * Filter conditions accepted by a vector search, scoped to the searched
 * member entities. Vector search filters are an equality-only conjunction:
 * every condition is `attribute = value` with a scalar value, all conditions
 * are joined with AND, and at most one condition may target an attribute.
 *
 * `$or` blocks, `$beginsWith`/`$contains` operator objects, and "IN" arrays
 * are rejected at compile time (and at runtime for plain JS callers). The
 * `type` discriminator is also rejected — narrowing a search to specific
 * member entities belongs to the search `in:` option.
 *
 * @template Entities - The union of member entity types being searched.
 */
/**
 * The value a single filterable attribute accepts, recovered from its
 * declaration rather than widened to every scalar.
 *
 * The `SearchFilterable` brand carries the declared type in its phantom key
 * precisely so it can be read back here; that payload then passes through
 * {@link LibraryBrandToValue}, so a filterable foreign key takes a plain
 * string while a consumer's own brand survives. `NonNullable` is applied to
 * the attribute before the payload is inferred because a filter condition
 * always takes a defined value — a row missing the attribute never matches an
 * equality filter on it — which also means the inferred payload can never
 * carry `undefined` and needs no second unwrapping.
 *
 * Resolves to `never` for anything not carrying the brand, which keeps a
 * non-filterable attribute out of the accepted key set.
 *
 * @typeParam V - The attribute's declared type.
 */
export type SearchFilterableValue<V> =
  NonNullable<V> extends { readonly __searchFilterable: infer U }
    ? LibraryBrandToValue<U>
    : never;

/**
 * The value a filter key accepts across the entities being searched.
 *
 * Distributes over the member union, so the result is the union of the
 * declared types of exactly those members that declare `K` — a key declared by
 * one member contributes only that member's type, and members that do not
 * declare it contribute `never`, which vanishes from the union. This mirrors
 * the runtime resolver, which already builds a zod union across members that
 * register different types for one filterable property.
 *
 * `in:` narrowing needs no separate handling: the search options type passes
 * the already-narrowed member union, so a narrowed search resolves against one
 * member's declarations alone.
 *
 * @typeParam Entities - The union of member entities being searched.
 * @typeParam K - The filter key.
 */
export type SearchFilterValueFor<
  Entities extends DynaRecord,
  K
> = Entities extends DynaRecord
  ? K extends keyof EntityAttributesOnly<Entities>
    ? SearchFilterableValue<EntityAttributesOnly<Entities>[K]>
    : never
  : never;

export type SearchFilterParams<Entities extends DynaRecord = DynaRecord> = {
  [K in SearchFilterableKeysFor<Entities>]?: SearchFilterValueFor<Entities, K>;
} & { type?: never; $or?: never };
