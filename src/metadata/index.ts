import TableMetadata from "./TableMetadata.js";
import EntityMetadata from "./EntityMetadata.js";
import AttributeMetadata from "./AttributeMetadata.js";
import MetadataStorage from "./MetadataStorage.js";
import JoinTableMetadata from "./JoinTableMetadata.js";
import VectorIndexMetadata from "./VectorIndexMetadata.js";

export default new MetadataStorage();
export {
  TableMetadata,
  EntityMetadata,
  AttributeMetadata,
  JoinTableMetadata,
  VectorIndexMetadata
};

export * from "./MetadataStorage.js";
export * from "./TableMetadata.js";
export * from "./VectorIndexMetadata.js";
export * from "./relationship-metadata/index.js";
export * from "./types.js";
