import type DynaRecord from "../../DynaRecord";
import { TransactWriteBuilder } from "../../dynamo-utils";
import type { BelongsToRelationship } from "../../metadata";
import { entityToTableItem, isNullableString } from "../../utils";
import {
  type UpdateExpression,
  buildBelongsToLinkKey,
  expressionBuilder,
  extractForeignKeyFromEntity
} from "../utils";
import OperationBase from "../OperationBase";
import type { UpdatedAttributes, UpdateOptions } from "./types";
import type { EntityClass } from "../../types";
import Metadata from "../../metadata";
import { type EntityAttributesOnly, type EntityAttributes } from "../types";

type Entity = EntityAttributesOnly<DynaRecord>;

interface SelfAndLinkEntities {
  entityPreUpdate: Entity;
  relatedEntities: Entity[];
}

interface UpdateMetadata<T extends DynaRecord> {
  updatedAttrs: UpdatedAttributes<T>;
  expression: UpdateExpression;
}

/**
 * Represents an update operation for a DynaRecord-backed entity, handling both attribute updates and relationship consistency via denormalization.
 *
 * This class supports updating an existing entity and managing its relational links, specifically:
 * - Updating entity attributes while preserving schema constraints.
 * - Managing "BelongsTo" relationship links by creating or removing associated denormalized records.
 * - Ensuring that if a foreign key changes, the old link record is removed, preventing stale references.
 *
 * Only attributes defined on the model can be updated. Both compile-time and runtime checks help ensure that updated values are valid.
 *
 * **Example**
 * ```typescript
 * const updateOp = new Update(MyEntityClass);
 * await updateOp.run("entityId", { name: "NewName", status: "active" });
 * ```
 *
 * @template T - The type of the entity being updated, extending `DynaRecord`.
 */
class Update<T extends DynaRecord> extends OperationBase<T> {
  readonly #transactionBuilder: TransactWriteBuilder;

  constructor(Entity: EntityClass<T>) {
    super(Entity);
    this.#transactionBuilder = new TransactWriteBuilder();
  }

  /**
   * Executes the update operation against DynamoDB.
   *
   * **What it does:**
   * - Fetches the current state of the entity and any related "Has" relationship entities.
   * - Constructs an update expression for the main entity's attributes.
   * - Applies the same update expression to related entities and "BelongsTo" link records to maintain denormalized consistency.
   * - Manages foreign key changes by creating new link items and removing old link items.
   *
   * @param id - The unique identifier of the entity being updated.
   * @param attributes - Partial set of entity attributes to update. Must be defined on the entity's model.
   * @returns A promise that resolves to the set of updated attributes as applied to the entity.
   * @throws If the entity does not exist, an error is thrown.
   */
  public async run(
    id: string,
    attributes: UpdateOptions<DynaRecord>
  ): Promise<UpdatedAttributes<T>> {
    const entityMeta = Metadata.getEntity(this.EntityClass.name);
    const entityAttrs =
      entityMeta.parseRawEntityDefinedAttributesPartial(attributes);

    const { entityPreUpdate, relatedEntities } = await this.preFetch(id);

    const { updatedAttrs, expression } = this.buildUpdateMetadata(entityAttrs);
    const updatedEntity = { ...entityPreUpdate, ...updatedAttrs };

    this.buildUpdateItemTransaction(id, expression);
    this.buildUpdateRelatedEntityLinks(relatedEntities, expression);
    this.buildBelongsToTransactions(entityPreUpdate, updatedEntity, expression);

    await this.#transactionBuilder.executeTransaction();

    return updatedAttrs;
  }

