import type DynaRecord from "../../DynaRecord";
import type {
  ConditionCheck,
  Put,
  TransactWriteBuilder
} from "../../dynamo-utils";
import Metadata, {
  type TableMetadata,
  type BelongsToRelationship,
  type EntityMetadata
} from "../../metadata";
import {
  doesEntityBelongToRelAsHasMany,
  doesEntityBelongToRelAsHasOne,
  isBelongsToRelationship
} from "../../metadata/utils";
import { BelongsToLink } from "../../relationships";
import type { EntityClass, Nullable } from "../../types";
import { entityToTableItem } from "../../utils";
import { extractForeignKeyFromEntity } from "./utils";

type EntityData<T extends DynaRecord> = Pick<T, "id"> & Partial<T>;

interface RelationshipTransactionsProps<T extends DynaRecord> {
  /**
   * Entity for which relationships are being persisted
   */
  readonly Entity: EntityClass<T>;
  /**
   * TransactionBuilder instance to add relationship transactions to
   */
  readonly transactionBuilder: TransactWriteBuilder;
  /**
   * Optional callback to add logic to persisting BelongsTo HasMany relationships
   * @param rel The BelongsToRelationship metadata of which the Entity BelongsTo HasMany of
   * @param entityId The ID of the entity
   * @returns
   */
  belongsToHasManyCb?: (
    rel: BelongsToRelationship,
    entityId: string
  ) => Promise<void>;
  /**
   * Optional callback to add logic to persisting BelongsTo HasOne relationships
   * @param rel The BelongsToRelationship metadata of which the Entity BelongsTo HasOne of
   * @param entityId The ID of the entity
   * @returns
   */
  belongsToHasOneCb?: (
    rel: BelongsToRelationship,
    entityId: string
  ) => Promise<void>;
}

/**
 * Builds transactions for persisting create/update relationships
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

  public async build<T extends DynaRecord>(
    entityData: EntityData<T>
  ): Promise<void> {
    const { relationships } = this.#entityMetadata;

    for (const rel of Object.values(relationships)) {
      const isBelongsTo = isBelongsToRelationship(rel);

      if (isBelongsTo) {
        const relationshipId = extractForeignKeyFromEntity(
          rel,
          entityData as T
        );

        const isUpdatingRelationshipId = relationshipId !== undefined;

        if (isUpdatingRelationshipId && this.isNullableString(relationshipId)) {
          if (relationshipId !== null) {
            this.buildRelationshipExistsConditionTransaction(
              rel,
              relationshipId
            );
          }

          const callbackParams = [rel, entityData.id, relationshipId] as const;

          if (doesEntityBelongToRelAsHasMany(this.#props.Entity, rel)) {
            await this.buildBelongsToHasMany(...callbackParams);
          }

          if (doesEntityBelongToRelAsHasOne(this.#props.Entity, rel)) {
            await this.buildBelongsToHasOne(...callbackParams);
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
   * @param entityId Id of the entity being persisted
   * @param rel BelongsTo relationship metadata for which the entity being persisted is a BelongsTo HasOne
   * @param relationshipId Id of the parent entity of which the entity being persisted BelongsTo
   */
  private async buildBelongsToHasOne(
    rel: BelongsToRelationship,
    entityId: string,
    relationshipId: Nullable<string>
  ): Promise<void> {
    const { name: tableName } = this.#tableMetadata;

    if (this.#props.belongsToHasOneCb !== undefined) {
      await this.#props.belongsToHasOneCb(rel, entityId);
    }

    if (relationshipId !== null) {
      const link = BelongsToLink.build(this.#props.Entity.name, entityId);

      const keys = {
        [this.#partitionKeyAlias]: rel.target.partitionKeyValue(relationshipId),
        [this.#sortKeyAlias]: this.#props.Entity.name
      };

      const putExpression: Put = {
        TableName: tableName,
        Item: { ...keys, ...entityToTableItem(rel.target, link) },
        ConditionExpression: `attribute_not_exists(${this.#partitionKeyAlias})` // Ensure item doesn't already exist
      };

      this.#props.transactionBuilder.addPut(
        putExpression,
        `${rel.target.name} with id: ${relationshipId} already has an associated ${this.#props.Entity.name}`
      );
    }
  }

  /**
   * Creates a BelongsToLink transaction item in the parents partition if the entity BelongsTo a HasMany association
   * @param rel BelongsTo relationship metadata for which the entity being persisted is a BelongsTo HasMany
   * @param entityId Id of the entity being persisted
   * @param relationshipId Id of the parent entity of which the entity being persisted BelongsTo
   */
  private async buildBelongsToHasMany(
    rel: BelongsToRelationship,
    entityId: string,
    relationshipId: Nullable<string>
  ): Promise<void> {
    const { name: tableName } = this.#tableMetadata;

    if (this.#props.belongsToHasManyCb !== undefined) {
      await this.#props.belongsToHasManyCb(rel, entityId);
    }

    if (relationshipId !== null) {
      const link = BelongsToLink.build(this.#props.Entity.name, entityId);

      const keys = {
        [this.#partitionKeyAlias]: rel.target.partitionKeyValue(relationshipId),
        [this.#sortKeyAlias]: this.#props.Entity.partitionKeyValue(
          link.foreignKey
        )
      };

      const putExpression: Put = {
        TableName: tableName,
        Item: { ...keys, ...entityToTableItem(rel.target, link) },
        ConditionExpression: `attribute_not_exists(${this.#partitionKeyAlias})` // Ensure item doesn't already exist
      };

      this.#props.transactionBuilder.addPut(
        putExpression,
        `${this.#props.Entity.name} with ID '${entityId}' already belongs to ${rel.target.name} with Id '${relationshipId}'`
      );
    }
  }

  private isNullableString(val: unknown): val is Nullable<string> {
    return typeof val === "string" || val === null;
  }
}

export default RelationshipTransactions;
