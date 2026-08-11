import Metadata, {
  tableDefaultFields,
  type TableMetadata,
  type VectorIndexMetadata,
  type VectorIndexOptions
} from "./metadata/index.js";
import { DateAttribute, StringAttribute } from "./decorators/index.js";
import {
  FindById,
  type FindByIdOptions,
  type FindByIdIncludesRes,
  Query,
  type EntityKeyConditions,
  type QueryResults,
  Create,
  type CreateOptions,
  Update,
  type UpdateOptions,
  Delete,
  Search,
  type EntityAttributesOnly,
  type EntityAttributesInstance,
  type IncludedAssociations,
  type IndexKeyConditions,
  type OptionsWithoutIndex,
  type OptionsWithIndex,
  type EntityQueryKeyConditions,
  type TypedFilterParams,
  type TypedSortKeyCondition,
  type InferQueryResults,
  type SKScopedFilterParams,
  type HasSearchableRelationships,
  type IncludedEntities,
  type InferSearchResults,
  type ParentSearchOptions,
  type ParentSearchedEntities,
  type ParentSearchRuntimeOptions,
  type SearchableRelationshipEntities,
  type SearchableRelationshipProperties,
  type SearchNotAvailable,
  type SearchQuery,
  type SearchResults
} from "./operations/index.js";
import { ValidationError } from "./errors.js";
import { mergePartialObjectAttributes } from "./operations/utils/index.js";
import type { DynamoTableItem, EntityClass, Optional } from "./types.js";
import { createInstance, tableItemToEntity } from "./utils.js";

interface DynaRecordBase {
  id: string;
  type: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Serves as an abstract base class for entities in the ORM system. It defines standard fields such as `id`, `type`, `createdAt`, and `updatedAt`, and provides static methods for CRUD operations and queries. This class encapsulates common behaviors and properties that all entities share, leveraging decorators for attribute metadata and supporting operations like finding, creating, updating, and deleting entities.
 *
 * Table classes should extend this class, and each entity should extend the table class — either directly or through intermediate abstract base classes that hold shared attributes
 *
 * Entities extending `DynaRecord` can utilize these operations to interact with their corresponding records in the database, including handling relationships between different entities.
 * @example
 * ```typescript
 * @Table({ name: "my-table" })
 * abstract class MyTable extends DynaRecord {
 *   @PartitionKeyAttribute()
 *   public readonly pk: PartitionKey;
 *
 *   @SortKeyAttribute()
 *   public readonly sk: SortKey;
 * }
 *
 * @Entity
 * class User extends MyTable {
 *   declare readonly type: "User";
 *   // User implementation
 * }
 * ```
 */
abstract class DynaRecord implements DynaRecordBase {
  /**
   * A unique identifier for the entity itself, automatically generated upon creation.
   */
  @StringAttribute({ alias: tableDefaultFields.id.alias })
  public readonly id: string;

  /**
   * The type of the entity. Set automatically to the class name at runtime.
   *
   * Each entity must narrow this field to a string literal matching the class name
   * via `declare readonly type: "ClassName"`. This enables compile-time type safety
   * for query filters and return type narrowing.
   */
  @StringAttribute({ alias: tableDefaultFields.type.alias })
  public readonly type: string;

  /**
   * The timestamp marking when the entity was created
   */
  @DateAttribute({ alias: tableDefaultFields.createdAt.alias })
  public readonly createdAt: Date;

  /**
   * The timestamp marking the last update to the entity. Initially set to the same value as `createdAt`.
   */
  @DateAttribute({ alias: tableDefaultFields.updatedAt.alias })
  public readonly updatedAt: Date;

  /**
   * Find an entity by Id and optionally include associations.
   *
   * @param {string} id - Entity Id.
   * @param {undefined} [options] - No options provided, returns the entity without included associations.
   * @returns {Optional<T>} An entity without included associations serialized.
   *
   * @example Without included relationships
   * ```typescript
   * const user = await User.findById("userId");
   * ```
   *
   * ---
   *
   * @param {string} id - Entity Id.
   * @param {FindByIdOptions<T>} options - FindByIdOptions specifying associations to include.
   * @returns {FindByIdIncludesRes<T, FindByIdOptions<T>>} An entity with included associations serialized.
   *
   * @example With included relationships
   * ```typescript
   * const user = await User.findById("userId", { include: [{ association: "profile" }] });
   * ```
   */
  // Overload when no options are provided.
  public static async findById<T extends DynaRecord>(
    this: EntityClass<T>,
    id: string,
    options?: undefined
  ): Promise<Optional<EntityAttributesInstance<T>>>;

