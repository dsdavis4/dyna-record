import type SingleTableDesign from "../../SingleTableDesign";
import type { RelationshipMetadata, EntityClass } from "../../metadata";
import DynamoClient, {
  type TransactGetItemResponses,
  type QueryItems
} from "../../DynamoClient";
import { QueryBuilder } from "../../query-utils";
import { includedRelationshipsFilter } from "../../query-utils/Filters";
import { TransactGetBuilder } from "../../dynamo-utils";
import { type QueryCommandInput } from "@aws-sdk/lib-dynamodb";
import type {
  BelongsToLinkDynamoItem,
  RelationshipMetaObj,
  RelationshipLookup
} from "../../types";
import {
  isBelongsToLinkDynamoItem,
  isKeyOfEntity,
  isPropertyKey,
  isString,
  tableItemToEntity
} from "../../utils";
import OperationBase from "../OperationBase";
import type {
  FindByIdOptions,
  FindByIdIncludesRes,
  IncludedAssociations,
  SortedQueryResults
} from "./types";
import { buildEntityRelationshipMetaObj } from "../utils";

// TODO if the item is not found it should return null
// TODO if relationships are not found it should return an array for has many and null for has one or belongs to

/**
 * FindById operations
 */
class FindById<T extends SingleTableDesign> extends OperationBase<T> {
  readonly #transactionBuilder: TransactGetBuilder;

  constructor(Entity: EntityClass<T>) {
    super(Entity);
    this.#transactionBuilder = new TransactGetBuilder();
  }

  /**
   * Find an entity by Id and optionally include associations
   * @param {string} id - Entity Id
   * @param {Object} options - FindById options
   * @param {Object[]=} options.include - The associations to include in the query
   * @param {string} options.include[].association - The name of the association to include. Must be defined on the model
   * @returns An entity with optional included associations serialized
   */
  public async run(
    id: string,
    options?: FindByIdOptions<T>
  ): Promise<T | FindByIdIncludesRes<T, FindByIdOptions<T>> | null> {
    if (options?.include === undefined) {
      return await this.findByIdOnly(id);
    } else {
      return await this.findByIdWithIncludes(id, options.include);
    }
  }

  /**
   * Find an Entity by id without associations
   * @param {string} id - Entity Id
   * @returns An entity object or null
   */
  private async findByIdOnly(id: string): Promise<T | null> {
    const { name: tableName } = this.tableMetadata;

    const dynamo = new DynamoClient();
    const res = await dynamo.getItem({
      TableName: tableName,
      Key: {
        [this.primaryKeyAlias]: this.EntityClass.primaryKeyValue(id),
        [this.sortKeyAlias]: this.EntityClass.name
      },
      ConsistentRead: true
    });

    if (res === null) {
      return null;
    } else {
      return tableItemToEntity<T>(this.EntityClass, res);
    }
  }

  /**
   * Find an entity with included associations
   * @param {string} id - Entity Id
   * @param {Object[]=} includedAssociations - The associations to include in the query
   * @param {string} includedAssociations[].association - The name of the association to include. Must be defined on the model
   * @returns An entity with included associations serialized
   */
  private async findByIdWithIncludes(
    id: string,
    includedAssociations: IncludedAssociations<T>
  ): Promise<FindByIdIncludesRes<T, FindByIdOptions<T>> | null> {
    const includedRels = this.getIncludedRelationships(includedAssociations);
    const params = this.buildFindByIdIncludesQuery(id, includedRels);

    const dynamo = new DynamoClient();
    const queryResults = await dynamo.query({
      ...params,
      ConsistentRead: true
    });

    if (queryResults.length === 0) {
      return null;
    }

    const sortedQueryResults = this.filterQueryResults(queryResults);
    const relationsObj = buildEntityRelationshipMetaObj(includedRels);

    this.buildGetIncludedRelationshipsTransaction(
      sortedQueryResults,
      relationsObj
    );

    const transactionRes = await this.#transactionBuilder.executeTransaction();

    if (transactionRes.some(res => res.Item === undefined)) {
      // TODO I am getting this on some queries... why?
      // TODO delete this code block
      console.error("ERROR - Orphaned Belongs To Links");
    }

    return this.resolveFindByIdIncludesResults(
      sortedQueryResults.item,
      transactionRes,
      relationsObj.relationsLookup
    );
  }

  /**
   * Build the query to find the entity, and any of the BelongsToLinks for the included models
   * @param id
   * @param includedRelationships
   * @returns
   */
  private buildFindByIdIncludesQuery(
    id: string,
    includedRelationships: RelationshipMetadata[]
  ): QueryCommandInput {
    const modelPrimaryKey = this.tableMetadata.primaryKeyAttribute.name;

    const partitionFilter = includedRelationshipsFilter(
      this.EntityClass.name,
      includedRelationships
    );

    return new QueryBuilder({
      entityClassName: this.EntityClass.name,
      key: { [modelPrimaryKey]: this.EntityClass.primaryKeyValue(id) },
      options: { filter: partitionFilter }
    }).build();
  }

