import type SingleTableDesign from "../SingleTableDesign";
import { type NativeAttributeValue } from "@aws-sdk/util-dynamodb";
import Metadata, {
  type RelationshipMetadata,
  type EntityMetadata,
  type TableMetadata,
  type EntityClass,
  type BelongsToRelationship
} from "../metadata";
import DynamoClient, { TransactGetItemResponses } from "../DynamoClient";
import { QueryBuilder, QueryResolver } from "../query-utils";
import { includedRelationshipsFilter } from "../query-utils/Filters";
import type { EntityAttributes, RelationshipAttributeNames } from "./types";
import { TransactGetBuilder } from "../dynamo-utils";
import { BelongsToLink } from "../relationships";
import {
  type QueryCommandInput,
  type QueryCommandOutput
} from "@aws-sdk/lib-dynamodb";
import { isBelongsToRelationship } from "../metadata/utils";
import type { StringObj } from "../types";
import { isKeyOfEntity, tableItemToEntity } from "../utils";

// TODO as part of changing to use transactions... I should refactor  Query Resolver so its not needed anymore...

export interface FindByIdOptions<T extends SingleTableDesign> {
  include?: Array<{ association: RelationshipAttributeNames<T> }>;
}

// TODO is this duplicated?
type QueryItems = NonNullable<QueryCommandOutput["Items"]>;

type IncludedAssociations<T extends SingleTableDesign> = NonNullable<
  FindByIdOptions<T>["include"]
>;

interface SortedQueryResults {
  item: QueryItems[number];
  belongsToLinks: QueryItems;
  // TODO Should it be this?
  // belongsToLinks: BelongsToLinkDynamoItem;
}

type IncludedKeys<
  T extends SingleTableDesign,
  Opts extends FindByIdOptions<T>
> = Opts extends Required<FindByIdOptions<T>>
  ? [...NonNullable<Opts>["include"]][number]["association"]
  : never;

type EntityKeysWithIncludedAssociations<
  T extends SingleTableDesign,
  P extends keyof T
> = {
  [K in P]: T[K] extends SingleTableDesign
    ? EntityAttributes<T>
    : T[K] extends SingleTableDesign[]
    ? Array<EntityAttributes<T>>
    : T[K];
};

export type FindByIdResponse<
  T extends SingleTableDesign,
  Opts extends FindByIdOptions<T>
> = EntityKeysWithIncludedAssociations<
  T,
  keyof EntityAttributes<T> | IncludedKeys<T, Opts>
>;

// TODO this is duplicated from QueryResolve, can I delete from there
type RelationshipLookup = Record<string, RelationshipMetadata>;

// TODO this is duplicated from QueryResolve, can I delete from there
interface BelongsToLinkDynamoItem {
  Type: typeof BelongsToLink.name;
  [key: string]: NativeAttributeValue;
}

// TODO this is duplicated from QueryResolve, can I delete from there
interface RelationshipObj {
  relationsLookup: RelationshipLookup;
  belongsToRelationships: BelongsToRelationship[];
}

// Clean up the QueryResolver class... I moved most of the code here

/**
 * FindById operations
 */
class FindById<T extends SingleTableDesign> {
  private readonly EntityClass: EntityClass<T>;

  readonly #entityMetadata: EntityMetadata;
  readonly #tableMetadata: TableMetadata;
  readonly #transactionBuilder: TransactGetBuilder;

