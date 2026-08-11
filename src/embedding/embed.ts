import { EmbeddingError } from "../errors.js";
import type { VectorIndexSchema } from "../metadata/VectorIndexMetadata.js";
import type { Optional } from "../types.js";

/**
 * The number of significant decimal digits an embedding value is truncated to
 * before it is written. DynamoDB's vector index stores values as 32-bit
 * floats, which hold ~7 significant digits — digits beyond that are invisible
 * to search but roughly double the item's own byte size (verified: a
 * truncated vector matches its full-precision twin at distance 0)
 */
const EMBEDDING_SIGNIFICANT_DIGITS = 7;

/**
 * Truncates each embedding value to {@link EMBEDDING_SIGNIFICANT_DIGITS}
 * significant digits
 * @param vector - The embedding vector
 * @returns The truncated vector
 */
const truncateVector = (vector: number[]): number[] =>
  vector.map(value => Number(value.toPrecision(EMBEDDING_SIGNIFICANT_DIGITS)));

/**
 * Embeds text through the vector index's configured embedding provider,
 * validating the result against the index's model descriptor.
 *
 * Provider failures and dimension mismatches are wrapped in
 * {@link EmbeddingError} — error messages carry the subject, model, and
 * dimension identities only, never the text or the vector.
 * @param text - The text to embed
 * @param index - The vector index whose provider and model descriptor to use
 * @param subject - What is being embedded (EX: `Listing.description`), for error messages
 * @returns The embedding vector
 */
const embedText = async (
  text: string,
  index: Optional<VectorIndexSchema>,
  subject: string
): Promise<number[]> => {
  // Metadata validation guarantees a provider-configured index exists for
  // tables with searchable entities; this guard is defensive
  if (index?.provider === undefined) {
    throw new EmbeddingError(
      `No vector index with an embedding provider is configured for ${subject}`
    );
  }

  let vector: number[];

  try {
    vector = await index.provider(text);
  } catch (error) {
    throw new EmbeddingError(
      `Embedding failed for ${subject} via the ${index.model.name} provider on vector index ${index.name}`,
      { cause: error }
    );
  }

  if (vector.length !== index.model.dimensions) {
    throw new EmbeddingError(
      `Embedding provider returned a ${String(vector.length)}-dimension vector for ${subject}; the ${index.model.name} descriptor requires ${String(index.model.dimensions)} dimensions`
    );
  }

  return vector;
};

/**
 * Embeds a searchable attribute's value through the vector index's configured
 * embedding provider and returns the truncated vector.
 * @param text - The searchable attribute's value to embed
 * @param index - The vector index whose provider and model descriptor to use
 * @param entityName - Name of the entity being written
 * @param attributeName - Name of the searchable attribute
 * @returns The truncated embedding vector
 */
export const embedSearchableValue = async (
  text: string,
  index: Optional<VectorIndexSchema>,
  entityName: string,
  attributeName: string
): Promise<number[]> => {
  const vector = await embedText(text, index, `${entityName}.${attributeName}`);

  return truncateVector(vector);
};

/**
 * Embeds search query text through the vector index's configured embedding
 * provider and returns the truncated query vector. Truncation matches the
 * write path — digits beyond float32 precision are invisible to search and
 * only add request bytes
 * @param text - The search query text to embed
 * @param index - The vector index being searched
 * @returns The truncated query vector
 */
export const embedQueryVector = async (
  text: string,
  index: VectorIndexSchema
): Promise<number[]> => {
  const vector = await embedText(text, index, "the search query");

  return truncateVector(vector);
};
