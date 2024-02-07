import type SingleTableDesign from "../SingleTableDesign";
import TransactionBuilder from "../dynamo-utils/TransactWriteBuilder";
import Metadata, {
  type TableMetadata,
  type EntityClass,
  type JoinTableMetadata
} from "../metadata";
import type { ForeignKey } from "../types";
import { entityToTableItem } from "../utils";
import BelongsToLink from "./BelongsToLink";

// TODO move types to a type file

type ExcludeKeys = "type1" | "type2";

type ForeignKeyProperties<T> = {
  [P in Exclude<keyof T, ExcludeKeys>]: T[P] extends ForeignKey
    ? string
    : never;
};

interface TranactionProps {
  tableProps: TableMetadata;
  entities: {
    parentEntity: EntityClass<SingleTableDesign>;
    linkedEntity: EntityClass<SingleTableDesign>;
  };
  ids: { parentId: string; linkedEntityId: string };
}

// TODO typedoc for everything in here

// type ForeignKeyAttribute<T extends SingleTableDesign> = keyof T & ForeignKey;

// type ForeignKeyParam<T extends SingleTableDesign> =

// TODO is example still valid? Check at end of this..
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
abstract class JoinTable<
  T extends SingleTableDesign,
  K extends SingleTableDesign
> {
  // TODO make this so that it only allows ForeignKey types
  // TODO If I keep this add a test that only ForeignKey types are allowed
  // [key: string]: ForeignKey;

  constructor(
    private readonly type1: EntityClass<T>,
    private readonly type2: EntityClass<K>
  ) {}

  // TODO typedoc
  // TODO type tests similiar to add
  public static async create<
    ThisClass extends JoinTable<T, K>,
    T extends SingleTableDesign,
    K extends SingleTableDesign
  >(
    this: new (type1: EntityClass<T>, type2: EntityClass<K>) => ThisClass,
    keys: ForeignKeyProperties<ThisClass>
  ): Promise<void> {
    const transactionBuilder = new TransactionBuilder();

    // Table can never have more than two items
    // validated in decorator.. TODO check this
    const [rel1, rel2] = Metadata.getJoinTable(this.name);

    JoinTable.createBelongsToLink(transactionBuilder, keys, rel1, rel2);
    JoinTable.createBelongsToLink(transactionBuilder, keys, rel2, rel1);

    await transactionBuilder.executeTransaction();
  }

  // TODO typedoc
  public static async delete<
    ThisClass extends JoinTable<T, K>,
    T extends SingleTableDesign,
    K extends SingleTableDesign
  >(
    this: new (type1: EntityClass<T>, type2: EntityClass<K>) => ThisClass,
    keys: ForeignKeyProperties<ThisClass>
  ): Promise<void> {
    const transactionBuilder = new TransactionBuilder();

    // Table can never have more than two items
    // validated in decorator.. TODO check this
    const [rel1, rel2] = Metadata.getJoinTable(this.name);

    JoinTable.deleteBelongsToLink(transactionBuilder, keys, rel1, rel2);
    JoinTable.deleteBelongsToLink(transactionBuilder, keys, rel2, rel1);

    await transactionBuilder.executeTransaction();
  }

  // TODO typedoc
  private static createBelongsToLink(
    transactionBuilder: TransactionBuilder,
    keys: ForeignKeyProperties<JoinTable<SingleTableDesign, SingleTableDesign>>,
    parentEntityMeta: JoinTableMetadata,
    linkedEntityMeta: JoinTableMetadata
  ): void {
    const { tableProps, entities, ids } = this.transactionProps(
      keys,
      parentEntityMeta,
      linkedEntityMeta
    );
    const { name: tableName, primaryKey, sortKey } = tableProps;
    const { parentEntity, linkedEntity } = entities;
    const { parentId, linkedEntityId } = ids;

    transactionBuilder.addPut(
      {
        TableName: tableName,
        Item: {
          ...this.joinTableKey(keys, parentEntityMeta, linkedEntityMeta),
          ...entityToTableItem(
            linkedEntity.name,
            BelongsToLink.build(linkedEntity.name, parentId)
          )
        },
        ConditionExpression: `attribute_not_exists(${primaryKey})` // Ensure item doesn't already exist
      },
      `${parentEntity.name} with ID ${linkedEntityId} is already linked to ${linkedEntity.name} with ID ${parentId}`
    );

    // // TODO check this condition works
    transactionBuilder.addConditionCheck(
      {
        TableName: tableName,
        Key: {
          [primaryKey]: parentEntity.primaryKeyValue(linkedEntityId),
          [sortKey]: parentEntity.name
        },
        ConditionExpression: `attribute_exists(${primaryKey})`
      },
      `${parentEntity.name} with ID ${linkedEntityId} does not exist`
    );
  }

  // TODO typedoc
  private static deleteBelongsToLink(
    transactionBuilder: TransactionBuilder,
    keys: ForeignKeyProperties<JoinTable<SingleTableDesign, SingleTableDesign>>,
    parentEntityMeta: JoinTableMetadata,
    linkedEntityMeta: JoinTableMetadata
  ): void {
    const { entity: parentEntity, foreignKey: parentKey } = parentEntityMeta;
    const { entity: linkedEntity, foreignKey: linkedKey } = linkedEntityMeta;

    const parentId: string = keys[parentKey];
    const linkedEntityId: string = keys[linkedKey];

    const { name: tableName, primaryKey } = Metadata.getEntityTable(
      parentEntity.name
    );

    // TODO add test for error case
    transactionBuilder.addDelete(
      {
        TableName: tableName,
        Key: this.joinTableKey(keys, parentEntityMeta, linkedEntityMeta),
        ConditionExpression: `attribute_exists(${primaryKey})`
      },
      `${parentEntity.name} with ID ${linkedEntityId} is not linked to ${linkedEntity.name} with ID ${parentId}`
    );
  }

  private static joinTableKey(
    keys: ForeignKeyProperties<JoinTable<SingleTableDesign, SingleTableDesign>>,
    parentEntityMeta: JoinTableMetadata,
    linkedEntityMeta: JoinTableMetadata
  ): Record<string, string> {
    const { tableProps, entities, ids } = this.transactionProps(
      keys,
      parentEntityMeta,
      linkedEntityMeta
    );
    const { parentEntity, linkedEntity } = entities;

    return {
      [tableProps.primaryKey]: parentEntity.primaryKeyValue(ids.linkedEntityId),
      [tableProps.sortKey]: linkedEntity.primaryKeyValue(ids.parentId)
    };
  }

  private static transactionProps(
    keys: ForeignKeyProperties<JoinTable<SingleTableDesign, SingleTableDesign>>,
    parentEntityMeta: JoinTableMetadata,
    linkedEntityMeta: JoinTableMetadata
  ): TranactionProps {
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
