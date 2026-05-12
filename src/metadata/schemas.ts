import { z } from "zod";
import type { EntityClass } from "../types";
import type DynaRecord from "../DynaRecord";
import type { ObjectSchema } from "../decorators/attributes/types";

/**
 * Common serialized fields shared by every attribute kind.
 */
const baseAttributeShape = {
  name: z.string(),
  alias: z.string(),
  nullable: z.boolean()
};

const simpleAttributeShape = <K extends string>(kind: K) =>
  z.object({ ...baseAttributeShape, kind: z.literal(kind) });

/**
 * Zod schema that transforms attribute metadata to a serializable format.
 *
 * Emits a discriminated union keyed on `kind`. Every attribute carries
 * `{ name, alias, nullable, kind }`; some kinds carry an additional payload:
 *
 * - `kind: "enum"` → `values: readonly [string, ...string[]]`
 * - `kind: "object"` → `schema: ObjectSchema` (the user-authored schema)
 * - `kind: "foreignKey"` → `foreignKeyTarget: string` (target entity class name)
 *
 * Non-serializable internals (Zod types, serializers, partial types) are dropped.
 */
const AttributeMetadataTransform = z.discriminatedUnion("kind", [
  simpleAttributeShape("string"),
  simpleAttributeShape("number"),
  simpleAttributeShape("boolean"),
  simpleAttributeShape("date"),
  z
    .object({
      ...baseAttributeShape,
      kind: z.literal("enum"),
      enumValues: z.array(z.string()).nonempty()
    })
    .transform(({ enumValues, ...rest }) => ({
      ...rest,
      values: enumValues
    })),
  z.object({
    ...baseAttributeShape,
    kind: z.literal("object"),
    objectSchema: z.custom<ObjectSchema>()
  }).transform(({ objectSchema, ...rest }) => ({
    ...rest,
    schema: objectSchema
  })),
  z
    .object({
      ...baseAttributeShape,
      kind: z.literal("foreignKey"),
      foreignKeyTarget: z.custom<EntityClass<DynaRecord>>()
    })
    .transform(({ foreignKeyTarget, ...rest }) => ({
      ...rest,
      foreignKeyTarget: foreignKeyTarget.name
    }))
]);

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
    attributes: z.record(z.string(), AttributeMetadataTransform),
    tableAttributes: z.record(z.string(), AttributeMetadataTransform),
    relationships: z.record(z.string(), RelationshipMetadataTransform),
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
  defaultAttributes: z.record(z.string(), AttributeMetadataTransform),
  defaultTableAttributes: z.record(z.string(), AttributeMetadataTransform),
  partitionKeyAttribute: AttributeMetadataTransform,
  sortKeyAttribute: AttributeMetadataTransform,
  entities: z.record(z.string(), EntityMetadataTransform)
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
