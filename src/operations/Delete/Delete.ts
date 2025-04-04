import type DynaRecord from "../../DynaRecord";
import {
  TransactWriteBuilder,
  TransactionWriteFailedError
} from "../../dynamo-utils";
import { NotFoundError, NullConstraintViolationError } from "../../errors";
import Metadata, { type BelongsToRelationship } from "../../metadata";
import {
  isRelationshipMetadataWithForeignKey,
  isBelongsToRelationship,
  isHasAndBelongsToManyRelationship
} from "../../metadata/utils";
import type {
  DynamoTableItem,
  EntityClass,
  RelationshipLookup
} from "../../types";
import { isKeyOfObject } from "../../utils";
import OperationBase from "../OperationBase";
import type { QueryResults, QueryResult } from "../Query";
import { UpdateDryRun } from "../Update";
import {
  buildBelongsToLinkKey,
  buildEntityRelationshipMetaObj
} from "../utils";
import type { DeleteOptions } from "./types";

type Entity = QueryResult<DynaRecord>;

interface PreFetchResult {
  /**
   * The item representing the entity from which delete originated
   */
  self?: QueryResult<DynaRecord>;
  /**
   * Denormalized link records for associated entities that do not have a foreign key reference
   */
  linkedEntities: QueryResults<DynaRecord>;
  /**
   * Denormalized link records for associated entities with foreign key reference
   * This indicates it needs to have a foreign key nullified
   */
  linkedEntitiesWithFkRef: QueryResults<DynaRecord>;
}

/**
 * Implements the operation for deleting an entity and its related data from the database within the ORM framework.
 *
 * Delete an entity, everything in its partition, denormalized records and nullifies ForeignKeys on attributes that BelongTo it
 * If the foreign key is non nullable than it will throw a NullConstraintViolationError
 *
 * The `Delete` operation supports complex scenarios, such as deleting related entities in "BelongsTo" relationships, nullifying or removing foreign keys to maintain data integrity, and handling many-to-many relationships through join tables.
 *
 * @template T - The type of the entity being deleted, extending `DynaRecord`.
 */
class Delete<T extends DynaRecord> extends OperationBase<T> {
  readonly #transactionBuilder: TransactWriteBuilder;
  readonly #tableName: string;
  readonly #partitionKeyField: string;
  readonly #sortKeyField: string;
  readonly #relationsLookup: RelationshipLookup;
  readonly #belongsToRelationships: BelongsToRelationship[];
  readonly #validationErrors: Error[] = [];

  constructor(Entity: EntityClass<T>) {
    super(Entity);
    this.#transactionBuilder = new TransactWriteBuilder();

    const { name: tableName } = this.tableMetadata;

    this.#tableName = tableName;
    this.#partitionKeyField = this.tableMetadata.partitionKeyAttribute.name;
    this.#sortKeyField = this.tableMetadata.sortKeyAttribute.name;

    const relationsObj = buildEntityRelationshipMetaObj(
      Object.values(this.entityMetadata.relationships)
    );
    this.#relationsLookup = relationsObj.relationsLookup;
    this.#belongsToRelationships = relationsObj.belongsToRelationships;
  }

  /**
   * Delete an item by id
   *   - Deletes the given entity
   *   - Deletes each item in the entity's partition
   *   - For each item in the entity's partition which is a denormalized record it:
   *     - Will nullify the associated relationship's ForeignKey attribute if the attribute is nullable
   * @param id
   */
  public async run(id: string): Promise<void> {
    const preFetchRes = await this.preFetch(id);

    this.buildDeleteSelfTransactions(preFetchRes.self);

    preFetchRes.linkedEntities.forEach(item => {
      this.buildDeleteEntityTransaction(item, {
        errorMessage: `Failed to delete denormalized record with keys: ${JSON.stringify(
          this.buildKeyObject(item, this.#partitionKeyField, this.#sortKeyField)
        )}`
      });
      this.buildDeleteJoinTableLinkTransaction(item);
    });

    this.buildDeleteOwnedByRelationships(preFetchRes.self);

    await Promise.all(
      preFetchRes.linkedEntitiesWithFkRef.map(async entity => {
        await this.buildNullifyForeignKeyTransaction(entity);
      })
    );

    if (this.#validationErrors.length === 0) {
      await this.#transactionBuilder.executeTransaction();
    } else {
      throw new TransactionWriteFailedError(
        this.#validationErrors,
        "Failed Validations"
      );
    }
  }

