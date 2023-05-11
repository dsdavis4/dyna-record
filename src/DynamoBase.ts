import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand
  // DeleteCommand,
  // PutCommand,
  // UpdateCommand,
  // GetCommandInput
} from "@aws-sdk/lib-dynamodb";
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

class DynamoBase {
  private readonly tableName: string;
  private readonly dynamo: DynamoDBDocumentClient;

  constructor(tableName: string) {
    this.tableName = tableName;
    this.dynamo = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: "us-west-2" })
    );
  }

  public async findById(key: Record<string, string>) {
    console.log("findById", { key });

    const response = await this.dynamo.send(
      new GetCommand({
        TableName: this.tableName,
        Key: key
      })
    );

    return response.Item ?? null;
  }
}

export default DynamoBase;
