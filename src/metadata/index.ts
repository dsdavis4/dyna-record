export interface AttributeMetadata {
  name: string;
}

export interface EntityMetadata {
  // TODO should this be tableClassName?
  tableName: string; //
  attributes: Record<string, AttributeMetadata>;
  // TODO dont use any
  // hasManies?: [any];
}

export interface TableMetadata {
  name: string;
  primaryKey: string;
  sortKey: string;
  delimiter: string;
}

// TODO could I do something similiar for attributes?
// TODO make sure these are all needed
export interface RelationshipMetadata {
  type: "HasMany" | "BelongsTo";
  // Function to obtain Class to which relationship is applied
  target: Function;
  // Property name on the target class
  // targetPropertyName: string; // TODO is this needed? Shpuld it be called inverse?
  propertyName: string;

  // props: TODO need to add...?
}

class Metadata {
  public readonly tables: Record<string, TableMetadata> = {};
  public readonly entities: Record<string, EntityMetadata> = {};
  public readonly relationships: RelationshipMetadata[] = [];
}

// TODO is singleton right here...
export default new Metadata();
