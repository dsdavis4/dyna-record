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

/**
 * Represents the responses from a `TransactGetItems` operation in DynamoDB.
 */
export type TransactGetItemResponses = NonNullable<
  TransactGetCommandOutput["Responses"]
>;

/**
 * Represents the items returned from a `Query` operation in DynamoDB.
 */
export type QueryItems = NonNullable<QueryCommandOutput["Items"]>;

// Initialize the DynamoDB Document Client with a specific AWS region.
const dynamo = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: "us-west-2" })
);

/**
 * A utility class for interacting with DynamoDB, providing static methods
 * for common operations such as retrieving, querying, and transacting items.
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class DynamoClient {
  /**
   * Retrieves a single item from DynamoDB based on the provided parameters.
   * @param params The parameters for the GetCommand to DynamoDB.
   * @returns A Promise resolving to the retrieved item.
   */
  public static async getItem(
    params: GetCommandInput
  ): Promise<GetCommandOutput["Item"]> {
    console.log("getItem", { params });
    const response = await dynamo.send(new GetCommand(params));
    return response.Item;
  }

  /**
   * Queries DynamoDB based on the provided parameters and returns the matching items.
   * @param params The parameters for the QueryCommand to DynamoDB.
   * @returns A Promise resolving to an array of the queried items.
   */
  public static async query(params: QueryCommandInput): Promise<QueryItems> {
    console.log("query", { params });
    const response = await dynamo.send(new QueryCommand(params));
    return response.Items ?? [];
  }

  /**
   * Executes a transactional read operation in DynamoDB to get multiple items atomically.
   * @param params The parameters for the TransactGetCommand to DynamoDB.
   * @returns A Promise resolving to the responses of the transactional get operation.
   */
  public static async transactGetItems(
    params: TransactGetCommandInput
  ): Promise<TransactGetItemResponses> {
    console.log("transactGetItems", { params });
    const response = await dynamo.send(new TransactGetCommand(params));
    return response.Responses ?? [];
  }

  /**
   * Executes a transactional write operation in DynamoDB to write multiple items atomically.
   * @param params The parameters for the TransactWriteCommand to DynamoDB.
   * @returns A Promise resolving to the output of the transactional write operation.
   */
  public static async transactWriteItems(
    params: TransactWriteCommandInput
  ): Promise<TransactWriteCommandOutput> {
    console.log("transactWriteItems", { params });
    return await dynamo.send(new TransactWriteCommand(params));
  }
}

export default DynamoClient;
