import { AttributeMetadata } from ".";
import type NoOrm from "../NoOrm";
import { dateSerializer } from "../decorators";
import type { BelongsToLink } from "../relationships";
import type { MakeOptional } from "../types";
import type { AttributeMetadataOptions } from "./AttributeMetadata";

// TODO add typedoc for each of the attributes

type DefaultDateFields = "createdAt" | "updatedAt";

export type DefaultFields = keyof NoOrm | keyof BelongsToLink;

const defaultTableKeys = { primaryKey: "PK", sortKey: "SK" } as const;

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

type TableDefaultFields = Record<
  DefaultFields,
  Pick<AttributeMetadata, "alias">
>;

export type TableMetadataOptions = Pick<TableMetadata, "name" | "delimiter"> & {
  defaultFields?: Partial<TableDefaultFields>;
};

type KeysAttributeMetadataOptions = MakeOptional<
  Omit<AttributeMetadataOptions, "nullable">,
  "alias"
>;

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
