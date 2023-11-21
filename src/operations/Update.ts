import { type UpdateCommandInput } from "@aws-sdk/lib-dynamodb";
import type SingleTableDesign from "../SingleTableDesign";
import { TransactWriteBuilder, type ConditionCheck } from "../dynamo-utils";
import type {
  EntityClass,
  EntityMetadata,
  TableMetadata,
  RelationshipMetadata
} from "../metadata";
import Metadata from "../metadata";
import { entityToTableItem } from "../utils";
import { type CreateOptions } from "./Create";
import { type ForeignKey, type DynamoTableItem } from "../types";
import { v4 as uuidv4 } from "uuid";
import {
  isBelongsToRelationship,
  isHasManyRelationship,
  isHasOneRelationship
} from "../metadata/utils";
import { BelongsToLink } from "../relationships";

// TODO tsdoc for everything in here

// TODO unit test for changing foreign key on HasMany

// TODO unit test for changing foreign key on HasOne

// TODO dry up this class from other operation classes

// TODO
/**
 * if a foreign key for a HasOne/HasMany is changed:
 *      - remove the existing BelongsToLink in that associaterd partition
 *          - or fail...
 *      - check that the new one exists
 *      - create the new BelongsToLink
 */

interface Expression {
  UpdateExpression: NonNullable<UpdateCommandInput["UpdateExpression"]>;
  ExpressionAttributeNames: NonNullable<
    UpdateCommandInput["ExpressionAttributeNames"]
  >;
  ExpressionAttributeValues: NonNullable<
    UpdateCommandInput["ExpressionAttributeValues"]
  >;
}

class Update<T extends SingleTableDesign> {
  readonly #entityMetadata: EntityMetadata;
  readonly #tableMetadata: TableMetadata;
  readonly #transactionBuilder: TransactWriteBuilder;
  #entity: T | null = null; // TODO add test for this, its only fetched if a key is updated

  // TODO should this be an accessor with #? Same with other operation classes...
  private readonly EntityClass: EntityClass<T>;

