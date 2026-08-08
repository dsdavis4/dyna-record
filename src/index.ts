export * from "./decorators/index.js";
export * from "./errors.js";
export * from "./relationships/index.js";
export * from "./dynamo-utils/errors.js";

export type {
  EntityAttributesOnly,
  EntityAttributesInstance as EntityInstance,
  FindByIdIncludesRes,
  TypedFilterParams,
  TypedSortKeyCondition,
  SKScopedFilterParams,
  InferQueryResults,
  PartitionEntityNames,
  ShouldNarrow,
  NarrowByNames,
  FallbackToFilterKeys,
  IntersectTypeWithOr
} from "./operations/index.js";
export type {
  Brand,
  PartitionKey,
  SortKey,
  ForeignKey,
  NullableForeignKey,
  Optional
} from "./types.js";
export type { AttributeKind } from "./metadata/types.js";
export type {
  SerializedTableMetadata,
  SerializedVectorIndexMetadata
} from "./metadata/schemas.js";
export { VectorIndexMetadata, vectorSearchKeys } from "./metadata/index.js";
export type { VectorIndexOptions } from "./metadata/index.js";
export { TitanTextEmbedV2 } from "./embedding/types.js";
export type {
  EmbeddingModelDescriptor,
  EmbeddingProvider,
  VectorDistanceFunction
} from "./embedding/types.js";
