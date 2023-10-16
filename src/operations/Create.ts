import type SingleTableDesign from "../SingleTableDesign";
import Metadata, {
  type EntityMetadata,
  type TableMetadata,
  type EntityClass,
  type RelationshipMetadata
} from "../metadata";
import { type RelationshipAttributeNames } from "./types";
import { v4 as uuidv4 } from "uuid";
import type { PrimaryKey, SortKey, DynamoTableItem } from "../types";
import { type TransactWriteCommandInput } from "@aws-sdk/lib-dynamodb"; // TODO dont need this import...
import DynamoClient from "../DynamoClient";
import { PutExpression } from "../dynamo-utils";
import { BelongsToLink } from "../relationships";

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

type TransactItems = Exclude<
  TransactWriteCommandInput["TransactItems"],
  undefined
>;

// TODO should I make an operations base since they all have the same constructor?
// And they have the same public entry point

// TODO make sure to add a unit test that optional properties dont have to be included

// TODO add good error messages in here...

class Create<T extends SingleTableDesign> {
  readonly #entityMetadata: EntityMetadata;
  readonly #tableMetadata: TableMetadata;

  private readonly EntityClass: EntityClass<T>;

  constructor(Entity: EntityClass<T>) {
    this.EntityClass = Entity;
    this.#entityMetadata = Metadata.getEntity(Entity.name);
    this.#tableMetadata = Metadata.getTable(
      this.#entityMetadata.tableClassName
    );
  }

  // TODO insure idempotency - see here https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html

  // TODO tsdoc
  // TODO add friendly error handling for failed transactions
  public async run(attributes: CreateOptions<T>): Promise<T> {
    const { name: tableName } = this.#tableMetadata;

    const entityData = this.buildEntityData(attributes);

    // TODO does this need to be a class? Can the method be static?
    const expressionBuilder = new PutExpression({
      entityClassName: this.EntityClass.name
    });
    const expression = expressionBuilder.build(entityData);

    const relationshipTransactions =
      this.buildRelationshipTransactions(entityData);

    // debugger;

    // const bla3 = Object.values(relationships).filter(rel =>
    //   rel.type === "HasMany" // TODO what am I finding with the target key...?
    //     ? attributes[rel.targetKey as keyof CreateOptions<T>]
    //     : attributes[rel.foreignKey as keyof CreateOptions<T>]
    // );

    // const

    // TODO if this works make sure to check ALL associated relationships existence
    // TODO make sure to create BelongsToLinks
    // TODO if there is overlap with the expression attribute names and expression attribute values from QUERY then DRY up

    const dynamo = new DynamoClient(tableName);

    try {
      const res = await dynamo.transactWriteItems({
        TransactItems: [{ Put: expression }, ...relationshipTransactions]
      });
      debugger;
    } catch (e) {
      debugger;
    }

    debugger;

    // TODO fix return type...
    return entityData as any;
  }

  // TODO is this a good name?
  // TODO I dont think Dynamo table ITEM is right here...
  private buildEntityData(attributes: CreateOptions<T>): DynamoTableItem {
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

  private buildRelationshipTransactions(
    entityData: DynamoTableItem
  ): TransactItems {
    const { relationships } = this.#entityMetadata;

    return Object.values(relationships).reduce<TransactItems>((acc, rel) => {
      const key = rel.type === "HasMany" ? rel.targetKey : rel.foreignKey;

      // TODO find a way to not use as
      const relationshipId = entityData[key];

      if (relationshipId !== undefined) {
        acc.push({
          ConditionCheck: this.buildRelationshipExistsCondition(
            rel,
            relationshipId
          )
        });

        const relMetadata = Metadata.getEntity(rel.target.name);

        // TODO add comment, move to function?
        const entityBelongsToHasManyRel = Object.values(
          relMetadata.relationships
        ).find(
          rel =>
            rel.type === "HasMany" &&
            rel.target === this.EntityClass &&
            rel.targetKey === key
        );

        if (entityBelongsToHasManyRel !== undefined) {
          const renameMe: BelongsToLink = {
            id: uuidv4(),
            type: BelongsToLink.name,
            foreignEntityType: this.EntityClass.name,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          const belongsToLink = {
            pk: `${rel.target.name}#${relationshipId}`,
            // TODO type here should know its DynamoTableITem of single table design..
            //    this would make it so it doesnt think this is any...
            sk: `${this.EntityClass.name}#${entityData.id}`
          };

          const expressionBuilder = new PutExpression({
            entityClassName: rel.target.name
          });
          const expression = expressionBuilder.build({
            ...belongsToLink,
            ...renameMe
          });

          acc.push({ Put: expression });
        }
      }

      return acc;
    }, []);
  }

  private buildRelationshipExistsCondition(
    rel: RelationshipMetadata,
    relationshipId: string
  ): TransactItems[number]["ConditionCheck"] {
    const { name: tableName, primaryKey, sortKey } = this.#tableMetadata;

    return {
      TableName: tableName,
      Key: {
        [primaryKey]: rel.target.primaryKeyValue(relationshipId),
        [sortKey]: rel.target.name
      },
      ConditionExpression: `attribute_exists(${primaryKey})`
    };
  }
}

export default Create;
