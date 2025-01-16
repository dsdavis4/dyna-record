import type DynaRecord from "../DynaRecord";
import {
  TransactGetBuilder,
  type TransactGetItemResponses
} from "../dynamo-utils";
import TransactionBuilder from "../dynamo-utils/TransactWriteBuilder";
import { NotFoundError } from "../errors";
import Metadata, {
  type TableMetadata,
  type JoinTableMetadata
} from "../metadata";
import type { ForeignKey, EntityClass, DynamoTableItem } from "../types";

/**
 * Exclude the type1 type2 instance keys
 */
type ExcludeKeys = "type1" | "type2";

/**
 * Lookup item for looking up existing table items by id
 */
type TableItemLookup = Record<string, DynamoTableItem>;

/**
 * ForeignKey properties of the join table
 */
type ForeignKeyProperties<T> = {
  [P in Exclude<keyof T, ExcludeKeys>]: T[P] extends ForeignKey
    ? string
    : never;
};

interface JoinedEntityClasses {
  parentEntity: EntityClass<DynaRecord>;
  linkedEntity: EntityClass<DynaRecord>;
}

interface JoinedKeys {
  parentId: string;
  linkedEntityId: string;
}

/**
 * Common props for building transactions
 */
interface TransactionProps {
  tableProps: TableMetadata;
  entities: JoinedEntityClasses;
  ids: JoinedKeys;
}

/**
 * Abstract class representing a join table for HasAndBelongsToMany relationships.
 * This class should be extended for specific join table implementations.
 * It is virtual and not persisted to the database but manages the denormalized records
 * in each related entity's partition.
 *
 * Example:
 * ```
 * class ExampleJoinTable extends JoinTable {
 *   public exampleId1: ForeignKey;
 *   public exampleId2: ForeignKey;
 * }
 * ```
 */
abstract class JoinTable<T extends DynaRecord, K extends DynaRecord> {
  constructor(
    private readonly type1: EntityClass<T>,
    private readonly type2: EntityClass<K>
  ) {}

  /**
   * Create a JoinTable entry
   * Adds denormalized copy of the related entity to each associated Entity's partition
   * @param this
   * @param keys
   */
  public static async create<
    ThisClass extends JoinTable<T, K>,
    T extends DynaRecord,
    K extends DynaRecord
  >(
    this: new (type1: EntityClass<T>, type2: EntityClass<K>) => ThisClass,
    keys: ForeignKeyProperties<ThisClass>
  ): Promise<void> {
    const transactionBuilder = new TransactionBuilder();

    const [rel1, rel2] = Metadata.getJoinTable(this.name);
    const transactionProps = JoinTable.transactionProps(keys, rel2, rel1);
    const lookupTableItem = await JoinTable.preFetch(transactionProps);

    JoinTable.denormalizeLinkRecord(
      transactionBuilder,
      keys,
      rel1,
      rel2,
      lookupTableItem[transactionProps.ids.linkedEntityId]
    );
    JoinTable.denormalizeLinkRecord(
      transactionBuilder,
      keys,
      rel2,
      rel1,
      lookupTableItem[transactionProps.ids.parentId]
    );

    await transactionBuilder.executeTransaction();
  }

  /**
   * Delete a JoinTable entry
   * Deletes denormalized records from each associated Entity's partition
   * @param this
   * @param keys
   */
  public static async delete<
    ThisClass extends JoinTable<T, K>,
    T extends DynaRecord,
    K extends DynaRecord
  >(
    this: new (type1: EntityClass<T>, type2: EntityClass<K>) => ThisClass,
    keys: ForeignKeyProperties<ThisClass>
  ): Promise<void> {
    const transactionBuilder = new TransactionBuilder();

    const [rel1, rel2] = Metadata.getJoinTable(this.name);

    JoinTable.deleteLink(transactionBuilder, keys, rel1, rel2);
    JoinTable.deleteLink(transactionBuilder, keys, rel2, rel1);

    await transactionBuilder.executeTransaction();
  }

