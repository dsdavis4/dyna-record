import { NativeAttributeValue } from "@aws-sdk/util-dynamodb";
import type DynaRecord from "../../DynaRecord";
import type {
  ConditionCheck,
  Put,
  TransactWriteBuilder
} from "../../dynamo-utils";
import Metadata, {
  type TableMetadata,
  type BelongsToRelationship,
  type EntityMetadata,
  HasOneRelationship,
  HasManyRelationship,
  HasAndBelongsToManyRelationship
} from "../../metadata";
import {
  doesEntityBelongToRelAsHasMany,
  doesEntityBelongToRelAsHasOne,
  isBelongsToRelationship
} from "../../metadata/utils";
import type { DynamoTableItem, EntityClass, Nullable } from "../../types";
import { entityToTableItem } from "../../utils";
import { type EntityAttributes } from "../types";
import { extractForeignKeyFromEntity } from "./utils";

// TODO typedoc
// TODO are all needed?
interface PersistLinkCallbackProps {
  key: DynamoTableItem;
  relMeta: BelongsToRelationship;
  relationshipId: string;
}

type HasRelationship =
  | HasOneRelationship
  | HasManyRelationship
  | HasAndBelongsToManyRelationship;

interface RelationshipTransactionsProps<T extends DynaRecord> {
  /**
   * Entity for which relationships are being persisted
   */
  readonly Entity: EntityClass<T>;
  /**
   * TransactionBuilder instance to add relationship transactions to
   */
  readonly transactionBuilder: TransactWriteBuilder;

  // TODO typedoc
  persistLinkCb: (props: PersistLinkCallbackProps) => void;
  /**
   * Optional callback to add logic when  persisting BelongsTo HasMany relationships
   * @param rel The BelongsToRelationship metadata of which the Entity BelongsTo HasMany of
   * @returns
   */
  belongsToHasManyCb?: (
    rel: BelongsToRelationship,
    entityAttributes: EntityAttributes<DynaRecord>
  ) => void;
  /**
   * Optional callback to add logic when persisting BelongsTo HasOne relationships
   * @param rel The BelongsToRelationship metadata of which the Entity BelongsTo HasOne of
   * @returns
   */
  belongsToHasOneCb?: (
    rel: BelongsToRelationship,
    entityAttributes: EntityAttributes<DynaRecord>
  ) => void;
}

// TODO update this
/**
 * Builds transactions for persisting create/update relationships to linked dependency partitions
 *   - Sets/removes ForeignKeys
 *   - Adds/removes BelongsToLinks
 */
class RelationshipTransactions<T extends DynaRecord> {
  readonly #props: RelationshipTransactionsProps<T>;
  readonly #entityMetadata: EntityMetadata;
  readonly #tableMetadata: TableMetadata;
  readonly #partitionKeyAlias: string;
  readonly #sortKeyAlias: string;

  constructor(props: RelationshipTransactionsProps<T>) {
    this.#props = props;
    this.#entityMetadata = Metadata.getEntity(props.Entity.name);
    this.#tableMetadata = Metadata.getTable(
      this.#entityMetadata.tableClassName
    );
    this.#partitionKeyAlias = this.#tableMetadata.partitionKeyAttribute.alias;
    this.#sortKeyAlias = this.#tableMetadata.sortKeyAttribute.alias;
  }

  // TODO check that this will not allow partials... I think...
  public build<T extends EntityAttributes<DynaRecord>>(entityData: T): void {
    const { relationships } = this.#entityMetadata;

    for (const rel of Object.values(relationships)) {
      const isBelongsTo = isBelongsToRelationship(rel);

      if (isBelongsTo) {
        const relationshipId = extractForeignKeyFromEntity(rel, entityData);

        const isUpdatingRelationshipId = relationshipId !== undefined;

        if (isUpdatingRelationshipId && this.isNullableString(relationshipId)) {
          // TODO I think this only needed for create...
          if (relationshipId !== null) {
            this.buildRelationshipExistsConditionTransaction(
              rel,
              relationshipId
            );
          }

          const callbackParams = [rel, entityData, relationshipId] as const;

          if (doesEntityBelongToRelAsHasMany(this.#props.Entity, rel)) {
            this.buildBelongsToHasMany(...callbackParams);
          }

          if (doesEntityBelongToRelAsHasOne(this.#props.Entity, rel)) {
            this.buildBelongsToHasOne(...callbackParams);
          }
        }
      }
    }
  }

  /**
   * Builds a ConditionCheck transaction that ensures the associated relationship exists
   * @param rel
   * @param relationshipId
   * @returns
   */
  private buildRelationshipExistsConditionTransaction(
    rel: BelongsToRelationship,
    relationshipId: string
  ): void {
    const { name: tableName } = this.#tableMetadata;

    const errMsg = `${rel.target.name} with ID '${relationshipId}' does not exist`;

    const conditionCheck: ConditionCheck = {
      TableName: tableName,
      Key: {
        [this.#partitionKeyAlias]: rel.target.partitionKeyValue(relationshipId),
        [this.#sortKeyAlias]: rel.target.name
      },
      ConditionExpression: `attribute_exists(${this.#partitionKeyAlias})`
    };

    this.#props.transactionBuilder.addConditionCheck(conditionCheck, errMsg);
  }

  /**
   * Creates a BelongsToLink transaction item in the parents partition if the entity BelongsTo a HasOne association
   * Adds conditional check to ensure the parent doesn't already have one of the entity being associated
   * @param rel BelongsTo relationship metadata for which the entity being persisted is a BelongsTo HasOne
   * @param entityData Entity attributes to persist
   * @param relationshipId Id of the parent entity of which the entity being persisted BelongsTo
   */
  private buildBelongsToHasOne(
    relMeta: BelongsToRelationship,
    entityData: EntityAttributes<DynaRecord>,
    relationshipId: Nullable<string>
  ): void {
    if (this.#props.belongsToHasOneCb !== undefined) {
      this.#props.belongsToHasOneCb(relMeta, entityData);
    }

    if (relationshipId !== null) {
      const key = {
        [this.#partitionKeyAlias]:
          relMeta.target.partitionKeyValue(relationshipId),
        [this.#sortKeyAlias]: this.#props.Entity.name
      };

      this.#props.persistLinkCb({ key, relMeta, relationshipId });
    }
  }

  /**
   * Creates a BelongsToLink transaction item in the parents partition if the entity BelongsTo a HasMany association
   * @param rel BelongsTo relationship metadata for which the entity being persisted is a BelongsTo HasMany
   * @param entityData Entity attributes to persist
   * @param relationshipId Id of the parent entity of which the entity being persisted BelongsTo
   */
  private buildBelongsToHasMany(
    relMeta: BelongsToRelationship,
    entityData: EntityAttributes<DynaRecord>,
    relationshipId: Nullable<string>
  ): void {
    if (this.#props.belongsToHasManyCb !== undefined) {
      this.#props.belongsToHasManyCb(relMeta, entityData);
    }

    if (relationshipId !== null) {
      const key = {
        [this.#partitionKeyAlias]:
          relMeta.target.partitionKeyValue(relationshipId),
        [this.#sortKeyAlias]: this.#props.Entity.partitionKeyValue(
          entityData.id
        )
      };

      this.#props.persistLinkCb({ key, relMeta, relationshipId });
    }
  }

  private isNullableString(val: unknown): val is Nullable<string> {
    return typeof val === "string" || val === null;
  }
}

export default RelationshipTransactions;
