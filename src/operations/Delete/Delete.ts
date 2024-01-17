import type SingleTableDesign from "../../SingleTableDesign";
import { TransactWriteBuilder } from "../../dynamo-utils";
import { NullConstraintViolationError } from "../../errors";
import Metadata, {
  type BelongsToRelationship,
  type EntityClass
} from "../../metadata";
import {
  doesEntityBelongToRelAsHasMany,
  doesEntityBelongToRelAsHasOne,
  isBelongsToRelationship
} from "../../metadata/utils";
import { BelongsToLink } from "../../relationships";
import { entityToTableItem } from "../../utils";
import OperationBase from "../OperationBase";
import type { RelationshipLookup } from "../types";
import { expressionBuilder } from "../utils";
import type { DeleteOptions, ItemKeys } from "./types";

// TODO this is copied from types FindById. Find a way to clean this up. Utils or soemthing. REname approprtiatl
interface RelationshipObj {
  relationsLookup: RelationshipLookup;
  belongsToRelationships: BelongsToRelationship[];
}

// TODO tsdoc for everything in here
class Delete<T extends SingleTableDesign> extends OperationBase<T> {
  readonly #transactionBuilder: TransactWriteBuilder;
  readonly #tableName: string;
  readonly #primaryKeyField: string;
  readonly #sortKeyField: string;
  readonly #relationsLookup: RelationshipLookup;
  readonly #belongsToRelationships: BelongsToRelationship[];
  // readonly #attributesLookup: AttributeLookup;
  readonly #validationErrors: Error[] = [];

  constructor(Entity: EntityClass<T>) {
    super(Entity);
    this.#transactionBuilder = new TransactWriteBuilder();

    const { name: tableName, primaryKey, sortKey } = this.tableMetadata;

    this.#tableName = tableName;
    this.#primaryKeyField = this.entityMetadata.attributes[primaryKey].name;
    this.#sortKeyField = this.entityMetadata.attributes[sortKey].name;

    // TODO this is copied from FindById. Make a util
    //     - when I do this I should make `RelationshipObj` a better name
    const relationsObj = Object.values(
      this.entityMetadata.relationships
    ).reduce<RelationshipObj>(
      (acc, rel) => {
        if (isBelongsToRelationship(rel)) {
          acc.belongsToRelationships.push(rel);
        }

        acc.relationsLookup[rel.target.name] = rel;

        return acc;
      },
      { relationsLookup: {}, belongsToRelationships: [] }
    );

    // TODO delete this...
    // this.#attributesLookup = Object.values(
    //   this.entityMetadata.attributes
    // ).reduce<AttributeLookup>((acc, rel) => {
    //   acc[rel.name] = rel;
    //   return acc;
    // }, {});

    this.#relationsLookup = relationsObj.relationsLookup;
    this.#belongsToRelationships = relationsObj.belongsToRelationships;
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
    const items = await this.EntityClass.query(id);

    // TODO add test for this
    if (items.length === 0) {
      // TODO should this be a custom error type?
      throw new Error(`Item does not exist: ${id}`);
    }

    for (const item of items) {
      if (this.isEntityClass(item)) {
        this.buildDeleteItemTransaction(item, {
          errorMessage: `Failed to delete ${this.EntityClass.name} with Id: ${id}`
        });
        this.buildDeleteAssociatedBelongsToLinkTransaction(id, item);
      }

      if (item instanceof BelongsToLink) {
        this.buildDeleteItemTransaction(item, {
          errorMessage: `Failed to delete BelongsToLink with keys: ${JSON.stringify(
            { [this.#primaryKeyField]: item.pk, [this.#sortKeyField]: item.sk }
          )}`
        });
        this.buildNullifyForeignKeyTransaction(item);
      }
    }

    if (this.#validationErrors.length === 0) {
      await this.#transactionBuilder.executeTransaction();
    } else {
      throw new AggregateError(this.#validationErrors, "Failed Validations");
    }
  }

  /**
   * Deletes an item
   * @param item
   */
  private buildDeleteItemTransaction(
    item: BelongsToLink | ItemKeys<T>,
    options: DeleteOptions
  ): void {
    const { primaryKey, sortKey } = this.tableMetadata;

    const pkField = this.#primaryKeyField as keyof typeof item;
    const skField = this.#sortKeyField as keyof typeof item;

    this.#transactionBuilder.addDelete(
      {
        TableName: this.#tableName,
        Key: {
          [primaryKey]: item[pkField],
          [sortKey]: item[skField]
        }
      },
      options.errorMessage
    );
  }

