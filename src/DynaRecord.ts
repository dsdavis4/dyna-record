import Metadata, {
  tableDefaultFields,
  type TableMetadata,
  type ValidateVectorIndexes,
  type VectorIndexConstructs,
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
  type CreateOperationOptions,
  Update,
  type UpdateOptions,
  type UpdateOperationOptions,
  Delete,
  type DeleteOperationOptions,
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
  type CheckedFilterParams,
  type FilterInferenceSite
} from "./operations/index.js";
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
   * **Sort key narrowing reads the entity name:** `skCondition` narrows on an entity name or a
   * prefix of one. `"Order"` and `{ $beginsWith: "Order" }` narrow to every entity whose name
   * starts with `Order` (an `OrderItem` too, if the partition has one). A value that runs past
   * the entity name, such as `"Order#123"` or `{ $beginsWith: "Order#" }`, is accepted but does
   * not narrow: the table's delimiter is configurable and invisible to the types, so they cannot
   * tell where the name ends. Narrowing assumes no entity's sort key starts with another entity's
   * name followed by the delimiter, which always holds with the default `#` delimiter and with
   * any delimiter whose first character cannot appear in a class name.
   *
   * **Reusing a filter:** narrowing reads the filter's literal type, which a filter written at the
   * call has. To define a filter once and keep narrowing, check it with
   * `satisfies TypedFilterParams<T>`. A filter whose type is a {@link TypedFilterParams}
   * annotation (a function parameter, an object property) is accepted, but the annotation widens
   * it, so the results are the whole partition's union. Beside an `skCondition` that names an
   * entity, type a reusable filter as {@link SKScopedFilterParams} with the same sort key
   * condition, such as `SKScopedFilterParams<Customer, "Order">`: a partition-wide
   * `TypedFilterParams<T>` is refused there, because it offers other entities' keys and `type`
   * values that cannot match the rows the sort key selects.
   *
   * **`null` in a filter:** `null` is not a filter value on its own. Inside an object compared
   * whole (an equality value, an `IN` element, or a `$contains` element of a list of objects),
   * `null` on a nullable field means "not set": the field is left out of the value sent, which
   * then equals a value stored without it.
   *
   * @template T - The entity type being queried.
   * @template SK - The inferred sort key condition type, captured via `const` generic for literal type inference.
   * @template F - The inferred filter type, captured via `const` generic. Constrained by {@link SKScopedFilterParams} — when SK narrows, only matched entities' attributes are accepted.
   * @param {string | EntityKeyConditions<T>} key - Entity Id (string) or an object with PartitionKey and optional SortKey conditions.
   * @param {Object=} options - QueryOptions. Supports typed filter, consistentRead and skCondition. indexName is not supported.
   * @param {SKScopedFilterParams<T, SK>=} options.filter - Typed filter conditions. Keys are validated against partition entity attributes, scoped by `skCondition` when present. The `type` field accepts valid entity class names within the SK scope.
   * @param {TypedSortKeyCondition<T>=} options.skCondition - Sort key condition. Accepts entity names, entity-name-prefixed strings, `$beginsWith` with exact names or partial prefixes, a single comparison, or a `$between` range. Narrows the return type and scopes the filter to matched entities.
   * @returns A promise resolving to query results. The return type narrows based on the filter's `type` value, filter keys, and `skCondition`.
   * @throws {@link FilterError} Before the query is sent, when a filter or key condition value cannot match: a value that fails the attribute's schema, an inverted `$between`, a dot path the schema does not declare, a field an object operand's schema does not declare, or a key condition set to `undefined`.
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
   *   filter: { type: "Order", orderDate: new Date("2023-01-01") }
   * });
   * // orders is Array<EntityAttributesInstance<Order>>
   * // filter: { lastFour: "1234" } would be a compile error (PaymentMethod attribute)
   * ```
   *
   * @example Filtering on a range
   * ```typescript
   * // Several comparison operators on one attribute compose with AND
   * const orders = await Customer.query("123", {
   *   filter: {
   *     type: "Order",
   *     orderDate: { $gte: new Date("2026-01-01"), $lt: new Date("2026-02-01") }
   *   }
   * });
   *
   * // $between is inclusive on both bounds
   * const results = await Customer.query("123", {
   *   filter: { orderDate: { $between: [new Date("2026-01-01"), new Date("2026-12-31")] } }
   * });
   * ```
   *
   * @example Narrowing the read with a sort key range
   * ```typescript
   * // A key condition narrows what DynamoDB reads; a filter discards rows
   * // after reading them. A sort key takes one condition, so a two-sided
   * // range is $between
   * const orders = await Customer.query("123", {
   *   skCondition: { $between: ["Order#100", "Order#200"] }
   * });
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
   * @example Reusing a filter: satisfies keeps narrowing, an annotation widens
   * ```typescript
   * const ordersIn2026 = {
   *   type: "Order",
   *   orderDate: { $gte: new Date("2026-01-01") }
   * } satisfies TypedFilterParams<Customer>;
   *
   * const orders = await Customer.query("123", { filter: ordersIn2026 });
   * // orders is Array<EntityAttributesInstance<Order>>
   *
   * async function customerRecords(filter: TypedFilterParams<Customer>) {
   *   // Accepted, but the annotation widens the filter: QueryResults<Customer>
   *   return await Customer.query("123", { filter });
   * }
   * ```
   *
   * @example Reusing a filter beside an skCondition that names an entity
   * ```typescript
   * async function ordersFor(
   *   customerId: string,
   *   filter: SKScopedFilterParams<Customer, "Order">
   * ) {
   *   // Array<EntityAttributesInstance<Order>>
   *   return await Customer.query(customerId, { skCondition: "Order", filter });
   * }
   *
   * await ordersFor("123", { orderDate: { $gte: new Date("2026-01-01") } });
   * ```
   *
   * @example A prefix past the entity name does not narrow
   * ```typescript
   * const results = await Customer.query("123", {
   *   skCondition: { $beginsWith: "Order#" }
   * });
   * // results is QueryResults<Customer> — the types cannot see the delimiter
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
      filter?: CheckedFilterParams<F, SKScopedFilterParams<T, SK>>;
      skCondition?: SK;
    } & FilterInferenceSite<F>
  ): Promise<InferQueryResults<T, F, SK>>;

  // Overload 1b: Query by key conditions — SK validates against partition entity names
  public static async query<
    T extends DynaRecord,
    const F extends TypedFilterParams<T> = TypedFilterParams<T>
  >(
    this: EntityClass<T>,
    key: EntityKeyConditions<T>,
    options?: Omit<OptionsWithoutIndex<T>, "skCondition"> & {
      filter?: CheckedFilterParams<F, TypedFilterParams<T>>;
    } & FilterInferenceSite<F>
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
   *
   * The entity, its denormalized copies and its relationship links are written in one transaction.
   * With a `condition`, the create also guards the rows the new entity references, its BelongsTo
   * parents and the rows its other typed foreign keys reference, and happens only if every guard
   * holds. A create takes no condition on the new row's own attributes, which must not exist yet.
   * See {@link CreateCondition}.
   *
   * @param attributes - Attributes of the model to create. A nullable attribute is omitted rather than set to `null`, inside a list element as anywhere else.
   * @param options - Optional operation options: the referentialIntegrityCheck flag and a write condition on the rows the new entity references, checked in the same transaction as the create. See {@link CreateOperationOptions}
   * @returns The new Entity
   * @throws {@link ValidationError} Before anything is written, when the attributes do not match the entity's schema.
   * @throws {@link FilterError} Before anything is read or written, when the write condition is invalid, such as a guard on a foreign key the attributes leave unset.
   * @throws {@link TransactionWriteFailedError} When DynamoDB cancels the transaction. Its `errors` hold a {@link WriteConditionFailedError} for each guarded row whose condition failed, and a {@link ConditionalCheckFailedError} for a library check that failed: the entity already exists, or a referenced entity does not exist.
   *
   * @example Basic usage
   * ```typescript
   * const customer = await Customer.create({ name: "Jane Doe", status: "active" });
   * ```
   *
   * @example With relationships
   * ```typescript
   * // Denormalizes the Order into its Customer's partition
   * const order = await Order.create({
   *   orderDate: new Date("2026-10-06"),
   *   total: 40,
   *   status: "pending",
   *   customerId: "customer-1",
   *   storeId: "store-1"
   * });
   * ```
   *
   * @example With referential integrity check disabled
   * ```typescript
   * const order = await Order.create(
   *   {
   *     orderDate: new Date("2026-10-06"),
   *     total: 40,
   *     status: "pending",
   *     customerId: "customer-1",
   *     storeId: "store-1"
   *   },
   *   { referentialIntegrityCheck: false }
   * );
   * ```
   *
   * @example With a write condition on the rows the new entity references
   * ```typescript
   * // Place an Order only for an active Customer at an open Store
   * const order = await Order.create(
   *   {
   *     orderDate: new Date("2026-10-06"),
   *     total: 40,
   *     status: "pending",
   *     customerId: "customer-1",
   *     storeId: "store-1"
   *   },
   *   {
   *     condition: {
   *       customer: { status: "active" },
   *       storeId: { target: { status: "open" } }
   *     }
   *   }
   * );
   * ```
   */
  public static async create<T extends DynaRecord>(
    this: EntityClass<T>,
    attributes: CreateOptions<T>,
    options?: CreateOperationOptions<T>
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
   *
   * Setting a nullable attribute to `null` removes it. The same holds for a nullable field inside an
   * `@ObjectAttribute` and inside an element of a list, which is written whole and stored without the field.
   *
   * With a `condition`, the entity, its denormalized copies and its relationship links are updated only
   * if every part of the condition holds, checked in the same transaction: a condition on the entity's
   * own row, on its related entities by relationship name, and on the rows its other foreign keys
   * reference through `target`. See {@link WriteCondition}.
   *
   * @param id - The id of the entity to update
   * @param attributes - Attributes to update
   * @param options - Optional operation options: the referentialIntegrityCheck flag, forceEmbed and a write condition. See {@link UpdateOperationOptions}
   * @throws {@link ValidationError} Before anything is written, when the attributes do not match the entity's schema.
   * @throws {@link FilterError} Before anything is read or written, when the write condition is invalid, such as an `undefined` operand or a guard on a relationship whose foreign key the same update sets to `null`.
   * @throws {@link NotFoundError} When the update reads the entity first (it has relationships, or a condition needs its stored row) and the entity does not exist.
   * @throws {@link TransactionWriteFailedError} When DynamoDB cancels the transaction. Its `errors` hold a {@link WriteConditionFailedError} for each guarded row whose condition failed, and a {@link ConditionalCheckFailedError} for a library check that failed: a missing row, a referenced entity that does not exist, a relationship changed by a concurrent write, or a HasMany or HasAndBelongsToMany id that is not related.
   *
   * @example Updating an entity
   * ```typescript
   * await Customer.update("customer-1", { name: "Jane Smith", status: "suspended" });
   * ```
   *
   * @example Removing a nullable attribute
   * ```typescript
   * await Customer.update("customer-1", { phone: null });
   * ```
   *
   * @example Changing a foreign key, with the referential integrity check disabled
   * ```typescript
   * await Order.update(
   *   "order-1",
   *   { customerId: "customer-2" },
   *   { referentialIntegrityCheck: false }
   * );
   * ```
   *
   * @example Partial update of an ObjectAttribute (only provided fields are modified, omitted fields are preserved)
   * ```typescript
   * await Store.update("store-1", { address: { city: "Springfield" } });
   * ```
   *
   * @example Force a searchable entity to re-embed even when the value is unchanged (backfills, embedding model changes)
   * ```typescript
   * await Product.update("product-1", { description }, { forceEmbed: true });
   * ```
   *
   * @example With a write condition: the update happens only if it holds, checked in the same transaction
   * ```typescript
   * // Cancel an Order only while it is still pending and its Customer is active
   * await Order.update(
   *   "order-1",
   *   { status: "cancelled" },
   *   { condition: { status: "pending", customer: { status: "active" } } }
   * );
   *
   * // Ship an Order only if it has no tracking number yet: null means "not set"
   * await Order.update(
   *   "order-1",
   *   { status: "shipped", trackingNumber: "1Z999" },
   *   { condition: { trackingNumber: null } }
   * );
   * ```
   */
  public static async update<T extends DynaRecord>(
    this: EntityClass<T>,
    id: string,
    attributes: UpdateOptions<T>,
    options?: UpdateOperationOptions<T>
  ): Promise<void> {
    const op = new Update<T>(this);
    await op.run(id, attributes, options);
  }

  /**
   *  Same as the static `update` method but on an instance. Returns the full updated instance.
   *
   * For `@ObjectAttribute` fields, the returned instance deep merges the partial update
   * with the existing object value — omitted fields are preserved, and fields set to `null`
   * are removed, including a nullable field inside a list element.
   *
   * Takes the same options as the static method, including a `condition`; see {@link UpdateOperationOptions}.
   *
   * @param attributes - Attributes to update
   * @param options - Optional operation options: the referentialIntegrityCheck flag, forceEmbed and a write condition. See {@link UpdateOperationOptions}
   * @returns The updated instance
   * @throws {@link ValidationError} Before anything is written, when the attributes do not match the entity's schema.
   * @throws {@link FilterError} Before anything is read or written, when the write condition is invalid.
   * @throws {@link TransactionWriteFailedError} When DynamoDB cancels the transaction; a failed condition is reported inside it as a {@link WriteConditionFailedError}. See the static `update`.
   *
   * @example Updating an entity
   * ```typescript
   * const updated = await customer.update({ name: "Jane Smith" });
   * ```
   *
   * @example Removing a nullable attribute
   * ```typescript
   * const updated = await customer.update({ phone: null });
   * // updated.phone is undefined
   * ```
   *
   * @example Partial ObjectAttribute update with deep merge
   * ```typescript
   * // store.address.city is "Springfield"
   * const updated = await store.update({ address: { street: "456 Oak Ave" } });
   * // updated.address.street is "456 Oak Ave"; updated.address.city is still "Springfield"
   * ```
   *
   * @example With referential integrity check disabled
   * ```typescript
   * const updated = await order.update(
   *   { customerId: "customer-2" },
   *   { referentialIntegrityCheck: false }
   * );
   * ```
   *
   * @example With a write condition: the update happens only if it holds, checked in the same transaction
   * ```typescript
   * const cancelled = await order.update(
   *   { status: "cancelled" },
   *   { condition: { status: "pending" } }
   * );
   * ```
   */
  public async update<T extends this>(
    attributes: UpdateOptions<T>,
    options?: UpdateOperationOptions<T>
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
   *
   * With a `condition`, the entity, its denormalized records and its relationship links are deleted,
   * and its children's foreign keys cleared, only if every part of the condition holds and the
   * entity's own row still exists, checked in the same transaction. See {@link WriteCondition}.
   *
   * @param id - The id of the entity to delete
   * @param options - Optional operation options: a write condition, checked in the same transaction as the delete. The entity is deleted only if every part of the condition holds and its own row still exists. See {@link DeleteOperationOptions}
   * @throws {@link NotFoundError} When the entity does not exist.
   * @throws {@link FilterError} Before anything is read or written, when the write condition is invalid.
   * @throws {@link TransactionWriteFailedError} When a child's non-nullable foreign key would be cleared (holding a {@link NullConstraintViolationError}, before anything is sent), or when DynamoDB cancels the transaction. Its `errors` then hold a {@link WriteConditionFailedError} for each guarded row whose condition failed, and a {@link ConditionalCheckFailedError} for a library check that failed, such as the entity's row being deleted by a concurrent write.
   *
   * @example Delete an entity
   * ```typescript
   * await Order.delete("order-1");
   * ```
   *
   * @example With a write condition: the delete happens only if it holds, checked in the same transaction
   * ```typescript
   * // Delete an Order only while it is still pending and its Customer is active
   * await Order.delete("order-1", {
   *   condition: { status: "pending", customer: { status: "active" } }
   * });
   * ```
   */
  public static async delete<T extends DynaRecord>(
    this: EntityClass<T>,
    id: string,
    options?: DeleteOperationOptions<T>
  ): Promise<void> {
    const op = new Delete<T>(this);
    await op.run(id, options);
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
   * Declares a table's complete set of vector indexes in one call, keyed by
   * export name, and returns the typed index constructs — each index's
   * `search` surface and provisioning definition.
   *
   * Every index declares its own `vectorAttribute` (the physical attribute
   * its members' vectors are written under), its own embedding config, and
   * its complete membership with `members:` — there is no derived or
   * universal membership. Indexes have fully independent physical
   * membership: each searchable entity belongs to exactly one index and is
   * ingested, billed, and searchable only there.
   *
   * A **scoped** index (`scopedBy`) makes the scope parent's foreign key
   * the index `HASH`, and its construct's `search` takes the scope id first
   * with `in:` and result unions typed to the membership. An **unscoped**
   * index omits `scopedBy` — it has no `HASH`, its `search` takes the query
   * first, and every search spans its whole membership.
   *
   * Only table classes (classes decorated with `@Table`) may declare vector
   * indexes; calling this on an entity class throws, as does a second call
   * for the same table. Declaring indexes never triggers metadata
   * initialization and never resolves the entity thunks — index constants
   * can be declared at module evaluation, and membership is resolved and
   * validated when metadata initializes (first operation or an explicit
   * `metadata()` call).
   *
   * @param defs - Index declarations keyed by export name; see {@link VectorIndexOptions}
   * @returns The registered {@link VectorIndexMetadata} constructs, keyed as declared
   *
   * @example
   * ```typescript
   * const { listingSearchIndex, supportSearchIndex } = MyTable.vectorIndexes({
   *   listingSearchIndex: {
   *     name: "listing-search-index",
   *     vectorAttribute: "__dyna_vector",
   *     model: TitanTextEmbedV2,
   *     provider: myEmbedFunction,
   *     scopedBy: () => Store,
   *     members: [() => Listing, () => Review]
   *   },
   *   supportSearchIndex: {
   *     name: "support-search-index",
   *     vectorAttribute: "__dyna_vector_support",
   *     model: TitanTextEmbedV2,
   *     provider: myEmbedFunction,
   *     scopedBy: () => Store,
   *     members: [() => SupportArticle]
   *   }
   * });
   * ```
   */
  public static vectorIndexes<
    const T extends Record<string, VectorIndexOptions>
  >(defs: T & ValidateVectorIndexes<T>): VectorIndexConstructs<T> {
    return Metadata.addVectorIndexes(this.name, defs);
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
