import Metadata, { tableDefaultFields, type TableMetadata } from "./metadata";
import { DateAttribute, StringAttribute } from "./decorators";
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
  type EntityAttributesOnly,
  type EntityAttributesInstance,
  type IncludedAssociations,
  type IndexKeyConditions,
  type OptionsWithoutIndex,
  type OptionsWithIndex,
  type EntityQueryKeyConditions,
  type TypedFilterParams,
  type InferQueryResults
} from "./operations";
import { mergePartialObjectAttributes } from "./operations/utils";
import type { DynamoTableItem, EntityClass, Optional } from "./types";
import { createInstance, tableItemToEntity } from "./utils";

interface DynaRecordBase {
  id: string;
  type: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Serves as an abstract base class for entities in the ORM system. It defines standard fields such as `id`, `type`, `createdAt`, and `updatedAt`, and provides static methods for CRUD operations and queries. This class encapsulates common behaviors and properties that all entities share, leveraging decorators for attribute metadata and supporting operations like finding, creating, updating, and deleting entities.
 *
 * Table classes should extend this class, and each entity should extend the table class
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
   * Filter keys are strongly typed to only accept valid attribute names from entities in the
   * partition. The `type` field only accepts valid entity class names. When `type` is specified
   * as a single value in a `$or` block, filter keys are narrowed to that entity's attributes.
   *
   * The return type is automatically narrowed when the filter specifies a `type` value:
   * - `type: "Order"` → `Array<EntityAttributesInstance<Order>>`
   * - `type: ["Order", "PaymentMethod"]` → `Array<EntityAttributesInstance<Order> | EntityAttributesInstance<PaymentMethod>>`
   * - No `type` specified → `QueryResults<T>` (union of all partition entity types)
   *
   * @param {string | EntityKeyConditions<T>} key - Entity Id (string) or an object with PartitionKey and optional SortKey conditions.
   * @param {Object=} options - QueryOptions. Supports typed filter, consistentRead and skCondition. indexName is not supported.
   * @param {TypedFilterParams<T>=} options.filter - Typed filter conditions. Keys are validated against partition entity attributes. The `type` field accepts valid entity class names.
   * @returns A promise resolving to query results. The return type narrows based on the filter's `type` value.
   *
   * @example By partition key only (string shorthand)
   * ```typescript
   * const results = await Customer.query("123");
   * ```
   *
   * @example By partition key and sort key begins with
   * ```typescript
   * const results = await Customer.query("123", { skCondition: { $beginsWith: "Order" } });
   * ```
   *
   * @example With typed filter
   * ```typescript
   * const orders = await Customer.query("123", {
   *   filter: { type: "Order", orderDate: "2023-01-01" }
   * });
   * // orders is Array<EntityAttributesInstance<Order>>
   * ```
   *
   * @example With type as array (IN operator)
   * ```typescript
   * const results = await Customer.query("123", {
   *   filter: { type: ["Order", "PaymentMethod"] }
   * });
   * ```
   *
   * @example With $or filter narrowing
   * ```typescript
   * const results = await Customer.query("123", {
   *   filter: {
   *     $or: [
   *       { type: "Order", orderDate: "2023" },
   *       { type: "PaymentMethod", lastFour: "1234" }
   *     ]
   *   }
   * });
   * ```
   *
   * @example By partition key and sort key exact match
   * ```typescript
   * const results = await Customer.query("123", { skCondition: "Order#456" });
   * ```
   *
   * @example Return type narrowing does not apply to $or-only filters
   * ```typescript
   * // Return type is QueryResults<Customer> (full union), not narrowed,
   * // because return narrowing only inspects the top-level type field.
   * const results = await Customer.query("123", {
   *   filter: {
   *     $or: [
   *       { type: "Order", orderDate: "2023" },
   *       { type: "PaymentMethod", lastFour: "1234" }
   *     ]
   *   }
   * });
   * ```
   *
   * @example By partition key only (object form)
   * ```typescript
   * const results = await Customer.query({ pk: "Customer#123" });
   * ```
   *
   * @example Query as consistent read
   * ```typescript
   * const results = await Customer.query("123", { consistentRead: true });
   * ```
   */
  public static async query<
    T extends DynaRecord,
    const F extends TypedFilterParams<T> = TypedFilterParams<T>,
    SK extends string = string
  >(
    this: EntityClass<T>,
    key: string | EntityKeyConditions<T>,
    options?: OptionsWithoutIndex<T> & {
      filter?: F;
      skCondition?: SK | { $beginsWith: SK };
    }
  ): Promise<InferQueryResults<T, F, SK>>;

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
   * Returns serialized table metadata containing only serializable values.
   * This method returns a plain object representation of the table metadata,
   * with functions, class instances, and other non-serializable data converted
   * to their string representations or omitted.
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
    return tableMetadata.toJSON(entities);
  }
}

export default DynaRecord;
