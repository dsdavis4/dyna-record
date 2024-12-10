import type DynaRecord from "../../DynaRecord";
import { v4 as uuidv4 } from "uuid";
import type { DynamoTableItem, EntityClass } from "../../types";
import { Put, TransactWriteBuilder } from "../../dynamo-utils";
import { entityToTableItem, tableItemToEntity } from "../../utils";
import OperationBase from "../OperationBase";
import { RelationshipTransactions } from "../utils";
import type { CreateOptions } from "./types";
import {
  type EntityDefinedAttributes,
  type EntityAttributeDefaultFields,
  type EntityAttributes
} from "../types";

/**
 * Represents the operation for creating a new entity in the database, including handling its attributes and any related entities' associations. It will handle de-normalizing data to support relationships
 *
 * It encapsulates the logic required to translate entity attributes to a format suitable for DynamoDB, execute the creation transaction, and manage any relationships defined by the entity, such as "BelongsTo" or "HasMany" links.
 *
 * Only attributes defined on the model can be configured, and will be enforced via types and runtime schema validation.
 *
 * @template T - The type of the entity being created, extending `DynaRecord`.
 */
class Create<T extends DynaRecord> extends OperationBase<T> {
  readonly #transactionBuilder: TransactWriteBuilder;

  constructor(Entity: EntityClass<T>) {
    super(Entity);
    this.#transactionBuilder = new TransactWriteBuilder();
  }

  // TODO I need to handle the error where this throws because an item already exists and throw a better error...
  /**
   * Create an entity transaction, including relationship transactions (EX: Creating BelongsToLinks for HasMany, checking existence of relationships, etc)
   * @param attributes
   * @returns
   */
  public async run(attributes: CreateOptions<T>): Promise<EntityAttributes<T>> {
    const entityAttrs =
      this.entityMetadata.parseRawEntityDefinedAttributes(attributes);

    const reservedAttrs = this.buildReservedAttributes(entityAttrs);
    const entityData = { ...reservedAttrs, ...entityAttrs };

    const tableItem = entityToTableItem(this.EntityClass, entityData);

    this.buildPutItemTransaction(tableItem, entityData.id);
    this.buildRelationshipTransactions(entityData);

    await this.#transactionBuilder.executeTransaction();

    return tableItemToEntity<T>(this.EntityClass, tableItem);
  }

  /**
   * Builds the entity attributes
   * @param attributes
   * @returns
   */
  private buildReservedAttributes(
    entityAttrs: EntityDefinedAttributes<DynaRecord>
  ): EntityAttributes<DynaRecord> {
    const { idField } = this.entityMetadata;

    // If the entity has has a custom id field use that, otherwise generate a uuid
    const id =
      idField === undefined
        ? uuidv4()
        : entityAttrs[idField as keyof typeof entityAttrs];

    const createdAt = new Date();

    const pk = this.tableMetadata.partitionKeyAttribute.name;
    const sk = this.tableMetadata.sortKeyAttribute.name;

    const keys = {
      [pk]: this.EntityClass.partitionKeyValue(id),
      [sk]: this.EntityClass.name
    };

    const defaultAttrs: EntityAttributeDefaultFields = {
      id,
      type: this.EntityClass.name,
      createdAt,
      updatedAt: createdAt
    };

    return { ...keys, ...defaultAttrs };
  }

  /**
   * Build the transaction for the parent entity Create item request
   * @param tableItem
   */
  private buildPutItemTransaction(
    tableItem: DynamoTableItem,
    id: string
  ): void {
    const { name: tableName } = this.tableMetadata;

    const putExpression = {
      TableName: tableName,
      Item: tableItem,
      ConditionExpression: `attribute_not_exists(${this.partitionKeyAlias})` // Ensure item doesn't already exist
    };
    this.#transactionBuilder.addPut(
      putExpression,
      `${this.EntityClass.name} with id: ${id} already exists`
    );
  }

  /**
   * Build transaction items for associations
   * @param entityData
   */
  private buildRelationshipTransactions(
    entityData: EntityAttributes<DynaRecord>
  ): void {
    const tableName = this.tableMetadata.name;
    const partitionKeyAlias = this.tableMetadata.partitionKeyAttribute.alias;

    const relationshipTransactions = new RelationshipTransactions({
      Entity: this.EntityClass,
      transactionBuilder: this.#transactionBuilder,
      linkRecordAddPutOptions: ({ tableItem, relMeta, relationshipId }) => {
        const putExpression: Put = {
          TableName: tableName,
          Item: tableItem,
          ConditionExpression: `attribute_not_exists(${partitionKeyAlias})` // Ensure item doesn't already exist
        };

        return [
          putExpression,
          `${relMeta.target.name} with id: ${relationshipId} already has an associated ${this.EntityClass.name}`
        ];
      }
    });

    relationshipTransactions.build(entityData);
  }
}

export default Create;
