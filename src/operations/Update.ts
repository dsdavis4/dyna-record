import { type UpdateCommandInput } from "@aws-sdk/lib-dynamodb";
import type SingleTableDesign from "../SingleTableDesign";
import { TransactWriteBuilder } from "../dynamo-utils";
import type { EntityClass, EntityMetadata, TableMetadata } from "../metadata";
import Metadata from "../metadata";
import { entityToTableItem } from "../utils";
import { type CreateOptions } from "./Create";
import { type DynamoTableItem } from "../types";

// TODO dry up this class from other operation classes

// TODO
/**
 * if a foreign key for a HasOne/HasMany is changed:
 *      - remove the existing BelongsToLink in that associaterd partition
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
      `${this.EntityClass.name} with ID ${id} does not exist`
    );

    await this.#transactionBuilder.executeTransaction();
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
}

export default Update;
