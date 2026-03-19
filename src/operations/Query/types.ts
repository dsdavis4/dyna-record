import type DynaRecord from "../../DynaRecord";
import type {
  KeyConditions as QueryKeyConditions,
  QueryOptions as QueryBuilderOptions,
  FilterTypes,
  SortKeyCondition
} from "../../query-utils";
import type { IsAny, PartitionKey, SortKey } from "../../types";
import type {
  EntityAttributesInstance,
  EntityFilterableKeys
} from "../types";

/**
 * Extends the basic query builder options by adding an optional sort key condition for more precise querying capabilities.
 *
 * @extends QueryBuilderOptions - Base query options provided by the query utilities.
 * @property {SortKeyCondition?} skCondition - An optional condition for the sort key to further refine the query. This can be an exact match condition or a condition specifying a range or beginning match for the sort key.
 */
export type QueryOptions = QueryBuilderOptions & {
  /**
   * Condition to query sort key by
   */
  skCondition?: SortKeyCondition;
};

/**
 * Options for querying without an index.
 *
 * Omits `indexName`, `filter`, and `skCondition` from {@link QueryOptions}.
 * The `filter` property is re-declared using {@link TypedFilterParams} for compile-time
 * key validation. The `skCondition` property is omitted here and re-added at the query
 * overload level with a `const SK` generic parameter for literal type inference and
 * return type narrowing.
 *
 * The query overload also re-declares `filter` with a `const F` generic parameter to
 * enable literal type inference for return type narrowing. Both declarations are required:
 * this one provides excess property checking on object literals, while the generic
 * provides literal type capture for return type inference.
 *
 * @template T - The entity type being queried. Defaults to `DynaRecord` for backward
 * compatibility in generic contexts.
 */
export type OptionsWithoutIndex<T extends DynaRecord = DynaRecord> = Omit<
  QueryOptions,
  "indexName" | "filter" | "skCondition"
> & {
  filter?: TypedFilterParams<T>;
};

/**
 *  Options for querying on an index. Consistent reads are not allowed
 */
export type OptionsWithIndex = QueryBuilderOptions & {
  indexName: string;
  // If indexName is provided, consistentRead is not allowed (or must be false)
  consistentRead?: false;
};

/**
 * Defines key conditions for querying entities based on their keys.
 *
 * PartitionKey is required, SortKey is optional. The SortKey value is typed
 * to only accept valid entity names from the partition (or entity name prefixes),
 * matching dyna-record's single-table sort key format.
 *
 * @template T - The type of the entity being queried, extending `DynaRecord`.
 */
export type EntityKeyConditions<T extends DynaRecord = DynaRecord> = {
  // For each key in T that is a PartitionKey, make it required.
  [K in keyof T as T[K] extends PartitionKey ? K : never]-?: string;
} & {
  // For each key in T that is a SortKey, make it optional.
  // Uses TypedSortKeyCondition<T> to validate sort key values against
  // partition entity names, matching dyna-record's single-table SK format.
  [K in keyof T as T[K] extends SortKey ? K : never]?: TypedSortKeyCondition<T>;
};

/**
 * Key conditions when querying on an index. Can be any attribute on the entity but must be the keys of the given index
 */
export type IndexKeyConditions<T> = {
  [K in keyof T]?: QueryKeyConditions;
};

/**
 * Asserts that a given type `E` extends `DynaRecord`. If `E` does not extend `DynaRecord`, it resolves to `never`.
 *
 * This is used to enforce that only valid `DynaRecord` types are included in relationships or other dependent types.
 *
 * @template E - The type to assert.
 */
export type AssertDynaRecord<E> = E extends DynaRecord ? E : never;

/**
 * Extracts the keys of a `DynaRecord` type `T` whose properties are either a `DynaRecord` or an array of `DynaRecord`.
 *
 * This type is used to identify properties in a `DynaRecord` that represent relationships to other entities.
 *
 * @template T - The `DynaRecord` type to evaluate.
 * @returns A union of property names in `T` that represent relationships.
 */
