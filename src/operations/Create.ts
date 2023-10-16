import type SingleTableDesign from "../SingleTableDesign";
import Metadata, {
  type EntityMetadata,
  type TableMetadata,
  type EntityClass,
  type RelationshipMetadata
} from "../metadata";
import { type RelationshipAttributeNames } from "./types";
import { v4 as uuidv4 } from "uuid";
import type { DynamoTableItem, PrimaryKey, SortKey } from "../types";
import { PutExpression } from "../dynamo-utils";
import { BelongsToLink } from "../relationships";
import { QueryResolver } from "../query-utils";
import TransactionBuilder, {
  type ConditionCheck
} from "../dynamo-utils/TransactionBuilder";

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
//      - Implement the Transactio Builder class I made and get ride of the put expression stuff...
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
    const entityData = this.buildEntityData(attributes);

    // TODO does this need to be a class? Can the method be static?
    const expressionBuilder = new PutExpression({
      entityClassName: this.EntityClass.name
    });
    const expression = expressionBuilder.build(entityData);
    this.#transactionBuilder.addPut(expression);

    this.buildRelationshipTransactions(entityData);

    try {
      // const res = await dynamo.transactWriteItems({
      //   TransactItems: [{ Put: expression }, ...relationshipTransactions]
      // });
      await this.#transactionBuilder.executeTransaction();
      debugger;
    } catch (e) {
      debugger;
    }

    debugger;

    // TODO using QueryResolver here is not great...
    //      1. It can be renamed..
    //      2. Or I need to do a big refactor when I update that function to use FindById...
    const queryResolver = new QueryResolver<T>(this.EntityClass);

    // TODO dont use as. I need to figure out how to refactor the expression stuff..
    return await queryResolver.resolve(expression.Item as DynamoTableItem);
  }

  // TODO is this a good name?
  // TODO I dont think Dynamo table ITEM is right here...
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

  private buildRelationshipTransactions(entityData: SingleTableDesign): void {
    const { relationships } = this.#entityMetadata;

    Object.values(relationships).forEach(rel => {
      const key = rel.type === "HasMany" ? rel.targetKey : rel.foreignKey;

      // TODO find a way to not use as
      const relationshipId = entityData[key];

      if (relationshipId !== undefined && typeof relationshipId === "string") {
        this.#transactionBuilder.addConditionCheck(
          this.buildRelationshipExistsCondition(rel, relationshipId)
        );

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
            sk: `${this.EntityClass.name}#${entityData.id}`
          };

          const expressionBuilder = new PutExpression({
            entityClassName: rel.target.name
          });
          const expression = expressionBuilder.build({
            ...belongsToLink,
            ...renameMe
          });

          this.#transactionBuilder.addPut(expression);
        }
      }
    });
  }

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
    };
  }
}

export default Create;