  // Overload when options (including a potential `include` array) are provided.
  public static async findById<
    T extends DynaRecord,
    Inc extends IncludedAssociations<T> = []
  >(
    this: EntityClass<T>,
    id: string,
    options: FindByIdOptions<T, Inc>
  ): Promise<Optional<FindByIdIncludesRes<T, Inc>>>;

  public static async findById<
    T extends DynaRecord,
    Inc extends IncludedAssociations<T> = []
  >(
    this: EntityClass<T>,
    id: string,
    options?: FindByIdOptions<T, Inc>
  ): Promise<
    Optional<EntityAttributesInstance<T> | FindByIdIncludesRes<T, Inc>>
  > {
    const op = new FindById<T>(this);
    return await op.run(id, options);
  }

  /**
   * Query an EntityPartition by EntityId (string) or by PartitionKey/SortKey conditions (object).
   * QueryByIndex not supported with this overload. Use Query with keys and indexName option if needed.
   *
   * **Filter key validation:** Filter keys are strongly typed to only accept valid attribute
   * names from the entity and its declared relationships (`@HasMany`, `@HasOne`, `@BelongsTo`,
   * `@HasAndBelongsToMany`). The `type` field only accepts the entity itself or its related
   * entity names — entities from other tables or unrelated entities are rejected.
   * When `type` is specified as a single value in a `$or` block, filter keys are narrowed to
   * that entity's attributes.
   *
   * **Sort key validation:** Both `skCondition` (string form) and `sk` (object key form) only
   * accept the entity itself or its related entity names, matching dyna-record's single-table
   * sort key format where SK values always start with an entity class name. Unrelated entities
   * and entities from other tables are rejected at compile time.
   *
   * **SK-scoped filter:** When `skCondition` narrows to specific entities, the `filter`
   * parameter is scoped to only those entities' attributes. For example,
   * `skCondition: { $beginsWith: "Order" }` restricts the filter to Order's attributes —
   * using attributes from other entities (e.g., `lastFour` from PaymentMethod) produces a
   * compile error.
   *
   * **`$beginsWith` prefix matching:** `$beginsWith` accepts partial entity name prefixes
   * that match multiple entity types. For example, `$beginsWith: "Inv"` matches both
   * "Invoice" and "Inventory". The return type and filter are scoped to the union of
   * all matching entities.
   *
   * **Return type narrowing:** The return type narrows automatically based on:
   * - Top-level filter `type`: `type: "Order"` → `Array<EntityAttributesInstance<Order>>`
   * - Top-level filter `type` array: `type: ["Order", "PaymentMethod"]` → union of both
   * - Top-level filter keys: `{ orderDate: "2023" }` → narrows to entities that have `orderDate`
   * - `$or` elements: each block narrows by `type` (if present) or by filter keys; return type is the union
   * - AND intersection: when top-level conditions and `$or` both narrow, the return type is their intersection. Empty intersection → `never[]`.
   * - `skCondition` option: always intersected with filter narrowing. `skCondition: "Order"` or `{ $beginsWith: "Order" }` → narrows to Order. `{ $beginsWith: "Inv" }` → narrows to all entities starting with "Inv".
   * - No type/keys/SK specified → union of T and all related entities (e.g., `Customer | Order | PaymentMethod | ContactInformation`)
   *
   * Note: When using the object key form (`{ pk: "...", sk: "Order" }`), the `sk` value is
   * validated against entity names but does **not** narrow the return type due to a TypeScript
   * inference limitation. Use `filter: { type: "Order" }` or the `skCondition` option for
   * return type narrowing.
   *
   * @template T - The entity type being queried.
   * @template SK - The inferred sort key condition type, captured via `const` generic for literal type inference.
   * @template F - The inferred filter type, captured via `const` generic. Constrained by {@link SKScopedFilterParams} — when SK narrows, only matched entities' attributes are accepted.
   * @param {string | EntityKeyConditions<T>} key - Entity Id (string) or an object with PartitionKey and optional SortKey conditions.
   * @param {Object=} options - QueryOptions. Supports typed filter, consistentRead and skCondition. indexName is not supported.
   * @param {SKScopedFilterParams<T, SK>=} options.filter - Typed filter conditions. Keys are validated against partition entity attributes, scoped by `skCondition` when present. The `type` field accepts valid entity class names within the SK scope.
   * @param {TypedSortKeyCondition<T>=} options.skCondition - Sort key condition. Accepts entity names, entity-name-prefixed strings, or `$beginsWith` with exact names or partial prefixes. Narrows the return type and scopes the filter to matched entities.
   * @returns A promise resolving to query results. The return type narrows based on the filter's `type` value, filter keys, and `skCondition`.
   *
   * @example By entity ID
   * ```typescript
   * const results = await Customer.query("123");
   * ```
   *
   * @example With skCondition (narrows return type and scopes filter to Order)
   * ```typescript
   * const orders = await Customer.query("123", { skCondition: "Order" });
   * // orders is Array<EntityAttributesInstance<Order>>
   * ```
   *
   * @example With skCondition $beginsWith (narrows return type)
   * ```typescript
   * const orders = await Customer.query("123", { skCondition: { $beginsWith: "Order" } });
   * // orders is Array<EntityAttributesInstance<Order>>
   * ```
   *
   * @example $beginsWith prefix matching multiple entities
   * ```typescript
   * const results = await Customer.query("123", { skCondition: { $beginsWith: "C" } });
   * // results includes Customer and ContactInformation (both start with "C")
   * // filter accepts attributes from both entities
   * ```
   *
   * @example SK-scoped filter (only Order attributes accepted)
   * ```typescript
   * const orders = await Customer.query("123", {
   *   skCondition: { $beginsWith: "Order" },
   *   filter: { type: "Order", orderDate: "2023-01-01" }
   * });
   * // orders is Array<EntityAttributesInstance<Order>>
   * // filter: { lastFour: "1234" } would be a compile error (PaymentMethod attribute)
   * ```
   *
   * @example By primary key (sk validated, return type NOT narrowed)
   * ```typescript
   * const results = await Customer.query({ pk: "Customer#123", sk: "Order" });
   * // results is QueryResults<Customer> — use filter type for narrowing
   * ```
   *
   * @example By primary key with filter type (narrows return type)
   * ```typescript
   * const orders = await Customer.query(
   *   { pk: "Customer#123", sk: { $beginsWith: "Order" } },
   *   { filter: { type: "Order" } }
   * );
   * // orders is Array<EntityAttributesInstance<Order>>
   * ```
   *
   * @example Query as consistent read
   * ```typescript
   * const results = await Customer.query("123", { consistentRead: true });
   * ```
   */
  // Overload 1a: Query by entity ID string — SK inferred from skCondition option
  public static async query<
    T extends DynaRecord,
    const SK extends TypedSortKeyCondition<T> = TypedSortKeyCondition<T>,
    const F extends SKScopedFilterParams<T, SK> = SKScopedFilterParams<T, SK>
  >(
    this: EntityClass<T>,
    key: string,
    options?: OptionsWithoutIndex<T, SK> & {
      filter?: F;
      skCondition?: SK;
    }
  ): Promise<InferQueryResults<T, F, SK>>;

