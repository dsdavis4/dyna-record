import type DynaRecord from "../DynaRecord";
import TransactionBuilder from "../dynamo-utils/TransactWriteBuilder";
import Metadata, {
  type TableMetadata,
  type JoinTableMetadata
} from "../metadata";
import type { ForeignKey, EntityClass } from "../types";
import { entityToTableItem } from "../utils";
import BelongsToLink from "./BelongsToLink";

/**
 * Exclude the type1 type2 instance keys
 */
type ExcludeKeys = "type1" | "type2";

/**
 * ForeignKey properties of the join table
 */
type ForeignKeyProperties<T> = {
  [P in Exclude<keyof T, ExcludeKeys>]: T[P] extends ForeignKey
    ? string
    : never;
};

/**
 * Common props for building transactions
 */
interface TransactionProps {
  tableProps: TableMetadata;
  entities: {
    parentEntity: EntityClass<DynaRecord>;
    linkedEntity: EntityClass<DynaRecord>;
  };
  ids: { parentId: string; linkedEntityId: string };
}

/**
 * Abstract class representing a join table for HasAndBelongsToMany relationships.
 * This class should be extended for specific join table implementations.
 * It is virtual and not persisted to the database but manages the BelongsToLinks
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
   * Adds BelongsToLink to each associated Entity's partition
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

    JoinTable.createBelongsToLink(transactionBuilder, keys, rel1, rel2);
    JoinTable.createBelongsToLink(transactionBuilder, keys, rel2, rel1);

    await transactionBuilder.executeTransaction();
  }

  /**
   * Delete a JoinTable entry
   * Deletes BelongsToLink from each associated Entity's partition
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

    JoinTable.deleteBelongsToLink(transactionBuilder, keys, rel1, rel2);
    JoinTable.deleteBelongsToLink(transactionBuilder, keys, rel2, rel1);

    await transactionBuilder.executeTransaction();
  }

  /**
   * Creates transactions:
   *   1. Create a BelongsToLink in parents partition if its not already linked
   *   2. Ensures that the parent EntityExists
   * @param transactionBuilder
   * @param keys
   * @param parentEntityMeta
   * @param linkedEntityMeta
   */
  private static createBelongsToLink(
    transactionBuilder: TransactionBuilder,
    keys: ForeignKeyProperties<JoinTable<DynaRecord, DynaRecord>>,
    parentEntityMeta: JoinTableMetadata,
    linkedEntityMeta: JoinTableMetadata
  ): void {
    const { tableProps, entities, ids } = this.transactionProps(
      keys,
      parentEntityMeta,
      linkedEntityMeta
    );
    const { name: tableName } = tableProps;
    const { alias: partitionKeyAlias } = tableProps.partitionKeyAttribute;
    const { alias: sortKeyAlias } = tableProps.sortKeyAttribute;
    const { parentEntity, linkedEntity } = entities;
    const { parentId, linkedEntityId } = ids;

    transactionBuilder.addPut(
      {
        TableName: tableName,
        Item: {
          ...this.joinTableKey(keys, parentEntityMeta, linkedEntityMeta),
          ...entityToTableItem(
            linkedEntity,
            BelongsToLink.build(linkedEntity.name, parentId)
          )
        },
        ConditionExpression: `attribute_not_exists(${partitionKeyAlias})` // Ensure item doesn't already exist
      },
      `${parentEntity.name} with ID ${linkedEntityId} is already linked to ${linkedEntity.name} with ID ${parentId}`
    );

    transactionBuilder.addConditionCheck(
      {
        TableName: tableName,
        Key: {
          [partitionKeyAlias]: parentEntity.partitionKeyValue(linkedEntityId),
          [sortKeyAlias]: parentEntity.name
        },
        ConditionExpression: `attribute_exists(${partitionKeyAlias})`
      },
      `${parentEntity.name} with ID ${linkedEntityId} does not exist`
    );
  }

  /**
   * Deletes transactions:
   *   1. Delete a BelongsToLink in parents partition if its linked
   * @param transactionBuilder
   * @param keys
   * @param parentEntityMeta
   * @param linkedEntityMeta
   */
  private static deleteBelongsToLink(
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
}

export default JoinTable;
