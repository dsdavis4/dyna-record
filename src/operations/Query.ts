import type SingleTableDesign from "../SingleTableDesign";
import Metadata, {
  type EntityMetadata,
  type TableMetadata,
  type EntityClass
} from "../metadata";
import {
  QueryBuilder,
  type KeyConditions,
  type QueryOptions as QueryBuilderOptions,
  type SortKeyCondition
} from "../query-utils";
import DynamoClient from "../DynamoClient";
import { BelongsToLink } from "../relationships";
import type { EntityAttributes } from "./types";
import { type DynamoTableItem } from "../types";
import { isBelongsToLinkDynamoItem, tableItemToEntity } from "../utils";

export interface QueryOptions extends QueryBuilderOptions {
  skCondition?: SortKeyCondition;
}

export type EntityKeyConditions<T> = {
  [K in keyof T]?: KeyConditions;
};

export type QueryResults<T extends SingleTableDesign> = Array<
  EntityAttributes<T> | BelongsToLink
>;

// TODO make sure this paginates on dynamo limits

/**
 * Query operations
 */
class Query<T extends SingleTableDesign> {
  readonly #EntityClass: EntityClass<T>;
  readonly #entityMetadata: EntityMetadata;
  readonly #tableMetadata: TableMetadata;

  constructor(Entity: EntityClass<T>) {
    this.#EntityClass = Entity;
    this.#entityMetadata = Metadata.getEntity(Entity.name);
    this.#tableMetadata = Metadata.getTable(
      this.#entityMetadata.tableClassName
    );
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
  ): Promise<QueryResults<T>> {
    if (typeof key === "string") {
      return await this.queryEntity(key, options);
    } else {
      return await this.queryByKey(key, options);
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
  ): Promise<QueryResults<T>> {
    const params = new QueryBuilder({
      entityClassName: this.#EntityClass.name,
      key,
      options
    }).build();

    const dynamo = new DynamoClient();
    const queryResults = await dynamo.query(params);

    return this.resolveQueryResults(queryResults);
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
  ): Promise<QueryResults<T>> {
    const entityMetadata = this.#entityMetadata;
    const { primaryKey, sortKey } = this.#tableMetadata;

    const modelPk = entityMetadata.attributes[primaryKey].name;
    const modelSk = entityMetadata.attributes[sortKey].name;

    const keyCondition = {
      [modelPk]: this.#EntityClass.primaryKeyValue(id),
      ...(options?.skCondition !== undefined && {
        [modelSk]: options?.skCondition
      })
    };

    const params = new QueryBuilder({
      entityClassName: this.#EntityClass.name,
      key: keyCondition,
      options
    }).build();

    const dynamo = new DynamoClient();
    const queryResults = await dynamo.query(params);

    return this.resolveQueryResults(queryResults);
  }

  private resolveQueryResults(
    queryResults: DynamoTableItem[]
  ): QueryResults<T> {
    return queryResults.map(res =>
      isBelongsToLinkDynamoItem(res)
        ? tableItemToEntity(BelongsToLink, res)
        : tableItemToEntity<T>(this.#EntityClass, res)
    );
  }
}

export default Query;