  /**
   * Prefetch the item being deleted including items in its partition from denormalized associated records
   * @param id
   * @returns - The item and its associated links denormalized
   */
  private async preFetch(id: string): Promise<Required<PreFetchResult>> {
    const items = await this.EntityClass.query<DynaRecord>(id, {
      consistentRead: true
    });

    const prefetchResult = items.reduce<PreFetchResult>(
      (acc, item) => {
        const isItemSelf = item.id === id && item instanceof this.EntityClass;

        if (isItemSelf) {
          acc.self = item;
        } else if (this.doesEntityNeedForeignKeyNullified(item)) {
          acc.linkedEntitiesWithFkRef.push(item);
        } else {
          acc.linkedEntities.push(item);
        }

        return acc;
      },
      { linkedEntities: [], linkedEntitiesWithFkRef: [] }
    );

    if (prefetchResult.self === undefined) {
      throw new NotFoundError(`Item does not exist: ${id}`);
    }

    return {
      self: prefetchResult.self,
      linkedEntities: prefetchResult.linkedEntities,
      linkedEntitiesWithFkRef: prefetchResult.linkedEntitiesWithFkRef
    };
  }

  /**
   * Returns true if the linked entity needs to have a foreign key nullified
   * @param relMeta
   * @returns
   */
  private doesEntityNeedForeignKeyNullified(linkedEntity: Entity): boolean {
    const relMeta = this.#relationsLookup[linkedEntity.type];

    return (
      !isBelongsToRelationship(relMeta) &&
      isRelationshipMetadataWithForeignKey(relMeta)
    );
  }

  /**
   * Delete the entity and denormalized links from BelongsTo relationships
   * @param self
   */
  private buildDeleteSelfTransactions(self: Entity): void {
    this.buildDeleteEntityTransaction(self, {
      errorMessage: `Failed to delete ${this.EntityClass.name} with Id: ${self.id}`
    });
    this.buildDeleteAssociatedBelongsTransaction(self.id, self);
  }

