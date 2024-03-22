import { AttributeMetadata } from ".";
import { dateSerializer } from "../decorators";
import type {
  TableMetadataOptions,
  DefaultFields,
  TableDefaultFields,
  DefaultDateFields,
  KeysAttributeMetadataOptions
} from "./types";

// TODO this should be updated everywhere to be partitionKey
export const defaultTableKeys = { primaryKey: "PK", sortKey: "SK" } as const;

// TODO typedoc
export const tableDefaultFields: Record<
  DefaultFields,
  { alias: DefaultFields }
> = {
  id: { alias: "id" },
  type: { alias: "type" },
  createdAt: { alias: "createdAt" },
  updatedAt: { alias: "updatedAt" },
  foreignKey: { alias: "foreignKey" },
  foreignEntityType: { alias: "foreignEntityType" }
} as const;

/**
 * Represents the metadata for a table within the ORM framework, encapsulating information such as table name, key attributes, and default field mappings. This class is fundamental for defining how entities are mapped to their underlying database tables, providing a schema-like structure that includes both key configuration and default attribute handling.
 *
 * The metadata includes the primary and sort key attributes of the table, which are essential for database operations. It also provides a mechanism to include default attributes and their mappings, supporting common fields like `id`, `type`, `createdAt`, and `updatedAt`, along with their serialization strategies, particularly for date fields.
 *
 * @property {string} name - The name of the table.
 * @property {string} delimiter - A delimiter used in the table's composite keys.
 * @property {Record<DefaultFields, AttributeMetadata>} defaultAttributes - A record of default attributes for the entity, keyed by entity field names.
 * @property {Record<string, AttributeMetadata>} defaultTableAttributes - A record of default attributes for the table, keyed by table field aliases.
 * @property {AttributeMetadata} primaryKeyAttribute - Metadata for the table's primary key attribute.
 * @property {AttributeMetadata} sortKeyAttribute - Metadata for the table's sort key attribute.
 *
 * @param {TableMetadataOptions} options - Configuration options for the table metadata.
 */
class TableMetadata {
  public readonly name: string;
  public readonly delimiter: string;
  public readonly defaultAttributes: Record<DefaultFields, AttributeMetadata>;
  public readonly defaultTableAttributes: Record<string, AttributeMetadata>;
  public primaryKeyAttribute: AttributeMetadata;
  public sortKeyAttribute: AttributeMetadata;

  constructor(options: TableMetadataOptions) {
    const defaultAttrMeta = this.buildDefaultAttributesMetadata(options);

    this.name = options.name;
    this.delimiter = options.delimiter;
    this.defaultAttributes = defaultAttrMeta.entityDefaults;
    this.defaultTableAttributes = defaultAttrMeta.tableDefaults;
    // Placeholders, these are set later
    this.primaryKeyAttribute = {
      name: "",
      alias: defaultTableKeys.primaryKey,
      nullable: false,
      serializers: { toEntityAttribute: () => "", toTableAttribute: () => "" }
    };
    this.sortKeyAttribute = {
      name: "",
      alias: defaultTableKeys.sortKey,
      nullable: false,
      serializers: { toEntityAttribute: () => "", toTableAttribute: () => "" }
    };
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
          serializers: isDateField ? dateSerializer : undefined
        };
        acc.entityDefaults[entityKey] = meta;
        acc.tableDefaults[alias] = meta;
        return acc;
      },
      { entityDefaults: {}, tableDefaults: {} }
    );
  }

  /**
   * Adds the primary key attribute to Table metadata storage
   * @param options
   */
  public addPrimaryKeyAttribute(options: KeysAttributeMetadataOptions): void {
    const opts = { ...options, nullable: false };
    this.primaryKeyAttribute = new AttributeMetadata(opts);
  }

  /**
   * Adds the sort key attribute to Table metadata storage
   * @param options
   */
  public addSortKeyAttribute(options: KeysAttributeMetadataOptions): void {
    const opts = { ...options, nullable: false };
    this.sortKeyAttribute = new AttributeMetadata(opts);
  }
}

export default TableMetadata;
