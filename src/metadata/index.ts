import TableMetadata from "./TableMetadata.js";
import EntityMetadata from "./EntityMetadata.js";
import AttributeMetadata from "./AttributeMetadata.js";
import MetadataStorage from "./MetadataStorage.js";
import JoinTableMetadata from "./JoinTableMetadata.js";

export default new MetadataStorage();
export { TableMetadata, EntityMetadata, AttributeMetadata, JoinTableMetadata };

export * from "./MetadataStorage.js";
export * from "./TableMetadata.js";
export * from "./relationship-metadata/index.js";
export * from "./types.js";
