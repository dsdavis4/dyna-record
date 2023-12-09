import type SingleTableDesign from "../../SingleTableDesign";
import { TransactWriteBuilder } from "../../dynamo-utils";
import Metadata, { type EntityClass } from "../../metadata";
import { isBelongsToRelationship } from "../../metadata/utils";
import { BelongsToLink } from "../../relationships";
import { DynamoTableItem } from "../../types";
import { entityToTableItem } from "../../utils";
import OperationBase from "../OperationBase";
import { QueryResults } from "../Query";
import type { RelationshipLookup } from "../types";
import { expressionBuilder } from "../utils";

/**
 * TODO
 * Delete the entity and everything in its partition
 * - Make sure to update foreign keys linked on linked models
 * - If the foreign key is a required attribute, and as a value then I should throw an error through transactions.
 *      - I beleive I can get this info from the attribute decorator....
 *      - But should this even be allowed? In a SQL database what would happen?
 */

// TODO tsdoc for everything in here
class Delete<T extends SingleTableDesign> extends OperationBase<T> {
  readonly #transactionBuilder: TransactWriteBuilder;
  readonly #tableName: string;
  readonly #primaryKeyField: string;
  readonly #sortKeyField: string;
  readonly #relationsLookup: RelationshipLookup;

  constructor(Entity: EntityClass<T>) {
    super(Entity);
    this.#transactionBuilder = new TransactWriteBuilder();

    const { name: tableName, primaryKey, sortKey } = this.tableMetadata;

    this.#tableName = tableName;
    this.#primaryKeyField = this.entityMetadata.attributes[primaryKey].name;
    this.#sortKeyField = this.entityMetadata.attributes[sortKey].name;
    this.#relationsLookup = Object.values(
      this.entityMetadata.relationships
    ).reduce<RelationshipLookup>((acc, meta) => {
      acc[meta.target.name] = meta;
      return acc;
    }, {});
  }

  /**
   * Delete an item by id
   *   - Deletes the given entity
   *   - Deletes each item in the entity's partition
   *   - For each item in the entity's partition which is of type 'BelongsToLink' it:
   *     - Will nullify the associated relationship's ForeignKey attribute TODO add details about how it handles non nullable
   * @param id
   */
  public async run(id: string): Promise<void> {
    // TODO start here......

    const items = await this.EntityClass.query(id);

    for (const item of items) {
      this.buildDeleteItemTransaction(item);

      if (item instanceof BelongsToLink) {
        this.buildNullifyForeignKeyTransaction(item);
      }
    }

    debugger;
  }

  /**
   * Deletes an item in the parent Entity's partition
   * @param item
   */
  private buildDeleteItemTransaction(item: QueryResults<T>[number]): void {
    const pkField = this.#primaryKeyField as keyof typeof item;
    const skField = this.#sortKeyField as keyof typeof item;

    this.#transactionBuilder.addDelete({
      TableName: this.#tableName,
      Key: {
        [pkField]: item[pkField],
        [skField]: item[skField]
      }
    });
  }

  /**
   * Nullify the associated relationship's ForeignKey attribute TODO add details about how it handles non nullable
   * @param item
   */
  private buildNullifyForeignKeyTransaction(item: BelongsToLink): void {
    const relMeta = this.#relationsLookup[item.foreignEntityType];

    const tableKeys = entityToTableItem(this.EntityClass.name, {
      [this.#primaryKeyField]: relMeta.target.primaryKeyValue(item.foreignKey),
      [this.#sortKeyField]: relMeta.target.name
    });
    const tableAttrs = entityToTableItem(relMeta.target.name, {
      [relMeta.foreignKey]: null
    });

    const expression = expressionBuilder(tableAttrs);

    this.#transactionBuilder.addUpdate({
      TableName: this.#tableName,
      Key: tableKeys,
      ExpressionAttributeNames: expression.ExpressionAttributeNames,
      ExpressionAttributeValues: expression.ExpressionAttributeValues,
      UpdateExpression: expression.UpdateExpression
      // ConditionExpression: `attribute_exists(${primaryKey})` // Only update the item if it exists
    });
  }
}

export default Delete;