  // Overload 1b: Query by key conditions — SK validates against partition entity names
  public static async query<
    T extends DynaRecord,
    const F extends TypedFilterParams<T> = TypedFilterParams<T>
  >(
    this: EntityClass<T>,
    key: EntityKeyConditions<T>,
    options?: Omit<OptionsWithoutIndex<T>, "skCondition"> & { filter?: F }
  ): Promise<InferQueryResults<T, F>>;

  /**
   * Query by PartitionKey and optional SortKey/Filter/Index conditions with an index
   * When querying on an index, any of the entities attributes can be part of the key condition
   * @param {Object} key - Any attribute defined on the entity that is part of an index's keys
   * @param {Object=} options - QueryBuilderOptions
   *
   * @example On index
   * ```typescript
   *  const result = await User.query(
   *    {
   *      name: "SomeName" // An attribute that is part of the key condition on an index
   *    },
   *    { indexName: "myIndex" }
   *  );
   * ```
   */
  public static async query<T extends DynaRecord>(
    this: EntityClass<T>,
    key: IndexKeyConditions<T>,
    options: OptionsWithIndex
  ): Promise<QueryResults<T>>;

  public static async query<T extends DynaRecord>(
    this: EntityClass<T>,
    key: string | EntityQueryKeyConditions<T>,
    options?: OptionsWithoutIndex<T> | OptionsWithIndex
  ): Promise<QueryResults<T>> {
    const op = new Query<T>(this);
    return await op.run(key, options);
  }

