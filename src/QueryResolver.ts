import SingleTableDesign from "./SingleTableDesign";
import { NativeAttributeValue } from "@aws-sdk/util-dynamodb";
import Metadata, {
  RelationshipMetadata,
  BelongsToRelationship,
  EntityMetadata,
  TableMetadata
} from "./metadata";
import { BelongsToLink } from "./relationships";

type DynamoTableItem = Record<string, NativeAttributeValue>;

/**
 * Resolves a Dynamo query to Entities instances
 */
class QueryResolver<T extends SingleTableDesign> {
  private entity: T;

  readonly #entityMetadata: EntityMetadata;
  readonly #tableMetadata: TableMetadata;

  constructor(entity: T) {
    this.entity = entity;
    this.#entityMetadata = Metadata.entities[entity.constructor.name];
    this.#tableMetadata = Metadata.tables[this.#entityMetadata.tableName];
  }

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

  public async resolve(
    queryResult: DynamoTableItem | DynamoTableItem[],
    includedRelationships?: RelationshipMetadata[]
  ) {
    const isMultipleTableItems = Array.isArray(queryResult);
    const hasIncludedRelationships =
      Array.isArray(includedRelationships) && !!includedRelationships.length;
    if (!isMultipleTableItems && !hasIncludedRelationships) {
      return this.resolveEntity(queryResult);
    } else if (isMultipleTableItems && hasIncludedRelationships) {
      return await this.resolveEntityWithRelationships(
        queryResult,
        includedRelationships
      );
    } else {
      throw new Error("Invalid query resolution");
    }
  }

  /**
   * Serialize a dynamo table item to its Entity model
   */
  private resolveEntity(tableItem: Record<string, NativeAttributeValue>) {
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
   * Serialize dynamo table items to an entity with its relationships
   * For each BelongsToLink in the query, an extra GetItem call will be performed to get the related Entity
   */
  private async resolveEntityWithRelationships(
    queryResults: DynamoTableItem[],
    includedRelationships: RelationshipMetadata[]
  ) {
    const { relationsLookup, belongTos } = includedRelationships.reduce(
      (acc, rel) => {
        if (this.isBelongsToRelationship(rel)) {
          acc.belongTos.push(rel);
        }

        acc.relationsLookup[rel.target.name] = rel;

        return acc;
      },
      {
        relationsLookup: {} as Record<string, RelationshipMetadata>,
        belongTos: [] as BelongsToRelationship[]
      }
    );

    await Promise.all(
      queryResults.map(res =>
        this.resolveEntityOrFindRelationship(res, relationsLookup, belongTos)
      )
    );

    return this.entity;
  }

  /**
   * Resolve an table item to its Entity model or perform a GetItem call on a BelongsToLink to get the associated Entity
   */
  private async resolveEntityOrFindRelationship(
    res: DynamoTableItem,
    relationsLookup: Record<string, RelationshipMetadata>,
    belongsTos: BelongsToRelationship[]
  ) {
    const { sortKey, delimiter } = this.#tableMetadata;
    const [modelName] = res[sortKey].split(delimiter);

    if (res.Type === BelongsToLink.name) {
      const [modelName, id] = res[sortKey].split(delimiter);
      const includedRel = relationsLookup[modelName];
      if (!!includedRel) {
        if (this.isKeyOfEntity(includedRel.propertyName)) {
          const res = await includedRel.target.findById(id);

          if (includedRel.type === "HasMany") {
            if (!this.entity[includedRel.propertyName]) {
              this.entity[includedRel.propertyName] = [] as any;
            }
            (this.entity[includedRel.propertyName] as unknown as any[]).push(
              res
            );
          }
        }
      }
    } else if (modelName === this.entity.constructor.name) {
      this.resolve(res);

      await Promise.all(
        belongsTos.map(belongsTo => this.findAndResolveBelongsTo(belongsTo))
      );
    }
  }

  /**
   * Resolve a BelongsTo relationship by performing a GetItem on the BelongsToLink to get the related Entity
   */
  private async findAndResolveBelongsTo(belongsTo: BelongsToRelationship) {
    const foreignKey = this.entity[belongsTo.foreignKey as keyof T];

    if (this.isKeyOfEntity(belongsTo.propertyName) && foreignKey) {
      const res = await belongsTo.target.findById(foreignKey as string);
      this.entity[belongsTo.propertyName] = res as any;
    }
  }

  /**
   * Type guard to check if the key is defined on the entity
   */
  private isKeyOfEntity(key: string): key is keyof SingleTableDesign {
    return key in this.entity;
  }

  /**
   * Type guard to check if the relationship is a BelongsTo
   */
  private isBelongsToRelationship(
    rel: RelationshipMetadata
  ): rel is BelongsToRelationship {
    return rel.type === "BelongsTo";
  }
}

export default QueryResolver;