  private static async preFetch(
    transactionProps: TransactionProps
  ): Promise<TableItemLookup> {
    const { tableProps, entities, ids } = transactionProps;

    const idAlias = tableProps.defaultAttributes.id.alias;

    const parentKey = JoinTable.buildForeignEntityKey(
      tableProps,
      entities.linkedEntity,
      ids.parentId
    );

    const linkedKey = JoinTable.buildForeignEntityKey(
      tableProps,
      entities.parentEntity,
      ids.linkedEntityId
    );

    const transactionGetBuilder = new TransactGetBuilder();

    transactionGetBuilder.addGet({
      TableName: tableProps.name,
      Key: parentKey
    });

    transactionGetBuilder.addGet({
      TableName: tableProps.name,
      Key: linkedKey
    });

    const transactionResults = await transactionGetBuilder.executeTransaction();

    if (transactionResults.length !== 2) {
      const errorMessage = this.preFetchNotFoundErrorMessage(
        transactionResults,
        entities,
        ids
      );
      throw new NotFoundError(errorMessage);
    }

    return transactionResults.reduce<TableItemLookup>((acc, res) => {
      if (res.Item !== undefined) {
        acc[res.Item[idAlias]] = res.Item;
      }

      return acc;
    }, {});
  }

  /**
   * Creates transactions:
   *   1. Create a denormalized record in parents partition if its not already linked
   *   2. Ensures that the parent EntityExists
   * @param transactionBuilder
   * @param keys
   * @param parentEntityMeta
   * @param linkedEntityMeta
   */
  private static denormalizeLinkRecord(
    transactionBuilder: TransactionBuilder,
    keys: ForeignKeyProperties<JoinTable<DynaRecord, DynaRecord>>,
    parentEntityMeta: JoinTableMetadata,
    linkedEntityMeta: JoinTableMetadata,
    linkedRecord: DynamoTableItem
  ): void {
    const { tableProps, entities, ids } = this.transactionProps(
      keys,
      parentEntityMeta,
      linkedEntityMeta
    );
    const { name: tableName } = tableProps;
    const { alias: partitionKeyAlias } = tableProps.partitionKeyAttribute;
    const { parentEntity, linkedEntity } = entities;
    const { parentId, linkedEntityId } = ids;

    transactionBuilder.addPut(
      {
        TableName: tableName,
        Item: {
          ...linkedRecord,
          ...this.joinTableKey(keys, parentEntityMeta, linkedEntityMeta)
        },
        ConditionExpression: `attribute_not_exists(${partitionKeyAlias})` // Ensure item doesn't already exist
      },
      `${parentEntity.name} with ID ${linkedEntityId} is already linked to ${linkedEntity.name} with ID ${parentId}`
    );

    transactionBuilder.addConditionCheck(
      {
        TableName: tableName,
        Key: this.buildForeignEntityKey(
          tableProps,
          parentEntity,
          linkedEntityId
        ),
        ConditionExpression: `attribute_exists(${partitionKeyAlias})`
      },
      `${parentEntity.name} with ID ${linkedEntityId} does not exist`
    );
  }

  /**
   * Builds the key to the foreign entity
   * @param tableProps
   * @param parentEntity
   * @param linkedEntityId
   * @returns
   */
  private static buildForeignEntityKey(
    tableProps: TableMetadata,
    parentEntity: EntityClass<DynaRecord>,
    linkedEntityId: string
  ): DynamoTableItem {
    const { alias: partitionKeyAlias } = tableProps.partitionKeyAttribute;
    const { alias: sortKeyAlias } = tableProps.sortKeyAttribute;

    return {
      [partitionKeyAlias]: parentEntity.partitionKeyValue(linkedEntityId),
      [sortKeyAlias]: parentEntity.name
    };
  }

