import TableMetadata from "./TableMetadata";
import EntityMetadata from "./EntityMetadata";
import AttributeMetadata from "./AttributeMetadata";
import MetadataStorage from "./MetadataStorage";
import JoinTableMetadata from "./JoinTableMetadata";

export default new MetadataStorage();
export { TableMetadata, EntityMetadata, AttributeMetadata, JoinTableMetadata };

export * from "./MetadataStorage";
export * from "./TableMetadata";
export * from "./relationship-metadata";
