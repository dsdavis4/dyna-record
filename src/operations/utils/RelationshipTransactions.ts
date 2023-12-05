import type SingleTableDesign from "../../SingleTableDesign";
import Metadata, {
  type BelongsToRelationship,
  type EntityClass,
  type TableMetadata
} from "../../metadata";
import type { ConditionCheck, Put } from "../../dynamo-utils";
import { BelongsToLink } from "../../relationships";
import { entityToTableItem } from "../../utils";

/**
 * Builds transactions for persisting relationships
 */
class RelationshipTransactions<T extends SingleTableDesign> {
  readonly #tableMetadata: TableMetadata;

  constructor(private readonly EntityClass: EntityClass<T>) {
    const entityMetadata = Metadata.getEntity(EntityClass.name);
    this.#tableMetadata = Metadata.getTable(entityMetadata.tableClassName);
  }

  /**
   * Builds a ConditionCheck transaction that ensures the associated relationship exists
   * @param rel
   * @param relationshipId
   * @returns
   */
  public buildRelationshipExistsCondition(
    rel: BelongsToRelationship,
    relationshipId: string
  ): ConditionCheck {
    const { name: tableName, primaryKey, sortKey } = this.#tableMetadata;

    const conditionCheck: ConditionCheck = {
      TableName: tableName,
      Key: {
        [primaryKey]: rel.target.primaryKeyValue(relationshipId),
        [sortKey]: rel.target.name
      },
      ConditionExpression: `attribute_exists(${primaryKey})`
    };

    return conditionCheck;
  }

  /**
   * Creates a BelongsToLink transaction item in the parents partition if the entity BelongsTo a HasOne association
   * Adds conditional check to ensure the parent doesn't already have one of the entity being associated
   * @param entityId Id of the entity being persisted
   * @param rel BelongsTo relationship metadata for which the entity being persisted is a BelongsTo HasOne
   * @param relationshipId Id of the parent entity of which the entity being persisted BelongsTo
   */
  public buildBelongsToHasOne(
    rel: BelongsToRelationship,
    entityId: string,
    relationshipId: string
  ): Put {
    const { name: tableName, primaryKey, sortKey } = this.#tableMetadata;

    const link = BelongsToLink.build(this.EntityClass.name, entityId);

    const keys = {
      [primaryKey]: rel.target.primaryKeyValue(relationshipId),
      [sortKey]: this.EntityClass.name
    };

    const putExpression: Put = {
      TableName: tableName,
      Item: { ...keys, ...entityToTableItem(rel.target.name, link) },
      ConditionExpression: `attribute_not_exists(${primaryKey})` // Ensure item doesn't already exist
    };

    return putExpression;
  }

  /**
   * Creates a BelongsToLink transaction item in the parents partition if the entity BelongsTo a HasMany association
   * @param rel BelongsTo relationship metadata for which the entity being persisted is a BelongsTo HasMany
   * @param entityId Id of the entity being persisted
   * @param relationshipId Id of the parent entity of which the entity being persisted BelongsTo
   */
  public buildBelongsToHasMany(
    rel: BelongsToRelationship,
    entityId: string,
    relationshipId: string
  ): Put {
    const { name: tableName, primaryKey, sortKey } = this.#tableMetadata;

    const link = BelongsToLink.build(this.EntityClass.name, entityId);

    const keys = {
      [primaryKey]: rel.target.primaryKeyValue(relationshipId),
      [sortKey]: this.EntityClass.primaryKeyValue(link.foreignKey)
    };

    const putExpression: Put = {
      TableName: tableName,
      Item: { ...keys, ...entityToTableItem(rel.target.name, link) },
      ConditionExpression: `attribute_not_exists(${primaryKey})` // Ensure item doesn't already exist
    };

    return putExpression;
  }
}

export default RelationshipTransactions;