  /**
   * Pre-fetches the target entity and any related entities from the database. This is done using a strong read operation to ensure consistency.
   *
   * **What it does:**
   * - Retrieves the main entity and all linked entities in the entity's partition.
   * - Filters these entities to separate the main entity and its related link records.
   *
   * @param id - The unique identifier of the entity being fetched.
   * @returns A promise that resolves to an object containing:
   *   - `entityPreUpdate`: The current state of the entity before updates.
   *   - `relatedEntities`: An array of related link entities.
   * @throws If the entity does not exist, it throws an error.
   * @private
   */
  private async preFetch(id: string): Promise<SelfAndLinkEntities> {
    const hasRelMetas = this.entityMetadata.hasRelationships;

    const selfAndLinkedEntities = await this.EntityClass.query<DynaRecord>(id, {
      filter: {
        type: [
          this.EntityClass.name,
          ...hasRelMetas.map(meta => meta.target.name)
        ]
      }
    });

    let entity: Entity | undefined;
    const relatedEntities: Entity[] = [];

    selfAndLinkedEntities.forEach(queryRes => {
      if (id === queryRes.id) entity = queryRes;
      else relatedEntities.push(queryRes);
    });

    if (entity === undefined) {
      throw new Error("Failed to find entity");
    }

    return { entityPreUpdate: entity, relatedEntities };
  }

  /**
   * Constructs updated attributes and the corresponding DynamoDB update expression.
   *
   * **What it does:**
   * - Merges the provided attributes with `updatedAt` (automatically set to the current time).
   * - Converts the updated attributes into a DynamoDB update expression.
   *
   * @param attributes - The partial attributes to be updated on the entity.
   * @returns An object containing:
   *   - `updatedAttrs`: The final updated attribute set.
   *   - `expression`: A DynamoDB update expression to apply these changes.
   * @private
   */
  private buildUpdateMetadata(attributes: UpdateOptions<T>): UpdateMetadata<T> {
    const updatedAttrs: UpdatedAttributes<T> = {
      ...attributes,
      updatedAt: new Date()
    };

    const tableAttrs = entityToTableItem(this.EntityClass, updatedAttrs);
    const expression = expressionBuilder(tableAttrs);

    return { updatedAttrs, expression };
  }