export type RelationshipProperties<T extends DynaRecord> = Extract<
  {
    [K in keyof T]: NonNullable<T[K]> extends DynaRecord | DynaRecord[]
      ? K
      : never;
  }[keyof T],
  string
>;

/**
 * Maps the relationship properties of a `DynaRecord` type `T` to their corresponding entity types.
 *
 * For array relationships, this resolves to the entity type of the array elements.
 * For single relationships, this resolves to the entity type of the property.
 *
 * @template T - The `DynaRecord` type to evaluate.
 * @returns A union of all entity types referenced by the relationships in `T`.
 */
export type RelationshipEntities<T extends DynaRecord> = {
  [K in RelationshipProperties<T>]: NonNullable<T[K]> extends Array<infer U>
    ? AssertDynaRecord<U>
    : AssertDynaRecord<NonNullable<T[K]>>;
}[RelationshipProperties<T>];

/**
 * Represents the results of a query operation for a `DynaRecord` entity `T`.
 *
 * The results include attributes of the queried entity as well as attributes of its related entities.
 * For related entities, their attributes are derived from their relationship definitions in `T`.
 *
 * @template T - The type of the entity being queried, extending `DynaRecord`.
 * @returns An array of objects representing the entity attributes of `T` or its related entities.
 */
export type QueryResults<T extends DynaRecord> = Array<
  | EntityAttributesInstance<T>
  | (RelationshipEntities<T> extends infer R
      ? R extends DynaRecord
        ? EntityAttributesInstance<R>
        : never
      : never)
>;

/**
 * A utility type that represents a single item in the query results, which can be either an entity or a associated entity. This type is derived from the `QueryResults` array type, providing a convenient way to refer to individual results from a query.
 *
 * @template T - The type of the entity being queried, extending `DynaRecord`.
 */
export type QueryResult<T extends DynaRecord> = QueryResults<T>[number];

/**
 * Key conditions when querying an entity.
 * When querying the main table this will enforce that the keys are the PartitionKey and SortKey from the table
 * When querying an index, this can be any key on the table, but must be the keys for that index
 */
export type EntityQueryKeyConditions<T extends DynaRecord = DynaRecord> =
  | EntityKeyConditions<T>
  | IndexKeyConditions<T>;

// ─── Typed Query Filter Types ───────────────────────────────────────────────

/**
 * Union of T itself and all entity types reachable through its declared relationships
 * (`@HasMany`, `@HasOne`, `@BelongsTo`, `@HasAndBelongsToMany`).
 *
 * This defines which entities can appear in a partition query's `type` filter,
 * `skCondition`, and `sk` key conditions. Only the entity itself and its direct
 * relationships are included — entities from other tables or unrelated entities
 * on the same table are excluded.
 *
 * E.g. for Customer with HasMany Order/PaymentMethod and HasOne ContactInformation:
 * `Customer | Order | PaymentMethod | ContactInformation`
 */
export type PartitionEntities<T extends DynaRecord> =
  | T
  | RelationshipEntities<T>;

/**
 * Union of entity name string literals for the entity and its related entities.
 * These are the only valid values for the `type` filter field, `skCondition`, and
 * the `sk` property in key conditions.
 *
 * Falls back to `string` if any entity lacks `declare readonly type`.
 */
export type PartitionEntityNames<T extends DynaRecord> =
  PartitionEntities<T>["type"];

/**
 * Union of EntityFilterableKeys<E> for each entity E in PartitionEntities<T>.
 * This is the full set of valid filter keys when no `type` narrowing is applied.
 */
export type AllPartitionFilterableKeys<T extends DynaRecord> =
  PartitionEntities<T> extends infer E
    ? E extends DynaRecord
      ? EntityFilterableKeys<E>
      : never
    : never;

/**
 * Maps a union of string keys to an optional FilterTypes record.
 * Shared helper for building filter records from key unions.
 *
 * @template Keys - The union of string keys to include in the record.
 */
