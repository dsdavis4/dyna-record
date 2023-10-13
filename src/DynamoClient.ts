import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  PutCommand,
  TransactWriteCommand,
  type QueryCommandInput,
  type QueryCommandOutput,
  type GetCommandOutput,
  type PutCommandInput,
  type TransactWriteCommandInput
} from "@aws-sdk/lib-dynamodb";
import { type KeyConditions } from "./query-utils";
// import QueryParams from "./QueryParams";

// import { v4 as uuidv4 } from "uuid";

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

const dynamo = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: "us-west-2" })
);

class DynamoClient {
  private readonly tableName: string;

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

  // TODO change response type
  // TODO tsdoc
  public async create(params: PutCommandInput): Promise<number> {
    console.log("create", { params });

    const response = await dynamo.send(new PutCommand(params));

    debugger;

    return 1;
  }

  // TODO change response type
  // TODO tsdoc
  public async transactWriteItems(
    params: TransactWriteCommandInput
  ): Promise<number> {
    console.log("transactWriteItems", { params });

    const response = await dynamo.send(new TransactWriteCommand(params));

    return 1;
  }
}

export default DynamoClient;
