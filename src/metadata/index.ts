export interface AttributeMetadata {
  name: string;
}

export interface EntityMetadata {
  tableName: string;
  attributes: Record<string, AttributeMetadata>;
}

export interface TableMetadata {
  name: string;
  primaryKey: string;
  sortKey: string;
  delimiter: string;
}

class Metadata {
  public readonly tables: Record<string, TableMetadata> = {};
  public readonly entities: Record<string, EntityMetadata> = {};
}

// TODO is singleton right here...
export default new Metadata();
