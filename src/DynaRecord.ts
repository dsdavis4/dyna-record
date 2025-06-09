import Metadata, { tableDefaultFields } from "./metadata";
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
  type EntityQueryKeyConditions
} from "./operations";
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
 *  // User implementation
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
   * The type of the Entity
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
   * Query an EntityPartition by EntityId and optional SortKey/Filter conditions.
   * QueryByIndex not supported. Use Query with keys if indexName is needed
   * @param {string} id - Entity Id
   * @param {Object=} options - QueryOptions. Supports filter, consistentRead and skCondition. indexName is not supported
   *
   * @example By partition key only
   * ```typescript
   * const user = await User.query("123");
   * ```
   *
   * @example By partition key and sort key exact match
   * ```typescript
   * const user = await User.query("123", { skCondition: "Profile#111" });
   * ```
   *
   * @example By partition key and sort key begins with
   * ```typescript
   * const user = await User.query("123", { skCondition: { $beginsWith: "Profile" } })
   * ```
   *
   * @example With filter (arbitrary example)
   * ```typescript
   * const user = await User.query("123", {
   *   filter: {
   *     type: "Profile",
   *     createdAt: "2023-11-21T12:31:21.148Z"
   *    }
   * });
   *
   * @example Query as consistent read
   * ```typescript
   * const user = await User.query("123", { consistentRead: true })
   * ```
   * ```
   */
  public static async query<T extends DynaRecord>(
    this: EntityClass<T>,
    key: string,
    options?: OptionsWithoutIndex
  ): Promise<QueryResults<T>>;

  /**
   * Query by PartitionKey and optional SortKey/Filter/Index conditions without and index
   * When querying without an index the key conditions must be the PartitionKey and SortKey defined on the entity
   * @param {Object} key - PartitionKey value and optional SortKey condition. Keys must be attributes defined on the model
   * @param {Object=} options - QueryBuilderOptions
   *
   * @example By partition key only
   * ```typescript
   * const user = await User.query({ pk: "User#123" });
   * ```
   *
   * @example By partition key and sort key exact match
   * ```typescript
   * const user = await User.query({ pk: "User#123", sk: "Profile#123" });
   * ```
   *
   * @example By partition key and sort key begins with
   * ```typescript
   * const user = await User.query({ pk: "User#123", sk: { $beginsWith: "Profile" } });
   * ```
   *
   * @example With filter (arbitrary example)
   * ```typescript
   * const result = await User.query(
   *  {
   *    myPk: "User|123"
   *  },
   *  {
   *    filter: {
   *      type: ["Profile", "Preferences"],
   *      createdAt: { $beginsWith: "2023" },
   *      $or: [
   *        {
   *         name: "John",
   *         email: { $beginsWith: "testing }
   *        },
   *        {
   *          name: "Jane",
   *          updatedAt: { $beginsWith: "2024" },
   *        },
   *       {
   *         id: "123"
   *       }
   *      ]
   *    }
   * }
   *);
   * ```
   *
   * @example With a consistent read
   * ```typescript
   * const user = await User.query({ pk: "User#123", consistentRead: true });
   * ```
   */
  public static async query<T extends DynaRecord>(
    this: EntityClass<T>,
    key: EntityKeyConditions<T>,
    options?: OptionsWithoutIndex
  ): Promise<QueryResults<T>>;

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
   *      name: "SomeName" // An attribute that is part of the key condition on an iondex
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
    options?: OptionsWithoutIndex | OptionsWithIndex
  ): Promise<QueryResults<T>> {
    const op = new Query<T>(this);
    return await op.run(key, options);
  }

  /**
   * Create an entity. If foreign keys are included in the attributes then links will be demoralized accordingly
   * @param attributes - Attributes of the model to create
   * @returns The new Entity
   *
   * ```typescript
   * const newUser = await User.create({ name: "Alice", email: "alice@example.com", profileId: "123" });
   * ```
   */
  public static async create<T extends DynaRecord>(
    this: EntityClass<T>,
    attributes: CreateOptions<T>
  ): Promise<ReturnType<Create<T>["run"]>> {
    const op = new Create<T>(this);
    return await op.run(attributes);
  }

  /**
   * Update an entity. If foreign keys are included in the attribute then:
   *   - Manages associated relationship links as needed
   *   - If the entity already had a foreign key relationship, then denormalized records will be deleted from each partition
   *     - If the foreign key is not nullable then a {@link NullConstraintViolationError} is thrown.
   *   - Validation errors will be thrown if the attribute being removed is not nullable
   * @param id - The id of the entity to update
   * @param attributes - Attributes to update
   *
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
   */
  public static async update<T extends DynaRecord>(
    this: EntityClass<T>,
    id: string,
    attributes: UpdateOptions<T>
  ): Promise<void> {
    const op = new Update<T>(this);
    await op.run(id, attributes);
  }

  /**
   *  Same as the static `update` method but on an instance. Returns the full updated instance
   *
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
   */
  public async update<T extends this>(
    attributes: UpdateOptions<T>
  ): Promise<T> {
    const InstanceClass = this.constructor as EntityClass<T>;
    const op = new Update<T>(InstanceClass);
    const updatedAttributes = await op.run(this.id, attributes);

    const clone = structuredClone(this);

    // Update the current instance with new attributes
    Object.assign(clone, updatedAttributes);

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
  ): T {
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
}

export default DynaRecord;
