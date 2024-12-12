import type DynaRecord from "../../DynaRecord";
import Metadata from "../../metadata";

import {
  QueryBuilder,
  type QueryOptions as QueryBuilderOptions
} from "../../query-utils";
import DynamoClient from "../../dynamo-utils/DynamoClient";
import type { DynamoTableItem } from "../../types";
import {
  isBelongsToLinkDynamoItem,
  isString,
  tableItemToEntity
} from "../../utils";
import OperationBase from "../OperationBase";
import type {
  EntityKeyConditions,
  QueryOptions,
  QueryResult,
  QueryResults
} from "./types";
import Logger from "../../Logger";

// TODO update that this does nto return belongs to links and returns ... dyna record instances?

// TODO I think its setting everything to the class of the calling class, it instead should return the correct class
//      I think I already have a type that could help with this, by extracting relationships...

/**
 * Provides functionality to query entities from the database based on partition key, sort key, and optional filter conditions.
 *
 * The `Query` operation supports two main query patterns: querying by a simple entity ID or by more complex key conditions that include partition key, optional sort key, and filters. It can handle querying for both entities and their relationships, like "BelongsTo" links, based on the provided conditions.
 *
 * @template T - The type of the entity being queried, extending `DynaRecord`.
 */
class Query<T extends DynaRecord> extends OperationBase<T> {
  /**
   * Run the query operation
   * @param key EntityId or object with PartitionKey and optional SortKey conditions
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
   * Query by PartitionKey and optional SortKey/Filter/Index conditions
   * @param {Object} key - PartitionKey value and optional SortKey condition. Keys must be attributes defined on the model
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

    const queryResults = await DynamoClient.query(params);

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
    const modelPk = this.tableMetadata.partitionKeyAttribute.name;
    const modelSk = this.tableMetadata.sortKeyAttribute.name;

    const keyCondition = {
      [modelPk]: this.EntityClass.partitionKeyValue(id),
      ...(options?.skCondition !== undefined && {
        [modelSk]: options?.skCondition
      })
    };

    const params = new QueryBuilder({
      entityClassName: this.EntityClass.name,
      key: keyCondition,
      options
    }).build();

    const queryResults = await DynamoClient.query(params);

    return this.resolveQueryResults(queryResults);
  }

  /**
   * Resolve dynamo query results to the entity class
   * @param queryResults
   * @returns
   */
  private resolveQueryResults(
    queryResults: DynamoTableItem[]
  ): QueryResults<T> {
    const typeAlias = this.tableMetadata.defaultAttributes.type.alias;

    return queryResults.map(res =>
      res[typeAlias] === this.EntityClass.name
        ? tableItemToEntity<T>(this.EntityClass, res)
        : this.tableItemToLinkedEntity(res)
    );
  }

  private tableItemToLinkedEntity(tableItem: DynamoTableItem): QueryResult<T> {
    const typeAlias = this.tableMetadata.defaultAttributes.type.alias;
    const entityName = tableItem[typeAlias];

    if (isString(entityName)) {
      const entityMeta = Metadata.getEntity(entityName);
      // TODO I should make a type guard and remove the type cast
      return tableItemToEntity(
        entityMeta.EntityClass,
        tableItem
      ) as QueryResult<T>;
    } else {
      throw new Error("Malformed data. Unable to infer entity type");
    }
  }
}

export default Query;
