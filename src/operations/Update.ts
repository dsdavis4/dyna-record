import { type UpdateCommandInput } from "@aws-sdk/lib-dynamodb";
import type SingleTableDesign from "../SingleTableDesign";
import { TransactWriteBuilder } from "../dynamo-utils";
import type {
  EntityClass,
  EntityMetadata,
  TableMetadata,
  RelationshipMetadata,
  HasOneRelationship,
  HasManyRelationship,
  BelongsToRelationship
} from "../metadata";
import Metadata from "../metadata";
import { entityToTableItem } from "../utils";
import { type ForeignKey, type DynamoTableItem } from "../types";
import {
  doesEntityBelongToRelAsHasMany,
  doesEntityBelongToRelAsHasOne,
  isBelongsToRelationship
} from "../metadata/utils";
import type { EntityDefinedAttributes } from "./types";
import { RelationshipTransactions } from "./utils";

// TODO tsdoc for everything in here

interface Expression {
  UpdateExpression: NonNullable<UpdateCommandInput["UpdateExpression"]>;
  ExpressionAttributeNames: NonNullable<
    UpdateCommandInput["ExpressionAttributeNames"]
  >;
  ExpressionAttributeValues: NonNullable<
    UpdateCommandInput["ExpressionAttributeValues"]
  >;
}

export type UpdateOptions<T extends SingleTableDesign> = Partial<
  EntityDefinedAttributes<T>
>;

class Update<T extends SingleTableDesign> {
  readonly #EntityClass: EntityClass<T>;
  readonly #entityMetadata: EntityMetadata;
  readonly #tableMetadata: TableMetadata;
  readonly #transactionBuilder: TransactWriteBuilder;
  readonly #relationshipTransactions: RelationshipTransactions<T>;

  #entity?: T;

