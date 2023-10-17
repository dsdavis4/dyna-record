import type SingleTableDesign from "../SingleTableDesign";
import Metadata, {
  type EntityMetadata,
  type TableMetadata,
  type EntityClass,
  type RelationshipMetadata,
  type BelongsToRelationship
} from "../metadata";
import { type RelationshipAttributeNames } from "./types";
import { v4 as uuidv4 } from "uuid";
import type { PrimaryKey, SortKey } from "../types";
import { BelongsToLink } from "../relationships";
import { QueryResolver } from "../query-utils";
import { TransactionBuilder, type ConditionCheck } from "../dynamo-utils";
import { entityToTableItem } from "../utils";
import {
  isBelongsToRelationship,
  isHasManyRelationship
} from "../metadata/utils";

// TODO type might be too generic
// TODO how to make the fields shared so they arent repeeated in other files?
type DefaultFields = "id" | "type" | "createdAt" | "updatedAt";

// TODO add unit test for this
type FunctionFields<T> = {
  // eslint-disable-next-line @typescript-eslint/ban-types
  [K in keyof T]: T[K] extends Function ? K : never;
}[keyof T];

type PrimaryKeyAttribute<T> = {
  [K in keyof T]: T[K] extends PrimaryKey ? K : never;
}[keyof T];

type SortKeyAttribute<T> = {
  [K in keyof T]: T[K] extends SortKey ? K : never;
}[keyof T];

export type CreateOptions<T extends SingleTableDesign> = Omit<
  T,
  | DefaultFields
  | RelationshipAttributeNames<T>
  | FunctionFields<T>
  | PrimaryKeyAttribute<T>
  | SortKeyAttribute<T>
>;

// TODO START HERE.... I ended last time getting create v1 working
//      - The last thing I did was make it return an instance of the object on create, but it uses QueryResolver... yuck. Leave that for now
//      - Get rid of this PutExpression thing...
//      - I also only know that its doing create successfully in one scenario... (Belongs to with HasMany)
//          - START by testing/codifying the other situations. Then clean up/ DRY up etc
//      - lots of TODOs to fix

// TODO should I make an operations base since they all have the same constructor?
// And they have the same public entry point

// TODO make sure to add a unit test that optional properties dont have to be included

// TODO add good error messages in here...

class Create<T extends SingleTableDesign> {
  readonly #entityMetadata: EntityMetadata;
  readonly #tableMetadata: TableMetadata;
  readonly #transactionBuilder: TransactionBuilder;

  private readonly EntityClass: EntityClass<T>;