  /**
   * Create an entity. If foreign keys are included in the attributes then links will be denormalized accordingly
   * @param attributes - Attributes of the model to create
   * @param options - Optional operation options including referentialIntegrityCheck flag
   * @returns The new Entity
   *
   * @example Basic usage
   * ```typescript
   * const newUser = await User.create({ name: "Alice", email: "alice@example.com", profileId: "123" });
   * ```
   *
   * @example With referential integrity check disabled
   * ```typescript
   * const newUser = await User.create(
   *   { name: "Alice", email: "alice@example.com", profileId: "123" },
   *   { referentialIntegrityCheck: false }
   * );
   * ```
   */
  public static async create<T extends DynaRecord>(
    this: EntityClass<T>,
    attributes: CreateOptions<T>,
    options?: { referentialIntegrityCheck?: boolean }
  ): Promise<ReturnType<Create<T>["run"]>> {
    const op = new Create<T>(this);
    return await op.run(attributes, options);
  }

  /**
   * Update an entity. If foreign keys are included in the attributes then:
   *   - Manages associated relationship links as needed
   *   - If the entity already had a foreign key relationship, then denormalized records will be deleted from each partition
   *     - If the foreign key is not nullable then a {@link NullConstraintViolationError} is thrown.
   *   - Validation errors will be thrown if the attribute being removed is not nullable
   * @param id - The id of the entity to update
   * @param attributes - Attributes to update
   * @param options - Optional operation options including referentialIntegrityCheck flag
   *
   * @example Updating an entity.
   * ```typescript
   * await User.update("userId", { email: "newemail@example.com", profileId: 789 });
   * ```
   *
   * @example Removing a nullable entities attributes
   * ```typescript
   * await User.update("userId", { email: "newemail@example.com", someKey: null });
   * ```
   *
   * @example With referential integrity check disabled
   * ```typescript
   * await User.update(
   *   "userId",
   *   { email: "newemail@example.com", profileId: 789 },
   *   { referentialIntegrityCheck: false }
   * );
   * ```
   *
   * @example Partial update of an ObjectAttribute (only provided fields are modified, omitted fields are preserved)
   * ```typescript
   * await User.update("userId", { address: { street: "456 Oak Ave" } });
   * ```
   */
  public static async update<T extends DynaRecord>(
    this: EntityClass<T>,
    id: string,
    attributes: UpdateOptions<T>,
    options?: { referentialIntegrityCheck?: boolean }
  ): Promise<void> {
    const op = new Update<T>(this);
    await op.run(id, attributes, options);
  }

  /**
   *  Same as the static `update` method but on an instance. Returns the full updated instance.
   *
   * For `@ObjectAttribute` fields, the returned instance deep merges the partial update
   * with the existing object value — omitted fields are preserved, and fields set to `null`
   * are removed.
   *
   * @example Updating an entity.
   * ```typescript
   * const updatedInstance = await instance.update({ email: "newemail@example.com", profileId: 789 });
   * ```
   *
   * @example Removing a nullable entities attributes
   * ```typescript
   * const updatedInstance = await instance.update({ email: "newemail@example.com", someKey: null });
   * ```
   *
   * @example Partial ObjectAttribute update with deep merge
   * ```typescript
   * // instance.address is { street: "123 Main", city: "Springfield", zip: 12345 }
   * const updated = await instance.update({ address: { street: "456 Oak Ave" } });
   * // updated.address is { street: "456 Oak Ave", city: "Springfield", zip: 12345 }
   * ```
   *
   * @example With referential integrity check disabled
   * ```typescript
   * const updatedInstance = await instance.update(
   *   { email: "newemail@example.com", profileId: 789 },
   *   { referentialIntegrityCheck: false }
   * );
   * ```
   */
  public async update<T extends this>(
    attributes: UpdateOptions<T>,
    options?: { referentialIntegrityCheck?: boolean }
  ): Promise<EntityAttributesInstance<T>> {
    const InstanceClass = this.constructor as EntityClass<T>;
    const op = new Update<T>(InstanceClass);
    const updatedAttributes = await op.run(this.id, attributes, options);

    const clone = structuredClone(this);
    const entityAttrs = Metadata.getEntityAttributes(InstanceClass.name);

    // Deep merge ObjectAttributes, shallow assign everything else
    mergePartialObjectAttributes(
      clone as Record<string, unknown>,
      updatedAttributes,
      entityAttrs
    );

    const updatedInstance = Object.fromEntries(
      Object.entries(clone).filter(([_, value]) => value !== null)
    ) as EntityAttributesOnly<T>;

    // Return the updated instance, which is of type `this`
    return createInstance<T>(InstanceClass, updatedInstance);
  }

