import type SingleTableDesign from "../SingleTableDesign";
import Metadata, {
  type EntityMetadata,
  type TableMetadata,
  type EntityClass,
  type BelongsToRelationship
} from "../metadata";
import type { EntityDefinedAttributes } from "./types";
import { v4 as uuidv4 } from "uuid";
import type { DynamoTableItem } from "../types";
import { TransactWriteBuilder } from "../dynamo-utils";
import { entityToTableItem, tableItemToEntity } from "../utils";
import {
  doesEntityBelongToRelAsHasMany,
  doesEntityBelongToRelAsHasOne,
  isBelongsToRelationship
} from "../metadata/utils";
import { RelationshipTransactions } from "./utils";

// TODO do I need to handle the situation where the foreign key being set has already been set on another entity?

/**
 * Entity attribute fields that can be set on create. Excludes that are managed by no-orm
 */
export type CreateOptions<T extends SingleTableDesign> =
  EntityDefinedAttributes<T>;

// TODO should I make an operations base since they all have the same constructor?
// And they have the same public entry point

// TODO make sure to add a unit test that optional properties dont have to be included

// TODO add good error messages in here...

// TODO DRY up this class where I can

class Create<T extends SingleTableDesign> {
  private readonly EntityClass: EntityClass<T>;
  readonly #entityMetadata: EntityMetadata;
  readonly #tableMetadata: TableMetadata;
  readonly #transactionBuilder: TransactWriteBuilder;

  readonly #relationshipTransactions: RelationshipTransactions<T>;

  constructor(Entity: EntityClass<T>) {
    this.EntityClass = Entity;
    this.#entityMetadata = Metadata.getEntity(Entity.name);
    this.#tableMetadata = Metadata.getTable(
      this.#entityMetadata.tableClassName
    );
    this.#transactionBuilder = new TransactWriteBuilder();
    this.#relationshipTransactions = new RelationshipTransactions(Entity);
  }

  // TODO insure idempotency - see here https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html

  /**
   * Create an entity transaction, including relationship transactions (EX: Creating BelongsToLinks for HasMany, checking existence of relationships, etc)
   * @param attributes
   * @returns
   */
  public async run(attributes: CreateOptions<T>): Promise<T> {
    const entityData = this.buildEntityData(attributes);

    const tableItem = entityToTableItem(this.EntityClass.name, entityData);

    this.buildPutItemTransaction(tableItem);
    this.buildRelationshipTransactions(entityData);

    await this.#transactionBuilder.executeTransaction();

    return tableItemToEntity<T>(this.EntityClass, tableItem);
  }

  private buildEntityData(attributes: CreateOptions<T>): SingleTableDesign {
    const { attributes: entityAttrs } = this.#entityMetadata;
    const { primaryKey, sortKey } = this.#tableMetadata;

    const id = uuidv4();
    const createdAt = new Date();

    const pk = entityAttrs[primaryKey].name;
    const sk = entityAttrs[sortKey].name;

    const keys = {
      [pk]: this.EntityClass.primaryKeyValue(id),
      [sk]: this.EntityClass.name
    };

    const defaultAttrs: SingleTableDesign = {
      id,
      type: this.EntityClass.name,
      createdAt,
      updatedAt: createdAt
    };

    return { ...keys, ...attributes, ...defaultAttrs };
  }

  /**
   * Build the transaction for the parent entity Create item request
   * @param tableItem
   */
  private buildPutItemTransaction(tableItem: DynamoTableItem): void {
    const { name: tableName, primaryKey } = this.#tableMetadata;

    const putExpression = {
      TableName: tableName,
      Item: tableItem,
      ConditionExpression: `attribute_not_exists(${primaryKey})` // Ensure item doesn't already exist
    };
    this.#transactionBuilder.addPut(putExpression);
  }

  /**
   * Build transaction items for associations
   * @param entityData
   */
  private buildRelationshipTransactions(entityData: SingleTableDesign): void {
    const { relationships } = this.#entityMetadata;

    Object.values(relationships).forEach(rel => {
      const isBelongsTo = isBelongsToRelationship(rel);

      if (isBelongsTo) {
        const relationshipId = entityData[rel.foreignKey];

        if (
          relationshipId !== undefined &&
          typeof relationshipId === "string"
        ) {
          this.buildRelationshipExistsConditionTransaction(rel, relationshipId);

          const transactionOpts = [rel, entityData.id, relationshipId] as const;

          if (doesEntityBelongToRelAsHasMany(this.EntityClass, rel)) {
            this.buildBelongsToHasManyTransaction(...transactionOpts);
          }

          if (doesEntityBelongToRelAsHasOne(this.EntityClass, rel)) {
            this.buildBelongsToHasOneTransaction(...transactionOpts);
          }
        }
      }
    });
  }

  /**
   * Builds a ConditionCheck transaction that ensures the associated relationship exists
   * @param rel
   * @param relationshipId
   * @returns
   */
  private buildRelationshipExistsConditionTransaction(
    rel: BelongsToRelationship,
    relationshipId: string
  ): void {
    const errMsg = `${rel.target.name} with ID '${relationshipId}' does not exist`;

    const conditionCheck =
      this.#relationshipTransactions.buildRelationshipExistsCondition(
        rel,
        relationshipId
      );

    this.#transactionBuilder.addConditionCheck(conditionCheck, errMsg);
  }

  /**
   * Creates a BelongsToLink transaction item in the parents partition if the entity BelongsTo a HasMany association
   * @param rel BelongsTo relationship metadata for which the entity being created is a BelongsTo HasMany
   * @param entityId Id of the entity being created
   * @param relationshipId Id of the parent entity of which the entity being created BelongsTo
   */
  private buildBelongsToHasManyTransaction(
    rel: BelongsToRelationship,
    entityId: string,
    relationshipId: string
  ): void {
    const putExpression = this.#relationshipTransactions.buildBelongsToHasMany(
      rel,
      entityId,
      relationshipId
    );

    this.#transactionBuilder.addPut(putExpression);
  }

  // TODO this tsdoc is copied
  /**
   * Creates a BelongsToLink transaction item in the parents partition if the entity BelongsTo a HasOne association
   * Adds conditional check to ensure the parent doesn't already have one of the entity being associated
   * @param rel BelongsTo relationship metadata for which the entity being created is a BelongsTo HasOne
   * @param entityId Id of the entity being created
   * @param relationshipId Id of the parent entity of which the entity being created BelongsTo
   */
  private buildBelongsToHasOneTransaction(
    rel: BelongsToRelationship,
    entityId: string,
    relationshipId: string
  ): void {
    const putExpression = this.#relationshipTransactions.buildBelongsToHasOne(
      rel,
      entityId,
      relationshipId
    );

    this.#transactionBuilder.addPut(
      putExpression,
      `${rel.target.name} with id: ${relationshipId} already has an associated ${this.EntityClass.name}`
    );
  }
}

export default Create;
