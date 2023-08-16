import SingleTableDesign from "../SingleTableDesign";
import Metadata, {
  RelationshipMetadata,
  EntityMetadata,
  TableMetadata,
  EntityClass
} from "../metadata";
import {
  QueryBuilder,
  QueryResolver,
  KeyConditions,
  QueryOptions as QueryBuilderOptions,
  SortKeyCondition
} from "../query-utils";
import DynamoClient from "../DynamoClient";
import { BelongsToLink } from "../relationships";

export interface QueryOptions extends QueryBuilderOptions {
  skCondition?: SortKeyCondition;
}

export type EntityKeyConditions<T> = {
  [K in keyof T]?: KeyConditions;
};

/**
 * Query operations
 */
class Query<T extends SingleTableDesign> {
  private EntityClass: EntityClass<T>;

  readonly #entityMetadata: EntityMetadata;
  readonly #tableMetadata: TableMetadata;

  constructor(Entity: EntityClass<T>) {
    this.EntityClass = Entity;
    this.#entityMetadata = Metadata.entities[Entity.name];
    this.#tableMetadata = Metadata.tables[this.#entityMetadata.tableName];
  }

  /**
   *
   * @param key EntityId or object with PrimaryKey and optional SortKey conditions
   * @param options Filter conditions, indexName, or SortKey conditions if querying by keys
   * @returns Array of Entity or BelongsToLinks
   */
  public async run(
    key: string | EntityKeyConditions<T>,
    options?: QueryBuilderOptions | Omit<QueryOptions, "indexName">
  ): Promise<(T | BelongsToLink)[]> {
    if (typeof key === "string") {
      return await this.queryEntity(key, options);
    } else {
      return this.queryByKey(key, options);
    }
  }

  /**
   * Query by PrimaryKey and optional SortKey/Filter/Index conditions
   * @param {Object} key - PrimaryKey value and optional SortKey condition. Keys must be attributes defined on the model
   * @param {Object=} options - QueryBuilderOptions. Supports filter and indexName
   * @param {Object=} options.filter - Filter conditions object. Keys must be attributes defined on the model. Value can be exact value for Equality. Array for "IN" or $beginsWith
   * @param {string=} options.indexName - The name of the index to filter on
   */
  private async queryByKey(
    key: EntityKeyConditions<T>,
    options?: QueryBuilderOptions
  ): Promise<(T | BelongsToLink)[]> {
    const { name: tableName } = this.#tableMetadata;

    const params = new QueryBuilder({
      entityClassName: this.EntityClass.name,
      key,
      options
    }).build();

    const dynamo = new DynamoClient(tableName);
    const queryResults = await dynamo.query(params);

    const queryResolver = new QueryResolver<T>(this.EntityClass);
    return await queryResolver.resolve(queryResults);
  }

  /**
   * Query an EntityPartition by EntityId and optional SortKey/Filter conditions.
   * QueryByIndex not supported. Use Query with keys if indexName is needed
   * @param {string} id - Entity Id
   * @param {Object=} options - QueryOptions. Supports filter and skCondition
   * @param {Object=} options.skCondition - Sort Key condition. Can be an exact value or { $beginsWith: "val" }
   * @param {Object=} options.filter - Filter conditions object. Keys must be attributes defined on the model. Value can be exact value for Equality. Array for "IN" or $beginsWith
   */
  private async queryEntity(
    id: string,
    options?: Omit<QueryOptions, "indexName">
  ): Promise<(T | BelongsToLink)[]> {
    const entityMetadata = Metadata.entities[this.EntityClass.name];
    const tableMetadata = Metadata.tables[entityMetadata.tableName];

    const modelPk = entityMetadata.attributes[tableMetadata.primaryKey].name;
    const modelSk = entityMetadata.attributes[tableMetadata.sortKey].name;

    const keyCondition = {
      [modelPk]: this.EntityClass.primaryKeyValue(id),
      ...(options?.skCondition && { [modelSk]: options?.skCondition })
    };

    const params = new QueryBuilder({
      entityClassName: this.EntityClass.name,
      key: keyCondition,
      options
    }).build();

    const dynamo = new DynamoClient(tableMetadata.name);
    const queryResults = await dynamo.query(params);

    const queryResolver = new QueryResolver<T>(this.EntityClass);
    return await queryResolver.resolve(queryResults);
  }
}

export default Query;
