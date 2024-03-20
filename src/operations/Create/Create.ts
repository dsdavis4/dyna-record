import type NoOrm from "../../NoOrm";
import { v4 as uuidv4 } from "uuid";
import type { DynamoTableItem, EntityClass } from "../../types";
import { TransactWriteBuilder } from "../../dynamo-utils";
import { entityToTableItem, tableItemToEntity } from "../../utils";
import OperationBase from "../OperationBase";
import { RelationshipTransactions } from "../utils";
import type { CreateOptions } from "./types";

class Create<T extends NoOrm> extends OperationBase<T> {
  readonly #transactionBuilder: TransactWriteBuilder;

  constructor(Entity: EntityClass<T>) {
    super(Entity);
    this.#transactionBuilder = new TransactWriteBuilder();
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
    await this.buildRelationshipTransactions(entityData);

    await this.#transactionBuilder.executeTransaction();

    return tableItemToEntity<T>(this.EntityClass, tableItem);
  }

  private buildEntityData(attributes: CreateOptions<T>): NoOrm {
    const id = uuidv4();
    const createdAt = new Date();

    const pk = this.tableMetadata.primaryKeyAttribute.name;
    const sk = this.tableMetadata.sortKeyAttribute.name;

    const keys = {
      [pk]: this.EntityClass.primaryKeyValue(id),
      [sk]: this.EntityClass.name
    };

    const defaultAttrs: NoOrm = {
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
    const { name: tableName } = this.tableMetadata;

    const putExpression = {
      TableName: tableName,
      Item: tableItem,
      ConditionExpression: `attribute_not_exists(${this.primaryKeyAlias})` // Ensure item doesn't already exist
    };
    this.#transactionBuilder.addPut(putExpression);
  }

  /**
   * Build transaction items for associations
   * @param entityData
   */
  private async buildRelationshipTransactions(
    entityData: NoOrm
  ): Promise<void> {
    const relationshipTransactions = new RelationshipTransactions({
      Entity: this.EntityClass,
      transactionBuilder: this.#transactionBuilder
    });

    await relationshipTransactions.build(entityData);
  }
}

export default Create;
