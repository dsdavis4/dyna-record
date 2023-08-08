import SingleTableDesign from "../SingleTableDesign";
import { NativeAttributeValue } from "@aws-sdk/util-dynamodb";
import Metadata, {
  RelationshipMetadata,
  BelongsToRelationship,
  HasOneRelationship,
  EntityMetadata,
  TableMetadata
} from "../metadata";
import { BelongsToLink } from "../relationships";

type DynamoTableItem = Record<string, NativeAttributeValue>;

type ForeignKeyLinkedRelationship = HasOneRelationship | BelongsToRelationship;

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
   * Resolves an array of dynamo items to an array of Entities
   * @param queryResults
   */
  public async resolve(queryResults: DynamoTableItem[]): Promise<T[]>;

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
      return this.resolveQueryResults(queryResult);
    }

    throw new Error("Invalid query resolution");
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
   * Serialize a dynamo table item to a BelongsToLink
   * @param tableItem
   */
  private resolveBelongsToLink(
    tableItem: Record<string, NativeAttributeValue>
  ) {
    if (tableItem.Type !== BelongsToLink.name) return;

    const instance = new BelongsToLink();
    const attrs = Metadata.entities.BelongsToLink.attributes;

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
  ) {
    const { relationsLookup, foreignKeyLinkedRelationships } =
      includedRelationships.reduce(
        (acc, rel) => {
          if (this.isForeignKeyLinkedRelationship(rel)) {
            acc.foreignKeyLinkedRelationships.push(rel);
          }

          acc.relationsLookup[rel.target.name] = rel;

          return acc;
        },
        {
          relationsLookup: {} as Record<string, RelationshipMetadata>,
          foreignKeyLinkedRelationships: [] as ForeignKeyLinkedRelationship[]
        }
      );

    await Promise.all(
      queryResults.map(res =>
        this.resolveEntityOrFindRelationship(
          res,
          relationsLookup,
          foreignKeyLinkedRelationships
        )
      )
    );

    return this.entity;
  }

  /**
   * Resolve an table item to its Entity model or perform a GetItem call on a BelongsToLink or foreign key to get the associated Entity
   */
  private async resolveEntityOrFindRelationship(
    res: DynamoTableItem,
    relationsLookup: Record<string, RelationshipMetadata>,
    foreignKeyLinkedRelationships: ForeignKeyLinkedRelationship[]
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
        foreignKeyLinkedRelationships.map(rel =>
          this.findAndResolveByForeignKey(rel)
        )
      );
    }
  }

  /**
   * Resolve a BelongsTo or HasOne relationship by performing a GetItem using the foreignKey to get the related Entity
   */
  private async findAndResolveByForeignKey(rel: ForeignKeyLinkedRelationship) {
    const foreignKey = this.entity[rel.foreignKey];

    if (this.isKeyOfEntity(rel.propertyName) && foreignKey) {
      const res = await rel.target.findById(foreignKey as string);
      this.entity[rel.propertyName] = res as any;
    }
  }

  /**
   * Resolves results of a query operation
   * @param queryResults
   */
  private async resolveQueryResults(queryResults: DynamoTableItem[]) {
    return queryResults.map(res =>
      res.Type === BelongsToLink.name
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
   * Type guard to check if the relationship is a BelongsTo
   */
  private isBelongsToRelationship(
    rel: RelationshipMetadata
  ): rel is BelongsToRelationship {
    return rel.type === "BelongsTo" && !!rel.foreignKey;
  }

  /**
   * Type guard to check if the relationship is a HasOne
   */
  private isHasOneRelationship(
    rel: RelationshipMetadata
  ): rel is HasOneRelationship {
    return rel.type === "HasOne" && !!rel.foreignKey;
  }

  /**
   * Type guard to check if the relationship is linked by a foreignKey (HasOne or BelongsTo)
   */
  private isForeignKeyLinkedRelationship(
    rel: RelationshipMetadata
  ): rel is ForeignKeyLinkedRelationship {
    return this.isHasOneRelationship(rel) || this.isBelongsToRelationship(rel);
  }
}

export default QueryResolver;
