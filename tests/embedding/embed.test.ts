/**
 * Unit tests for the embedding entry points' defensive provider guard.
 *
 * Metadata initialization already rejects a table that has searchable
 * entities but no provider-configured index, so this guard should be
 * unreachable through the ORM. It exists for the plain-JS consumer who gets
 * past the type system, and it produces a specific message they would see —
 * which is what these tests pin. They call the functions directly rather than
 * fabricating an invalid registry.
 */
import {
  embedQueryVector,
  embedSearchableValue
} from "../../src/embedding/embed.js";
import { TitanTextEmbedV2 } from "../../src/embedding/types.js";
import VectorIndexMetadata, {
  type VectorIndexOptions
} from "../../src/metadata/VectorIndexMetadata.js";
import { EmbeddingError } from "../../src/errors.js";

/**
 * An index whose provider never arrived. `VectorIndexOptions` requires
 * `provider`, so only an untyped caller can produce this — the single cast
 * is that trust boundary, and it is what the guard under test defends.
 */
const providerlessIndex = new VectorIndexMetadata("SomeTable", {
  name: "some-index",
  vectorAttribute: "__dyna_vector",
  model: TitanTextEmbedV2,
  members: []
} as unknown as VectorIndexOptions);

describe("embedding provider guard", () => {
  it("rejects a search query when the index carries no provider", async () => {
    expect.assertions(2);

    await expect(
      embedQueryVector("hand thrown mugs", providerlessIndex)
    ).rejects.toBeInstanceOf(EmbeddingError);

    await expect(
      embedQueryVector("hand thrown mugs", providerlessIndex)
    ).rejects.toThrow(
      "No vector index with an embedding provider is configured for the search query"
    );
  });

  it("rejects a write when the entity resolves to no owning index", async () => {
    expect.assertions(2);

    // The other half of the guard: no index at all, rather than an index
    // missing its provider. The message names the entity and attribute so the
    // consumer can find the declaration that is missing
    await expect(
      embedSearchableValue("a listing", undefined, "Listing", "description")
    ).rejects.toBeInstanceOf(EmbeddingError);

    await expect(
      embedSearchableValue("a listing", undefined, "Listing", "description")
    ).rejects.toThrow(
      "No vector index with an embedding provider is configured for Listing.description"
    );
  });
});
