import { createHash } from "node:crypto";
import type DynaRecord from "../DynaRecord.js";
import type {
  EmbeddingModelDescriptor,
  EmbeddingProvider
} from "../embedding/types.js";
import type { EntityClass, Optional } from "../types.js";

/**
 * Table aliases of the library-managed vector search attributes. These
 * aliases are reserved by dyna-record and may not be used as the alias of a
 * consumer-defined attribute (enforced at metadata initialization).
 *
 *   - **vector**: the attribute holding the embedding vector. It is
 *     intentionally never registered in any entity's attribute metadata so
 *     serialization and copy paths drop it automatically.
 *   - **contentHash**: the content hash of the embedded text, registered as a
 *     library-managed attribute on searchable entities so it round-trips
 *     serialization and prefetch (enabling the unchanged-content embed skip).
 */
export const vectorSearchKeys = {
  vector: "__dyna_vector",
  contentHash: "__dyna_vector_hash"
} as const;

/**
 * Options for defining a vector index through the static `vectorIndex`
 * factory on a table class.
 */
export interface VectorIndexOptions {
  /**
   * The DynamoDB IndexName of the vector index.
   */
  name: string;
  /**
   * The embedding model descriptor (EX: `TitanTextEmbedV2`), carrying the
   * dimensions and distance function the index is provisioned with.
   */
  model: EmbeddingModelDescriptor;
  /**
   * The embed function used to generate vectors. Required — dyna-record
   * ships no embedding implementation; the provider owns credentials,
   * region, retry, and timeout posture.
   */
  provider: EmbeddingProvider;
  /**
   * Optional entity thunk selecting the scope parent. The foreign key
   * attribute referencing this entity becomes the index `HASH`, making the
   * index queryable only per scope value. Without `scopedBy` the index
   * compiles to no `HASH` and its searches are global.
   */
  scopedBy?: () => EntityClass<DynaRecord>;
  /**
   * Optional entity thunks adding FK-only members to a scoped index —
   * searchable entities that carry the scoping foreign key but have no
   * declared inverse relationship on the scope parent.
   */
  include?: Array<() => EntityClass<DynaRecord>>;
}

/**
 * Parameters resolving an index's search schema at metadata initialization.
 * See {@link VectorIndexMetadata.resolveSearchSchema}.
 */
interface ResolveSearchSchemaParams {
  /**
   * Class names of the searchable member entities of the index.
   */
  memberEntities: string[];
  /**
   * Table alias of the scoping foreign key attribute (the index `HASH`).
   * Undefined for global indexes.
   */
  hashAlias?: string;
  /**
   * Sorted table aliases of the index's inline filters, including the
   * entity type filter the library declares automatically.
   */
  inlineFilterAliases: string[];
}

/**
 * Represents the metadata for a vector index defined on a table class through
 * the static `vectorIndex` factory. Holds the consumer-supplied configuration
 * (name, model descriptor, provider, scope and membership thunks) plus the
 * search schema resolved at metadata initialization (members, `HASH` alias,
 * inline filter aliases, and the search-schema fingerprint).
 *
 * Entity thunks (`scopedBy`, `include`) are never resolved at definition
 * time — resolution happens during metadata initialization so index constants
 * can be declared at module evaluation without freezing metadata against a
 * partial entity graph.
 *
 * This construct is also the future home of the index `search` surface.
 *
 * @param {string} tableClassName - Name of the table class the index is defined on.
 * @param {VectorIndexOptions} options - Configuration options for the vector index.
 */
class VectorIndexMetadata {
  /**
   * The name of the table class the index is defined on
   */
  public readonly tableClassName: string;
  /**
   * The DynamoDB IndexName of the vector index
   */
  public readonly name: string;
  /**
   * The embedding model descriptor the index is provisioned with
   */
  public readonly model: EmbeddingModelDescriptor;
  /**
   * The consumer-supplied embed function. Typed as required configuration;
   * optional here so a missing provider (EX: plain JS consumers) is caught by
   * metadata validation rather than a runtime crash.
   */
  public readonly provider: Optional<EmbeddingProvider>;
  /**
   * Entity thunk selecting the scope parent, when the index is scoped
   */
  public readonly scopedBy?: () => EntityClass<DynaRecord>;
  /**
   * Entity thunks adding FK-only members to a scoped index
   */
  public readonly include?: ReadonlyArray<() => EntityClass<DynaRecord>>;

  /**
   * Class names of the searchable member entities of the index. Placeholder,
   * resolved at metadata initialization
   */
  public memberEntities: string[];
  /**
   * Table alias of the scoping foreign key attribute (the index `HASH`).
   * Undefined for global indexes. Placeholder, resolved at metadata
   * initialization
   */
  public hashAlias?: string;
  /**
   * Sorted table aliases of the index's inline filters, including the
   * auto-declared entity type filter. Placeholder, resolved at metadata
   * initialization
   */
  public inlineFilterAliases: string[];
  /**
   * Stable fingerprint of the search-schema configuration (`HASH` alias,
   * sorted inline filter aliases, dimensions, distance function) so IaC can
   * detect that a decorator change implies a destructive index replacement.
   * Placeholder, resolved at metadata initialization
   */
  public fingerprint: string;

  constructor(tableClassName: string, options: VectorIndexOptions) {
    this.tableClassName = tableClassName;
    this.name = options.name;
    this.model = options.model;
    this.provider = options.provider;
    this.scopedBy = options.scopedBy;
    this.include = options.include;
    // Placeholders, these are set later
    this.memberEntities = [];
    this.inlineFilterAliases = [];
    this.fingerprint = "";
  }

  /**
   * Resolves the index's search schema. Called during metadata
   * initialization once membership and inline filters have been validated.
   * @param params - {@link ResolveSearchSchemaParams}
   */
  public resolveSearchSchema(params: ResolveSearchSchemaParams): void {
    this.memberEntities = params.memberEntities;
    this.hashAlias = params.hashAlias;
    this.inlineFilterAliases = params.inlineFilterAliases;
    this.fingerprint = createHash("sha256")
      .update(
        [
          `hash=${params.hashAlias ?? ""}`,
          `filters=${params.inlineFilterAliases.join(",")}`,
          `dimensions=${String(this.model.dimensions)}`,
          `distance=${this.model.distanceFunction}`
        ].join(";")
      )
      .digest("hex");
  }
}

export default VectorIndexMetadata;