  /**
   * Deletes an item when given the table keys
   * @param keys - The key to delete representing the table keys, as opposed to the entities keys
   */
  private buildDeleteItemTransaction(
    keys: Partial<Entity>,
    options: DeleteOptions
  ): void {
    this.#transactionBuilder.addDelete(
      {
        TableName: this.#tableName,
        Key: keys
      },
      options.errorMessage
    );
  }

  /**
   * Deletes an item when given the keys of the entity. Converts the keys to the table alias
   * @param keys - The key to delete representing the entity keys, as opposed to the table keys
   */
  private buildDeleteEntityTransaction(
    keys: Partial<Entity>,
    options: DeleteOptions
  ): void {
    if (
      isKeyOfObject(keys, this.#partitionKeyField) &&
      isKeyOfObject(keys, this.#sortKeyField)
    ) {
      this.buildDeleteItemTransaction(
        {
          [this.partitionKeyAlias]: keys[this.#partitionKeyField],
          [this.sortKeyAlias]: keys[this.#sortKeyField]
        },
        options
      );
    }
  }

  /**
   * If the item being deleted has a foreign key reference, nullify the associated relationship's ForeignKey attribute
   * If the ForeignKey is non nullable than it throws a NullConstraintViolationError
   * @param item
   */
  private async buildNullifyForeignKeyTransaction(item: Entity): Promise<void> {
    const relMeta = this.#relationsLookup[item.type];

    if (isRelationshipMetadataWithForeignKey(relMeta)) {
      const entityAttrs = Metadata.getEntityAttributes(relMeta.target.name);

      const attrMeta = Object.values(entityAttrs).find(
        attr => attr.name === relMeta.foreignKey
      );

      if (attrMeta?.nullable === false) {
        this.trackValidationError(
          new NullConstraintViolationError(
            `Cannot set ${relMeta.target.name} with id: '${item.id}' attribute '${relMeta.foreignKey}' to null`
          )
        );
      } else {
        const op = new UpdateDryRun<typeof item>(
          relMeta.target,
          this.#transactionBuilder
        );

        await op.run(item.id, { [relMeta.foreignKey]: null });
      }
    }
  }

  /**
   * Deletes associated BelongsTo relationships for each ForeignKey of the item being deleted
   * @param entityId
   * @param item
   */
  private buildDeleteAssociatedBelongsTransaction(
    entityId: string,
    item: Entity
  ): void {
    this.#belongsToRelationships.forEach(relMeta => {
      if (
        isKeyOfObject(item, relMeta.foreignKey) &&
        item[relMeta.foreignKey] !== undefined
      ) {
        const foreignKeyValue = item[relMeta.foreignKey];

        const belongsToLinksKeys = buildBelongsToLinkKey(
          this.EntityClass,
          entityId,
          relMeta,
          foreignKeyValue
        );

        this.buildDeleteItemTransaction(belongsToLinksKeys, {
          errorMessage: `Failed to delete denormalized record with keys: ${JSON.stringify(
            belongsToLinksKeys
          )}`
        });
      }
    });
  }

  /**
   * If the item has a JoinTable entry (is part of HasAndBelongsToMany relationship) then delete both JoinTable entries
   * @param item - Denormalized record from HasAndBelongsToMany relationship
   */
  private buildDeleteJoinTableLinkTransaction(item: Entity): void {
    const relMeta = this.#relationsLookup[item.type];

    if (isHasAndBelongsToManyRelationship(relMeta)) {
      const belongsToLinksKeys = this.buildKeyObject(
        item,
        this.#sortKeyField,
        this.#partitionKeyField
      );
      this.buildDeleteEntityTransaction(belongsToLinksKeys, {
        errorMessage: `Failed to delete denormalized record with keys: ${JSON.stringify(
          belongsToLinksKeys
        )}`
      });
    }
  }

  /**
   * If the entity being deleted is owned by another entity via a unidirectional relationship, delete the denormalized records
   * @param self - The entity being deleted
   */
  private buildDeleteOwnedByRelationships(self: Entity): void {
    this.entityMetadata.ownedByRelationships.forEach(ownedByRelMeta => {
      if (isKeyOfObject(self, ownedByRelMeta.foreignKey)) {
        const fkValue = self[ownedByRelMeta.foreignKey];

        const keys = buildBelongsToLinkKey(
          this.EntityClass,
          self.id,
          ownedByRelMeta,
          fkValue
        );

        this.buildDeleteItemTransaction(keys, {
          errorMessage: `Failed to delete denormalized record with keys: ${JSON.stringify(
            keys
          )}`
        });
      }
    });
  }

  /**
   * Track validation errors and throw AggregateError after all validations have been run
   * @param err
   */
  private trackValidationError(err: Error): void {
    this.#validationErrors.push(err);
  }

  private buildKeyObject(
    item: Partial<Entity>,
    pkField: string,
    skField: string
  ): DynamoTableItem {
    if (isKeyOfObject(item, pkField) && isKeyOfObject(item, skField)) {
      return {
        [this.#partitionKeyField]: item[pkField],
        [this.#sortKeyField]: item[skField]
      };
    }

    throw new Error("Invalid keys");
  }
}

export default Delete;
