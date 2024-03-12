import { AttributeMetadata } from ".";
import type SingleTableDesign from "../SingleTableDesign";
import { dateSerializer } from "../decorators";
import type { BelongsToLink } from "../relationships";
import type { MakeOptional } from "../types";
import type { AttributeMetadataOptions } from "./AttributeMetadata";

// TODO can anything in here be readonly?

// TODO can I refactor to make instance vars private

// TODO add typedoc for each of the attributes

type DefaultDateFields = "createdAt" | "updatedAt";

export type DefaultFields = keyof SingleTableDesign | keyof BelongsToLink;

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
  public name: string;
  // TODO start here I am working on cleaning up metadata storage - should I refactor so that these are not redefined on entitiy metadata
  // If I do I can get rid of the this.addEntityAttribute calls in the add primary key and sort key functions
  public primaryKeyAttribute: AttributeMetadata;
  public sortKeyAttribute: AttributeMetadata;
  public delimiter: string;
  public defaultAttributes: Record<DefaultFields, AttributeMetadata>;
  public defaultTableAttributes: Record<string, AttributeMetadata>;

  constructor(options: TableMetadataOptions) {
    const defaultAttrMeta = this.buildDefaultAttributesMetadata(options);

    this.name = options.name;
    this.delimiter = options.delimiter;
    // TODO instead of storing these, does it make sense to calculate each time its needed?
    //     What about for just one of the lookups?
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