  constructor(Entity: EntityClass<T>) {
    this.EntityClass = Entity;
    this.#entityMetadata = Metadata.getEntity(Entity.name);
    this.#tableMetadata = Metadata.getTable(
      this.#entityMetadata.tableClassName
    );
    this.#transactionBuilder = new TransactionBuilder();
  }

  // TODO insure idempotency - see here https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html

  // TODO tsdoc
  // TODO add friendly error handling for failed transactions
  public async run(attributes: CreateOptions<T>): Promise<T> {
    const { name: tableName, primaryKey } = this.#tableMetadata;
    const entityData = this.buildEntityData(attributes);

    const putExpression = {
      TableName: tableName,
      Item: entityToTableItem(this.EntityClass.name, entityData),
      ConditionExpression: `attribute_not_exists(${primaryKey})` // Ensure item doesn't already exist
    };
    this.#transactionBuilder.addPut(putExpression);

    this.buildRelationshipTransactions(entityData);

    await this.#transactionBuilder.executeTransaction();

    // TODO using QueryResolver here is not great...
    //      1. It can be renamed..
    //      2. Or I need to do a big refactor when I update that function to use FindById...
    const queryResolver = new QueryResolver<T>(this.EntityClass);
    return await queryResolver.resolve(putExpression.Item);
  }

  // TODO is this a good name?
  private buildEntityData(attributes: CreateOptions<T>): SingleTableDesign {
    const { attributes: entityAttrs } = this.#entityMetadata;
    const { primaryKey, sortKey } = this.#tableMetadata;

    const id = uuidv4();
    const createdAt = new Date();

    const pk = entityAttrs[primaryKey].name;
    const sk = entityAttrs[sortKey].name;

    const keys = {
      [pk]: this.EntityClass.primaryKeyValue(id),
      [sk]: this.EntityClass.name
    };

    const defaultAttrs: SingleTableDesign = {
      id,
      type: this.EntityClass.name,
      createdAt,
      updatedAt: createdAt
    };

    return { ...keys, ...attributes, ...defaultAttrs };
  }

  /**
   * Build transaction items for associations
   * @param entityData
   */
  private buildRelationshipTransactions(entityData: SingleTableDesign): void {
    const { relationships } = this.#entityMetadata;

    Object.values(relationships).forEach(rel => {
      const key = isHasManyRelationship(rel) ? rel.targetKey : rel.foreignKey;
      const relationshipId = entityData[key];

      if (relationshipId !== undefined && typeof relationshipId === "string") {
        const errMsg = `${rel.target.name} with ID '${relationshipId}' does not exist`;
        this.#transactionBuilder.addConditionCheck(
          this.buildRelationshipExistsCondition(rel, relationshipId),
          errMsg
        );

        if (
          this.doesEntityBelongToHasMany(rel, key) &&
          isBelongsToRelationship(rel)
        ) {
          this.buildBelongsToHasManyTransaction(
            rel,
            entityData.id,
            relationshipId
          );
        }
      }
    });
  }

  /**
   * Returns true if the entity being created Belongs to a HasMany
   * @param rel
   * @param foreignKey
   * @returns
   */
  private doesEntityBelongToHasMany(
    rel: RelationshipMetadata,
    foreignKey: string
  ): boolean {
    const relMetadata = Metadata.getEntity(rel.target.name);

    return Object.values(relMetadata.relationships).some(
      rel =>
        isHasManyRelationship(rel) &&
        rel.target === this.EntityClass &&
        rel.targetKey === foreignKey
    );
  }

  /**
   * Builds a ConditionCheck that ensures the associated relationship exists
   * @param rel
   * @param relationshipId
   * @returns
   */
  private buildRelationshipExistsCondition(
    rel: RelationshipMetadata,
    relationshipId: string
  ): ConditionCheck {
    const { name: tableName, primaryKey, sortKey } = this.#tableMetadata;

    return {
      TableName: tableName,
      Key: {
        [primaryKey]: rel.target.primaryKeyValue(relationshipId),
        [sortKey]: rel.target.name
      },
      ConditionExpression: `attribute_exists(${primaryKey})`

      // TODO the below is something that works for making sure a process cant be creatd if the scale already has one... I need to implement...
      // TODO  ConditionExpression: `attribute_exists(${primaryKey}) AND attribute_not_exists(ProcessId)`
    };
  }

  /**
   * Creates a BelongsToLink transaction item in the parents partition if the entity BelongsTo a HasMany association
   * @param rel BelongsTo relationship metadata for which the entity being created is a BelongsTo HasMany
   * @param entityId Id of the entity being created
   * @param relationshipId Id of the parent entity of which the entity being created BelongsTo
   */
  private buildBelongsToHasManyTransaction(
    rel: BelongsToRelationship,
    entityId: string,
    relationshipId: string
  ): void {
    const { name: tableName, primaryKey } = this.#tableMetadata;

    const createdAt = new Date();
    const link: BelongsToLink = {
      id: uuidv4(),
      type: BelongsToLink.name,
      foreignEntityType: this.EntityClass.name,
      createdAt,
      updatedAt: createdAt
    };

    const keys = {
      pk: `${rel.target.name}#${relationshipId}`,
      sk: `${this.EntityClass.name}#${entityId}`
    };

    const putExpression = {
      TableName: tableName,
      Item: entityToTableItem(rel.target.name, { ...link, ...keys }),
      ConditionExpression: `attribute_not_exists(${primaryKey})` // Ensure item doesn't already exist
    };

    this.#transactionBuilder.addPut(putExpression);
  }
}

export default Create;
