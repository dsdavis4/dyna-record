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
 * Facilitates the operation of updating an existing entity in the database, including handling updates to its attributes and managing changes to its relationships. It will de-normalize data to support relationship links
 *
 * The `Update` operation supports updating entity attributes and ensures consistency in relationships linked records. It handles the complexity of managing foreign keys and associated "BelongsToLink" records, including creating new links for updated relationships and removing outdated links when necessary.
 *
 * Only attributes defined on the model can be configured, and will be enforced via types and runtime schema validation.
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
   * Update entity transactions, including transactions to create/update denormalized records
   * @param id The id of the entity being updated
   * @param attributes Attributes on the model to update.
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

  // TODO ensure that this is a strong read... unit test for it
  /**
   * Queries for the entity being updated and any relationship related via a "has" relationship (EX: "HasMany")
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
   * Creates the updated entity and update expression used for processing
   * @param attributes - Attributes being updated
   * @returns
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
   * Build the transaction to update the entity
   * @param id The id of the entity being updated
   * @param updateExpression Dynamo expression for Update
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
        ConditionExpression: `attribute_exists(${this.partitionKeyAlias})`, // Only update the item if it exists
        ...updateExpression
      },
      `${this.EntityClass.name} with ID '${id}' does not exist`
    );
  }

  /**
   * Builds the transactions to persist BelongsTo relationships
   *   - Denormalizes link data related entities partitions
   *   - When a foreign key is updated it will remove the denormalized records from the old association
   * @param id The id of the entity being updated
   * @param updateExpression Dynamo expression for Update
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

        // The foreignKey value before update
        const oldFk = extractForeignKeyFromEntity(relMeta, entityPreUpdate);

        // If the record being updated is changing a foreign key then delete the old record
        if (oldFk !== undefined && oldFk !== foreignKey) {
          this.buildDeleteOldBelongsToLinkTransaction(entityId, relMeta, oldFk);
        }
      }
    }
  }

  /**
   * Denormalizes data to the linked records on for belongs to relationships
   * @param entityId
   * @param relMeta
   * @param foreignKey
   * @param updateExpression
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
      // TODO test this error condition in unit tests and real
      ConditionExpression: `attribute_exists(${this.partitionKeyAlias})`, // Only update the item if it exists
      ...updateExpression
    });
  }

  /**
   * When updating the foreign key of an entity, delete the BelongsToLink in the previous relationships partition
   * @param entityId
   * @param relMeta
   * @param oldForeignKey
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
   * Builds the transactions to update the linked entities on foreign associations (EX: from "HasMany")
   * @param relatedEntities - Entity links from the entity being updated's partition. Used to build update link items in other partitions
   * @param expression - The update expression to apply
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
        ConditionExpression: `attribute_exists(${this.partitionKeyAlias})`, // Only update the item if it exists
        ...expression
      });
    });
  }
}

export default Update;
