export interface AttributeMetadata {
  name: string;
}

// TODO this is copied in multiple places
type ObjectType<T> = { new (): T };

export interface EntityMetadata {
  tableName: string;
  attributes: Record<string, AttributeMetadata>;
  // TODO dont use any
  hasManies?: [any];
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
