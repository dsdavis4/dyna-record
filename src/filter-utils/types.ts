import { type QueryCommandInput } from "@aws-sdk/lib-dynamodb";
import { type NativeAttributeValue } from "@aws-sdk/util-dynamodb";
import { type ZodType } from "zod";
import type DynaRecord from "../DynaRecord.js";
import type { EntityAttributesOnly } from "../operations/types.js";

/**
 * Represents conditions used to specify the partition key and sort key (if applicable) for querying items in DynamoDB.
 *
 * @type {KeyConditions} - Derived from the `KeyConditions` part of the `QueryCommandInput` from AWS SDK, excluding the "undefined" type to ensure type safety.
 */
export type KeyConditions = Omit<
  QueryCommandInput["KeyConditions"],
  "undefined"
>;

/**
 * Defines the structure for a filter expression used in querying items, including the expression string and a record of values associated with the expression placeholders.
 *
 * @property {Record<string, NativeAttributeValue>} values - A mapping of placeholder tokens in the filter expression to their actual values.
 * @property {string} expression - The filter expression string, using DynamoDB's expression syntax.
 */
export interface FilterExpression {
  values: Record<string, NativeAttributeValue>;
  expression: string;
}

/**
 * Represents a filter condition specifying that a value must begin with a certain prefix.
 *
 * @type {BeginsWithFilter} - A record with "$beginsWith" key pointing to the prefix value.
 */
export type BeginsWithFilter = Record<"$beginsWith", NativeAttributeValue>;

/**
 * Represents a filter condition specifying that a list contains a given element, or a string contains a given substring.
 * Maps to the DynamoDB `contains()` function.
 *
 * Works with both top-level attributes and nested `@ObjectAttribute` fields via dot-path notation.
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
export type ContainsFilter = Record<"$contains", NativeAttributeValue>;

/**
 * Defines possible types of values that can be used in a filter condition, including begins with, contains, exact value, or an array for "IN" conditions.
 *
 * Filter keys support dot-path notation for nested `@ObjectAttribute` Map fields (e.g., `"address.city"`).
 *
 * @type {FilterTypes} - A union of `BeginsWithFilter`, `ContainsFilter`, a single scalar value, or an array of scalar values.
 */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents -- NativeAttributeValue is 'any' from AWS SDK */
export type FilterTypes =
  | BeginsWithFilter
  | ContainsFilter
  | NativeAttributeValue
  | NativeAttributeValue[];
/* eslint-enable @typescript-eslint/no-redundant-type-constituents */

/**
 * Represents a filter condition using an AND logical operator. All items in this record will be queried with "AND"
 *
 * @type {AndFilter} - A record mapping attribute names to their filter conditions, implying all conditions must be met (AND logic).
 */
export type AndFilter = Record<string, FilterTypes>;

/**
 * Represents a filter condition using an OR logical operator, allowing for grouping of multiple `AndFilter` conditions under a single '$or' key.
 *
 * @type {OrFilter} - A record with an "$or" key containing an array of `AndFilter` objects, indicating any of the conditions can be met (OR logic).
 */
export type OrFilter = Record<"$or", AndFilter[]>;

/**
 * Makes the '$or' key optional in an `OrFilter`, allowing for filters that primarily use AND logic but optionally include OR conditions.
 *
 * @type {OrOptional} - An `OrFilter` type with the '$or' key made optional.
 */
export type OrOptional = Omit<OrFilter, "$or"> & Partial<Pick<OrFilter, "$or">>;

/**
 * Combines `AndFilter` and `OrFilter` types, supporting complex filters that use both AND and OR logic within the same filter structure.
 *
 * @type {FilterParams} - A combination of `AndFilter` or `OrFilter` with optional OR conditions.
 */
export type FilterParams = (AndFilter | OrFilter) & OrOptional;

/**
 * Represents complex filters combining AND and OR logic, specifically allowing for an 'OrFilter' at the top level.
 *
 * @type {AndOrFilter} - A `FilterParams` type further combined with an `OrFilter` for additional flexibility.
 */
export type AndOrFilter = FilterParams & OrFilter;

// ─── Capability-Parameterized Expression Building ───────────────────────────

/**
 * Declares the filter vocabulary a context supports. The
 * {@link FilterExpressionBuilder} enforces the capability set at runtime,
 * rejecting any condition outside it with a {@link FilterError} — the
 * compile-time filter typings are erased for plain JS callers, so every
 * context-specific restriction is backed by a capability here.
 *
 * @property {string} context - Human readable name of the filter context (EX: "query"), used in error messages.
 * @property {boolean} or - Whether `$or` condition blocks are supported.
 * @property {boolean} in - Whether "IN" conditions (array values) are supported.
 * @property {boolean} beginsWith - Whether `$beginsWith` conditions are supported.
 * @property {boolean} contains - Whether `$contains` conditions are supported.
 * @property {boolean} nestedPaths - Whether dot-path notation for nested Map attributes is supported.
 * @property {boolean} singleConditionPerAttribute - When true, at most one condition may target a given attribute across the lifetime of a builder instance.
 */
export interface FilterCapabilities {
  context: string;
  or: boolean;
  in: boolean;
  beginsWith: boolean;
  contains: boolean;
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
 * Scalar values accepted by vector search filter conditions. DynamoDB's
 * `SearchConditionExpression` is an equality-only conjunction, so operator
 * objects (`$beginsWith`, `$contains`), "IN" arrays, and `$or` blocks are not
 * representable — value types are restricted to scalars accordingly.
 */
export type SearchFilterValue = string | number | boolean;

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
export type SearchFilterParams<Entities extends DynaRecord = DynaRecord> = {
  [K in SearchFilterableKeysFor<Entities>]?: SearchFilterValue;
} & { type?: never; $or?: never };
