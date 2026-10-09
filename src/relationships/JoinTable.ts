import type DynaRecord from "../DynaRecord.js";
import {
  TransactGetBuilder,
  type TransactGetItemResponses
} from "../dynamo-utils/index.js";
import TransactionBuilder from "../dynamo-utils/TransactWriteBuilder.js";
import { NotFoundError } from "../errors.js";
import { stripVectorAttributes } from "../metadata/VectorIndexMetadata.js";
import Metadata, {
  type TableMetadata,
  type JoinTableMetadata
} from "../metadata/index.js";
import type { AssertDynaRecord } from "../operations/Query/index.js";
import {
  attachJoinTableCondition,
  compileJoinTableCondition
} from "../operations/utils/index.js";
import type { ForeignKeyTargetGuardFor } from "../operations/WriteCondition/index.js";
import type {
  ForeignKey,
  EntityClass,
  DynamoTableItem,
  ExtractForeignKeyTarget
} from "../types.js";

/**
 * Exclude the type1 type2 instance keys
 */
type ExcludeKeys = "type1" | "type2";

/**
 * Lookup for the pre-read table items, keyed by each item's partition key
 * value. The partition key carries both the entity type and the id, so two
 * entities of different types that share an id never overwrite each other
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

/**
 * The two entity classes a join table links
 */
interface JoinedEntityClasses {
  parentEntity: EntityClass<DynaRecord>;
  linkedEntity: EntityClass<DynaRecord>;
}

/**
 * The ids of the two entities a join table links
 */
interface JoinedKeys {
  parentId: string;
  linkedEntityId: string;
}

/**
 * Options for JoinTable operations
 */
interface JoinTableOptions {
  /**
   * Whether to perform referential integrity checks for foreign key references.
   * When `true` (default), condition checks are added to verify that referenced entities exist.
   * When `false`, these condition checks are skipped, allowing updates even if foreign key references don't exist.
   * @default true
   */
  referentialIntegrityCheck?: boolean;
}

/**
 * The foreign key properties of a join table: those whose declared type is a
 * `ForeignKey` or `NullableForeignKey`, typed or bare.
 */
type JoinTableForeignKeys<J> = {
  [P in Exclude<keyof J, ExcludeKeys>]: [
    ExtractForeignKeyTarget<J[P]>
  ] extends [never]
    ? never
    : P;
}[Exclude<keyof J, ExcludeKeys>];

/**
 * The condition `JoinTable.create` and `JoinTable.delete` accept, keyed by the
 * join table's foreign key properties.
 *
 * A join table has no row of its own, so each key guards the entity its
 * foreign key references, wrapped in `target` to make clear that the condition
 * applies to that entity's row rather than to the key's value. Each target is
 * typed from the foreign key's own type parameter, so the key must be declared
 * `ForeignKey<Target>`: on a bare `ForeignKey` the guard is a compile error
 * naming the missing type parameter (see {@link UntypedForeignKeyTargetError}).
 *
 * Each `target` takes a {@link TargetCondition} on the referenced entity, in
 * the full query-filter vocabulary, `null` and `$or` included. A guard also
 * requires its entity to exist, even with `referentialIntegrityCheck: false`.
 * When a guard fails, the `WriteConditionFailedError` names the join table as
 * its `entity` and the join table's keys as its `id`, for example
 * `customerId=customer-1, storeId=store-1`.
 *
 * @typeParam J - The join table class.
 *
 * @example
 * ```typescript
 * class CustomerStore extends JoinTable<Customer, Store> {
 *   public readonly customerId: ForeignKey<Customer>;
 *   public readonly storeId: ForeignKey<Store>;
 * }
 *
 * // Link a Customer to a Store only if the Store is in Springfield
 * const condition: JoinTableCondition<CustomerStore> = {
 *   storeId: { target: { "address.city": "Springfield" } }
 * };
 * ```
 */
export type JoinTableCondition<J> = {
  [P in JoinTableForeignKeys<J>]?: ForeignKeyTargetGuardFor<
    AssertDynaRecord<ExtractForeignKeyTarget<J[P]>>
  >;
};

/**
 * Options for `JoinTable.create`
 *
 * @typeParam J - The join table class.
 */
export interface JoinTableCreateOptions<J> extends JoinTableOptions {
  /**
   * Guards on the entities being linked, checked in the same transaction as
   * the link: the link is created only if every guard holds. A guard still
   * requires its row to exist when `referentialIntegrityCheck` is `false`.
   * See {@link JoinTableCondition}.
   */
  condition?: JoinTableCondition<J>;
}

/**
 * Options for `JoinTable.delete`
 *
 * @typeParam J - The join table class.
 */
