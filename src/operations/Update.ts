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
import { type DynamoTableItem } from "../types";
import { isBelongsToRelationship } from "../metadata/utils";

// TODO tsdoc for everything in here

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
    this.buildRelationshipTransactions(attributes);

    // TODO start here........ Start working on managing relationship entities. See conditions at top

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
  private buildRelationshipTransactions(
    attributes: Partial<SingleTableDesign>
  ): void {
    const { relationships } = this.#entityMetadata;

    Object.values(relationships).forEach(rel => {
      const isBelongsTo = isBelongsToRelationship(rel);

      if (isBelongsTo) {
        const relationshipId = attributes[rel.foreignKey];
        const isUpdatingRelationshipId = relationshipId !== undefined;

        if (isUpdatingRelationshipId && typeof relationshipId === "string") {
          this.buildRelationshipExistsConditionTransaction(rel, relationshipId);
          debugger;
        }
      }
    });
    debugger;
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

  // private build
}

export default Update;
