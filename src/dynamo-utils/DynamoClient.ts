import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  TransactGetCommand,
  type QueryCommandInput,
  type GetCommandInput,
  type GetCommandOutput,
  type TransactWriteCommandInput,
  type TransactWriteCommandOutput,
  type TransactGetCommandInput,
  SearchVectorsCommand,
  type SearchVectorsCommandInput,
  type SearchVectorsCommandOutput
} from "@aws-sdk/lib-dynamodb";
import Logger from "../Logger.js";
import { vectorSearchKeys } from "../metadata/VectorIndexMetadata.js";
import type { QueryItems, TransactGetItemResponses } from "./types.js";

// Initialize the DynamoDB Document Client with a specific AWS region.
const dynamo = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: "us-west-2" })
);

/**
 * Returns the log placeholder for a redacted vector, carrying only its
 * dimension count
 * @param dimensions - The vector's dimension count
 * @returns The placeholder string
 */
const vectorPlaceholder = (dimensions: number): string =>
  `[vector:${String(dimensions)}]`;

/**
 * Returns a copy of transact write params safe for logging: vector embedding
 * values riding in Put items or Update expression values are replaced with a
 * placeholder carrying the dimension count. Embeddings reconstruct their
 * source text under published inversion techniques, so vector values must
 * never reach logs — the command itself keeps the real values
 */
const redactVectorWrites = (
  params: TransactWriteCommandInput
): TransactWriteCommandInput => {
  const vectorValueKey = `:${vectorSearchKeys.vector}`;

  const hasVector = params.TransactItems?.some(
    transactItem =>
      Array.isArray(transactItem.Put?.Item?.[vectorSearchKeys.vector]) ||
      Array.isArray(
        transactItem.Update?.ExpressionAttributeValues?.[vectorValueKey]
      )
  );

  if (hasVector !== true) return params;

  return {
    ...params,
    TransactItems: params.TransactItems?.map(transactItem => {
      const putVector: unknown =
        transactItem.Put?.Item?.[vectorSearchKeys.vector];
      if (transactItem.Put !== undefined && Array.isArray(putVector)) {
        return {
          ...transactItem,
          Put: {
            ...transactItem.Put,
            Item: {
              ...transactItem.Put.Item,
              [vectorSearchKeys.vector]: vectorPlaceholder(putVector.length)
            }
          }
        };
      }

      const updateVector: unknown =
        transactItem.Update?.ExpressionAttributeValues?.[vectorValueKey];
      if (transactItem.Update !== undefined && Array.isArray(updateVector)) {
        return {
          ...transactItem,
          Update: {
            ...transactItem.Update,
            ExpressionAttributeValues: {
              ...transactItem.Update.ExpressionAttributeValues,
              [vectorValueKey]: vectorPlaceholder(updateVector.length)
            }
          }
        };
      }

      return transactItem;
    })
  };
};

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
    Logger.log("getItem", { params });
    const response = await dynamo.send(new GetCommand(params));
    return response.Item;
  }

  /**
   * Queries DynamoDB based on the provided parameters and returns the matching items.
   *
   * A single DynamoDB `Query` returns at most 1MB of data and a `LastEvaluatedKey`
   * cursor when more results exist. This method drains every page by following that
   * cursor, so callers always receive the complete result set rather than a silently
   * truncated first page.
   *
   * If `params.Limit` is provided it is treated as a cap on the total number of items
   * returned (not a per-page limit), and pagination stops once it is reached. This
   * keeps the door open for adding a bounded/cursor-based read API later without
   * changing this method's behavior.
   * @param params The parameters for the QueryCommand to DynamoDB.
   * @returns A Promise resolving to an array of the queried items.
   */
  public static async query(params: QueryCommandInput): Promise<QueryItems> {
    Logger.log("query", { params });

    const items: QueryItems = [];
    let exclusiveStartKey: QueryCommandInput["ExclusiveStartKey"];

    do {
      const remaining =
        params.Limit !== undefined ? params.Limit - items.length : undefined;

      const response = await dynamo.send(
        new QueryCommand({
          ...params,
          ExclusiveStartKey: exclusiveStartKey,
          ...(remaining !== undefined && { Limit: remaining })
        })
      );

      if (response.Items !== undefined) {
        items.push(...response.Items);
      }

      exclusiveStartKey = response.LastEvaluatedKey;
    } while (
      exclusiveStartKey !== undefined &&
      (params.Limit === undefined || items.length < params.Limit)
    );

    return items;
  }

  /**
   * Executes a transactional read operation in DynamoDB to get multiple items atomically.
   * @param params The parameters for the TransactGetCommand to DynamoDB.
   * @returns A Promise resolving to the responses of the transactional get operation.
   */
  public static async transactGetItems(
    params: TransactGetCommandInput
  ): Promise<TransactGetItemResponses> {
    Logger.log("transactGetItems", { params });
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
    Logger.log("transactWriteItems", { params: redactVectorWrites(params) });
    return await dynamo.send(new TransactWriteCommand(params));
  }

  /**
   * Performs a vector similarity search against a DynamoDB vector index and
   * returns the matching results.
   *
   * Log output redacts the query vector: only a placeholder with the
   * dimension count is logged, never the vector values.
   * @param params The parameters for the SearchVectorsCommand to DynamoDB.
   * @returns A Promise resolving to the array of search results.
   */
  public static async searchVectors(
    params: SearchVectorsCommandInput
  ): Promise<NonNullable<SearchVectorsCommandOutput["SearchResults"]>> {
    Logger.log("searchVectors", {
      params: {
        ...params,
        SearchVector: vectorPlaceholder(params.SearchVector?.length ?? 0)
      }
    });
    const response = await dynamo.send(new SearchVectorsCommand(params));
    return response.SearchResults ?? [];
  }
}

export default DynamoClient;