  /**
   * Delete an entity by ID
   *   - Delete all denormalized records
   *   - Disassociate all foreign keys of linked models
   * @param id - The id of the entity to update
   *
   * @example Delete an entity
   * ```typescript
   * await User.delete("userId");
   * ```
   */
  public static async delete<T extends DynaRecord>(
    this: EntityClass<T>,
    id: string
  ): Promise<void> {
    const op = new Delete<T>(this);
    await op.run(id);
  }

  /**
   * Vector-searches the entities related to one parent entity, through the
   * vector index scoped by this class. Compiles to exactly one
   * `SearchVectors` operation; results carry complete typed entity instances
   * with `similarity` and the raw `score`, ordered most-similar-first.
   *
   * The return type is inferred from `in:`: present, results narrow to that
   * relationship's target entity; omitted, results are the union of every
   * searchable relationship target, discriminated via `entity.type`.
   *
   * Available only on classes with at least one relationship to a searchable
   * entity (compile error otherwise, runtime error in plain JS), and only
   * when exactly one vector index is scoped by this class — with more than
   * one the parent surface is ambiguous; search through the index construct
   * instead.
   *
   * `include:` members of the scoped index have no relationship on this
   * class, so they are absent from the parent-level result union — search
   * through the index construct to receive them typed.
   *
   * @param scopeId - The id of the parent entity to search within.
   * @param query - The query text to embed, or `{ vector }` with a precomputed vector.
   * @param options - {@link ParentSearchOptions}
   * @returns A promise resolving to the typed search results.
   *
   * @example Search across a store's searchable entities
   * ```typescript
   * const results = await Store.search("storeId", "hand thrown ceramic mugs");
   * ```
   *
   * @example Narrowed to one relationship, with filters
   * ```typescript
   * const results = await Store.search("storeId", "mugs", {
   *   in: "listings",
   *   filter: { category: "Mugs" },
   *   topK: 25
   * });
   * ```
   */
  public static async search<
    T extends DynaRecord,
    const In extends SearchableRelationshipProperties<T> = never
  >(
    this: EntityClass<T> &
      (HasSearchableRelationships<T> extends false
        ? SearchNotAvailable
        : unknown),
    scopeId: string,
    query: SearchQuery,
    options?: ParentSearchOptions<T, In>
  ): Promise<InferSearchResults<ParentSearchedEntities<T, In>>>;

  public static async search(
    this: EntityClass<DynaRecord>,
    scopeId: string,
    query: SearchQuery,
    options?: ParentSearchRuntimeOptions
  ): Promise<SearchResults> {
    return await DynaRecord.runParentSearch(this, scopeId, query, options);
  }

  /**
   * Same as the static `search` method but on an instance, searching within
   * this instance's own scope.
   *
   * Full inference (`in:` narrowing, filter keys, result unions) applies to
   * class-typed instances. Hydrated results (`findById`, `query`, search)
   * are typed without relationship properties — the inference channel — so
   * on those the permissive overload applies and the runtime guards are
   * authoritative; use the static surface for full inference.
   *
   * @param query - The query text to embed, or `{ vector }` with a precomputed vector.
   * @param options - {@link ParentSearchOptions}
   * @returns A promise resolving to the typed search results.
   *
   * @example
   * ```typescript
   * const results = await store.search("hand thrown ceramic mugs", {
   *   in: "listings"
   * });
   * ```
   */
  public async search<
    T extends this,
    const In extends SearchableRelationshipProperties<T> = never
  >(
    this: T &
      (HasSearchableRelationships<T> extends false
        ? SearchNotAvailable
        : unknown),
    query: SearchQuery,
    options?: ParentSearchOptions<T, In>
  ): Promise<InferSearchResults<ParentSearchedEntities<T, In>>>;

