import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  TransactGetCommand,
  type QueryCommandInput,
  type QueryCommandOutput,
  type GetCommandInput,
  type GetCommandOutput,
  type TransactWriteCommandInput,
  type TransactWriteCommandOutput,
  type TransactGetCommandInput,
  type TransactGetCommandOutput
} from "@aws-sdk/lib-dynamodb";

export type TransactGetItemResponses = NonNullable<
  TransactGetCommandOutput["Responses"]
>;

export type QueryItems = NonNullable<QueryCommandOutput["Items"]>;

const dynamo = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: "us-west-2" })
);

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class DynamoClient {
  public static async getItem(
    params: GetCommandInput
  ): Promise<GetCommandOutput["Item"]> {
    console.log("findById", { params });
    const response = await dynamo.send(new GetCommand(params));
    return response.Item;
  }

  public static async query(params: QueryCommandInput): Promise<QueryItems> {
    console.log("query", { params });
    const response = await dynamo.send(new QueryCommand(params));
    return response.Items ?? [];
  }

  public static async transactGetItems(
    params: TransactGetCommandInput
  ): Promise<TransactGetItemResponses> {
    console.log("transactGetItems", { params });
    const response = await dynamo.send(new TransactGetCommand(params));
    return response.Responses ?? [];
  }

  public static async transactWriteItems(
    params: TransactWriteCommandInput
  ): Promise<TransactWriteCommandOutput> {
    console.log("transactWriteItems", { params });
    return await dynamo.send(new TransactWriteCommand(params));
  }
}

export default DynamoClient;
