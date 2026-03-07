import { z, ZodError, type ZodType } from "zod";
import type {
  BelongsToRelationship,
  HasRelationships,
  AttributeMetadata,
  AttributeMetadataStorage,
  RelationshipMetadataStorage,
  RelationshipMetadata,
  OwnedByRelationship,
  BelongsToOrOwnedByRelationship,
  ForeignKeyAttributeMetadata
} from ".";
import type DynaRecord from "../DynaRecord";
import { ValidationError } from "../errors";
import { type EntityDefinedAttributes } from "../operations";
import Metadata from ".";
import {
  isBelongsToRelationship,
  isHasAndBelongsToManyRelationship,
  isHasManyRelationship,
  isHasOneRelationship,
  isOwnedByRelationship,
  isRelationshipMetadataWithForeignKey,
  isForeignKeyAttributeMetadata
} from "./utils";

type EntityClass = new (...args: unknown[]) => DynaRecord;

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
   * Optional attribute of an entity, used with @IdAttribute decorator when an entity has a custom id field
   */
  public idField?: string;

  /**
   * Zod schema for runtime validation on entity attributes. Validates all attributes (used on Create)
   */
  #schema?: ZodType;

  /**
   * Zod schema for runtime validation on entity attributes. Validates partial attributes (used on Update)
   */
  #schemaPartial?: ZodType;

  /**
   * Object containing zod attributes. Built programmatically via decorators and used to create schemas
   */
  #zodAttributes: Record<string, ZodType> = {};

  /**
   * Object containing zod attributes for partial (update) validation.
   * ObjectAttributes use their partialType; others use the standard type.
   */
  #zodPartialAttributes: Record<string, ZodType> = {};

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
    this.#zodPartialAttributes[attrMeta.name] =
      attrMeta.partialType ?? attrMeta.type;
  }

  /**
   * Parse raw entity defined attributes (not reserved/relationship attributes) from input and ensure they are entity defined attributes.
   * Any reserved attributes such as primary key, sort key, id, type ,createdAt, updatedAt etc will be omitted.
   * If any attributes do not match their schema, a ValidationError is thrown
   * @param attributes
   */
  public parseRawEntityDefinedAttributes(
    attributes: EntityDefinedAttributes<DynaRecord>
  ): EntityDefinedAttributes<DynaRecord> {
    if (this.#schema === undefined) {
      const tableMeta = Metadata.getTable(this.tableClassName);
      const omitKeys = this.filterReservedKeys(
        tableMeta.reservedKeys,
        this.#zodAttributes
      );
      this.#schema = z.object(this.#zodAttributes).omit(omitKeys);
    }

    try {
      return this.#schema.parse(
        attributes
      ) as EntityDefinedAttributes<DynaRecord>;
    } catch (error) {
      throw this.buildValidationError(error);
    }
  }

  /**
   * Partial parse raw entity defined attributes (not reserved/relationship attributes) from input and ensure they are entity defined attributes.
   * This is similar to `parseRawEntityDefinedAttributes` but will do a partial validation, only validating the entity defined attributes that are present and not rejected if fields are missing.
   * Any reserved attributes such as primary key, sort key, id, type ,createdAt, updatedAt etc will be omitted.
   * If any attributes do not match their schema, a ValidationError is thrown
   * @param attributes
   */
  public parseRawEntityDefinedAttributesPartial(
    attributes: Partial<EntityDefinedAttributes<DynaRecord>>
  ): Partial<EntityDefinedAttributes<DynaRecord>> {
    if (this.#schemaPartial === undefined) {
      const tableMeta = Metadata.getTable(this.tableClassName);
      const omitKeys = this.filterReservedKeys(
        tableMeta.reservedKeys,
        this.#zodPartialAttributes
      );
      this.#schemaPartial = z
        .object(this.#zodPartialAttributes)
        .omit(omitKeys)
        .partial()
        .transform((data: Record<string, unknown>) => {
          // Remove undefined values but keep null values
          const result: Record<string, unknown> = {};
          for (const key in data) {
            if (data[key] !== undefined) {
              result[key] = data[key];
            }
          }
          return result;
        });
    }

    try {
      return this.#schemaPartial.parse(attributes) as Partial<
        EntityDefinedAttributes<DynaRecord>
      >;
    } catch (error) {
      throw this.buildValidationError(error);
    }
  }

  /**
   * Filters reserved keys to only include keys present in the given attributes.
   * Zod v4 throws on .omit() with keys not in the schema.
   */
  private filterReservedKeys(
    reservedKeys: Record<string, true>,
    attributes: Record<string, ZodType>
  ): Record<string, true> {
    const filtered: Record<string, true> = {};
    for (const key of Object.keys(reservedKeys)) {
      if (key in attributes) {
        filtered[key] = true;
      }
    }
    return filtered;
  }

  /**
   * Build validation errors with the cause
   * @param error
   */
  private buildValidationError(error: unknown): ValidationError {
    const errorOptions =
      error instanceof ZodError ? { cause: error.issues } : undefined;
    return new ValidationError("Validation errors", errorOptions);
  }

  /**
   * Returns all relationship metadata for the entity
   */
  public get allRelationships(): RelationshipMetadata[] {
    return Object.values(this.relationships);
  }

  /**
   * Returns the BelongsToRelationship  (bidirectional to parent) metadata for the entity
   */
  public get belongsToRelationships(): BelongsToRelationship[] {
    return Object.values(this.relationships).filter(rel =>
      isBelongsToRelationship(rel)
    );
  }

  /**
   * Returns the OwnedByRelationship (unidirectional to parent) relationship metadata for an entity
   */
  public get ownedByRelationships(): OwnedByRelationship[] {
    return Object.values(this.relationships).filter(relMeta =>
      isOwnedByRelationship(relMeta)
    );
  }

  /**
   * Returns the BelongsToRelationship and OwnedByRelationship metadata objects for an entity
   */
  public get belongsToOrOwnedByRelationships(): BelongsToOrOwnedByRelationship[] {
    return [...this.belongsToRelationships, ...this.ownedByRelationships];
  }

  /**
   * Returns the "Has" relationship metadata for the entity (EX: "HasMany")
   */
  public get hasRelationships(): HasRelationships {
    return Object.values(this.relationships).filter(
      relMeta =>
        isHasOneRelationship(relMeta) ||
        isHasManyRelationship(relMeta) ||
        isHasAndBelongsToManyRelationship(relMeta)
    );
  }

  /**
   * Returns attribute metadata for attributes that reference a foreign entity via {@link ForeignKeyAttribute}.
   * The returned metadata guarantees a non-null {@link ForeignKeyAttributeMetadata.foreignKeyTarget}.
   */
  public get foreignKeyAttributes(): ForeignKeyAttributeMetadata[] {
    return Object.values(this.attributes).filter(isForeignKeyAttributeMetadata);
  }

  /**
   * Returns foreign key attributes that are not linked through a relationship decorator.
   * These attributes rely on standalone referential integrity checks during create and update operations.
   */
  public get standaloneForeignKeyAttributes(): ForeignKeyAttributeMetadata[] {
    const associatedForeignKeys = new Set<string>(
      Object.values(this.relationships)
        .filter(isRelationshipMetadataWithForeignKey)
        .map(rel => rel.foreignKey.toString())
    );

    return this.foreignKeyAttributes.filter(
      attr => !associatedForeignKeys.has(attr.name)
    );
  }
}

export default EntityMetadata;
