import Metadata, { tableDefaultFields } from "./metadata";
import { type QueryOptions as QueryBuilderOptions } from "./query-utils";
import { Attribute, DateAttribute } from "./decorators";
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
  Delete
} from "./operations";
import type { EntityClass, Optional } from "./types";

interface NoOrmBase {
  id: string;
  type: string;
  createdAt: Date;
  updatedAt: Date;
}

// TODO should these fields be readonly?
// TODO add typing for these aliases...
abstract class NoOrm implements NoOrmBase {
  @Attribute({ alias: tableDefaultFields.id.alias })
  public id: string;

  @Attribute({ alias: tableDefaultFields.type.alias })
  public type: string;

  @DateAttribute({ alias: tableDefaultFields.createdAt.alias })
  public createdAt: Date;

  @DateAttribute({ alias: tableDefaultFields.updatedAt.alias })
  public updatedAt: Date;

  /**
   * Find an entity by Id and optionally include associations
   * @param {string} id - Entity Id
   * @param {Object} options - FindById options
   * @param {Object[]=} options.include - The associations to include in the query
   * @param {string} options.include[].association - The name of the association to include. Must be defined on the model
   * @returns An entity with included associations serialized
   */
  public static async findById<
    T extends NoOrm,
    Opts extends FindByIdOptions<T>
  >(
    this: EntityClass<T>,
    id: string,
    options?: Opts
  ): Promise<Optional<T | FindByIdIncludesRes<T, Opts>>> {
    const op = new FindById<T>(this);
    return await op.run(id, options);
  }

  /**
   * Query by PrimaryKey and optional SortKey/Filter/Index conditions
   * @param {Object} key - PrimaryKey value and optional SortKey condition. Keys must be attributes defined on the model
   * @param {Object=} options - QueryBuilderOptions. Supports filter and indexName
   * @param {Object=} options.filter - Filter conditions object. Keys must be attributes defined on the model. Value can be exact value for Equality. Array for "IN" or $beginsWith
   * @param {string=} options.indexName - The name of the index to filter on
   */
  public static async query<T extends NoOrm>(
    this: EntityClass<T>,
    key: EntityKeyConditions<T>,
    options?: QueryBuilderOptions
  ): Promise<QueryResults<T>>;

  /**
   * Query an EntityPartition by EntityId and optional SortKey/Filter conditions.
   * QueryByIndex not supported. Use Query with keys if indexName is needed
   * @param {string} id - Entity Id
   * @param {Object=} options - QueryOptions. Supports filter and skCondition
   * @param {Object=} options.skCondition - Sort Key condition. Can be an exact value or { $beginsWith: "val" }
   * @param {Object=} options.filter - Filter conditions object. Keys must be attributes defined on the model. Value can be exact value for Equality. Array for "IN" or $beginsWith
   */
  public static async query<T extends NoOrm>(
    this: EntityClass<T>,
    id: string,
    options?: Omit<QueryOptions, "indexName">
  ): Promise<QueryResults<T>>;

  public static async query<T extends NoOrm>(
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
   */
  public static async create<T extends NoOrm>(
    this: EntityClass<T>,
    attributes: CreateOptions<T>
  ): Promise<T> {
    const op = new Create<T>(this);
    return await op.run(attributes);
  }

  /**
   * Update an entity. If foreign keys are included in the attribute then:
   *   - BelongsToLinks will be created accordingly
   *   - If the entity already had a foreign key relationship, then those BelongsToLinks will be deleted
   * @param id - The id of the entity to update
   * @param attributes - Att
   */
  public static async update<T extends NoOrm>(
    this: EntityClass<T>,
    id: string,
    attributes: UpdateOptions<T>
  ): Promise<void> {
    const op = new Update<T>(this);
    await op.run(id, attributes);
  }

  /**
   * Delete an entity by ID
   *   - Delete all BelongsToLinks
   *   - Disassociate all foreign keys of linked models
   * @param id - The id of the entity to update
   */
  public static async delete<T extends NoOrm>(
    this: EntityClass<T>,
    id: string
  ): Promise<void> {
    const op = new Delete<T>(this);
    await op.run(id);
  }

  /**
   * Constructs the primary key value
   * @param {string} id - Entity Id
   * @returns Constructed primary key value
   */
  public static primaryKeyValue(id: string): string {
    const { delimiter } = Metadata.getEntityTable(this.name);
    return `${this.name}${delimiter}${id}`;
  }
}

export default NoOrm;
