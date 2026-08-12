/**
 * Embedding provider and model descriptor types for vector search.
 *
 * dyna-record ships no embedding implementation and no embedding SDK
 * dependency — the consumer supplies an {@link EmbeddingProvider} (an embed
 * function) on each vector index definition and owns the credentials, region,
 * retry, and timeout posture of whatever service backs it. The library ships
 * only typed model *descriptors* (EX: {@link TitanTextEmbedV2}) — pure data
 * consumed by index definitions, validations, and typing.
 */

import type { VectorDistanceFunction } from "@aws-sdk/client-dynamodb";

/**
 * A distance function supported by DynamoDB vector indexes. Re-exported from
 * the AWS SDK so the accepted values track the service definition instead of
 * a hand-maintained duplicate.
 */
export type { VectorDistanceFunction };

/**
 * An embed function supplied by the consumer on a vector index definition.
 * Takes the text to embed and resolves to the embedding vector, which must
 * have the dimensions declared by the index's {@link EmbeddingModelDescriptor}.
 *
 * Usage example (consumer-owned Bedrock provider):
 * ```typescript
 * const provider: EmbeddingProvider = async text => {
 *   const res = await bedrock.send(
 *     new InvokeModelCommand({
 *       modelId: TitanTextEmbedV2.name,
 *       body: JSON.stringify({ inputText: text })
 *     })
 *   );
 *   return JSON.parse(new TextDecoder().decode(res.body)).embedding;
 * };
 * ```
 */
export type EmbeddingProvider = (text: string) => Promise<number[]>;

/**
 * Pure-data description of an embedding model: the model name, the dimensions
 * of the vectors it produces, the distance function the vector index should
 * use, and the conversion from a raw distance score to a similarity value.
 *
 * Descriptors carry no client, credentials, or SDK dependency. Only the
 * descriptor's `name` is ever serialized (EX: through `metadata()`).
 */
export interface EmbeddingModelDescriptor {
  /**
   * The model name (EX: a Bedrock model id). This is the only part of the
   * descriptor that appears in serialized metadata.
   */
  name: string;
  /**
   * The number of dimensions of the vectors the model produces.
   */
  dimensions: number;
  /**
   * The distance function the vector index should be provisioned with.
   */
  distanceFunction: VectorDistanceFunction;
  /**
   * Converts a raw distance score returned by DynamoDB to a similarity value.
   */
  scoreToSimilarity: (score: number) => number;
}

/**
 * Model descriptor for Amazon Titan Text Embeddings V2.
 *
 * Pure data — pair it with a consumer-owned {@link EmbeddingProvider} on a
 * vector index definition:
 * ```typescript
 * const searchIndex = MyTable.vectorIndex({
 *   name: "my-search-index",
 *   model: TitanTextEmbedV2,
 *   provider: myEmbedFunction
 * });
 * ```
 */
export const TitanTextEmbedV2 = {
  name: "amazon.titan-embed-text-v2:0",
  dimensions: 1024,
  distanceFunction: "COSINE",
  scoreToSimilarity: (score: number): number => 1 - score
} as const satisfies EmbeddingModelDescriptor;

/**
 * {@link TitanTextEmbedV2} at 512 output dimensions — half the vector
 * storage and write footprint for a modest accuracy trade-off.
 *
 * The provider must request the matching output size from the model
 * (Bedrock: `body: JSON.stringify({ inputText: text, dimensions: 512 })`);
 * a mismatched vector fails the write with an `EmbeddingError`.
 */
export const TitanTextEmbedV2Dim512 = {
  ...TitanTextEmbedV2,
  dimensions: 512
} as const satisfies EmbeddingModelDescriptor;

/**
 * {@link TitanTextEmbedV2} at 256 output dimensions — the smallest Titan V2
 * variant, minimizing vector storage and write cost where coarse similarity
 * is enough.
 *
 * The provider must request the matching output size from the model
 * (Bedrock: `body: JSON.stringify({ inputText: text, dimensions: 256 })`);
 * a mismatched vector fails the write with an `EmbeddingError`.
 */
export const TitanTextEmbedV2Dim256 = {
  ...TitanTextEmbedV2,
  dimensions: 256
} as const satisfies EmbeddingModelDescriptor;