  /**
   * Sort query results into an object containing:
   *  - item: The FindById DynamoItem
   *  - belongsToLinks: BelongsToLinkDynamoItem records for each of the included relationships
   * @param queryResults
   * @returns
   */
  private filterQueryResults(queryResults: QueryItems): SortedQueryResults {
    return queryResults.reduce<SortedQueryResults>(
      (acc, res) => {
        const typeAlias = this.tableMetadata.defaultAttributes.type.alias;
        if (res[typeAlias] === this.EntityClass.name) acc.item = res;
        if (isBelongsToLinkDynamoItem(res, this.tableMetadata))
          acc.belongsToLinks.push(res);
        return acc;
      },
      { item: {}, belongsToLinks: [] as BelongsToLinkDynamoItem[] }
    );
  }

  private buildGetIncludedRelationshipsTransaction(
    sortedQueryResults: SortedQueryResults,
    relationsObj: RelationshipMetaObj
  ): void {
    this.buildGetRelationshipsThroughLinksTransaction(
      sortedQueryResults.belongsToLinks,
      relationsObj.relationsLookup
    );

    this.buildGetRelationshipsThroughForeignKeyTransaction(
      sortedQueryResults.item,
      relationsObj.belongsToRelationships
    );
  }

  /**
   * Builds transactions to get an associated entity via a BelongsToLink (HasOne or HasMany)
   * @param belongsToLinks
   * @param relationsLookup
   */
  private buildGetRelationshipsThroughLinksTransaction(
    belongsToLinks: BelongsToLinkDynamoItem[],
    relationsLookup: RelationshipMetaObj["relationsLookup"]
  ): void {
    const { name: tableName, defaultAttributes } = this.tableMetadata;

    belongsToLinks.forEach(link => {
      const foreignKey = link[defaultAttributes.foreignKey.alias];
      const foreignEntityType = link[defaultAttributes.foreignEntityType.alias];

      if (isPropertyKey(foreignEntityType) && isString(foreignKey)) {
        const rel = relationsLookup[foreignEntityType];

        this.#transactionBuilder.addGet({
          TableName: tableName,
          Key: {
            [this.primaryKeyAlias]: rel.target.primaryKeyValue(foreignKey),
            [this.sortKeyAlias]: rel.target.name
          }
        });
      } else {
        console.error(
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `Corrupted foreign key value. Invalid type. ${foreignEntityType} - ${foreignKey}`
        );
      }
    });
  }

  /**
   * Builds transactions to get an associated entity using a foreign key on the parent model (BelongsTo)
   * @param belongsToLinks
   * @param relationsLookup
   */
  private buildGetRelationshipsThroughForeignKeyTransaction(
    item: QueryItems[number],
    belongsToRelationships: RelationshipMetaObj["belongsToRelationships"]
  ): void {
    if (belongsToRelationships.length > 0) {
      const { name: tableName } = this.tableMetadata;
      const { attributes } = this.entityMetadata;

      belongsToRelationships.forEach(rel => {
        const foreignKeyTableAlias: string = attributes[rel.foreignKey].alias;
        const foreignKeyVal: string = item[foreignKeyTableAlias];

        this.#transactionBuilder.addGet({
          TableName: tableName,
          Key: {
            [this.primaryKeyAlias]: rel.target.primaryKeyValue(foreignKeyVal),
            [this.sortKeyAlias]: rel.target.name
          }
        });
      });
    }
  }

  /**
   * Get relationship metadata for the associations included in the query
   * @param includedAssociations
   * @returns
   */
  private getIncludedRelationships(
    includedAssociations: IncludedAssociations<T>
  ): RelationshipMetadata[] {
    return includedAssociations.reduce<RelationshipMetadata[]>(
      (acc, includedRel) => {
        const key = includedRel.association as string;
        const included = this.entityMetadata.relationships[key];
        if (included !== undefined) acc.push(included);
        return acc;
      },
      []
    );
  }

  /**
   * Serialize the FindById item to its class, serialize results from included relationships query onto the entity
   * @param entityTableItem
   * @param transactionResults
   * @param relationsLookup
   * @returns
   */
  private resolveFindByIdIncludesResults(
    entityTableItem: QueryItems[number],
    transactionResults: TransactGetItemResponses,
    relationsLookup: RelationshipLookup
  ): FindByIdIncludesRes<T, FindByIdOptions<T>> {
    const parentEntity = tableItemToEntity(this.EntityClass, entityTableItem);
    const typeAlias = this.tableMetadata.defaultAttributes.type.alias;

    transactionResults.forEach(res => {
      const tableItem = res.Item;

      if (tableItem !== undefined) {
        const rel = relationsLookup[tableItem[typeAlias]];

        if (isKeyOfEntity(parentEntity, rel.propertyName)) {
          if (rel.type === "HasMany" || rel.type === "HasAndBelongsToMany") {
            const entity = tableItemToEntity(rel.target, tableItem);
            const entities = parentEntity[rel.propertyName] ?? [];

            if (Array.isArray(entities)) {
              entities.push(entity);
            }

            Object.assign(parentEntity, { [rel.propertyName]: entities });
          } else {
            Object.assign(parentEntity, {
              [rel.propertyName]: tableItemToEntity(rel.target, tableItem)
            });
          }
        }
      }
    });

    return parentEntity as FindByIdIncludesRes<T, FindByIdOptions<T>>;
  }
}

export default FindById;
