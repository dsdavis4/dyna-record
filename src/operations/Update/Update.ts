import type DynaRecord from "../../DynaRecord";
import {
  type ConditionCheck,
  TransactGetBuilder,
  TransactWriteBuilder
} from "../../dynamo-utils";
import type {
  BelongsToRelationship,
  HasAndBelongsToManyRelationship
} from "../../metadata";
import {
  entityToTableItem,
  isNullableString,
  isString,
  tableItemToEntity
} from "../../utils";
import {
  type UpdateExpression,
  buildBelongsToLinkKey,
  expressionBuilder,
  extractForeignKeyFromEntity
} from "../utils";
import OperationBase from "../OperationBase";
import type { UpdatedAttributes, UpdateOptions } from "./types";
import type { DynamoTableItem, EntityClass, WithRequired } from "../../types";
import Metadata from "../../metadata";
import { type EntityAttributesOnly, type EntityAttributes } from "../types";
import { NotFoundError } from "../../errors";

type Entity = EntityAttributesOnly<DynaRecord>;

type PartialEntityWithId = WithRequired<
  Partial<EntityAttributes<DynaRecord>>,
  "id"
>;

interface BelongsToRelMetaAndKey {
  meta: BelongsToRelationship;
  foreignKeyVal: string;
}

/**
 * Lookup item to look up a belongs to entity by id
 */
type BelongsToEntityLookup = Record<string, Entity>;

/**
 * Lookup item to lookup a HasAndBelongsToManyRelationship by entity type
 */
type HasAndBelongsToManyRelLookup = Record<
  string,
  HasAndBelongsToManyRelationship
>;

/**
 * Sorted pre-fetched data for processing
 */
interface PreFetchData {
  /**
   * The entity being updated, before its updated
   */
  entityPreUpdate: Entity;
  /**
   * Entities that are already related to the entity being updated and linked via "has" relationships (Ex: HasMany).
   */
  relatedEntities: Entity[];
  /**
   * Record of entities linked via belongsTo, that are being updated
   */
  newBelongsToEntityLookup: BelongsToEntityLookup;
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
  protected readonly transactionBuilder: TransactWriteBuilder;

  constructor(
    Entity: EntityClass<T>,
    transactionBuilder?: TransactWriteBuilder
  ) {
    super(Entity);
    // Use the transaction builder passed to the class, or instantiate a new one
    this.transactionBuilder = transactionBuilder ?? new TransactWriteBuilder();
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

    const { updatedAttrs, expression } = this.buildUpdateMetadata(entityAttrs);
    this.buildUpdateItemTransaction(id, expression);

    // TODO add explicit unit test for this - right now its tested indirectly
    // Only need to prefetch if the entity has relationships
    if (entityMeta.allRelationships.length > 0) {
      const belongsToRelMetaBeingUpdated =
        this.getBelongsToRelMetaAndKeyForUpdatedKeys(entityAttrs);

      const entities = await this.preFetch(id, belongsToRelMetaBeingUpdated);
      const preFetch = this.preProcessFetchedData(
        id,
        entities,
        belongsToRelMetaBeingUpdated
      );

      const updatedEntity = {
        ...preFetch.entityPreUpdate,
        ...updatedAttrs,
        id
      };

      this.buildUpdateRelatedEntityLinks(
        id,
        preFetch.relatedEntities,
        expression
      );
      this.buildBelongsToTransactions(
        preFetch.entityPreUpdate,
        updatedEntity,
        expression,
        preFetch.newBelongsToEntityLookup
      );
    }

    await this.commitTransaction();

    return updatedAttrs;
  }

  protected async commitTransaction(): Promise<void> {
    await this.transactionBuilder.executeTransaction();
  }

  /**
   * BelongsToRelationship meta data and foreign key value pair for foreign keys being updated
   * @param attributes
   * @returns
   */
  private getBelongsToRelMetaAndKeyForUpdatedKeys(
    attributes: UpdateOptions<DynaRecord>
  ): BelongsToRelMetaAndKey[] {
    return this.entityMetadata.belongsToRelationships.reduce<
      BelongsToRelMetaAndKey[]
    >((acc, meta) => {
      const foreignKeyVal = extractForeignKeyFromEntity(meta, attributes);
      if (foreignKeyVal !== undefined) acc.push({ meta, foreignKeyVal });
      return acc;
    }, []);
  }