  /**
   * Vector-searches the entities related to this instance, within its own
   * scope. This signature applies to hydrated instances (`findById`, `query`,
   * search results), which are typed without relationship properties — the
   * inference channel — so `in:` is a plain relationship-name string and
   * results are the base union; the runtime guards are authoritative. Use the
   * static `search` for full inference.
   *
   * @param query - The query text to embed, or `{ vector }` with a precomputed vector.
   * @param options - Search options: `in`, `filter`, `topK`.
   * @returns A promise resolving to the search results.
   */
  public async search(
    query: SearchQuery,
    options?: ParentSearchRuntimeOptions
  ): Promise<SearchResults>;

  public async search(
    query: SearchQuery,
    options?: ParentSearchRuntimeOptions
  ): Promise<SearchResults> {
    const InstanceClass = this.constructor as EntityClass<DynaRecord>;
    return await DynaRecord.runParentSearch(
      InstanceClass,
      this.id,
      query,
      options
    );
  }

  /**
   * Resolves and executes a parent-anchored search: finds the one vector
   * index scoped by the parent class, maps the `in:` relationship property
   * to its target entity, and runs the search scoped to the parent's id
   * @param ParentClass - The scope parent entity class
   * @param scopeId - The parent entity id to search within
   * @param query - The search query input
   * @param options - The parent search options
   * @returns The search results
   */
  private static async runParentSearch(
    ParentClass: EntityClass<DynaRecord>,
    scopeId: string,
    query: SearchQuery,
    options?: ParentSearchRuntimeOptions
  ): Promise<SearchResults> {
    const entityMetadata = Metadata.getEntity(ParentClass.name);
    const indexes = Metadata.getVectorIndexes(entityMetadata.tableClassName);

    const scopedIndexes = indexes.filter(
      index => index.scopedBy?.() === ParentClass
    );

    if (scopedIndexes.length === 0) {
      throw new ValidationError(
        `${ParentClass.name} has no vector index scoped by it — search is unavailable. Define one with scopedBy: () => ${ParentClass.name}`
      );
    }

    if (scopedIndexes.length > 1) {
      throw new ValidationError(
        `${ParentClass.name} scopes more than one vector index (${scopedIndexes
          .map(index => index.name)
          .join(
            ", "
          )}) — the parent search surface is ambiguous. Search through the index construct instead: myIndex.search(...)`
      );
    }

    const [index] = scopedIndexes;

    // The public `in:` names a relationship property of the parent; the
    // search runtime narrows by the target's entity name
    let entityName: Optional<string>;
    if (options?.in !== undefined) {
      if (!(options.in in entityMetadata.relationships)) {
        throw new ValidationError(
          `Invalid search option in: "${options.in}" is not a relationship of ${ParentClass.name}`
        );
      }
      entityName = entityMetadata.relationships[options.in].target.name;
    }

    return await new Search(index).run(query, {
      scopeId,
      in: entityName,
      filter: options?.filter,
      topK: options?.topK
    });
  }

  /**
   * Constructs the partition key value
   * @param {string} id - Entity Id
   * @returns Constructed partition key value
   *
   * @example
   * ```typescript
   * const pkValue = User.partitionKeyValue("userId");
   * ```
   */
  public static partitionKeyValue(id: string): string {
    const { delimiter } = Metadata.getEntityTable(this.name);
    return `${this.name}${delimiter}${id}`;
  }

  /**
   * Takes a table item and serializes it to an entity instance
   */
  public static tableItemToEntity<T extends DynaRecord>(
    this: new () => T,
    tableItem: DynamoTableItem
  ): EntityAttributesInstance<T> {
    const tableMeta = Metadata.getEntityTable(this.name);
    const typeAlias = tableMeta.defaultAttributes.type.alias;

    if (tableItem[typeAlias] !== this.name) {
      throw new Error("Unable to convert dynamo item to entity. Invalid type");
    }

    return tableItemToEntity(this, tableItem);
  }

