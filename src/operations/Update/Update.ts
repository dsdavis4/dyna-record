import DynaRecord from "../../DynaRecord";
import { type Put, TransactWriteBuilder } from "../../dynamo-utils";
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
import { NotFoundError } from "../../errors";
import { type EntityAttributes } from "../types";
import {
  isBelongsToRelationship,
  isHasAndBelongsToManyRelationship,
  isHasManyRelationship,
  isHasOneRelationship
} from "../../metadata/utils";

// TODO if I have to add extra denormalization on create then I will need to update the deletes as well. Making sure to update the new records
// TODO and what about HasAndBelongsToMany when updated?

interface SortedQueryResults {
  entity: EntityAttributes<DynaRecord>;
  relatedEntities: EntityAttributes<DynaRecord>[];
}

// TODO is this needed? or used?
type Entity = EntityAttributes<DynaRecord>;

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

  // TODO should this be renamed to match the comment?
  /**
   * The entity object before being updated
   */
  #entity: Entity;

  constructor(Entity: EntityClass<T>) {
    super(Entity);
    this.#transactionBuilder = new TransactWriteBuilder();
  }

  /**
   * Gets the entity class member or throws if its not set
   * @returns
   */
  private getEntity(): NonNullable<Entity> {
    // TODO unit test
    // TODO is this the correct error?
    if (this.#entity === undefined) {
      throw new NotFoundError("Entity not set");
    }

    return this.#entity;
  }

  /**
   * Update entity transactions, including transactions to create/update BelongsToLinks
   * @param id The id of the entity being updated
   * @param attributes Attributes on the model to update.
   */
  public async run(
    id: string,
    attributes: UpdateOptions<DynaRecord>
  ): Promise<UpdatedAttributes<T>> {
    const entityMeta = Metadata.getEntity(this.EntityClass.name);
    const entityAttrs =
      entityMeta.parseRawEntityDefinedAttributesPartial(attributes);

    const relMetas = this.entityMetadata.relationships;

    const hasRelMetas = Object.values(relMetas).filter(
      relMeta =>
        isHasOneRelationship(relMeta) ||
        isHasManyRelationship(relMeta) ||
        // TODO is this what I want?
        isHasAndBelongsToManyRelationship(relMeta)
    );

    debugger;

    // TODO should this be a raq query
    // TODO ensure that this is a strong read...
    // TODO dont fetch if the entity has no relationships meta data
    //     this is because I HAVE to get it and denormalize to all locations to ensure associated links are updated
    //    AND unit test for that case
    const selfAndLinkedEntities = await this.EntityClass.query<DynaRecord>(id, {
      filter: {
        type: [
          this.EntityClass.name,
          ...hasRelMetas.map(meta => meta.target.name)
        ]
      }
    });

    const linkedEntities = selfAndLinkedEntities.filter(entity => {
      if (entity.id === id) {
        this.#entity = entity;
        return false; // Exclude the matching record
      }
      return true;
    });

    debugger;

    if (linkedEntities[0] instanceof DynaRecord) {
      const bla = linkedEntities[0].partitionKeyValue();
      debugger;
    }

    const updatedAttrs = this.buildUpdateItemTransaction(id, entityAttrs);

    const { name: tableName } = this.tableMetadata;

    // linkedEntities.forEach(entity => {
    //   this.#transactionBuilder.addUpdate({
    //     TableName: tableName,
    //     Key: {
    //       [this.partitionKeyAlias]:
    //     }
    //   })
    // });

    // TODO is this type assertion needed?
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const updatedEntity = {
      ...this.#entity,
      ...updatedAttrs
    } as EntityAttributes<DynaRecord>;

    this.buildRelationshipTransactions(updatedEntity);
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
        // TODO for ACID-like, make sure that the updatedAt of the item being updated is before the new updatedAt
        //       - I of course will need to have the full object with a strong read
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
  private buildRelationshipTransactions(
    entity: EntityAttributes<DynaRecord>
  ): void {
    const tableName = this.tableMetadata.name;

    const relationshipTransactions = new RelationshipTransactions({
      Entity: this.EntityClass,
      transactionBuilder: this.#transactionBuilder,
      linkRecordAddPutOptions: ({ tableItem }) => {
        const putExpression: Put = {
          TableName: tableName,
          Item: tableItem
        };

        // TODO should this be an update?

        debugger;

        return [putExpression];
      },
      belongsToHasManyCb: (rel, updatedEntity) => {
        debugger;
        this.buildDeleteOldBelongsToLinkTransaction(
          rel,
          "HasMany",
          updatedEntity
        );
      },
      belongsToHasOneCb: (rel, updatedEntity) => {
        debugger;
        this.buildDeleteOldBelongsToLinkTransaction(
          rel,
          "HasOne",
          updatedEntity
        );
      }
    });

    relationshipTransactions.build(entity);
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
    updatedEntity: EntityAttributes<DynaRecord>
  ): void {
    const { name: tableName } = this.tableMetadata;

    const currentId = extractForeignKeyFromEntity(rel, this.getEntity());
    const newId = extractForeignKeyFromEntity(rel, updatedEntity);

    if (currentId !== undefined && currentId !== newId) {
      const oldLinkKeys = {
        [this.partitionKeyAlias]: rel.target.partitionKeyValue(currentId),
        [this.sortKeyAlias]:
          relType === "HasMany"
            ? this.EntityClass.partitionKeyValue(updatedEntity.id)
            : this.EntityClass.name
      };

      this.#transactionBuilder.addDelete({
        TableName: tableName,
        Key: oldLinkKeys
      });
    }
  }
}

export default Update;