  constructor(Entity: EntityClass<T>) {
    this.EntityClass = Entity;
    this.#entityMetadata = Metadata.getEntity(Entity.name);
    this.#tableMetadata = Metadata.getTable(
      this.#entityMetadata.tableClassName
    );
    this.#transactionBuilder = new TransactWriteBuilder();
  }

  // TODO should this return void? OR get the new item?
  // TODO add tests that all fields are optional,
  // TODO add tests that it only updateable fields are updateable
  // TODO dont use CreateOptions... if they end up being the sanme then find a way to share them
  public async run(
    id: string,
    attributes: Partial<CreateOptions<T>>
  ): Promise<void> {
    this.buildUpdateItemTransaction(id, attributes);
    await this.buildRelationshipTransactions(id, attributes);
    await this.#transactionBuilder.executeTransaction();
  }

  private buildUpdateItemTransaction(
    id: string,
    attributes: Partial<CreateOptions<T>>
  ): void {
    const { attributes: entityAttrs } = this.#entityMetadata;
    const { name: tableName, primaryKey, sortKey } = this.#tableMetadata;

    const pk = entityAttrs[primaryKey].name;
    const sk = entityAttrs[sortKey].name;

    // TODO if this is copied make a function on eventual base class
    const keys = {
      [pk]: this.EntityClass.primaryKeyValue(id),
      [sk]: this.EntityClass.name
    };

    const updatedAttrs: Partial<SingleTableDesign> = {
      ...attributes,
      updatedAt: new Date()
    };
    const tableKeys = entityToTableItem(this.EntityClass.name, keys);
    const tableAttrs = entityToTableItem(this.EntityClass.name, updatedAttrs);

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
      // TODO add unit test for error message
      `${this.EntityClass.name} with ID '${id}' does not exist`
    );
  }

  // TODO can any of this be DRY'd up with create?
  private async buildRelationshipTransactions(
    id: string,
    attributes: Partial<SingleTableDesign>
  ): Promise<void> {
    const { relationships } = this.#entityMetadata;

    for (const rel of Object.values(relationships)) {
      const isBelongsTo = isBelongsToRelationship(rel);

      // TODO add test that none of below is called if only updating non foreign key attributes
      if (isBelongsTo) {
        const relationshipId = attributes[rel.foreignKey];
        const isUpdatingRelationshipId = relationshipId !== undefined;

        if (isUpdatingRelationshipId && typeof relationshipId === "string") {
          const entity = await this.getEntity(id);

          this.buildRelationshipExistsConditionTransaction(rel, relationshipId);

          // Return early if the item is not found, it will fail the transaction
          // if (entity === null) return; // TODO add a test for this

          if (this.doesEntityBelongToHasMany(rel, rel.foreignKey)) {
            this.buildBelongsToHasManyTransaction(
              rel,
              id,
              relationshipId,
              entity
            );
          }

          if (this.doesEntityBelongToHasOne(rel, rel.foreignKey)) {
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

  // TODO this is copied from Create. DRY up
  /**
   * Builds a ConditionCheck transaction that ensures the associated relationship exists
   * @param rel
   * @param relationshipId
   * @returns
   */
  private buildRelationshipExistsConditionTransaction(
    rel: RelationshipMetadata,
    relationshipId: string
  ): void {
    const { name: tableName, primaryKey, sortKey } = this.#tableMetadata;

    const errMsg = `${rel.target.name} with ID '${relationshipId}' does not exist`;

    const conditionCheck: ConditionCheck = {
      TableName: tableName,
      Key: {
        [primaryKey]: rel.target.primaryKeyValue(relationshipId),
        [sortKey]: rel.target.name
      },
      ConditionExpression: `attribute_exists(${primaryKey})`
    };

    this.#transactionBuilder.addConditionCheck(conditionCheck, errMsg);
  }

  // TODO this is copied from Create. Dry up
  /**
   * Returns true if the entity being created BelongsTo a HasMany
   * @param rel
   * @param foreignKey
   * @returns
   */
  private doesEntityBelongToHasMany(
    rel: RelationshipMetadata,
    foreignKey: string
  ): boolean {
    const relMetadata = Metadata.getEntity(rel.target.name);

    return Object.values(relMetadata.relationships).some(
      rel =>
        isHasManyRelationship(rel) &&
        rel.target === this.EntityClass &&
        rel.foreignKey === foreignKey
    );
  }

  // TODO this is copied from Create. Dry up
  /**
   * Returns true if the entity being created BelongsTo a HasOne
   * @param rel
   * @param foreignKey
   * @returns
   */
  private doesEntityBelongToHasOne(
    rel: RelationshipMetadata,
    foreignKey: string
  ): boolean {
    const relMetadata = Metadata.getEntity(rel.target.name);

    return Object.values(relMetadata.relationships).some(
      rel =>
        isHasOneRelationship(rel) &&
        rel.target === this.EntityClass &&
        rel.foreignKey === foreignKey
    );
  }

  // TODO I dont need to pass entityId and entity. Entity has the id
  /**
   * Creates the transaction to:
   *    - If the entity already is linked to a model, it creates a delete transaction to delete the current BelongsToLink
   *    - Creates the new BelongsToLink if the item its being linked to does not already have an association
   * @param rel
   * @param entityId
   * @param relationshipId
   * @param entity
   */
  private buildBelongsToHasOneTransaction(
    rel: RelationshipMetadata,
    entityId: string,
    relationshipId: string,
    entity?: T
  ): void {
    const { name: tableName, primaryKey, sortKey } = this.#tableMetadata;

    // TODO can I avoid using "as", how can I update t
    const currentId =
      entity !== undefined ? (entity[rel.foreignKey] as ForeignKey) : undefined;

    // TODO this is duplicated in the buildBelongsToHasManyTransaction function
    // TODO add unit test that this only happens when the currentId exists
    // TODO add a check that the breweryId is not equal to itself
    //      and  test for that
    if (currentId !== undefined) {
      const oldLinkKeys = {
        [primaryKey]: rel.target.primaryKeyValue(currentId),
        [sortKey]: this.EntityClass.name
      };

      // TODO do these need conditions?
      this.#transactionBuilder.addDelete({
        TableName: tableName,
        Key: oldLinkKeys
      });
    }

    // TODO Everything below is copied from Create and can be cleaned up
    const link = BelongsToLink.build(this.EntityClass.name, entityId);

    const keys = {
      [primaryKey]: rel.target.primaryKeyValue(relationshipId),
      [sortKey]: this.EntityClass.name
    };

    const putExpression = {
      TableName: tableName,
      Item: { ...keys, ...entityToTableItem(rel.target.name, link) },
      ConditionExpression: `attribute_not_exists(${primaryKey})` // Ensure item doesn't already exist
    };

    // TODO add test for error
    this.#transactionBuilder.addPut(
      putExpression,
      `${rel.target.name} with id: ${relationshipId} already has an associated ${this.EntityClass.name}`
    );
  }

  // TODO I dont need to pass entityId and entity. Entity has the id
  private buildBelongsToHasManyTransaction(
    rel: RelationshipMetadata,
    entityId: string,
    relationshipId: string,
    entity?: T
  ): void {
    const { name: tableName, primaryKey, sortKey } = this.#tableMetadata;

    // TODO can I avoid using "as", how can I update t
    const currentId =
      entity !== undefined ? (entity[rel.foreignKey] as ForeignKey) : undefined;

    // TODO this is MOSTLY duplicated in the buildBelongsToHasOneTransaction function
    // TODO add unit test that this only happens when the currentId exists
    // TODO add a check that the breweryId is not equal to itself
    //      and  test for that
    if (currentId !== undefined && currentId !== relationshipId) {
      const oldLinkKeys = {
        [primaryKey]: rel.target.primaryKeyValue(currentId),
        [sortKey]: this.EntityClass.primaryKeyValue(entityId)
      };

      // TODO do these need conditions?
      this.#transactionBuilder.addDelete({
        TableName: tableName,
        Key: oldLinkKeys
      });
    }

    // TODO Everything below is copied from Create and can be cleaned up  }

    const link = BelongsToLink.build(this.EntityClass.name, entityId);

    const keys = {
      [primaryKey]: rel.target.primaryKeyValue(relationshipId),
      [sortKey]: this.EntityClass.primaryKeyValue(link.foreignKey)
    };

    const putExpression = {
      TableName: tableName,
      Item: { ...keys, ...entityToTableItem(rel.target.name, link) },
      ConditionExpression: `attribute_not_exists(${primaryKey})` // Ensure item doesn't already exist
    };

    // TODO add test for error
    this.#transactionBuilder.addPut(
      putExpression,
      `${this.EntityClass.name} with ID '${entityId}' already belongs to ${rel.target.name} with Id '${relationshipId}'`
    );
  }

  /**
   * If updating a ForeignKey, look up the current state of the item to build transactions
   */
  private async getEntity(id: string): Promise<T | undefined> {
    if (this.#entity !== null) return this.#entity;
    const res = (await this.EntityClass.findById(id)) as T; // TODO can I avoid the "as"
    return res ?? undefined;
  }
}

export default Update;
