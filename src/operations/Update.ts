import { type UpdateCommandInput } from "@aws-sdk/lib-dynamodb";
import type SingleTableDesign from "../SingleTableDesign";
import { TransactWriteBuilder } from "../dynamo-utils";
import type {
  EntityClass,
  RelationshipMetadata,
  HasOneRelationship,
  HasManyRelationship
} from "../metadata";
import { entityToTableItem } from "../utils";
import { type ForeignKey, type DynamoTableItem } from "../types";
import type { EntityDefinedAttributes } from "./types";
import { RelationshipPersistor } from "./utils";
import OperationBase from "./OperationBase";

// TODO start here... do I like what I did here for DRY up the relationship persistor?
//       It certainly dries things up, but is it too rigid?
//       Is it readable?
//       If I keep it, take a close look at uncommited branch, and fix todos first

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

/**
 * Update operation. Updates attributes, creates BelongsToLinks and deletes outdated BelongsToLinks
 */
class Update<T extends SingleTableDesign> extends OperationBase<T> {
  readonly #transactionBuilder: TransactWriteBuilder;

  #entity?: T;

  constructor(Entity: EntityClass<T>) {
    super(Entity);
    this.#transactionBuilder = new TransactWriteBuilder();
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
    const { attributes: entityAttrs } = this.entityMetadata;
    const { name: tableName, primaryKey, sortKey } = this.tableMetadata;

    const pk = entityAttrs[primaryKey].name;
    const sk = entityAttrs[sortKey].name;

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
      `${this.EntityClass.name} with ID '${id}' does not exist`
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
    const entityData = { id, ...attributes };

    const relationshipPersistor = new RelationshipPersistor({
      Entity: this.EntityClass,
      transactionBuilder: this.#transactionBuilder,
      belongsToHasManyCb: async (rel, entityId) => {
        const entity = await this.getEntity(entityId);
        this.buildDeleteOldBelongsToLinkTransaction(rel, "HasMany", entity);
      },
      belongsToHasOneCb: async (rel, entityId) => {
        const entity = await this.getEntity(entityId);
        this.buildDeleteOldBelongsToLinkTransaction(rel, "HasOne", entity);
      }
    });

    // TODO dont use any...
    await relationshipPersistor.persist(entityData as any);
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
    const { name: tableName, primaryKey, sortKey } = this.tableMetadata;

    const currentId =
      entity !== undefined ? (entity[rel.foreignKey] as ForeignKey) : undefined;

    if (entity !== undefined && currentId !== undefined) {
      const oldLinkKeys = {
        [primaryKey]: rel.target.primaryKeyValue(currentId),
        [sortKey]:
          relType === "HasMany"
            ? this.EntityClass.primaryKeyValue(entity.id)
            : this.EntityClass.name
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
    const res: T = (await this.EntityClass.findById(id)) as T;
    this.#entity = res ?? undefined;
    return this.#entity;
  }
}

export default Update;
