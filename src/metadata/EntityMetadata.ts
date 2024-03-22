import {
  type AttributeMetadata,
  type AttributeMetadataStorage,
  type RelationshipMetadataStorage
} from ".";
import type NoOrm from "../NoOrm";

type EntityClass = new (...args: any) => NoOrm;

/**
 * Represents metadata for an entity within the ORM system, encapsulating information about the entity's attributes, relationships, and its associated database table.
 *
 * @property {string} tableClassName - The name of the table class instance to which this entity is mapped, providing a link between the entity and its database table.
 * @property {AttributeMetadataStorage} attributes - A storage mapping for attribute metadata, keyed by entity field names, enabling lookup of attribute configurations.
 * @property {AttributeMetadataStorage} tableAttributes - A storage mapping for attribute metadata, keyed by table column names (aliases), used for database interactions.
 * @property {RelationshipMetadataStorage} relationships - A storage for relationship metadata, facilitating the management of entity relationships.
 * @property {EntityClass} EntityClass - The constructor function of the entity class, allowing instantiation and further metadata enrichment.
 *
 * @param {EntityClass} entityClass - The constructor function of the entity class this metadata belongs to.
 * @param {string} tableClassName - The name of the table class instance that maps to the database table of the entity.
 */
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

  /**
   * Add attribute metadata to an entity
   * @param attrMeta
   */
  public addAttribute(attrMeta: AttributeMetadata): void {
    this.attributes[attrMeta.name] = attrMeta;
    this.tableAttributes[attrMeta.alias] = attrMeta;
  }
}

export default EntityMetadata;