  /**
   * Get the partition key for an entity
   * @returns The partition key of the entity
   */
  public partitionKeyValue(): string {
    return (this.constructor as typeof DynaRecord).partitionKeyValue(this.id);
  }

  /**
   * Defines a **scoped** vector index on a table class and returns the typed
   * index construct — the index's `search` surface and provisioning
   * definition.
   *
   * The scope parent's foreign key becomes the index `HASH`, so searches run
   * within exactly one scope value at a time. Members are the scope parent's
   * searchable relationships union the `include:` list, and the construct's
   * `search` takes the scope id first with `in:` and result unions typed to
   * that membership.
   *
   * Only table classes (classes decorated with `@Table`) may define vector
   * indexes; calling this on an entity class throws. Defining an index never
   * triggers metadata initialization and never resolves the entity thunks —
   * index constants can be declared at module evaluation, and membership is
   * resolved and validated when metadata initializes (first operation or an
   * explicit `metadata()` call).
   *
   * @param options - {@link VectorIndexOptions} with `scopedBy` (and optionally `include`)
   * @returns The registered {@link VectorIndexMetadata} construct
   *
   * @example
   * ```typescript
   * const orgSearchIndex = MyTable.vectorIndex({
   *   name: "org-search-index",
   *   model: TitanTextEmbedV2,
   *   provider: myEmbedFunction,
   *   scopedBy: () => Organization,
   *   include: [() => Review] // FK-only members without a declared inverse
   * });
   * ```
   */
  public static vectorIndex<
    Scope extends DynaRecord,
    Inc extends ReadonlyArray<() => EntityClass<DynaRecord>> = []
  >(
    options: VectorIndexOptions & {
      scopedBy: () => EntityClass<Scope>;
      include?: Inc;
    }
  ): VectorIndexMetadata<
    SearchableRelationshipEntities<Scope> | IncludedEntities<Inc>,
    true
  >;

  /**
   * Defines a **global** vector index on a table class and returns the typed
   * index construct — the index's `search` surface and provisioning
   * definition.
   *
   * A global index has no `HASH`: its members are every searchable entity of
   * the table, and the construct's `search` takes the query first with no
   * scope id. `include:` is rejected — there is nothing to add to a
   * membership that already spans the table. Because entity classes are only
   * discovered at metadata initialization, the member union is not statically
   * enumerable: `in:` remains available as a plain entity-name string
   * (validated against the resolved membership at runtime) and results type
   * as the base entity union — discriminate on `entity.type` to narrow.
   *
   * Only table classes (classes decorated with `@Table`) may define vector
   * indexes; calling this on an entity class throws. Defining an index never
   * triggers metadata initialization and never resolves the entity thunks —
   * index constants can be declared at module evaluation, and membership is
   * resolved and validated when metadata initializes (first operation or an
   * explicit `metadata()` call).
   *
   * @param options - {@link VectorIndexOptions} without `scopedBy`
   * @returns The registered {@link VectorIndexMetadata} construct
   *
   * @example
   * ```typescript
   * const globalSearchIndex = MyTable.vectorIndex({
   *   name: "global-search-index",
   *   model: TitanTextEmbedV2,
   *   provider: myEmbedFunction
   * });
   * ```
   */
  public static vectorIndex(
    options: VectorIndexOptions & { scopedBy?: undefined; include?: undefined }
  ): VectorIndexMetadata<DynaRecord, false>;

  public static vectorIndex(options: VectorIndexOptions): VectorIndexMetadata {
    return Metadata.addVectorIndex(this.name, options);
  }

  /**
   * Returns serialized table metadata containing only serializable values.
   * This method returns a plain object representation of the table metadata,
   * with functions, class instances, and other non-serializable data converted
   * to their string representations or omitted. Vector index definitions are
   * included with the model descriptor's name only — never the provider
   * value, client config, or credentials.
   * @returns A plain object representation of the table metadata
   *
   * @example
   * ```typescript
   * const metadata = User.metadata();
   * // Returns a serialized object with all metadata information
   * ```
   */
  public static metadata(): ReturnType<TableMetadata["toJSON"]> {
    const tableMetadata = Metadata.getTable(this.name);
    const entities = Metadata.getEntitiesForTable(this.name);
    const vectorIndexes = Metadata.getVectorIndexes(this.name);
    return tableMetadata.toJSON(entities, vectorIndexes);
  }
}

export default DynaRecord;