  // TODO update typedoc for what it does with new param belongstorelmeta
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
   * @throws If the entity does not exist, it throws a NotFoundError.
   * @private
   */
  private async preFetch(
    id: string,
    belongsToRelFkAndMetas: BelongsToRelMetaAndKey[]
  ): Promise<Entity[]> {
    const hasRelMetas = this.entityMetadata.hasRelationships;

    const { name: tableName } = this.tableMetadata;
    const transactionBuilder = new TransactGetBuilder();

    // Get the new BelongsTo relationship entities that are being updated
    belongsToRelFkAndMetas.forEach(({ meta, foreignKeyVal }) => {
      if (foreignKeyVal !== null) {
        transactionBuilder.addGet({
          TableName: tableName,
          Key: {
            [this.partitionKeyAlias]:
              meta.target.partitionKeyValue(foreignKeyVal),
            [this.sortKeyAlias]: meta.target.name
          }
        });
      }
    });

    const typeAlias = this.tableMetadata.defaultAttributes.type.alias;

    // Get linked items from entity being updates partition as well as new foreign entities if adding or updating an FK
    const [transactionResults, selfAndLinkedEntities] = await Promise.all([
      transactionBuilder.executeTransaction(),
      this.EntityClass.query<DynaRecord>(id, {
        filter: {
          type: [
            this.EntityClass.name,
            ...hasRelMetas.map(meta => meta.target.name)
          ]
        }
      })
    ]);

    // Serialize table items to entities
    const foreignEntities = transactionResults.reduce<Entity[]>((acc, res) => {
      if (res.Item !== undefined && isString(res.Item[typeAlias])) {
        const entityMeta = Metadata.getEntity(res.Item[typeAlias]);
        const entity = tableItemToEntity(entityMeta.EntityClass, res.Item);
        acc.push(entity);
      }
      return acc;
    }, []);

    return [...selfAndLinkedEntities, ...foreignEntities];
  }

