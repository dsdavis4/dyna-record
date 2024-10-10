import { z, ZodError, type ZodSchema, type ZodType } from "zod";
import {
  type AttributeMetadata,
  type AttributeMetadataStorage,
  type RelationshipMetadataStorage
} from ".";
import type DynaRecord from "../DynaRecord";
import { ValidationError } from "../errors";
import { type EntityAttributes } from "../operations";

type EntityClass = new (...args: any) => DynaRecord;

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

  /**
   * Zod schema for runtime validation on entity attributes. Validates all attributes (used on Create)
   */
  #schema?: ZodSchema;

  /**
   * Zod schema for runtime validation on entity attributes. Validates partial attributes (used on Update)
   */
  #schemaPartial?: ZodSchema;

  /**
   * Object containing zod attributes. Built programmatically via decorators and used to create schemas
   */
  #zodAttributes: Record<string, ZodType> = {};

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

    this.#zodAttributes[attrMeta.name] = attrMeta.type;
  }

  /**
   * Validate all an entities attributes (used on create)
   * @param attributes
   */
  public validateFull(attributes: EntityAttributes<DynaRecord>): void {
    if (this.#schema === undefined) {
      this.#schema = z.object(this.#zodAttributes);
    }

    try {
      this.#schema.parse(attributes);
    } catch (error) {
      this.handleValidationError(error);
    }
  }

  // In which case I think this needs to be renamed? or a new method and this validates pre input?
  // Are changes needed to validate full as well?
  /**
   * Validate partial entities attributes (used on update)
   * @param attributes
   */
  public validatePartial(attributes: Partial<DynaRecord>): void {
    if (this.#schemaPartial === undefined) {
      this.#schemaPartial = z.object(this.#zodAttributes).partial();
    }

    try {
      this.#schemaPartial.parse(attributes);
    } catch (error) {
      this.handleValidationError(error);
    }
  }

  /**
   * Throw validation errors with the cause
   * @param error
   */
  private handleValidationError(error: unknown): void {
    const errorOptions =
      error instanceof ZodError ? { cause: error.issues } : undefined;
    throw new ValidationError("Validation errors", errorOptions);
  }
}

export default EntityMetadata;
