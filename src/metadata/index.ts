interface AttributeMetadata {
  name: string;
}

// TODO this might be duplicated
export interface EntityMetadata {
  tableName: string;
  attributes: Record<string, AttributeMetadata>;
}

// TODO this is duplicated from table class
export interface TableMetadata {
  name: string;
  primaryKey: string;
  sortKey: string;
  delimiter: string;
}

// TODO this is duplicated

class Metadata {
  public readonly tables: Record<string, TableMetadata> = {};
  public readonly entities: Record<string, EntityMetadata> = {};
}

// TODO is singleton right here...
export default new Metadata();