export interface JoinTableDeleteOptions<J> {
  /**
   * Guards on the entities being unlinked, checked in the same transaction as
   * the unlink: the link is deleted only if every guard holds. See
   * {@link JoinTableCondition}.
   */
  condition?: JoinTableCondition<J>;
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
 * Declare each foreign key with the entity it references, `ForeignKey<Target>`,
 * so a write condition on `create` or `delete` can guard that entity's row.
 *
 * @example
 * ```typescript
 * class CustomerStore extends JoinTable<Customer, Store> {
 *   public readonly customerId: ForeignKey<Customer>;
 *   public readonly storeId: ForeignKey<Store>;
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
   *
   * When a write condition is given, links only if every guard on the entities
   * being linked holds, in the same transaction.
   * @param this
   * @param keys - The foreign key values of the entities to link
   * @param options - Optional operation options: the referentialIntegrityCheck flag and a write condition on the entities being linked, checked in the same transaction as the link. See {@link JoinTableCreateOptions}
   * @throws {@link FilterError} Before anything is read or written, when the write condition is invalid.
   * @throws {@link NotFoundError} Before anything is written, when either entity does not exist. The message names each missing entity, such as `Entities not found: (Store: store-9)`.
   * @throws {@link TransactionWriteFailedError} When DynamoDB cancels the transaction. Its `errors` hold a {@link WriteConditionFailedError} for each guarded entity whose condition failed, and a {@link ConditionalCheckFailedError} for a library check that failed, such as the entities already being linked.
   *
   * @example
   * ```typescript
   * await CustomerStore.create({ customerId: "customer-1", storeId: "store-1" });
   * ```
   *
   * @example With a write condition on the entities being linked
   * ```typescript
   * // Link only while the Customer is active and the Store is open
   * await CustomerStore.create(
   *   { customerId: "customer-1", storeId: "store-1" },
   *   {
   *     condition: {
   *       customerId: { target: { status: "active" } },
   *       storeId: { target: { status: "open" } }
   *     }
   *   }
   * );
   * ```
   */
  public static async create<
    ThisClass extends JoinTable<T, K>,
    T extends DynaRecord,
    K extends DynaRecord
  >(
    this: new (type1: EntityClass<T>, type2: EntityClass<K>) => ThisClass,
    keys: ForeignKeyProperties<ThisClass>,
    options?: JoinTableCreateOptions<ThisClass>
  ): Promise<void> {
    const referentialIntegrityCheck =
      options?.referentialIntegrityCheck ?? true;
    const [rel1, rel2] = Metadata.getJoinTable(this.name);
    const transactionProps = JoinTable.transactionProps(keys, rel2, rel1);
    const transactionBuilder = new TransactionBuilder(
      transactionProps.tableProps.dynamo
    );

    // Validated and compiled before the pre-read, so an invalid condition
    // costs nothing
    const writeCondition =
      options?.condition === undefined
        ? undefined
        : compileJoinTableCondition({
            joinTableName: this.name,
            condition: options.condition,
            transactionBuilder
          });

    const lookupTableItem = await JoinTable.preFetch(transactionProps);

    JoinTable.denormalizeLinkRecord(
      transactionBuilder,
      keys,
      rel1,
      rel2,
      lookupTableItem[
        transactionProps.entities.parentEntity.partitionKeyValue(
          transactionProps.ids.linkedEntityId
        )
      ],
      referentialIntegrityCheck
    );
    JoinTable.denormalizeLinkRecord(
      transactionBuilder,
      keys,
      rel2,
      rel1,
      lookupTableItem[
        transactionProps.entities.linkedEntity.partitionKeyValue(
          transactionProps.ids.parentId
        )
      ],
      referentialIntegrityCheck
    );

    // Guards merge only once every library item is queued: each lands on its
    // entity's referential-integrity check, or adds its own check when
    // integrity checks are off
    if (writeCondition !== undefined) {
      attachJoinTableCondition({
        compiled: writeCondition,
        keys,
        transactionBuilder
      });
    }

    await transactionBuilder.executeTransaction();
  }

  /**
   * Delete a JoinTable entry
   * Deletes denormalized records from each associated Entity's partition
   *
   * When a write condition is given, unlinks only if every guard on the
   * entities being unlinked holds, in the same transaction.
   * @param this
   * @param keys - The foreign key values of the entities to unlink
   * @param options - Optional operation options: a write condition on the entities being unlinked, checked in the same transaction as the unlink. See {@link JoinTableDeleteOptions}
   * @throws {@link FilterError} Before anything is written, when the write condition is invalid.
   * @throws {@link TransactionWriteFailedError} When DynamoDB cancels the transaction. Its `errors` hold a {@link WriteConditionFailedError} for each guarded entity whose condition failed, and a {@link ConditionalCheckFailedError} for a library check that failed, such as the entities not being linked or a guarded entity not existing.
   *
   * @example
   * ```typescript
   * await CustomerStore.delete({ customerId: "customer-1", storeId: "store-1" });
   * ```
   *
   * @example With a write condition on the entities being unlinked
   * ```typescript
   * // Unlink only while the Store is open
   * await CustomerStore.delete(
   *   { customerId: "customer-1", storeId: "store-1" },
   *   { condition: { storeId: { target: { status: "open" } } } }
   * );
   * ```
   */
  public static async delete<
    ThisClass extends JoinTable<T, K>,
    T extends DynaRecord,
    K extends DynaRecord
  >(
    this: new (type1: EntityClass<T>, type2: EntityClass<K>) => ThisClass,
    keys: ForeignKeyProperties<ThisClass>,
    options?: JoinTableDeleteOptions<ThisClass>
  ): Promise<void> {
    const [rel1, rel2] = Metadata.getJoinTable(this.name);
    const transactionProps = JoinTable.transactionProps(keys, rel2, rel1);
    const transactionBuilder = new TransactionBuilder(
      transactionProps.tableProps.dynamo
    );

    // Validated and compiled before anything is queued
    const writeCondition =
      options?.condition === undefined
        ? undefined
        : compileJoinTableCondition({
            joinTableName: this.name,
            condition: options.condition,
            transactionBuilder
          });

    JoinTable.deleteLink(transactionBuilder, keys, rel1, rel2);
    JoinTable.deleteLink(transactionBuilder, keys, rel2, rel1);

    // No library item is queued on either entity's row, so each guard adds
    // its own check
    if (writeCondition !== undefined) {
      attachJoinTableCondition({
        compiled: writeCondition,
        keys,
        transactionBuilder
      });
    }

    await transactionBuilder.executeTransaction();
  }

  private static async preFetch(
    transactionProps: TransactionProps
  ): Promise<TableItemLookup> {
    const { tableProps, entities, ids } = transactionProps;

    const { alias: partitionKeyAlias } = tableProps.partitionKeyAttribute;

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

    const transactionGetBuilder = new TransactGetBuilder(tableProps.dynamo);

    transactionGetBuilder.addGet({
      TableName: tableProps.name,
      Key: parentKey
    });

    transactionGetBuilder.addGet({
      TableName: tableProps.name,
      Key: linkedKey
    });

    const transactionResults = await transactionGetBuilder.executeTransaction();

    // DynamoDB returns one response per get, with no `Item` for a missing
    // entity, so only responses that carry an `Item` count as found
    const foundCount = transactionResults.filter(
      res => res.Item !== undefined
    ).length;

    if (foundCount !== 2) {
      const errorMessage = this.preFetchNotFoundErrorMessage(
        transactionResults,
        entities,
        ids
      );
      throw new NotFoundError(errorMessage);
    }

    return transactionResults.reduce<TableItemLookup>((acc, res) => {
      const partitionKey: unknown = res.Item?.[partitionKeyAlias];

      if (res.Item !== undefined && typeof partitionKey === "string") {
        acc[partitionKey] = res.Item;
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
   * @param linkedRecord
   * @param referentialIntegrityCheck - Whether to perform referential integrity checks.
   * @private
   */
  private static denormalizeLinkRecord(
    transactionBuilder: TransactionBuilder,
    keys: ForeignKeyProperties<JoinTable<DynaRecord, DynaRecord>>,
    parentEntityMeta: JoinTableMetadata,
    linkedEntityMeta: JoinTableMetadata,
    linkedRecord: DynamoTableItem,
    referentialIntegrityCheck: boolean
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

    // The prefetched record is a raw canonical row that bypasses entity
    // serialization, so a searchable entity's vector must be stripped here —
    // vectors live on canonical rows only
    const denormalizedRecord = stripVectorAttributes(linkedRecord);

    transactionBuilder.addPut(
      {
        TableName: tableName,
        Item: {
          ...denormalizedRecord,
          ...this.joinTableKey(keys, parentEntityMeta, linkedEntityMeta)
        },
        ConditionExpression: `attribute_not_exists(${partitionKeyAlias})` // Ensure item doesn't already exist
      },
      `${parentEntity.name} with ID '${linkedEntityId}' is already linked to ${linkedEntity.name} with ID '${parentId}'`
    );

    if (referentialIntegrityCheck) {
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
        `${parentEntity.name} with ID '${linkedEntityId}' does not exist`
      );
    }
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
      `${parentEntity.name} with ID '${linkedEntityId}' is not linked to ${linkedEntity.name} with ID '${parentId}'`
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
      { entityId: ids.parentId, entity: entities.linkedEntity },
      { entityId: ids.linkedEntityId, entity: entities.parentEntity }
    ];

    const tableMeta = Metadata.getEntityTable(entities.parentEntity.name);
    const { alias: partitionKeyAlias } = tableMeta.partitionKeyAttribute;

    // Matched by partition key, which carries the entity type as well as the
    // id, so an entity that shares its id with the other is not mistaken for
    // it
    const foundPartitionKeys = new Set(
      transactionResults.map(
        (result): unknown => result.Item?.[partitionKeyAlias]
      )
    );

    const missingEntities = joinedEntityData.filter(entityData => {
      return !foundPartitionKeys.has(
        entityData.entity.partitionKeyValue(entityData.entityId)
      ); // If not in Set, it's missing
    });

    const missingEntityStr = missingEntities
      .map(entityData => `(${entityData.entity.name}: ${entityData.entityId})`)
      .join(", ");

    return `Entities not found: ${missingEntityStr}`;
  }
}

export default JoinTable;
