import type SingleTableDesign from "../../SingleTableDesign";
import { TransactWriteBuilder } from "../../dynamo-utils";
import type {
  EntityClass,
  RelationshipMetadata,
  HasOneRelationship,
  HasManyRelationship
} from "../../metadata";
import { entityToTableItem } from "../../utils";
import {
  RelationshipTransactions,
  expressionBuilder,
  extractForeignKeyFromEntity
} from "../utils";
import OperationBase from "../OperationBase";
import type { UpdateOptions } from "./types";

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
    const { name: tableName } = this.tableMetadata;

    const pk = entityAttrs[this.primaryKeyAlias].name;
    const sk = entityAttrs[this.sortKeyAlias].name;

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

    const expression = expressionBuilder(tableAttrs);

    this.#transactionBuilder.addUpdate(
      {
        TableName: tableName,
        Key: tableKeys,
        ConditionExpression: `attribute_exists(${this.primaryKeyAlias})`, // Only update the item if it exists
        ...expression
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

    const relationshipTransactions = new RelationshipTransactions({
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

    await relationshipTransactions.build(entityData);
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
    const { name: tableName } = this.tableMetadata;

    const currentId = extractForeignKeyFromEntity(rel, entity);

    if (entity !== undefined && currentId !== undefined) {
      const oldLinkKeys = {
        [this.primaryKeyAlias]: rel.target.primaryKeyValue(currentId),
        [this.sortKeyAlias]:
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
