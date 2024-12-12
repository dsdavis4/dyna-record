import type DynaRecord from "../../DynaRecord";
import { v4 as uuidv4 } from "uuid";
import type { DynamoTableItem, EntityClass } from "../../types";
import {
  type Put,
  TransactGetBuilder,
  TransactWriteBuilder
} from "../../dynamo-utils";
import { entityToTableItem, isString, tableItemToEntity } from "../../utils";
import OperationBase from "../OperationBase";
import {
  extractForeignKeyFromEntity,
  BelongsToTransactionBuilder
} from "../utils";
import type { CreateOptions } from "./types";
import {
  type EntityDefinedAttributes,
  type EntityAttributeDefaultFields,
  type EntityAttributes
} from "../types";
import { isBelongsToRelationship } from "../../metadata/utils";
import Logger from "../../Logger";

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
    this.buildBelongsToTransactions(entityData, tableItem);

    // TODO ensure strong read... and unit test for it
    const belongsToTableItems = await this.getBelongsToTableItems(entityData);

    // TODO shoud this be moved to a callback within relationship transactions so its all together?
    // TODO test when this is not called . - Creating item with no belongs to might already exist
    if (belongsToTableItems.length > 0) {
      this.buildAddBelongsToLinkToSelfTransactions(
        reservedAttrs.id,
        belongsToTableItems
      );
    }

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
   * Build transaction items for belongs to associations associations
   * @param entityData
   */
  private buildBelongsToTransactions(
    entityData: EntityAttributes<DynaRecord>,
    tableItem: DynamoTableItem
  ): void {
    const tableName = this.tableMetadata.name;
    const partitionKeyAlias = this.tableMetadata.partitionKeyAttribute.alias;

    const relationshipTransactions = new BelongsToTransactionBuilder({
      Entity: this.EntityClass,
      transactionBuilder: this.#transactionBuilder,
      persistLinkCb: ({ key, relMeta, relationshipId }) => {
        this.#transactionBuilder.addPut(
          {
            TableName: tableName,
            Item: { ...tableItem, ...key },
            ConditionExpression: `attribute_not_exists(${partitionKeyAlias})` // Ensure item doesn't already exist
          },
          `${relMeta.target.name} with id: ${relationshipId} already has an associated ${this.EntityClass.name}`
        );
      }
    });

    relationshipTransactions.build(entityData);
  }

  // TODO unrelated to this method... I should make a shared type since I am using EntityAttributes<DynaRecord> everywhere
  /**
   * Retrieves the associated DynamoDB records for all entities that the given entity
   * is related to via "belongsTo" relationships.
   *
   *
   * If there are no "belongsTo" relationships or no foreign keys are present, it returns an empty array.
   *
   * @param entityData - The attributes of the entity instance for which associated items need to be retrieved.
   * @returns A promise that resolves to an array of the associated DynamoDB table items.
   */
  private async getBelongsToTableItems(
    entityData: EntityAttributes<DynaRecord>
  ): Promise<DynamoTableItem[]> {
    const { name: tableName } = this.tableMetadata;
    const transactionBuilder = new TransactGetBuilder();
    const relMetas = this.entityMetadata.relationships;

    const belongsToRelMetas = Object.values(relMetas).filter(relMeta =>
      isBelongsToRelationship(relMeta)
    );

    belongsToRelMetas.forEach(relMeta => {
      const fk = extractForeignKeyFromEntity(relMeta, entityData);

      if (fk !== undefined) {
        transactionBuilder.addGet({
          TableName: tableName,
          Key: {
            [this.partitionKeyAlias]: relMeta.target.partitionKeyValue(fk),
            [this.sortKeyAlias]: relMeta.target.name
          }
        });
      }
    });

    // TODO make sure there is a test when this has no transactions to fetch
    if (transactionBuilder.hasTransactions()) {
      const results = await transactionBuilder.executeTransaction();

      const tableItems = results.reduce<DynamoTableItem[]>((acc, res) => {
        if (res.Item !== undefined) acc.push(res.Item);
        return acc;
      }, []);

      return tableItems;
    }

    return [];
  }

  // TODO typedoc - include that entity id is the main entity being updated
  private buildAddBelongsToLinkToSelfTransactions(
    entityId: string,
    belongsToTableItems: DynamoTableItem[]
  ): void {
    const pk = this.EntityClass.partitionKeyValue(entityId);
    const typeAlias = this.tableMetadata.defaultAttributes.type.alias;

    belongsToTableItems.forEach(tableItem => {
      const relationshipType = tableItem[typeAlias];

      const key = {
        [this.partitionKeyAlias]: pk,
        [this.sortKeyAlias]: relationshipType
        // TODO should I store this way?
        // [this.sortKeyAlias]: tableItem[this.partitionKeyAlias]
      };

      this.#transactionBuilder.addPut(
        {
          TableName: this.tableMetadata.name,
          Item: { ...tableItem, ...key },
          ConditionExpression: `attribute_not_exists(${this.partitionKeyAlias})` // Ensure item doesn't already exist
        },
        // TODO test for error condition. Its the opposite of the one elsewhere in here
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `${this.EntityClass.name} already has an associated ${relationshipType}`
      );
    });
  }
}

export default Create;