  /**
   * {reprocess pre-fetch data for processing
   * @param id
   * @param entities
   * @param belongsToRelFkAndMetas
   * @returns
   */
  private preProcessFetchedData(
    id: string,
    entities: Entity[],
    belongsToRelFkAndMetas: BelongsToRelMetaAndKey[]
  ): PreFetchData {
    let entityPreUpdate: Entity | undefined;
    const relatedEntities: Entity[] = [];
    const newBelongsToEntityLookup: BelongsToEntityLookup = {};

    entities.forEach(entity => {
      if (id === entity.id) {
        entityPreUpdate = entity;
      } else if (
        belongsToRelFkAndMetas.some(obj => obj.foreignKeyVal === entity.id)
      ) {
        newBelongsToEntityLookup[entity.id] = entity;
      } else {
        relatedEntities.push(entity);
      }
    });

    if (entityPreUpdate === undefined) {
      throw new NotFoundError(`${this.EntityClass.name} does not exist: ${id}`);
    }

    return { entityPreUpdate, relatedEntities, newBelongsToEntityLookup };
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

    this.transactionBuilder.addUpdate(
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
    updatedEntity: PartialEntityWithId,
    updateExpression: UpdateExpression,
    newBelongsToEntityLookup: BelongsToEntityLookup
  ): void {
    const entityId = entityPreUpdate.id;

    for (const relMeta of this.entityMetadata.belongsToRelationships) {
      const foreignKey = extractForeignKeyFromEntity(relMeta, updatedEntity);

      const isUpdatingRelationshipId = foreignKey !== undefined;

      if (isUpdatingRelationshipId && isNullableString(foreignKey)) {
        // Handle removal of old link if the foreign key changed.
        const oldFk = extractForeignKeyFromEntity(relMeta, entityPreUpdate);
        const isAddingForeignKey = oldFk === undefined && foreignKey !== null;
        const isUpdatingForeignKey =
          oldFk !== undefined && oldFk !== foreignKey;
        const isRemovingForeignKey =
          isUpdatingForeignKey && foreignKey === null;

        if (isAddingForeignKey) {
          this.buildPutBelongsToLinkedRecords(
            updatedEntity,
            relMeta,
            foreignKey,
            // TODO I am passing this through alot of functions. Why dont I just pass newBelongsToEntityLookup[foreignKey]
            newBelongsToEntityLookup,
            "attribute_not_exists",
            `${this.EntityClass.name} already has an associated ${relMeta.target.name}`
          );
        } else if (isRemovingForeignKey) {
          this.removeForeignKeysTransactions(entityId, relMeta, oldFk);
        } else if (isUpdatingForeignKey) {
          this.updateForeignKeyTransactions(
            updatedEntity,
            relMeta,
            foreignKey,
            oldFk,
            newBelongsToEntityLookup
          );
        } else if (foreignKey !== null) {
          this.buildUpdateBelongsToLinkedRecords(
            entityId,
            relMeta,
            foreignKey,
            updateExpression
          );
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

    this.transactionBuilder.addUpdate({
      TableName: tableName,
      Key: newKey,
      ConditionExpression: `attribute_exists(${this.partitionKeyAlias})`,
      ...updateExpression
    });
  }

  /**
   * Builds transactions to persist an updated/new belongs to record
   * Denormalizes data to the entity being updates's partition and a link to the foreign entities partition
   * Ensures that the new entity foreign key exists
   * @param updatedEntity
   * @param relMeta
   * @param foreignKey
   * @param newBelongsToEntityLookup
   * @param persistToSelfCondition
   * @param persistToSelfConditionErrMessage
   */
  private buildPutBelongsToLinkedRecords(
    updatedEntity: PartialEntityWithId,
    relMeta: BelongsToRelationship,
    foreignKey: string,
    newBelongsToEntityLookup: BelongsToEntityLookup,
    persistToSelfCondition: "attribute_not_exists" | "attribute_exists",
    persistToSelfConditionErrMessage?: string
  ): void {
    // Ensure that the new foreign key is valid and exists
    this.buildEntityExistsCondition(relMeta, foreignKey);

    // Denormalize entity being updated to foreign partition
    this.buildLinkToForeignEntityTransaction(
      updatedEntity,
      relMeta,
      foreignKey
    );

    // Add denormalized record for new entity to self
    this.buildAddForeignEntityToSelfTransaction(
      updatedEntity,
      relMeta,
      foreignKey,
      newBelongsToEntityLookup,
      persistToSelfCondition,
      persistToSelfConditionErrMessage
    );
  }

  /**
   * Builds a condition expression that an entity exists
   * @param relMeta
   * @param foreignKey
   */
  private buildEntityExistsCondition(
    relMeta: BelongsToRelationship,
    foreignKey: string
  ): void {
    const errMsg = `${relMeta.target.name} with ID '${foreignKey}' does not exist`;

    const conditionCheck: ConditionCheck = {
      TableName: this.tableMetadata.name,
      Key: {
        [this.partitionKeyAlias]: relMeta.target.partitionKeyValue(foreignKey),
        [this.sortKeyAlias]: relMeta.target.name
      },
      ConditionExpression: `attribute_exists(${this.partitionKeyAlias})`
    };

    this.transactionBuilder.addConditionCheck(conditionCheck, errMsg);
  }

  /**
   * Denormalizes a link for the entity being updated to the new entities partition
   * @param updatedEntity
   * @param relMeta
   * @param foreignKey
   */
  private buildLinkToForeignEntityTransaction(
    updatedEntity: PartialEntityWithId,
    relMeta: BelongsToRelationship,
    foreignKey: string
  ): void {
    const key = buildBelongsToLinkKey(
      this.EntityClass,
      updatedEntity.id,
      relMeta,
      foreignKey
    );
    const tableItem = entityToTableItem(this.EntityClass, updatedEntity);
    this.transactionBuilder.addPut(
      {
        TableName: this.tableMetadata.name,
        Item: { ...tableItem, ...key },
        ConditionExpression: `attribute_not_exists(${this.partitionKeyAlias})`
      },
      `${relMeta.target.name} with id: ${foreignKey} already has an associated ${this.EntityClass.name}`
    );
  }

  /**
   * Builds the transaction to add or replace the linked record for the foreign entity in the entity being updates partition
   * @param updatedEntity
   * @param relMeta
   * @param foreignKey
   * @param newBelongsToEntityLookup
   * @param persistToSelfCondition
   * @param persistToSelfConditionErrMessage
   */
  private buildAddForeignEntityToSelfTransaction(
    updatedEntity: PartialEntityWithId,
    relMeta: BelongsToRelationship,
    foreignKey: string,
    newBelongsToEntityLookup: BelongsToEntityLookup,
    persistToSelfCondition: "attribute_not_exists" | "attribute_exists",
    persistToSelfConditionErrMessage?: string
  ): void {
    const linkedEntity = newBelongsToEntityLookup[foreignKey];

    if (linkedEntity === undefined) {
      throw new NotFoundError(
        `${relMeta.target.name} does not exist: ${foreignKey}`
      );
    }

    const key = {
      [this.partitionKeyAlias]: this.EntityClass.partitionKeyValue(
        updatedEntity.id
      ),
      [this.sortKeyAlias]: relMeta.target.name
    };

    const linkedRecordTableItem = entityToTableItem(
      relMeta.target,
      linkedEntity
    );
    this.transactionBuilder.addPut(
      {
        TableName: this.tableMetadata.name,
        Item: { ...linkedRecordTableItem, ...key },
        ConditionExpression: `${persistToSelfCondition}(${this.partitionKeyAlias})`
      },
      persistToSelfConditionErrMessage
    );
  }

  // TODO unit test this second delete
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
  private removeForeignKeysTransactions(
    entityId: string,
    relMeta: BelongsToRelationship,
    oldForeignKey: string
  ): void {
    // Keys to delete the denormalized record from entities own partition
    const oldKeysToSelf = {
      [this.partitionKeyAlias]: this.EntityClass.partitionKeyValue(entityId),
      [this.sortKeyAlias]: relMeta.target.name
    };

    // Keys to delete the linked record from the foreign entities partition
    const oldKeysToForeignEntity = buildBelongsToLinkKey(
      this.EntityClass,
      entityId,
      relMeta,
      oldForeignKey
    );

    this.transactionBuilder.addDelete(
      {
        TableName: this.tableMetadata.name,
        Key: oldKeysToSelf
      },
      // TODO I added this with delete logic, add a test within update class for this
      `Failed to delete BelongsToLink with keys: ${JSON.stringify(oldKeysToSelf)}`
    );

    this.transactionBuilder.addDelete(
      {
        TableName: this.tableMetadata.name,
        Key: oldKeysToForeignEntity
      },
      // TODO I added this with delete logic, add a test within update class for this
      `Failed to delete BelongsToLink with keys: ${JSON.stringify(oldKeysToForeignEntity)}`
    );
  }

  /**
   * Builds the transactions for updating the foreign key of an entity from one key to another
   * @param updatedEntity
   * @param relMeta
   * @param newForeignKey
   * @param oldForeignKey
   * @param newBelongsToEntityLookup
   */
  private updateForeignKeyTransactions(
    updatedEntity: PartialEntityWithId,
    relMeta: BelongsToRelationship,
    newForeignKey: string,
    oldForeignKey: string,
    newBelongsToEntityLookup: BelongsToEntityLookup
  ): void {
    // Keys to delete the linked record from the foreign entities partition
    const oldKeysToForeignEntity = buildBelongsToLinkKey(
      this.EntityClass,
      updatedEntity.id,
      relMeta,
      oldForeignKey
    );

    this.transactionBuilder.addDelete({
      TableName: this.tableMetadata.name,
      Key: oldKeysToForeignEntity
    });

    this.buildPutBelongsToLinkedRecords(
      updatedEntity,
      relMeta,
      newForeignKey,
      newBelongsToEntityLookup,
      "attribute_exists"
    );
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
    entityId: string,
    relatedEntities: Entity[],
    expression: UpdateExpression
  ): void {
    const hasAndBelongsToManyLookup = this.buildHasAndBelongsToManyRelLookup();

    relatedEntities.forEach(entity => {
      this.transactionBuilder.addUpdate(
        {
          TableName: this.tableMetadata.name,
          Key: this.buildUpdatedRelatedEntityLinkKey(
            entityId,
            entity,
            hasAndBelongsToManyLookup
          ),
          ConditionExpression: `attribute_exists(${this.partitionKeyAlias})`,
          ...expression
        },
        // TODO add test for this within update test file. I added this while working on delete
        `${entity.constructor.name} is not associated with ${this.EntityClass.name} - ${entityId}`
      );
    });
  }

  /**
   * Builds the table key for a related entity that needs to be updated
   * @param id - The id of the entity being updated
   * @param entity
   * @param relLookup
   * @returns
   */
  private buildUpdatedRelatedEntityLinkKey(
    id: string,
    entity: Entity,
    relLookup: HasAndBelongsToManyRelLookup
  ): DynamoTableItem {
    const isHasAndBelongsToManyRel = relLookup[entity.type] !== undefined;
    const sortKey = isHasAndBelongsToManyRel
      ? this.EntityClass.partitionKeyValue(id)
      : this.EntityClass.name;

    return {
      [this.partitionKeyAlias]: entity.partitionKeyValue(),
      [this.sortKeyAlias]: sortKey
    };
  }

  /**
   * Build a lookup object to lookup a HasAndBelongsToMany relationship for an entity. Used for processing to avoid excessive looping
   * @returns
   */
  private buildHasAndBelongsToManyRelLookup(): HasAndBelongsToManyRelLookup {
    return Object.values(
      this.entityMetadata.relationships
    ).reduce<HasAndBelongsToManyRelLookup>((acc, rel) => {
      if (rel.type === "HasAndBelongsToMany") {
        acc[rel.target.name] = rel;
      }
      return acc;
    }, {});
  }
}

export default Update;