  constructor(Entity: EntityClass<T>) {
    this.EntityClass = Entity;
    this.#entityMetadata = Metadata.getEntity(Entity.name);
    this.#tableMetadata = Metadata.getTable(
      this.#entityMetadata.tableClassName
    );
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
  ): Promise<FindByIdResponse<T, FindByIdOptions<T>> | null> {
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
  private async findByIdOnly(
    id: string
  ): Promise<FindByIdResponse<T, FindByIdOptions<T>> | null> {
    const { name: tableName, primaryKey, sortKey } = this.#tableMetadata;

    const dynamo = new DynamoClient(tableName);
    const res = await dynamo.findById({
      [primaryKey]: this.EntityClass.primaryKeyValue(id),
      [sortKey]: this.EntityClass.name
    });

    if (res === null) {
      return null;
    } else {
      const queryResolver = new QueryResolver<T>(this.EntityClass);
      // TODO dont use type assertion. Should I break query resolver up so FindById and Query classes own their own resolvers?
      return (await queryResolver.resolve(res)) as FindByIdResponse<
        T,
        FindByIdOptions<T>
      >;
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
  ): Promise<FindByIdResponse<T, FindByIdOptions<T>> | null> {
    const { name: tableName } = this.#tableMetadata;

    const includedRels = this.getIncludedRelationships(includedAssociations);
    const params = this.buildFindByIdIncludesQuery(id, includedRels);

    const dynamo = new DynamoClient(tableName);
    const queryResults = await dynamo.query({
      ...params,
      ConsistentRead: true
    });

    // TODO do I need this?
    // if (queryResults.length === 0) return null;

    const sortedQueryResults = this.filterQueryResults(queryResults);
    const relationsObj = this.buildIncludedRelationsObj(includedRels);

    this.buildGetIncludedRelationshipsTransaction(
      sortedQueryResults,
      relationsObj
    );

    const transactionRes = await this.#transactionBuilder.executeTransaction();

    return this.resolveFindByIdIncludesResults(
      sortedQueryResults.item,
      transactionRes,
      relationsObj.relationsLookup
    );

    // const queryResolver = new QueryResolver<T>(this.EntityClass);
    // // TODO dont use type assertion. Should I break query resolver up so FindById and Query classes own their own resolvers?
    // return (await queryResolver.resolve(
    //   queryResults,
    //   includedRels
    // )) as FindByIdResponse<T, FindByIdOptions<T>>;
  }

  // TODO tsdoc
  private buildFindByIdIncludesQuery(
    id: string,
    includedRelationships: RelationshipMetadata[]
  ): QueryCommandInput {
    const { primaryKey } = this.#tableMetadata;
    const modelPrimaryKey = this.#entityMetadata.attributes[primaryKey].name;

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

  // TODO tsdoc
  private filterQueryResults(queryResults: QueryItems): SortedQueryResults {
    return queryResults.reduce<SortedQueryResults>(
      (acc, res) => {
        if (res.Type === this.EntityClass.name) acc.item = res;
        if (res.Type === BelongsToLink.name) acc.belongsToLinks.push(res);
        return acc;
      },
      { item: {}, belongsToLinks: [] }
    );
  }

  private buildGetIncludedRelationshipsTransaction(
    sortedQueryResults: SortedQueryResults,
    relationsObj: RelationshipObj
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

  // TODO Tsdoc to include this is for HasOne of HasMany - really anything from a link
  private buildGetRelationshipsThroughLinksTransaction(
    belongsToLinks: QueryItems,
    relationsLookup: RelationshipObj["relationsLookup"]
  ): void {
    const { name: tableName, primaryKey, sortKey } = this.#tableMetadata;

    belongsToLinks.forEach(link => {
      // TODO make these type safe... they are type any... Goal is that if something changed in BelongsToLink then there is a type error here...
      //      Can maybe do this by using BelongsToLinkDynamoItem...
      const { ForeignKey, ForeignEntityType } = link;
      const includedRel = relationsLookup[ForeignEntityType];

      this.#transactionBuilder.addGet({
        TableName: tableName,
        Key: {
          [primaryKey]: includedRel.target.primaryKeyValue(ForeignKey),
          [sortKey]: includedRel.target.name
        }
      });
    });
  }

  // TODO tsdoc this is for lookign up relationships where the forgein key is on the parent item
  private buildGetRelationshipsThroughForeignKeyTransaction(
    item: QueryItems[number],
    belongsToRelationships: RelationshipObj["belongsToRelationships"]
  ): void {
    if (belongsToRelationships.length > 0) {
      const { name: tableName, primaryKey, sortKey } = this.#tableMetadata;

      const tableKeyLookup = this.buildTableKeyLookup();

      belongsToRelationships.forEach(rel => {
        const tableForeignKeyAttrName = tableKeyLookup[rel.foreignKey];
        const foreignKeyVal = item[tableForeignKeyAttrName];

        this.#transactionBuilder.addGet({
          TableName: tableName,
          Key: {
            [primaryKey]: rel.target.primaryKeyValue(foreignKeyVal),
            [sortKey]: rel.target.name
          }
        });
      });
    }
  }

  /**
   * Create a lookup object to lookup a table key attribute name by the entities attribute key
   */
  private buildTableKeyLookup(): StringObj {
    return Object.entries(this.#entityMetadata.attributes).reduce<StringObj>(
      (acc, [tableKey, meta]) => {
        acc[meta.name] = tableKey;
        return acc;
      },
      {}
    );
  }

  // TODO tsdoc
  private buildIncludedRelationsObj(
    includedRelationships: RelationshipMetadata[]
  ): RelationshipObj {
    return includedRelationships.reduce<RelationshipObj>(
      (acc, rel) => {
        if (isBelongsToRelationship(rel)) {
          acc.belongsToRelationships.push(rel);
        }

        acc.relationsLookup[rel.target.name] = rel;

        return acc;
      },
      { relationsLookup: {}, belongsToRelationships: [] }
    );
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
        const included = this.#entityMetadata.relationships[key];
        if (included !== undefined) acc.push(included);
        return acc;
      },
      []
    );
  }

  private resolveFindByIdIncludesResults(
    entityTableItem: QueryItems[number],
    transactionResults: TransactGetItemResponses,
    relationsLookup: RelationshipLookup
  ): FindByIdResponse<T, FindByIdOptions<T>> {
    const parentEntity = tableItemToEntity(this.EntityClass, entityTableItem);

    // TODO Yikes! Clean this up
    transactionResults.forEach(res => {
      const tableItem = res.Item;

      if (tableItem !== undefined) {
        const rel = relationsLookup[tableItem.Type];

        if (isKeyOfEntity(parentEntity, rel.propertyName)) {
          if (rel.type === "HasMany") {
            // TODO can I get rid of the "as"
            parentEntity[rel.propertyName] ??= [] as any;
            (parentEntity[rel.propertyName] as unknown as any[]).push(
              tableItemToEntity(rel.target, tableItem)
            );
          } else {
            parentEntity[rel.propertyName] = tableItemToEntity(
              rel.target,
              tableItem
            ) as any;
          }
        }
      }
    });

    return parentEntity as FindByIdResponse<T, FindByIdOptions<T>>;
  }
}

export default FindById;
