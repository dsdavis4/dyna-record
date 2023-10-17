import type SingleTableDesign from "../SingleTableDesign";
import { type NativeAttributeValue } from "@aws-sdk/util-dynamodb";
import Metadata, {
  type RelationshipMetadata,
  type BelongsToRelationship,
  type EntityMetadata,
  type TableMetadata
} from "../metadata";
import { BelongsToLink } from "../relationships";
import { isBelongsToRelationship } from "../metadata/utils";

type DynamoTableItem = Record<string, NativeAttributeValue>;

type RelationshipLookup = Record<string, RelationshipMetadata>;

interface BelongsToLinkDynamoItem {
  Type: typeof BelongsToLink.name;
  [key: string]: NativeAttributeValue;
}

interface RelationshipObj {
  relationsLookup: RelationshipLookup;
  belongsToRelationships: BelongsToRelationship[];
}

// TODO make jsdoc better. See SingleTableDesign

/**
 * Resolves a Dynamo query to Entities instances
 */
class QueryResolver<T extends SingleTableDesign> {
  private entity: T;

  readonly #entityMetadata: EntityMetadata;
  readonly #tableMetadata: TableMetadata;

  constructor(EntityClass: new () => T) {
    this.entity = new EntityClass();
    this.#entityMetadata = Metadata.getEntity(EntityClass.name);
    this.#tableMetadata = Metadata.getTable(
      this.#entityMetadata.tableClassName
    );
  }

  /**
   * Resolves an array of dynamo items to an array of Entities
   * @param queryResults
   */
  public async resolve(
    queryResults: DynamoTableItem[]
  ): Promise<Array<T | BelongsToLink>>;

  /**
   * Resolves a single dynamo table item to an Entity
   */
  public async resolve(queryResult: DynamoTableItem): Promise<T>;

  /**
   * Resolves a multiple dynamo table items to an entity with included associations
   * This will result in extra GetItem calls for each association
   */
  public async resolve(
    queryResults: DynamoTableItem[],
    includedRelationships: RelationshipMetadata[]
  ): Promise<T>;

  // TODO fix this
  public async resolve(
    queryResult: DynamoTableItem | DynamoTableItem[],
    includedRelationships?: RelationshipMetadata[]
  ): Promise<T | Array<T | BelongsToLink>> {
    const isMultipleTableItems = Array.isArray(queryResult);
    const hasIncludedRelationships =
      Array.isArray(includedRelationships) &&
      !(includedRelationships.length === 0);

    const isFindByIdWithoutIncludes =
      !isMultipleTableItems && !hasIncludedRelationships;
    const isFindByIdWithIncludes =
      isMultipleTableItems && hasIncludedRelationships;
    const isQueryResults = isMultipleTableItems && !hasIncludedRelationships;

    if (isFindByIdWithoutIncludes) {
      return this.resolveEntity(queryResult);
    } else if (isFindByIdWithIncludes) {
      return await this.resolveEntityWithRelationships(
        queryResult,
        includedRelationships
      );
    } else if (isQueryResults) {
      return await this.resolveQueryResults(queryResult);
    }

    throw new Error("Invalid query resolution");
  }

  /**
   * Serialize a dynamo table item to its Entity model
   */
  private resolveEntity(tableItem: Record<string, NativeAttributeValue>): T {
    const attrs = this.#entityMetadata.attributes;
    Object.keys(tableItem).forEach(attr => {
      const entityKey = attrs[attr]?.name;
      if (this.isKeyOfEntity(entityKey)) {
        this.entity[entityKey] = tableItem[attr];
      }
    });

    return this.entity;
  }

  /**
   * Serialize a dynamo table item to a BelongsToLink
   * @param tableItem
   */
  private resolveBelongsToLink(
    tableItem: BelongsToLinkDynamoItem
  ): BelongsToLink {
    const instance = new BelongsToLink();
    const attrs = Metadata.getEntity(BelongsToLink.name).attributes;

    Object.keys(tableItem).forEach(attr => {
      const entityKey = attrs[attr]?.name;
      if (this.isKeyOfBelongsToLink(instance, entityKey)) {
        instance[entityKey] = tableItem[attr];
      }
    });

    return instance;
  }

  /**
   * Serialize dynamo table items to an entity with its relationships
   * For each BelongsToLink in the query, for for included relationships with a foreign key an extra GetItem call will be performed to get the related Entity
   */
  private async resolveEntityWithRelationships(
    queryResults: DynamoTableItem[],
    includedRelationships: RelationshipMetadata[]
  ): Promise<T> {
    const { relationsLookup, belongsToRelationships } =
      includedRelationships.reduce<RelationshipObj>(
        (acc, rel) => {
          if (isBelongsToRelationship(rel)) {
            acc.belongsToRelationships.push(rel);
          }

          acc.relationsLookup[rel.target.name] = rel;

          return acc;
        },
        {
          relationsLookup: {},
          belongsToRelationships: []
        }
      );

    await Promise.all(
      queryResults.map(async res => {
        await this.resolveEntityOrFindRelationship(
          res,
          relationsLookup,
          belongsToRelationships
        );
      })
    );

    return this.entity;
  }

  /**
   * Resolve an table item to its Entity model or perform a GetItem call on a BelongsToLink or foreign key to get the associated Entity
   */
  private async resolveEntityOrFindRelationship(
    res: DynamoTableItem,
    relationsLookup: RelationshipLookup,
    belongsToRelationships: BelongsToRelationship[]
  ): Promise<void> {
    const { sortKey, delimiter } = this.#tableMetadata;
    const [modelName] = res[sortKey].split(delimiter);

    if (res.Type === BelongsToLink.name) {
      const [modelName, id] = res[sortKey].split(delimiter);
      const includedRel = relationsLookup[modelName];
      if (includedRel !== undefined) {
        if (this.isKeyOfEntity(includedRel.propertyName)) {
          const res = await includedRel.target.findById(id);

          if (includedRel.type === "HasMany") {
            if (this.entity[includedRel.propertyName] === undefined) {
              this.entity[includedRel.propertyName] = [] as any;
            }
            (this.entity[includedRel.propertyName] as unknown as any[]).push(
              res
            );
          }

          if (includedRel.type === "HasOne") {
            if (this.entity[includedRel.propertyName] === undefined) {
              this.entity[includedRel.propertyName] = res as any;
            }
          }
        }
      }
    } else if (modelName === this.entity.constructor.name) {
      await Promise.all([
        this.resolve(res),
        Promise.all(
          belongsToRelationships.map(async rel => {
            await this.findAndResolveByForeignKey(rel);
          })
        )
      ]);
    }
  }

  /**
   * Resolve a BelongsTo or HasOne relationship by performing a GetItem using the foreignKey to get the related Entity
   */
  private async findAndResolveByForeignKey(
    rel: BelongsToRelationship
  ): Promise<void> {
    const foreignKey = this.entity[rel.foreignKey];

    if (
      this.isKeyOfEntity(rel.propertyName) &&
      foreignKey !== undefined &&
      typeof foreignKey === "string" // TODO need to find a way to check that its Forgein key instead of string
    ) {
      const res = await rel.target.findById(foreignKey);
      this.entity[rel.propertyName] = res as any;
    }
  }

  /**
   * Resolves results of a query operation
   * @param queryResults
   */
  private async resolveQueryResults(
    queryResults: DynamoTableItem[]
  ): Promise<Array<T | BelongsToLink>> {
    return queryResults.map(res =>
      this.isBelongsToLinkDynamoItem(res)
        ? this.resolveBelongsToLink(res)
        : this.resolveEntity(res)
    );
  }

  /**
   * Type guard to check if the key is defined on the entity
   */
  private isKeyOfEntity(key: string): key is keyof SingleTableDesign {
    return key in this.entity;
  }

  /**
   * Type guard to check if the key is defined on BelongsToLink
   */
  private isKeyOfBelongsToLink(
    instance: BelongsToLink,
    key: string
  ): key is keyof BelongsToLink {
    return key in instance;
  }

  /**
   * Type guard to check if the DynamoTableItem is a BelongsToLink
   * @param res DynamoTableItem
   * @returns boolean
   */
  private isBelongsToLinkDynamoItem(
    res: DynamoTableItem
  ): res is BelongsToLinkDynamoItem {
    return res.Type === BelongsToLink.name;
  }
}

export default QueryResolver;
