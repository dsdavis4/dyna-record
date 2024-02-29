import type SingleTableDesign from "../../SingleTableDesign";
import {
  QueryBuilder,
  type QueryOptions as QueryBuilderOptions
} from "../../query-utils";
import DynamoClient from "../../DynamoClient";
import { BelongsToLink } from "../../relationships";
import type { DynamoTableItem } from "../../types";
import {
  isBelongsToLinkDynamoItem,
  tableItemToBelongsToLink,
  tableItemToEntity
} from "../../utils";
import OperationBase from "../OperationBase";
import type { EntityKeyConditions, QueryOptions, QueryResults } from "./types";

// TODO make sure this paginates on dynamo limits

/**
 * Query operations
 */
class Query<T extends SingleTableDesign> extends OperationBase<T> {
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
      entityClassName: this.EntityClass.name,
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
    const entityMetadata = this.entityMetadata;
    const { primaryKey, sortKey } = this.tableMetadata;

    const modelPk = entityMetadata.attributes[primaryKey].name;
    const modelSk = entityMetadata.attributes[sortKey].name;

    const keyCondition = {
      [modelPk]: this.EntityClass.primaryKeyValue(id),
      ...(options?.skCondition !== undefined && {
        [modelSk]: options?.skCondition
      })
    };

    const params = new QueryBuilder({
      entityClassName: this.EntityClass.name,
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
      isBelongsToLinkDynamoItem(res, this.tableMetadata)
        ? tableItemToBelongsToLink(this.tableMetadata, res)
        : tableItemToEntity<T>(this.EntityClass, res)
    );
  }
}

export default Query;