  /**
   * Deletes transactions:
   *   1. Delete a denormalized record in parents partition if its linked
   * @param transactionBuilder
   * @param keys
   * @param parentEntityMeta
   * @param linkedEntityMeta
   */
  private static deleteLink(
    transactionBuilder: TransactionBuilder,
    keys: ForeignKeyProperties<JoinTable<DynaRecord, DynaRecord>>,
    parentEntityMeta: JoinTableMetadata,
    linkedEntityMeta: JoinTableMetadata
  ): void {
    const { entity: parentEntity, foreignKey: parentKey } = parentEntityMeta;
    const { entity: linkedEntity, foreignKey: linkedKey } = linkedEntityMeta;

    const parentId: string = keys[parentKey];
    const linkedEntityId: string = keys[linkedKey];

    const { name: tableName, partitionKeyAttribute } = Metadata.getEntityTable(
      parentEntity.name
    );

    transactionBuilder.addDelete(
      {
        TableName: tableName,
        Key: this.joinTableKey(keys, parentEntityMeta, linkedEntityMeta),
        ConditionExpression: `attribute_exists(${partitionKeyAttribute.alias})`
      },
      `${parentEntity.name} with ID ${linkedEntityId} is not linked to ${linkedEntity.name} with ID ${parentId}`
    );
  }

  private static joinTableKey(
    keys: ForeignKeyProperties<JoinTable<DynaRecord, DynaRecord>>,
    parentEntityMeta: JoinTableMetadata,
    linkedEntityMeta: JoinTableMetadata
  ): Record<string, string> {
    const { tableProps, entities, ids } = this.transactionProps(
      keys,
      parentEntityMeta,
      linkedEntityMeta
    );
    const { parentEntity, linkedEntity } = entities;

    const { alias: partitionKeyAlias } = tableProps.partitionKeyAttribute;
    const { alias: sortKeyAlias } = tableProps.sortKeyAttribute;
    return {
      [partitionKeyAlias]: parentEntity.partitionKeyValue(ids.linkedEntityId),
      [sortKeyAlias]: linkedEntity.partitionKeyValue(ids.parentId)
    };
  }

  private static transactionProps(
    keys: ForeignKeyProperties<JoinTable<DynaRecord, DynaRecord>>,
    parentEntityMeta: JoinTableMetadata,
    linkedEntityMeta: JoinTableMetadata
  ): TransactionProps {
    const { entity: parentEntity, foreignKey: parentFK } = parentEntityMeta;
    const { entity: linkedEntity, foreignKey: linkedFK } = linkedEntityMeta;

    const tableMetadata = Metadata.getEntityTable(parentEntity.name);

    const parentId: string = keys[parentFK];
    const linkedEntityId: string = keys[linkedFK];

    return {
      tableProps: tableMetadata,
      entities: { parentEntity, linkedEntity },
      ids: { parentId, linkedEntityId }
    };
  }

  private static preFetchNotFoundErrorMessage(
    transactionResults: TransactGetItemResponses,
    entities: JoinedEntityClasses,
    ids: JoinedKeys
  ): string {
    const joinedEntityData = [
      { entityId: ids.parentId, entityName: entities.linkedEntity.name },
      { entityId: ids.linkedEntityId, entityName: entities.parentEntity.name }
    ];

    const tableMeta = Metadata.getEntityTable(entities.parentEntity.name);
    const idAlias = tableMeta.defaultAttributes.id.alias;

    const foundEntityIds = new Set(
      transactionResults
        .filter(result => result?.Item)
        .map(result => result.Item?.[idAlias])
    );

    const missingEntities = joinedEntityData.filter(entityData => {
      return !foundEntityIds.has(entityData.entityId); // If not in Set, it's missing
    });

    const missingEntityStr = missingEntities
      .map(entity => `(${entity.entityName}: ${entity.entityId})`)
      .join(", ");

    return `Entities not found: ${missingEntityStr}`;
  }
}

export default JoinTable;
