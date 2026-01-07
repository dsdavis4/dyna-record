import { z } from "zod";
import type { EntityClass } from "../types";
import type DynaRecord from "../DynaRecord";

/**
 * Zod schema that transforms attribute metadata to a serializable format.
 * Extracts only serializable properties (name, alias, nullable) and converts
 * the foreignKeyTarget EntityClass reference to its class name string.
 *
 * @property {string} name - The name of the attribute as defined on the entity
 * @property {string} alias - The alias of the attribute as defined in the database table
 * @property {boolean} nullable - Indicates whether the attribute can be null
 * @property {EntityClass<DynaRecord>} [foreignKeyTarget] - Optional entity class reference that will be converted to its name string
 *
 * @returns A serialized attribute metadata object with foreignKeyTarget as a string (class name) if present
 */
const AttributeMetadataTransform = z
  .object({
    name: z.string(),
    alias: z.string(),
    nullable: z.boolean(),
    foreignKeyTarget: z.custom<EntityClass<DynaRecord>>().optional()
  })
  .transform(attr => ({
    name: attr.name,
    alias: attr.alias,
    nullable: attr.nullable,
    ...(attr.foreignKeyTarget != null && {
      foreignKeyTarget: attr.foreignKeyTarget.name
    })
  }));

/**
 * Zod schema that transforms relationship metadata to a serializable format.
 * Extracts serializable properties and converts EntityClass references to their class name strings.
 *
 * @property {string} type - The type of the relationship (e.g., "HasMany", "BelongsTo", "HasOne", "HasAndBelongsToMany", "OwnedBy")
 * @property {string} propertyName - The property name on the source entity that holds the relationship
 * @property {EntityClass<DynaRecord>} [target] - Optional target entity class reference that will be converted to its name string
 * @property {string} [foreignKey] - Optional foreign key property name
 * @property {string} [joinTableName] - Optional join table name for many-to-many relationships
 * @property {boolean} [uniDirectional] - Optional flag indicating if the relationship is unidirectional
 *
 * @returns A serialized relationship metadata object with EntityClass references converted to strings
 */
const RelationshipMetadataTransform = z
  .object({
    type: z.string(),
    propertyName: z.string(),
    target: z.custom<EntityClass<DynaRecord>>().optional(),
    foreignKey: z.string().optional(),
    joinTableName: z.string().optional(),
    uniDirectional: z.boolean().optional()
  })
  .transform(rel => ({
    type: rel.type,
    propertyName: rel.propertyName,
    ...(rel.target != null && { target: rel.target.name }),
    ...(rel.foreignKey != null && { foreignKey: rel.foreignKey }),
    ...(rel.joinTableName != null && { joinTableName: rel.joinTableName }),
    ...(rel.uniDirectional !== undefined && {
      uniDirectional: rel.uniDirectional
    })
  }));

/**
 * Zod schema that transforms entity metadata to a serializable format.
 * Extracts serializable properties and includes nested attribute and relationship metadata.
 *
 * @property {string} tableClassName - The name of the table class instance to which this entity belongs
 * @property {Record<string, AttributeMetadataTransform>} attributes - Attribute metadata keyed by entity field names
 * @property {Record<string, AttributeMetadataTransform>} tableAttributes - Attribute metadata keyed by table column names (aliases)
 * @property {Record<string, RelationshipMetadataTransform>} relationships - Relationship metadata keyed by entity property names
 * @property {string} [idField] - Optional custom id field name (used with @IdAttribute decorator)
 *
 * @returns A serialized entity metadata object with all nested metadata transformed
 */
const EntityMetadataTransform = z
  .object({
    tableClassName: z.string(),
    attributes: z.record(AttributeMetadataTransform),
    tableAttributes: z.record(AttributeMetadataTransform),
    relationships: z.record(RelationshipMetadataTransform),
    idField: z.string().optional()
  })
  .transform(entity => ({
    tableClassName: entity.tableClassName,
    attributes: entity.attributes,
    tableAttributes: entity.tableAttributes,
    relationships: entity.relationships,
    ...(entity.idField !== undefined &&
      entity.idField !== "" && { idField: entity.idField })
  }));

/**
 * Zod schema that transforms table metadata to a serializable format.
 * This is the main schema used to serialize {@link TableMetadata} instances,
 * extracting only serializable values and converting EntityClass references to strings.
 *
 * @property {string} name - The name of the table
 * @property {string} delimiter - The delimiter used in the table's composite keys (defaults to "#")
 * @property {Record<string, AttributeMetadataTransform>} defaultAttributes - Default attributes for the entity, keyed by entity field names
 * @property {Record<string, AttributeMetadataTransform>} defaultTableAttributes - Default attributes for the table, keyed by table field aliases
 * @property {AttributeMetadataTransform} partitionKeyAttribute - Metadata for the table's partition key attribute
 * @property {AttributeMetadataTransform} sortKeyAttribute - Metadata for the table's sort key attribute
 * @property {Record<string, EntityMetadataTransform>} entities - Entities mapped to the table, keyed by entity class name
 *
 * @returns A serialized table metadata object containing only serializable values
 *
 * @example
 * ```typescript
 * const metadata = TableMetadataTransform.parse(tableMetadataInstance);
 * // Returns a plain object with all EntityClass references converted to strings
 * ```
 */
export const TableMetadataTransform = z.object({
  name: z.string(),
  delimiter: z.string(),
  defaultAttributes: z.record(AttributeMetadataTransform),
  defaultTableAttributes: z.record(AttributeMetadataTransform),
  partitionKeyAttribute: AttributeMetadataTransform,
  sortKeyAttribute: AttributeMetadataTransform,
  entities: z.record(EntityMetadataTransform)
});

/**
 * Type representing the serialized output of table metadata.
 * This type is inferred from the {@link TableMetadataTransform} schema and represents
 * the structure of metadata after serialization, with all EntityClass references
 * converted to strings and all non-serializable data (functions, Zod types, serializers) removed.
 *
 * @example
 * ```typescript
 * const metadata: SerializedTableMetadata = User.metadata();
 * // metadata is a plain object with readonly properties
 * ```
 */
export type SerializedTableMetadata = z.output<typeof TableMetadataTransform>;
