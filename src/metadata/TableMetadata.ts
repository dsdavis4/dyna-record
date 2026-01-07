import { z } from "zod";
import { AttributeMetadata } from ".";
import { dateSerializer } from "../decorators";
import type {
  TableMetadataOptions,
  DefaultFields,
  TableDefaultFields,
  DefaultDateFields,
  KeysAttributeMetadataOptions,
  EntityMetadataStorage
} from "./types";
import {
  type SerializedTableMetadata,
  TableMetadataTransform
} from "./schemas";

export const defaultTableKeys = { partitionKey: "PK", sortKey: "SK" } as const;

/**
 * Default fields with default table alias. Can be overwritten through {@link TableMetadataOptions} defaultFields
 */
export const tableDefaultFields: Record<
  DefaultFields,
  { alias: DefaultFields }
> = {
  id: { alias: "id" },
  type: { alias: "type" },
  createdAt: { alias: "createdAt" },
  updatedAt: { alias: "updatedAt" }
} as const;

/**
 * Represents the metadata for a table within the ORM framework, encapsulating information such as table name, key attributes, and default field mappings. This class is fundamental for defining how entities are mapped to their underlying database tables, providing a schema-like structure that includes both key configuration and default attribute handling.
 *
 * The metadata includes the partition and sort key attributes of the table, which are essential for database operations. It also provides a mechanism to include default attributes and their mappings, supporting common fields like `id`, `type`, `createdAt`, and `updatedAt`, along with their serialization strategies, particularly for date fields.
 *
 * @property {string} name - The name of the table.
 * @property {string} delimiter - A delimiter used in the table's composite keys. Defaults to `#`
 * @property {Record<DefaultFields, AttributeMetadata>} defaultAttributes - A record of default attributes for the entity, keyed by entity field names.
 * @property {Record<string, AttributeMetadata>} defaultTableAttributes - A record of default attributes for the table, keyed by table field aliases.
 * @property {AttributeMetadata} partitionKeyAttribute - Metadata for the table's partition key attribute.
 * @property {AttributeMetadata} sortKeyAttribute - Metadata for the table's sort key attribute.
 * @property {EntityMetadataStorage} entities - A record of entities that are mapped to the table, keyed by entity class name.
 *
 * @param {TableMetadataOptions} options - Configuration options for the table metadata.
 */
class TableMetadata {
  public readonly name: string;
  public readonly delimiter: string;
  public readonly defaultAttributes: Record<DefaultFields, AttributeMetadata>;
  public readonly defaultTableAttributes: Record<string, AttributeMetadata>;
  public partitionKeyAttribute: AttributeMetadata;
  public sortKeyAttribute: AttributeMetadata;
  public readonly entities: EntityMetadataStorage = {};

  /**
   * Represents the keys that should be excluded from schema validation.
   * These keys are reserved by dyna-record and should be managed internally.
   *
   * While dyna-record employs type guards to prevent the setting of these keys,
   * this ensures additional runtime validation.
   *
   * The reserved keys include:
   *   - pk
   *   - sk
   *   - id
   *   - type
   *   - createdAt
   *   - updatedAt
   *   - foreignKey
   *   - foreignEntityType
   */
  public reservedKeys: Record<string, true>;

  constructor(options: TableMetadataOptions) {
    const defaultAttrMeta = this.buildDefaultAttributesMetadata(options);

    this.name = options.name;
    this.delimiter = options.delimiter ?? "#";
    this.defaultAttributes = defaultAttrMeta.entityDefaults;
    this.defaultTableAttributes = defaultAttrMeta.tableDefaults;
    // Placeholders, these are set later
    this.partitionKeyAttribute = {
      name: "",
      alias: defaultTableKeys.partitionKey,
      nullable: false,
      type: z.string()
    };
    this.sortKeyAttribute = {
      name: "",
      alias: defaultTableKeys.sortKey,
      nullable: false,
      type: z.string()
    };

    const defaultAttrNames = Object.keys(this.defaultAttributes);
    // Set the default keys as reserved keys, the user defined primary and sort key are set later
    this.reservedKeys = Object.fromEntries(
      defaultAttrNames.map(key => [key, true])
    );
  }

  /**
   * Creates default attribute metadata. Use {@link tableDefaultFields} unless consuming table decorator specifies overrides
   * @param options - {@link TableMetadataOptions}
   * @returns
   */
  private buildDefaultAttributesMetadata(options: TableMetadataOptions): {
    entityDefaults: TableMetadata["defaultAttributes"];
    tableDefaults: TableMetadata["defaultTableAttributes"];
  } {
    const defaultAttrsMeta = Object.entries(tableDefaultFields);
    const customDefaults: Partial<TableDefaultFields> =
      options.defaultFields ?? {};

    return defaultAttrsMeta.reduce<{
      entityDefaults: Record<string, AttributeMetadata>;
      tableDefaults: Record<string, AttributeMetadata>;
    }>(
      (acc, [entityKey, tableKeyAlias]) => {
        const key = entityKey as DefaultFields;
        const { alias } = customDefaults[key] ?? tableKeyAlias;
        const dateFields: DefaultDateFields[] = ["createdAt", "updatedAt"];
        const isDateField = dateFields.includes(entityKey as DefaultDateFields);
        const meta = {
          name: entityKey,
          alias,
          nullable: false,
          serializers: isDateField ? dateSerializer : undefined,
          type: isDateField ? z.date() : z.string()
        };
        acc.entityDefaults[entityKey] = meta;
        acc.tableDefaults[alias] = meta;
        return acc;
      },
      { entityDefaults: {}, tableDefaults: {} }
    );
  }

  /**
   * Adds the partition key attribute to Table metadata storage
   * @param options
   */
  public addPartitionKeyAttribute(options: KeysAttributeMetadataOptions): void {
    const opts = { ...options, nullable: false };
    this.partitionKeyAttribute = new AttributeMetadata(opts);
    // Set the user defined primary key as reserved key so that its managed by dyna-record
    this.reservedKeys[options.attributeName] = true;
  }

  /**
   * Adds the sort key attribute to Table metadata storage
   * @param options
   */
  public addSortKeyAttribute(options: KeysAttributeMetadataOptions): void {
    const opts = { ...options, nullable: false };
    this.sortKeyAttribute = new AttributeMetadata(opts);
    // Set the user defined primary key as reserved key so that its managed by dyna-record
    this.reservedKeys[options.attributeName] = true;
  }

  /**
   * Serializes the table metadata to a plain object containing only serializable values.
   * This removes functions, Zod types, serializers, and other non-serializable data.
   * @returns A plain object representation of the metadata
   */
  public toJSON(): SerializedTableMetadata {
    return TableMetadataTransform.parse(this);
  }
}

export default TableMetadata;
