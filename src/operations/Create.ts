import type SingleTableDesign from "../SingleTableDesign";
import Metadata, {
  type EntityMetadata,
  type TableMetadata,
  type EntityClass,
  type BelongsToRelationship,
  type HasOneRelationship
} from "../metadata";
import { type RelationshipAttributeNames } from "./types";
import { v4 as uuidv4 } from "uuid";
import type { PrimaryKey, SortKey, DynamoTableItem } from "../types";
import { type TransactWriteCommandInput } from "@aws-sdk/lib-dynamodb"; // TODO dont need this import...
import DynamoClient from "../DynamoClient";

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

// TODO should I make an operations base since they all have the same constructor?
// And they have the same public entry point

// TODO make sure to add a unit test that optional properties dont have to be included

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
    const { name: tableName, primaryKey, sortKey } = this.#tableMetadata;
    // TODO add conditional checks when managing relationships
    //       example: Throw error if breweryId does not exist for beer
    //                is that possible?

    // TODO start here... I think object is ready, call method
    const tableItem = this.buildTableItem(attributes);
    // await this.checkRelationshipsExist(tableItem);

    debugger;

    // TODO if this works make sure to check ALL associated relationships existence
    // TODO make sure to create BelongsToLinks
    // TODO if there is overlap with the expression attribute names and expression attribute values from QUERY then DRY up

    // this works... codify
    const bla: TransactWriteCommandInput = {
      TransactItems: [
        {
          ConditionCheck: {
            TableName: tableName,
            Key: {
              PK: "Brewery#157cc981-1be2-4ecc-a257-07d9a6037559",
              SK: "Brewery"
              // PK: "Bla123",
              // SK: "Bla"
            },
            ConditionExpression: "attribute_exists(PK)"
          }
        },
        {
          Update: {
            TableName: tableName,
            Key: {
              PK: "Beer#ceb34f08-3472-45e8-b78c-9fa503b70637",
              SK: "Beer"
            },
            UpdateExpression: "SET #Name = :newValue",
            ExpressionAttributeValues: {
              ":newValue": { S: "Serrano Pale Ale Test 7" }
            },
            ExpressionAttributeNames: {
              "#Name": "Name"
            }
          }
        }
      ]
    };

    const dynamo = new DynamoClient(tableName);

    try {
      const res = await dynamo.transactWriteItems(bla);
      debugger;
    } catch (e) {
      debugger;
    }

    debugger;

    // console.log(bla);

    console.log(tableItem);
    // START here on actual create

    return {} as any;
  }

  private buildTableItem(attributes: CreateOptions<T>): DynamoTableItem {
    const { attributes: entityAttrs } = this.#entityMetadata;
    const { primaryKey, sortKey } = this.#tableMetadata;

    const id = uuidv4();
    const createdAt = new Date();

    const keys = {
      [primaryKey]: this.EntityClass.primaryKeyValue(id),
      [sortKey]: this.EntityClass.name
    };

    const defaultAttrs: SingleTableDesign = {
      id,
      type: this.EntityClass.name,
      createdAt,
      updatedAt: createdAt
    };

    const entityData = { ...attributes, ...defaultAttrs };

    return Object.entries(entityAttrs).reduce<DynamoTableItem>(
      (acc, [tableKey, attributeData]) => {
        const val = entityData[attributeData.name as keyof CreateOptions<T>];
        if (val !== undefined) acc[tableKey] = val;
        return acc;
      },
      keys
    );
  }

  // TODO anything to check for has many?
  // TODO tsdoc
  private async checkRelationshipsExist(
    tableItem: DynamoTableItem
  ): Promise<void> {
    const { relationships } = this.#entityMetadata;

    // TODO Get the filter to work correctly by using type guard
    const hasManyOrBelongsTos = Object.values(relationships).filter(
      rel => rel.type !== "HasMany" // TODO needs type guard
    );
    await Promise.all(
      hasManyOrBelongsTos.map(async rel => {
        await this.relationshipExists(tableItem, rel as any); // TODO no any
      })
    );
  }

  // TODO tsdoc
  // TODO unit test for this error for both relationship types
  private async relationshipExists(
    tableItem: DynamoTableItem,
    rel: HasOneRelationship | BelongsToRelationship
  ): Promise<void> {
    const { foreignKey, target } = rel;
    const relationshipId = tableItem[foreignKey];
    const res = await target.findById(relationshipId);
    if (res === null) {
      throw new Error(
        `Foreign key constraint error (${foreignKey}): No ${target.name} exists with Id ${relationshipId}`
      );
    }
  }
}

export default Create;
