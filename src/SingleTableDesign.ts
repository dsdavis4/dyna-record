import Metadata, { type EntityClass } from "./metadata";
import { type QueryOptions as QueryBuilderOptions } from "./query-utils";
import { Attribute } from "./decorators";
import {
  FindById,
  type FindByIdOptions,
  type FindByIdResponse,
  Query,
  type QueryOptions,
  type EntityKeyConditions,
  type QueryResults,
  Create,
  type CreateOptions
} from "./operations";

abstract class SingleTableDesign {
  @Attribute({ alias: "Id" })
  public id: string;

  // TODO this is too generic. Consuming models would want to use this
  // Maybe EntityType? Would require data migration....
  @Attribute({ alias: "Type" })
  public type: string;

  @Attribute({ alias: "CreatedAt" })
  public createdAt: Date; // TODO this should serialize to date

  @Attribute({ alias: "UpdatedAt" })
  public updatedAt: Date; // TODO this should serialize to date

  /**
   * Find an entity by Id and optionally include associations
   * @param {string} id - Entity Id
   * @param {Object} options - FindById options
   * @param {Object[]=} options.include - The associations to include in the query
   * @param {string} options.include[].association - The name of the association to include. Must be defined on the model
   * @returns An entity with included associations serialized
   */
  public static async findById<
    T extends SingleTableDesign,
    Opts extends FindByIdOptions<T>
  >(
    this: EntityClass<T>,
    id: string,
    options?: Opts
  ): Promise<FindByIdResponse<T, Opts> | null> {
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
  public static async query<T extends SingleTableDesign>(
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
  public static async query<T extends SingleTableDesign>(
    this: EntityClass<T>,
    id: string,
    options?: Omit<QueryOptions, "indexName">
  ): Promise<QueryResults<T>>;

  public static async query<T extends SingleTableDesign>(
    this: EntityClass<T>,
    key: string | EntityKeyConditions<T>,
    options?: QueryBuilderOptions | Omit<QueryOptions, "indexName">
  ): Promise<QueryResults<T>> {
    const op = new Query<T>(this);
    return await op.run(key, options);
  }

  // TODO add tsdoc
  public static async create<T extends SingleTableDesign>(
    this: EntityClass<T>,
    attributes: CreateOptions<T>
  ): Promise<T> {
    const op = new Create<T>(this);
    return await op.run(attributes);
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

export default SingleTableDesign;
