import type SingleTableDesign from "../../SingleTableDesign";
import { TransactWriteBuilder } from "../../dynamo-utils";
import { type BelongsToRelationship, type EntityClass } from "../../metadata";
import {
  doesEntityBelongToRelAsHasMany,
  doesEntityBelongToRelAsHasOne,
  isBelongsToRelationship
} from "../../metadata/utils";
import { BelongsToLink } from "../../relationships";
import { entityToTableItem } from "../../utils";
import OperationBase from "../OperationBase";
import { type QueryResult } from "../Query";
import type { RelationshipLookup } from "../types";
import { expressionBuilder } from "../utils";

// TODO move types to their own file like I did for other operation classes

interface DeleteOptions {
  errorMessage: string;
}

// TODO makes type file like I did for the others
type ItemKeys<T extends SingleTableDesign> = Partial<QueryResult<T>>;

/**
 * TODO
 * Delete the entity and everything in its partition
 * - Make sure to update foreign keys linked on linked models
 * - If the foreign key is a required attribute, and as a value then I should throw an error through transactions.
 *      - I beleive I can get this info from the attribute decorator....
 *      - But should this even be allowed? In a SQL database what would happen?
 */

// TODO this is copied from types FindById. Find a way to clean this up. Utils or soemthing. REname approprtiatl
interface RelationshipObj {
  relationsLookup: RelationshipLookup;
  belongsToRelationships: BelongsToRelationship[];
}

// I ended last time having just added unit tests for the current delete functionality
// Start now by handling the NullException handling

//      At the end of last time I am pretty sure I have it building delete transactions correct
//       - I have not ran a delete yet, just inspected the built transactions
//       - I I have not added non-nulltable foreignKeys yet
//           - See TODO in types for ideas how to do this
//           - IMPORTANT - if I cant figure out how to do it with a dynamo transaction then I can make a method in transaction builder which allows me to force an error. I could pass it a NonNullableException or something (but see what the normal error name is) and it will aggregate it in the error response
//       -         - !!! Similar to how AWS transactions have validation exceptions. I could make a pubic method on transactionwritebuilder where I store ValidationErrors. This is checked before comitting a transaction. If there are any validation errors I dont commit the transaction
//       -                  - Aggregate all validator errors and throw
//       -                  - this has added benefits because I can reduce the amount of transactions to by validating ahead of time
//       - Do I need conditions on any of the operations in here

// TODO tsdoc for everything in here
class Delete<T extends SingleTableDesign> extends OperationBase<T> {
  readonly #transactionBuilder: TransactWriteBuilder;
  readonly #tableName: string;
  readonly #primaryKeyField: string;
  readonly #sortKeyField: string;
  readonly #relationsLookup: RelationshipLookup;
  readonly #belongsToRelationships: BelongsToRelationship[];

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

    await this.#transactionBuilder.executeTransaction();
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

    const expression = expressionBuilder(tableAttrs, "REMOVE");

    this.#transactionBuilder.addUpdate(
      {
        TableName: this.#tableName,
        Key: tableKeys,
        ...expression
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
}

export default Delete;
