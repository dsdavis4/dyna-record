import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  TransactGetCommand,
  type QueryCommandInput,
  type QueryCommandOutput,
  type GetCommandOutput,
  type TransactWriteCommandInput,
  type TransactWriteCommandOutput,
  type TransactGetCommandInput,
  type TransactGetCommandOutput
} from "@aws-sdk/lib-dynamodb";
import { type KeyConditions } from "./query-utils";

// TODO should this move into dynamo-utils...?

export type TransactGetItemResponses = NonNullable<
  TransactGetCommandOutput["Responses"]
>;

// const dynamo = DynamoDBDocumentClient.from(
//   new DynamoDBClient({ region: "us-west-2" })
// );

// https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/modules/_aws_sdk_lib_dynamodb.html
// TODO should these be static?
// TODO do I need to destroy to dynamo connection?
// const client = new DynamoDBClient({});
// const ddbDocClient = DynamoDBDocumentClient.from(client);

// // Perform operations on document client.

// ddbDocClient.destroy(); // no-op
// client.destroy(); // destroys DynamoDBClient

// TODO tsdoc for everything in here

const dynamo = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: "us-west-2" })
);

class DynamoClient {
  private readonly tableName: string;

  // TODO remove table name from here...
  constructor(tableName: string) {
    this.tableName = tableName;
  }

  // TODO should this be updated so it gets all the items in a BatchGetItems?
  // TransctGetItems likely wont work due to limitation of 100 records and will fail if writes happen at same time
  public async findById(
    key: KeyConditions
  ): Promise<NonNullable<GetCommandOutput["Item"]> | null> {
    console.log("findById", { key });

    const response = await dynamo.send(
      new GetCommand({
        TableName: this.tableName,
        Key: key
        // ConsistentRead: true // TODO should I implement this? Maybe on the caller?
      })
    );

    return response.Item ?? null;
  }

  public async query(
    params: QueryCommandInput
  ): Promise<NonNullable<QueryCommandOutput["Items"]>> {
    console.log("query", { params });
    const response = await dynamo.send(new QueryCommand(params));
    return response.Items ?? [];
  }

  public async transactGetItems(
    params: TransactGetCommandInput
  ): Promise<TransactGetItemResponses> {
    console.log("transactGetItems", { params });
    const response = await dynamo.send(new TransactGetCommand(params));
    return response.Responses ?? [];
  }

  public async transactWriteItems(
    params: TransactWriteCommandInput
  ): Promise<TransactWriteCommandOutput> {
    console.log("transactWriteItems", { params });
    return await dynamo.send(new TransactWriteCommand(params));
  }
}

export default DynamoClient;
