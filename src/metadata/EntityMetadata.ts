import {
  type AttributeMetadata,
  type AttributeMetadataStorage,
  type RelationshipMetadataStorage
} from ".";
import type NoOrm from "../NoOrm";

type EntityClass = new (...args: any) => NoOrm;

class EntityMetadata {
  /**
   * The name of the table class instance to which this entity belongs
   */
  public readonly tableClassName: string; //
  /**
   * Attribute metadata, for looking up attribute metadata by entity key
   */
  public readonly attributes: AttributeMetadataStorage;
  /**
   * Attribute metadata, for looking up attribute metadata by table key
   */
  public readonly tableAttributes: AttributeMetadataStorage;

  /**
   * Relationship metadata. For looking up a relationship by entity key
   */
  public readonly relationships: RelationshipMetadataStorage;

  public readonly EntityClass: EntityClass;

  constructor(entityClass: EntityClass, tableClassName: string) {
    this.EntityClass = entityClass;

    this.tableClassName = tableClassName;
    this.attributes = {};
    this.tableAttributes = {};
    this.relationships = {};
  }

  public addAttribute(attrMeta: AttributeMetadata): void {
    this.attributes[attrMeta.name] = attrMeta;
    this.tableAttributes[attrMeta.alias] = attrMeta;
  }
}

export default EntityMetadata;
