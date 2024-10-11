import type DynaRecord from "../../DynaRecord";
import { TransactWriteBuilder } from "../../dynamo-utils";
import type {
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
import type { UpdatedAttributes, UpdateOptions } from "./types";
import type { EntityClass } from "../../types";
import Metadata from "../../metadata";

/**
 * Facilitates the operation of updating an existing entity in the database, including handling updates to its attributes and managing changes to its relationships. It will de-normalize data to support relationship links
 *
 * The `Update` operation supports updating entity attributes and ensures consistency in relationships, especially for "BelongsTo" relationships. It handles the complexity of managing foreign keys and associated "BelongsToLink" records, including creating new links for updated relationships and removing outdated links when necessary.
 *
 * Only attributes defined on the model can be configured, and will be enforced via types and runtime schema validation.
 *
 * @template T - The type of the entity being updated, extending `DynaRecord`.
 */
class Update<T extends DynaRecord> extends OperationBase<T> {
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
  public async run(
    id: string,
    attributes: UpdateOptions<T>
  ): Promise<UpdatedAttributes<T>> {
    const entityMeta = Metadata.getEntity(this.EntityClass.name);
    const entityAttrs =
      entityMeta.parseRawEntityDefinedAttributesPartial(attributes);

    const updatedAttrs = this.buildUpdateItemTransaction(id, entityAttrs);

    await this.buildRelationshipTransactions(id, entityAttrs);
    await this.#transactionBuilder.executeTransaction();

    return updatedAttrs;
  }

  /**
   * Build the transaction to update the entity
   * @param id The id of the entity being updated
   * @param attributes Attributes on the model to update.
   */
  private buildUpdateItemTransaction(
    id: string,
    attributes: UpdateOptions<T>
  ): UpdatedAttributes<T> {
    const { name: tableName } = this.tableMetadata;

    const pk = this.tableMetadata.partitionKeyAttribute.name;
    const sk = this.tableMetadata.sortKeyAttribute.name;

    const keys = {
      [pk]: this.EntityClass.partitionKeyValue(id),
      [sk]: this.EntityClass.name
    };

    const updatedAttrs: UpdatedAttributes<T> = {
      ...attributes,
      updatedAt: new Date()
    };
    const tableKeys = entityToTableItem(this.EntityClass, keys);
    const tableAttrs = entityToTableItem(this.EntityClass, updatedAttrs);

    const expression = expressionBuilder(tableAttrs);

    this.#transactionBuilder.addUpdate(
      {
        TableName: tableName,
        Key: tableKeys,
        ConditionExpression: `attribute_exists(${this.partitionKeyAlias})`, // Only update the item if it exists
        ...expression
      },
      `${this.EntityClass.name} with ID '${id}' does not exist`
    );

    return updatedAttrs;
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
    attributes: Partial<DynaRecord>
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
        [this.partitionKeyAlias]: rel.target.partitionKeyValue(currentId),
        [this.sortKeyAlias]:
          relType === "HasMany"
            ? this.EntityClass.partitionKeyValue(entity.id)
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
