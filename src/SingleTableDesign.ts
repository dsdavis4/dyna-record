import Metadata, {
  tableDefaultFields,
  type EntityClass,
  type DefaultEntityFields
} from "./metadata";
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

// TODO should this be renamed? Its weird to extend something called Single table design..
// TODO look into "constructor signatures" on this doc https://medium.com/better-programming/all-javascript-and-typescript-features-of-the-last-3-years-629c57e73e42
//      This might help me replace the EntityClass<T> that I have been passing around...
// TODO  or look into ConstructorParameters from this https://medium.com/javascript-in-plain-english/15-utility-types-that-every-typescript-developer-should-know-6cf121d4047c
// TODO  or InstanceType from InstanceType

// TODO "type" key might be too generic
// TODO Make sure that these values are not repeated in other files, without using this type

/**
 * Default attributes defined by no-orm, which cannot be customized by consumers and are required for no-orm to work
 */
// TODO Delete these, these are now handled from TableProps
const idField: DefaultEntityFields = "id";
const typeField: DefaultEntityFields = "type";
const createdAtField: DefaultEntityFields = "createdAt";
const updatedAtField: DefaultEntityFields = "updatedAt";

// TODO should these fields be readonly?
// TODO add typing for these aliases...
abstract class SingleTableDesign {
  @Attribute({ alias: tableDefaultFields.id })
  public [idField]: string;

  @Attribute({ alias: tableDefaultFields.type })
  public [typeField]: string;

  @DateAttribute({ alias: tableDefaultFields.createdAt })
  public [createdAtField]: Date;

  @DateAttribute({ alias: tableDefaultFields.updatedAt })
  public [updatedAtField]: Date;

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
  ): Promise<T | FindByIdIncludesRes<T, Opts> | null> {
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

  /**
   * Create an entity. If foreign keys are included in the attributes then BelongsToLinks will be demoralized accordingly
   * @param attributes - Attributes of the model to create
   * @returns The new Entity
   */
  public static async create<T extends SingleTableDesign>(
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
  public static async update<T extends SingleTableDesign>(
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
  public static async delete<T extends SingleTableDesign>(
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

export default SingleTableDesign;
