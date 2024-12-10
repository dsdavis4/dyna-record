import Metadata, { tableDefaultFields } from "./metadata";
import { type QueryOptions as QueryBuilderOptions } from "./query-utils";
import { DateAttribute, StringAttribute } from "./decorators";
import {
  FindById,
  type FindByIdOptions,
  type FindByIdIncludesRes,
  Query,
  type QueryOptions,
  type EntityKeyConditions,
  type QueryResults,
  Create,
  type CreateOptions,
  Update,
  type UpdateOptions,
  Delete,
  type EntityAttributes,
  EntityAttributesOnly
} from "./operations";
import type { EntityClass, Optional } from "./types";
import { createInstance } from "./utils";

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
 * @Table({ name: "my-table", delimiter: "#" })
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

  // /**
  //  * Find an entity by Id and optionally include associations
  //  * @param {string} id - Entity Id
  //  * @param {Object} options - FindByIdOptions
  //  * @returns An entity with included associations serialized
  //  *
  //  * @example Without included relationships
  //  * ```typescript
  //  * const user = await User.findById("userId");
  //  * ```
  //  *
  //  * @example With included relationships
  //  * ```typescript
  //  * const user = await User.findById("userId", { include: [{ association: "profile" }] });
  //  * ```
  //  */
  // public static async findById<
  //   T extends DynaRecord,
  //   Opts extends FindByIdOptions<T>
  // >(
  //   this: EntityClass<T>,
  //   id: string,
  //   options?: Opts
  // ): Promise<Optional<T | FindByIdIncludesRes<T, Opts>>> {
  //   const op = new FindById<T>(this);
  //   return await op.run(id, options);
  // }

  // TODO add type tests for all variations of having and not having included options
  // dont forget to test that its optional...
  // and test that it has functions..
  // TODO check how this comment looks on published docs
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
  public static async findById<T extends DynaRecord>(
    this: EntityClass<T>,
    id: string,
    options?: undefined
  ): Promise<Optional<EntityAttributesOnly<T>>>;

  // TODO typeguard test that result can be undefined
  public static async findById<
    T extends DynaRecord,
    Opts extends FindByIdOptions<T>
  >(
    this: EntityClass<T>,
    id: string,
    options?: Opts
  ): Promise<Optional<FindByIdIncludesRes<T, Opts>>>;

  public static async findById<
    T extends DynaRecord,
    Opts extends FindByIdOptions<T>
  >(
    this: EntityClass<T>,
    id: string,
    options?: Opts
  ): Promise<Optional<EntityAttributesOnly<T> | FindByIdIncludesRes<T, Opts>>> {
    const op = new FindById<T>(this);
    return await op.run(id, options);
  }

  /**
   * Query by PartitionKey and optional SortKey/Filter/Index conditions
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
   *    type: ["BelongsToLink", "Profile"],
   *    createdAt: { $beginsWith: "202" },
   *    $or: [
   *      {
   *        foreignKey: "111",
   *        updatedAt: { $beginsWith: "2023-02-15" }
   *      },
   *      {
   *        foreignKey: ["222", "333"],
   *        createdAt: { $beginsWith: "2021-09-15T" },
   *        foreignEntityType: "Order"
   *      },
   *      {
   *        id: "123"
   *      }
   *    ]
   *  }
   * }
   *);
   * ```
   *
   * @example On index
   * ```typescript
   *  const result = await User.query(
   *    {
   *      pk: "User#123",
   *      sk: { $beginsWith: "Profile" }
   *    },
   *    { indexName: "myIndex" }
   *  );
   * ```
   */
  public static async query<T extends DynaRecord>(
    this: EntityClass<T>,
    key: EntityKeyConditions<T>,
    options?: QueryBuilderOptions
  ): Promise<QueryResults<T>>;

  /**
   * Query an EntityPartition by EntityId and optional SortKey/Filter conditions.
   * QueryByIndex not supported. Use Query with keys if indexName is needed
   * @param {string} id - Entity Id
   * @param {Object=} options - QueryOptions. Supports filter and skCondition. indexName is not supported
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
   *     type: "BelongsToLink",
   *     createdAt: "2023-11-21T12:31:21.148Z"
   *    }
   * });
   * ```
   */
  public static async query<T extends DynaRecord>(
    this: EntityClass<T>,
    id: string,
    options?: Omit<QueryOptions, "indexName">
  ): Promise<QueryResults<T>>;

  public static async query<T extends DynaRecord>(
    this: EntityClass<T>,
    key: string | EntityKeyConditions<T>,
    options?: QueryBuilderOptions | Omit<QueryOptions, "indexName">
  ): Promise<QueryResults<T>> {
    const op = new Query<T>(this);
    return await op.run(key, options);
  }

  /**
   * Create an entity. If foreign keys are included in the attributes then BelongsToLinks will be demoralized accordingly
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
   *   - BelongsToLinks will be created accordingly
   *   - If the entity already had a foreign key relationship, then those BelongsToLinks will be deleted
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
    ) as EntityAttributes<T>;

    // Return the updated instance, which is of type `this`
    return createInstance<T>(InstanceClass, updatedInstance);
  }

  /**
   * Delete an entity by ID
   *   - Delete all BelongsToLinks
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
}

export default DynaRecord;