type FilterRecord<Keys extends string> = {
  [K in Keys]?: FilterTypes;
};

/**
 * Filter record scoped to a single entity's attributes.
 *
 * @template E - The entity type whose attributes form the record keys.
 */
export type EntityFilterRecord<E extends DynaRecord> = FilterRecord<
  EntityFilterableKeys<E>
>;

/**
 * Filter record for all entities in a partition (union of all filter keys).
 *
 * @template T - The root entity whose partition defines the filter keys.
 */
type FullPartitionFilterRecord<T extends DynaRecord> = FilterRecord<
  AllPartitionFilterableKeys<T>
>;

/**
 * Discriminated union enabling per-block `type` narrowing.
 * When type is a single string literal, only that entity's attributes are allowed.
 * When type is an array or absent, all partition attributes are allowed.
 * The `type` field is handled separately from other filter keys to enable narrowing.
 */
export type TypedAndFilter<T extends DynaRecord> =
  | (PartitionEntities<T> extends infer E
      ? E extends DynaRecord
        ? { type: E["type"] } & EntityFilterRecord<E>
        : never
      : never)
  | ({ type: PartitionEntityNames<T>[] } & FullPartitionFilterRecord<T>)
  | ({ type?: never } & FullPartitionFilterRecord<T>);

/**
 * Typed `$or` filter block for partition queries.
 * Each `$or` element is independently narrowed: when a block specifies
 * `type: "Order"`, only Order's attributes are accepted in that block.
 *
 * @template T - The root entity whose partition defines valid filter keys and type values.
 */
export type TypedOrFilter<T extends DynaRecord> = {
  $or?: TypedAndFilter<T>[];
};

/**
 * Top-level filter combining AND and OR.
 */
export type TypedFilterParams<T extends DynaRecord> = TypedAndFilter<T> &
  TypedOrFilter<T>;

// ─── Typed Sort Key Condition ───────────────────────────────────────────────

/**
 * Typed sort key condition for querying within an entity's partition.
 *
 * In dyna-record's single-table design, sort key values always start with an entity
 * class name — either the entity itself or one of its declared relationships
 * (`@HasMany`, `@HasOne`, `@BelongsTo`, `@HasAndBelongsToMany`):
 * - Self/HasOne records: `SK = "EntityName"` (exact entity name)
 * - HasMany records: `SK = "EntityName#id"` (entity name + delimiter + id)
 *
 * This type restricts `skCondition` and the `sk` key condition to only accept the
 * entity's own name or its related entity names (or prefixes thereof). Unrelated
 * entities and entities from other tables are rejected at compile time.
 *
 * @template T - The entity type being queried.
 */
export type TypedSortKeyCondition<T extends DynaRecord> =
  | PartitionEntityNames<T>
  | `${PartitionEntityNames<T>}${string}`
  | { $beginsWith: PartitionEntityNames<T> | `${PartitionEntityNames<T>}${string}` };

/**
 * Extracts the entity name from a typed sort key condition for return type narrowing.
 *
 * Narrows when:
 * - SK is an exact entity name: `"Order"` → `"Order"`
 * - SK is `{ $beginsWith: "Order" }` → `"Order"`
 *
 * Does not narrow when:
 * - SK is a prefixed string like `"Order#123"` (can't parse the delimiter at type level)
 * - SK is `{ $beginsWith: "Order#..." }` (specific prefix, not just entity name)
 *
 * @template T - The entity type being queried.
 * @template SK - The inferred sort key condition literal type.
 */
export type ExtractEntityFromSK<T extends DynaRecord, SK> =
  SK extends { $beginsWith: infer V extends PartitionEntityNames<T> }
    ? V
    : SK extends PartitionEntityNames<T>
      ? SK
      : never;

// ─── Return Type Narrowing Types ────────────────────────────────────────────