  /**
   * Adds a transaction operation to update the main entity's record.
   *
   * **What it does:**
   * - Builds a DynamoDB Update transaction using the provided update expression.
   * - Adds a condition to ensure the entity exists before updating.
   *
   * @param id - The unique identifier of the entity being updated.
   * @param updateExpression - The DynamoDB update expression describing the changes.
   * @private
   */
  private buildUpdateItemTransaction(
    id: string,
    updateExpression: UpdateExpression
  ): void {
    const { name: tableName } = this.tableMetadata;
    const pk = this.tableMetadata.partitionKeyAttribute.name;
    const sk = this.tableMetadata.sortKeyAttribute.name;

    const keys = {
      [pk]: this.EntityClass.partitionKeyValue(id),
      [sk]: this.EntityClass.name
    };
    const tableKeys = entityToTableItem(this.EntityClass, keys);

    this.#transactionBuilder.addUpdate(
      {
        TableName: tableName,
        Key: tableKeys,
        ConditionExpression: `attribute_exists(${this.partitionKeyAlias})`,
        ...updateExpression
      },
      `${this.EntityClass.name} with ID '${id}' does not exist`
    );
  }

  /**
   * Builds all necessary transactions to handle "BelongsTo" relationships when updating the entity.
   *
   * **What it does:**
   * - Checks if any foreign keys for "BelongsTo" relationships have changed.
   * - If so, updates or creates new denormalized link records in the related partitions.
   * - Removes old link records that are no longer valid due to foreign key changes.
   *
   * @param entityPreUpdate - The state of the entity before the update.
   * @param updatedEntity - The entity state after proposed updates (partial attributes).
   * @param updateExpression - The DynamoDB update expression representing the attribute updates.
   * @private
   */
  private buildBelongsToTransactions(
    entityPreUpdate: EntityAttributes<DynaRecord>,
    updatedEntity: Partial<EntityAttributes<DynaRecord>>,
    updateExpression: UpdateExpression
  ): void {
    const entityId = entityPreUpdate.id;

    for (const relMeta of this.entityMetadata.belongsToRelationships) {
      const foreignKey = extractForeignKeyFromEntity(relMeta, updatedEntity);

      const isUpdatingRelationshipId = foreignKey !== undefined;

      if (isUpdatingRelationshipId && isNullableString(foreignKey)) {
        this.buildUpdateBelongsToLinkedRecords(
          entityId,
          relMeta,
          foreignKey,
          updateExpression
        );

        // Handle removal of old link if the foreign key changed.
        const oldFk = extractForeignKeyFromEntity(relMeta, entityPreUpdate);
        if (oldFk !== undefined && oldFk !== foreignKey) {
          this.buildDeleteOldBelongsToLinkTransaction(entityId, relMeta, oldFk);
        }
      }
    }
  }

  /**
   * Creates or updates the denormalized link record for a "BelongsTo" relationship to the related entity's partition.
   *
   * **What it does:**
   * - Builds a DynamoDB Update transaction for the linked record identified by the relationship and foreign key.
   * - Ensures the linked record exists before updating (if not, it will fail).
   *
   * @param entityId - The identifier of the main entity being updated.
   * @param relMeta - Metadata describing the "BelongsTo" relationship.
   * @param foreignKey - The new foreign key value after updates.
   * @param updateExpression - The DynamoDB update expression for the attribute changes.
   * @private
   */
  private buildUpdateBelongsToLinkedRecords(
    entityId: string,
    relMeta: BelongsToRelationship,
    foreignKey: string,
    updateExpression: UpdateExpression
  ): void {
    const { name: tableName } = this.tableMetadata;

    const newKey = buildBelongsToLinkKey(
      this.EntityClass,
      entityId,
      relMeta,
      foreignKey
    );

    this.#transactionBuilder.addUpdate({
      TableName: tableName,
      Key: newKey,
      ConditionExpression: `attribute_exists(${this.partitionKeyAlias})`,
      ...updateExpression
    });
  }

  /**
   * Removes the old link record associated with a previous "BelongsTo" foreign key when the foreign key changes.
   *
   * **What it does:**
   * - Builds a DynamoDB Delete transaction to remove the stale link record from the old relationship partition.
   *
   * @param entityId - The identifier of the entity whose foreign key was changed.
   * @param relMeta - Metadata describing the "BelongsTo" relationship.
   * @param oldForeignKey - The old foreign key value that should no longer link to the entity.
   * @private
   */
  private buildDeleteOldBelongsToLinkTransaction(
    entityId: string,
    relMeta: BelongsToRelationship,
    oldForeignKey: string
  ): void {
    const { name: tableName } = this.tableMetadata;

    const oldLinkKeys = buildBelongsToLinkKey(
      this.EntityClass,
      entityId,
      relMeta,
      oldForeignKey
    );

    this.#transactionBuilder.addDelete({
      TableName: tableName,
      Key: oldLinkKeys
    });
  }

  /**
   * Builds transactions to update all related entities that exist in the main entity's partition, applying the same attribute updates.
   *
   * **What it does:**
   * - For each linked entity found in `preFetch`, attempts to apply the same update expression.
   * - Ensures each related entity exists before attempting to update.
   *
   * @param relatedEntities - An array of entities that are related to the primary entity and need synchronized attribute updates.
   * @param expression - The DynamoDB update expression to apply to related entities.
   * @private
   */
  private buildUpdateRelatedEntityLinks(
    relatedEntities: Entity[],
    expression: UpdateExpression
  ): void {
    relatedEntities.forEach(entity => {
      this.#transactionBuilder.addUpdate({
        TableName: this.tableMetadata.name,
        Key: {
          [this.partitionKeyAlias]: entity.partitionKeyValue(),
          [this.sortKeyAlias]: this.EntityClass.name
        },
        ConditionExpression: `attribute_exists(${this.partitionKeyAlias})`,
        ...expression
      });
    });
  }
}

export default Update;
