import { createHash } from "node:crypto";
import { EmbeddingError } from "../errors.js";
import type VectorIndexMetadata from "../metadata/VectorIndexMetadata.js";

/**
 * The number of significant decimal digits an embedding value is truncated to
 * before it is written. DynamoDB's vector index stores values as 32-bit
 * floats, which hold ~7 significant digits — digits beyond that are invisible
 * to search but roughly double the item's own byte size (verified: a
 * truncated vector matches its full-precision twin at distance 0)
 */
const EMBEDDING_SIGNIFICANT_DIGITS = 7;

/**
 * The vector and content hash produced for a searchable attribute's value,
 * ready to be written to the canonical row
 */
export interface SearchableWriteAttributes {
  vector: number[];
  contentHash: string;
}

/**
 * Returns the sha256 content hash of a searchable attribute's value. Stored
 * on the canonical row so an update carrying an unchanged value skips the
 * embedding call and the vector write
 * @param text - The searchable attribute's value
 * @returns The sha256 hex digest of the value
 */
export const computeContentHash = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

/**
 * Embeds a searchable attribute's value through the vector index's configured
 * embedding provider and returns the truncated vector with the value's
 * content hash.
 *
 * Provider failures and dimension mismatches are wrapped in
 * {@link EmbeddingError} — error messages carry entity, attribute, model, and
 * dimension identities only, never the text or the vector.
 * @param text - The searchable attribute's value to embed
 * @param index - The vector index whose provider and model descriptor to use
 * @param entityName - Name of the entity being written
 * @param attributeName - Name of the searchable attribute
 * @returns The truncated embedding vector and the value's content hash
 */
export const embedSearchableValue = async (
  text: string,
  index: VectorIndexMetadata | undefined,
  entityName: string,
  attributeName: string
): Promise<SearchableWriteAttributes> => {
  // Metadata validation guarantees a provider-configured index exists for
  // tables with searchable entities; this guard is defensive
  if (index?.provider === undefined) {
    throw new EmbeddingError(
      `No vector index with an embedding provider is configured for ${entityName}.${attributeName}`
    );
  }

  let vector: number[];

  try {
    vector = await index.provider(text);
  } catch (error) {
    throw new EmbeddingError(
      `Embedding failed for ${entityName}.${attributeName} via the ${index.model.name} provider on vector index ${index.name}`,
      { cause: error }
    );
  }

  if (vector.length !== index.model.dimensions) {
    throw new EmbeddingError(
      `Embedding provider returned a ${String(vector.length)}-dimension vector for ${entityName}.${attributeName}; the ${index.model.name} descriptor requires ${String(index.model.dimensions)} dimensions`
    );
  }

  return {
    vector: vector.map(value =>
      Number(value.toPrecision(EMBEDDING_SIGNIFICANT_DIGITS))
    ),
    contentHash: computeContentHash(text)
  };
};