  constructor(Entity: EntityClass<T>) {
    this.#EntityClass = Entity;
    this.#entityMetadata = Metadata.getEntity(Entity.name);
    this.#tableMetadata = Metadata.getTable(
      this.#entityMetadata.tableClassName
    );
    this.#transactionBuilder = new TransactWriteBuilder();
    this.#relationshipTransactions = new RelationshipTransactions(Entity);
  }

  /**
   * Update entity transactions, including transactions to create/update BelongsToLinks
   * @param id The id of the entity being updated
   * @param attributes Attributes on the model to update.
   */
  public async run(id: string, attributes: UpdateOptions<T>): Promise<void> {
    this.buildUpdateItemTransaction(id, attributes);
    await this.buildRelationshipTransactions(id, attributes);
    await this.#transactionBuilder.executeTransaction();
  }

  /**
   * Build the transaction to update the entity
   * @param id The id of the entity being updated
   * @param attributes Attributes on the model to update.
   */
  private buildUpdateItemTransaction(
    id: string,
    attributes: UpdateOptions<T>
  ): void {
    const { attributes: entityAttrs } = this.#entityMetadata;
    const { name: tableName, primaryKey, sortKey } = this.#tableMetadata;

    const pk = entityAttrs[primaryKey].name;
    const sk = entityAttrs[sortKey].name;

    const keys = {
      [pk]: this.#EntityClass.primaryKeyValue(id),
      [sk]: this.#EntityClass.name
    };

    const updatedAttrs: Partial<SingleTableDesign> = {
      ...attributes,
      updatedAt: new Date()
    };
    const tableKeys = entityToTableItem(this.#EntityClass.name, keys);
    const tableAttrs = entityToTableItem(this.#EntityClass.name, updatedAttrs);

    const expression = this.expressionBuilder(tableAttrs);

    this.#transactionBuilder.addUpdate(
      {
        TableName: tableName,
        Key: tableKeys,
        ExpressionAttributeNames: expression.ExpressionAttributeNames,
        ExpressionAttributeValues: expression.ExpressionAttributeValues,
        UpdateExpression: expression.UpdateExpression,
        ConditionExpression: `attribute_exists(${primaryKey})` // Only update the item if it exists
      },
      `${this.#EntityClass.name} with ID '${id}' does not exist`
    );
  }

  /**
   * Builds the transactions to persist relationships
   *   - Creates BelongsToLinks when a foreign key changes
   *   - Removes outdated BelongsToLinks if the entity previously was associated with a different entity
   * @param id The id of the entity being updated
   * @param attributes Attributes on the model to update.
   */
  private async buildRelationshipTransactions(
    id: string,
    attributes: Partial<SingleTableDesign>
  ): Promise<void> {
    const { relationships } = this.#entityMetadata;

    for (const rel of Object.values(relationships)) {
      const isBelongsTo = isBelongsToRelationship(rel);

      if (isBelongsTo) {
        const relationshipId = attributes[rel.foreignKey];
        const isUpdatingRelationshipId = relationshipId !== undefined;

        if (isUpdatingRelationshipId && typeof relationshipId === "string") {
          const entity = await this.getEntity(id);

          this.buildRelationshipExistsConditionTransaction(rel, relationshipId);

          if (doesEntityBelongToRelAsHasMany(this.#EntityClass, rel)) {
            this.buildBelongsToHasManyTransaction(
              rel,
              id,
              relationshipId,
              entity
            );
          }

          if (doesEntityBelongToRelAsHasOne(this.#EntityClass, rel)) {
            this.buildBelongsToHasOneTransaction(
              rel,
              id,
              relationshipId,
              entity
            );
          }
        }
      }
    }
  }

  /**
   * Builds a dynamo expression given the table attributes
   * @param tableAttrs The table aliases of the entity attributes
   * @returns
   */
  private expressionBuilder(tableAttrs: DynamoTableItem): Expression {
    const entries = Object.entries(tableAttrs);
    return entries.reduce<Expression>(
      (acc, [key, val], idx) => {
        const attrName = `#${key}`;
        const attrVal = `:${key}`;
        acc.ExpressionAttributeNames[attrName] = key;
        acc.ExpressionAttributeValues[attrVal] = val;
        acc.UpdateExpression = acc.UpdateExpression.concat(
          ` ${attrName} = ${attrVal},`
        );

        if (idx === entries.length - 1) {
          // Remove trailing comma from the expression
          acc.UpdateExpression = acc.UpdateExpression.slice(0, -1);
        }

        return acc;
      },
      {
        ExpressionAttributeNames: {},
        ExpressionAttributeValues: {},
        UpdateExpression: "SET"
      }
    );
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
   * Creates the transaction to:
   *    - If the entity already is linked to a model, it creates a delete transaction to delete the current BelongsToLink
   *    - Creates the new BelongsToLink if the item its being linked to does not already have an association
   * @param rel BelongsTo relationship metadata for which the entity being created is a BelongsTo HasOne
   * @param entityId Id of the entity being created
   * @param relationshipId Id of the parent entity of which the entity being created BelongsTo
   * @param entity The actual entity of the item being updated, used to delete outdated BelongsToLinks
   */
  private buildBelongsToHasOneTransaction(
    rel: BelongsToRelationship,
    entityId: string,
    relationshipId: string,
    entity?: T
  ): void {
    this.buildDeleteOldBelongsToLinkTransaction(rel, "HasOne", entity);

    const putExpression = this.#relationshipTransactions.buildBelongsToHasOne(
      rel,
      entityId,
      relationshipId
    );

    this.#transactionBuilder.addPut(
      putExpression,
      `${
        rel.target.name
      } with id: ${relationshipId} already has an associated ${
        this.#EntityClass.name
      }`
    );
  }

  /**
   * Creates the transaction to:
   *    - If the entity already is linked to a model, it creates a delete transaction to delete the current BelongsToLink
   *    - Creates the new BelongsToLink if the item its being linked to does not already have an association
   * @param rel BelongsTo relationship metadata for which the entity being created is a BelongsTo HasMany
   * @param entityId Id of the entity being created
   * @param relationshipId Id of the parent entity of which the entity being created BelongsTo
   * @param entity The actual entity of the item being updated, used to delete outdated BelongsToLinks
   */
  private buildBelongsToHasManyTransaction(
    rel: BelongsToRelationship,
    entityId: string,
    relationshipId: string,
    entity?: T
  ): void {
    this.buildDeleteOldBelongsToLinkTransaction(rel, "HasMany", entity);

    const putExpression = this.#relationshipTransactions.buildBelongsToHasMany(
      rel,
      entityId,
      relationshipId
    );

    this.#transactionBuilder.addPut(
      putExpression,
      `${this.#EntityClass.name} with ID '${entityId}' already belongs to ${
        rel.target.name
      } with Id '${relationshipId}'`
    );
  }

  /**
   * When updating the foreign key of an entity, delete the BelongsToLink in the previous relationships partition
   * @param rel
   * @param relType
   * @param entity
   */
  private buildDeleteOldBelongsToLinkTransaction(
    rel: RelationshipMetadata,
    relType: HasOneRelationship["type"] | HasManyRelationship["type"],
    entity?: T
  ): void {
    const { name: tableName, primaryKey, sortKey } = this.#tableMetadata;

    const currentId =
      entity !== undefined ? (entity[rel.foreignKey] as ForeignKey) : undefined;

    if (entity !== undefined && currentId !== undefined) {
      const oldLinkKeys = {
        [primaryKey]: rel.target.primaryKeyValue(currentId),
        [sortKey]:
          relType === "HasMany"
            ? this.#EntityClass.primaryKeyValue(entity.id)
            : this.#EntityClass.name
      };

      this.#transactionBuilder.addDelete({
        TableName: tableName,
        Key: oldLinkKeys
      });
    }
  }

  /**
   * If updating a ForeignKey, look up the current state of the item to build transactions
   */
  private async getEntity(id: string): Promise<T | undefined> {
    // Only get the item once per transaction
    if (this.#entity !== undefined) return this.#entity;
    const res: T = (await this.#EntityClass.findById(id)) as T;
    this.#entity = res ?? undefined;
    return this.#entity;
  }
}

export default Update;
