import SingleTableDesign from "../SingleTableDesign";

export interface AttributeMetadata {
  name: string;
}

type RelationshipTypes = "HasMany" | "BelongsTo" | "HasOne";

type EntityClass<T> = { new (): T } & typeof SingleTableDesign;

interface RelationshipMetadataBase {
  type: RelationshipTypes;
  target: EntityClass<SingleTableDesign>;
  propertyName: keyof SingleTableDesign;
}

export interface BelongsToRelationship extends RelationshipMetadataBase {
  type: "BelongsTo";
  foreignKey: keyof SingleTableDesign;
}

export interface HasOneRelationship extends RelationshipMetadataBase {
  type: "HasOne";
  foreignKey: keyof SingleTableDesign;
}

export interface HasManyRelationship extends RelationshipMetadataBase {
  type: "HasMany";
  targetKey: keyof SingleTableDesign;
}

export type RelationshipMetadata =
  | BelongsToRelationship
  | HasManyRelationship
  | HasOneRelationship;

export interface EntityMetadata {
  // TODO should this be tableClassName?
  tableName: string; //
  attributes: Record<string, AttributeMetadata>;
  relationships: Record<string, RelationshipMetadata>;
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

export default new Metadata();
