import type { AttributeMetadataStorage, RelationshipMetadataStorage } from ".";
import type SingleTableDesign from "../SingleTableDesign";

// TODO can I refactor to make instance vars private

type EntityClass = new (...args: any) => SingleTableDesign;

// TODO can anything in here be readonly?

class EntityMetadata {
  /**
   * The name of the table class instance to which this entity belongs
   */
  public tableClassName: string; //
  /**
   * Attribute metadata, for looking up attribute metadata by entity key
   */
  public attributes: AttributeMetadataStorage;
  /**
   * Attribute metadata, for looking up attribute metadata by table key
   */
  public tableAttributes: AttributeMetadataStorage;
  // TODO evaluate if there is a better way to store.. can I store in a wway where I dont need to make relationship lookup items
  public relationships: RelationshipMetadataStorage;

  public readonly EntityClass: EntityClass;

  constructor(entityClass: EntityClass, tableClassName: string) {
    this.EntityClass = entityClass;

    this.tableClassName = tableClassName;
    this.attributes = {};
    this.tableAttributes = {};
    this.relationships = {};
  }
}

export default EntityMetadata;