/**
 * Extracts string values from a type that may be a string or an array of strings.
 * Returns the literal string if single value, array element types if array, or `never`.
 *
 * @template V - The value to extract strings from.
 */
type ExtractStringOrArrayStrings<V> = V extends string
  ? V
  : V extends Array<infer U extends string>
    ? U
    : never;

/**
 * Extracts the `type` value from a filter object.
 * Returns the literal string if single value, array element types if array, or `never`.
 *
 * @template F - The filter object to extract from.
 */
export type ExtractTypeFromFilter<F> = F extends { type: infer V }
  ? ExtractStringOrArrayStrings<V>
  : never;

/**
 * Maps entity name string → entity type.
 *
 * @template T - The root entity being queried.
 * @template Name - The entity name string literal to resolve.
 */
export type ResolveEntityByName<
  T extends DynaRecord,
  Name extends string
> = Extract<PartitionEntities<T>, { type: Name }>;

/**
 * Distributes EntityAttributesInstance over a union of DynaRecord types.
 */
type DistributeEntityAttributes<E> = E extends DynaRecord
  ? EntityAttributesInstance<E>
  : never;

/**
 * Narrows query results to specific entity types identified by name.
 * Falls back to QueryResults<T> if names don't resolve to known entities.
 *
 * @template T - The root entity being queried.
 * @template Names - Union of entity name string literals to narrow to.
 */
type NarrowByNames<T extends DynaRecord, Names extends string> = [
  ResolveEntityByName<T, Names>
] extends [never]
  ? QueryResults<T>
  : Array<DistributeEntityAttributes<ResolveEntityByName<T, Names>>>;

/**
 * Narrows query results based on the `type` value extracted from a filter object.
 * If the filter's `type` resolves to specific entity names, returns an array of
 * those entity attribute types. Otherwise falls back to the full `QueryResults<T>` union.
 *
 * @template T - The root entity being queried.
 * @template F - The filter object from which `type` is extracted.
 */
export type NarrowedQueryResults<T extends DynaRecord, F> =
  ExtractTypeFromFilter<F> extends infer Names extends string
    ? NarrowByNames<T, Names>
    : QueryResults<T>;

// ─── Filter Key Resolution ──────────────────────────────────────────────────

/**
 * Extracts non-special filter keys from a filter object (excludes `type` and `$or`).
 *
 * @template F - The filter object to extract keys from.
 */
type FilterKeysOf<F> = Exclude<keyof F & string, "type" | "$or">;

/**
 * Finds partition entities that have ALL the specified filter keys as filterable attributes.
 * Returns the full `PartitionEntities` when Keys is `never` (no filter keys specified).
 *
 * @template T - The root entity being queried.
 * @template Keys - Union of filter key strings that must all be present on the entity.
 */
type EntitiesWithAllKeys<T extends DynaRecord, Keys extends string> = [
  Keys
] extends [never]
  ? PartitionEntities<T>
  : PartitionEntities<T> extends infer E
    ? E extends DynaRecord
      ? [Keys] extends [EntityFilterableKeys<E>]
        ? E
        : never
      : never
    : never;

/**
 * Resolves the entity name strings for entities that have ALL the specified filter keys.
 *
 * @template T - The root entity being queried.
 * @template Keys - Union of filter key strings.
 */
type EntityNamesFromKeys<
  T extends DynaRecord,
  Keys extends string
> = EntitiesWithAllKeys<T, Keys>["type"];

/**
 * Resolves a single filter block to entity name strings.
 * If the block has a `type` field with specific entity names, uses those.
 * Otherwise, narrows by finding entities that have ALL the block's non-special filter keys.
 *
 * @template T - The root entity being queried.
 * @template Block - The filter block object.
 */
type ResolveBlockEntityNames<T extends DynaRecord, Block> = IsAny<
  ExtractTypeFromFilter<Block>
> extends true
  ? EntityNamesFromKeys<T, FilterKeysOf<Block>>
  : [ExtractTypeFromFilter<Block>] extends [never]
    ? EntityNamesFromKeys<T, FilterKeysOf<Block>>
    : ExtractTypeFromFilter<Block>;