  // TODO I need to do the same thing on update... Maybe via the update method
  /**
   * Nullify the associated relationship's ForeignKey attribute TODO add details about how it handles non nullable
   * @param item
   */
  private buildNullifyForeignKeyTransaction(item: BelongsToLink): void {
    const relMeta = this.#relationsLookup[item.foreignEntityType];
    const entityMeta = Metadata.getEntity(relMeta.target.name);
    // const attrMeta = this.#attributesLookup[relMeta.foreignKey];

    const attrMeta = Object.values(entityMeta.attributes).find(
      attr => attr.name === relMeta.foreignKey
    );

    if (attrMeta?.nullable === false) {
      // TODO is this a good error case? I am not actually setting to null. Maybe I need to serialize nullable attributes as null?
      // TODO this should for for belongs to links for HasMany and HasOne
      //       Add a unit test for HasMany and HasOne
      //       There should be one in a HasMany that has nullable attributes

      this.trackValidationError(
        new NullConstraintViolationError(
          `Cannot set ${relMeta.target.name} with id: '${item.id}' attribute '${relMeta.foreignKey}' to null`
        )
      );
    }

    const tableKeys = entityToTableItem(this.EntityClass.name, {
      [this.#primaryKeyField]: relMeta.target.primaryKeyValue(item.foreignKey),
      [this.#sortKeyField]: relMeta.target.name
    });
    const tableAttrs = entityToTableItem(relMeta.target.name, {
      [relMeta.foreignKey]: null
    });

    const expression = expressionBuilder(tableAttrs);

    this.#transactionBuilder.addUpdate(
      {
        TableName: this.#tableName,
        Key: tableKeys,
        UpdateExpression: expression.UpdateExpression,
        ExpressionAttributeNames: expression.ExpressionAttributeNames
        // TODO is this meeded
        // ConditionExpression: `attribute_exists(${primaryKey})` // Only update the item if it exists
      },
      `Failed to remove foreign key attribute from ${relMeta.target.name} with Id: ${item.foreignKey}`
    );
  }

  /**
   * Deletes associated BelongsToLinks for each ForeignKey of the item being deleted
   * @param entityId
   * @param item
   */
  private buildDeleteAssociatedBelongsToLinkTransaction(
    entityId: string,
    item: EntityClass<T>
  ): void {
    this.#belongsToRelationships.forEach(relMeta => {
      const foreignKeyValue = item[relMeta.foreignKey as keyof EntityClass<T>];

      if (doesEntityBelongToRelAsHasMany(this.EntityClass, relMeta)) {
        this.buildDeleteBelongsToHasManyTransaction(
          relMeta,
          entityId,
          foreignKeyValue
        );
      }

      if (doesEntityBelongToRelAsHasOne(this.EntityClass, relMeta)) {
        this.buildDeleteBelongsToHasOneTransaction(relMeta, foreignKeyValue);
      }
    });
  }

  /**
   * Deletes associated BelongsToLink for a BelongsTo HasMany relationship
   * @param relMeta
   * @param entityId
   * @param foreignKeyValue
   */
  private buildDeleteBelongsToHasManyTransaction(
    relMeta: BelongsToRelationship,
    entityId: string,
    foreignKeyValue: string
  ): void {
    const belongsToLinksKeys: ItemKeys<T> = {
      [this.#primaryKeyField]: relMeta.target.primaryKeyValue(foreignKeyValue),
      [this.#sortKeyField]: this.EntityClass.primaryKeyValue(entityId)
    };

    this.buildDeleteItemTransaction(belongsToLinksKeys, {
      errorMessage: `Failed to delete BelongsToLink with keys: ${JSON.stringify(
        belongsToLinksKeys
      )}`
    });
  }

  /**
   * Deletes associated BelongsToLink for a BelongsTo HasOne relationship
   * @param relMeta
   * @param foreignKeyValue
   */
  private buildDeleteBelongsToHasOneTransaction(
    relMeta: BelongsToRelationship,
    foreignKeyValue: string
  ): void {
    const belongsToLinksKeys: ItemKeys<T> = {
      [this.#primaryKeyField]: relMeta.target.primaryKeyValue(foreignKeyValue),
      [this.#sortKeyField]: this.EntityClass.name
    };

    this.buildDeleteItemTransaction(belongsToLinksKeys, {
      errorMessage: `Failed to delete BelongsToLink with keys: ${JSON.stringify(
        belongsToLinksKeys
      )}`
    });
  }

  private isEntityClass(item: any): item is typeof this.EntityClass {
    return item instanceof this.EntityClass;
  }

  // TODO tsdoc
  private trackValidationError(err: Error): void {
    this.#validationErrors.push(err);
  }
}

export default Delete;