/**
 * Resolves `$or` blocks to entity name strings. For each `$or` element, resolves
 * to entity names by `type` (if present) or by filter keys (if no `type`).
 * Returns the union of entity names across all `$or` blocks.
 *
 * @template T - The root entity being queried.
 * @template F - The filter object containing `$or`.
 */
type ResolveOrBlockEntityNames<T extends DynaRecord, F> = F extends {
  $or?: Array<infer OrElement>;
}
  ? OrElement extends infer Block extends object
    ? ResolveBlockEntityNames<T, Block>
    : never
  : never;

// ─── Inference Chain ────────────────────────────────────────────────────────

/**
 * Determines whether `Names` represents a meaningful narrowing of the partition.
 * Returns `true` if `Names` is a specific subset of partition entity names,
 * `false` otherwise.
 *
 * A narrowing is meaningful when `Names` is:
 * - Not `any` (from AWS SDK's `NativeAttributeValue` propagation)
 * - Not `never` (no resolution)
 * - Not the full partition union (no narrowing effect)
 *
 * This guard is shared across the inference chain to avoid duplicating the
 * three-check pattern (IsAny / never / full-union) at each fallback level.
 *
 * @template T - The root entity being queried.
 * @template Names - The resolved entity name union to check.
 */
type ShouldNarrow<T extends DynaRecord, Names> = IsAny<Names> extends true
  ? false
  : [Names] extends [never]
    ? false
    : [Names] extends [string]
      ? [PartitionEntityNames<T>] extends [Names]
        ? false
        : true
      : false;

/**
 * Falls back to SK narrowing, then to full union.
 */
type FallbackToSK<T extends DynaRecord, SK> =
  ExtractEntityFromSK<T, SK> extends infer Names
    ? ShouldNarrow<T, Names> extends true
      ? NarrowByNames<T, Names & string>
      : QueryResults<T>
    : QueryResults<T>;

/**
 * Falls back to `$or` block resolution (by type or filter keys), then SK, then full union.
 */
type FallbackToOrBlocks<T extends DynaRecord, F, SK> =
  ResolveOrBlockEntityNames<T, F> extends infer Names
    ? ShouldNarrow<T, Names> extends true
      ? NarrowByNames<T, Names & string>
      : FallbackToSK<T, SK>
    : FallbackToSK<T, SK>;

/**
 * Falls back to top-level filter key resolution, then `$or`, then SK, then full union.
 */
type FallbackToFilterKeys<T extends DynaRecord, F, SK> =
  EntityNamesFromKeys<T, FilterKeysOf<F>> extends infer Names
    ? ShouldNarrow<T, Names> extends true
      ? NarrowByNames<T, Names & string>
      : FallbackToOrBlocks<T, F, SK>
    : FallbackToOrBlocks<T, F, SK>;

/**
 * Infers query results from filter and SK for the non-index query overload.
 *
 * Narrowing priority:
 * 1. If the filter specifies a top-level `type` value, narrow by that.
 * 2. Otherwise, if top-level filter keys narrow to specific entities, use that.
 * 3. Otherwise, if `$or` blocks resolve to specific entities (by type or keys), use that.
 * 4. Otherwise, if `skCondition` matches an exact entity name or `$beginsWith` an entity name, narrow by that.
 * 5. Otherwise, return the full `QueryResults<T>` union.
 *
 * @template T - The root entity being queried.
 * @template F - The inferred filter type (captured via `const` generic).
 * @template SK - The inferred sort key condition type.
 */
export type InferQueryResults<
  T extends DynaRecord,
  F,
  SK = unknown
> = ExtractTypeFromFilter<F> extends infer Names
  ? ShouldNarrow<T, Names> extends true
    ? NarrowedQueryResults<T, F>
    : FallbackToFilterKeys<T, F, SK>
  : FallbackToFilterKeys<T, F, SK>;
