import { z } from "zod";
import { AttributeMetadata } from "./index.js";
import { dateSerializer } from "../decorators/attributes/serializers.js";
import type {
  AttributeKind,
  TableMetadataOptions,
  DefaultFields,
  TableDefaultFields,
  DefaultDateFields,
  KeysAttributeMetadataOptions,
  EntityMetadataStorage
} from "./types.js";
import {
  type SerializedTableMetadata,
  TableMetadataTransform
} from "./schemas.js";
import type VectorIndexMetadata from "./VectorIndexMetadata.js";
import DynamoClient from "../dynamo-utils/DynamoClient.js";
import {
  assertCanSend,
  resolveClient,
  type TableClientOptions
} from "../dynamo-utils/clientResolution.js";
import type { Optional } from "../types.js";

export const defaultTableKeys = { partitionKey: "PK", sortKey: "SK" } as const;

/**
 * Projection applied to ordinary reads (`findById`, `query`, internal
 * prefetches) on a table with a vector index, excluding the vector attribute.
 * DynamoDB has no exclusion form, so this is an inclusion list: the union of
 * table aliases across every entity mapped to the table, minus the vector
 * alias. The union is what makes it safe on adjacency-list queries whose
 * results span entity types. It saves network bytes and latency, not billed
 * capacity — reads bill on full item size regardless of projection
 */
export interface ReadProjection {
  /**
   * The `ProjectionExpression` string of `#`-aliased attribute names
   */
  expression: string;
  /**
   * The `ExpressionAttributeNames` entries backing the expression
   */
  attributeNames: Record<string, string>;
}

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
   *   - the library-managed vector attributes (reserved by prefix; see `reservedVectorAttributePrefix`)
   */
  public reservedKeys: Record<string, true>;

  /**
   * The vector-excluding {@link ReadProjection} applied to ordinary reads.
   * Set at metadata initialization, and only on tables that declare a vector
   * index — reads on tables without one are untouched. Never serialized
   * through {@link toJSON}
   */
  public readProjection?: ReadProjection;

  /**
   * How this table reaches DynamoDB, as declared on the Table decorator.
   * Never serialized through {@link toJSON} — a client config can carry
   * credentials
   */
  readonly #clientOptions: TableClientOptions;

  /**
   * Name of the table class, for error messages naming what to fix
   */
  readonly #tableClassName: string;

  /**
   * The resolved client, memoized on first use. Memoizing here is what makes
   * a client function run once per table, and what keeps tables configured
   * with different clients from sharing one
   */
  #dynamo: Optional<DynamoClient>;

  constructor(options: TableMetadataOptions, tableClassName: string) {
    const defaultAttrMeta = this.buildDefaultAttributesMetadata(options);

    this.#tableClassName = tableClassName;
    this.#clientOptions = TableMetadata.validateClientOptions(
      options,
      tableClassName
    );

    this.name = options.name;
    this.delimiter = options.delimiter ?? "#";
    this.defaultAttributes = defaultAttrMeta.entityDefaults;
    this.defaultTableAttributes = defaultAttrMeta.tableDefaults;
    // Placeholders, these are set later
    this.partitionKeyAttribute = {
      name: "",
      alias: defaultTableKeys.partitionKey,
      kind: "string",
      nullable: false,
      type: z.string()
    };
    this.sortKeyAttribute = {
      name: "",
      alias: defaultTableKeys.sortKey,
      kind: "string",
      nullable: false,
      type: z.string()
    };

    const defaultAttrNames = Object.keys(this.defaultAttributes);
    // Set the default keys as reserved keys, the user defined primary and sort key are set later.
    // Vector attribute names are reserved by prefix at metadata
    // initialization (see MetadataStorage.validateVectorSearchAliases), not
    // here — per-index attributes are unknown at table construction
    this.reservedKeys = Object.fromEntries(
      defaultAttrNames.map(key => [key, true])
    );
  }

  /**
   * The client every operation on this table sends through: the table's own
   * client, a client built from its config, or the shared default, resolved on
   * first use and reused thereafter
   */
  public get dynamo(): DynamoClient {
    this.#dynamo ??= new DynamoClient(
      resolveClient(this.#clientOptions, this.#tableClassName)
    );
    return this.#dynamo;
  }

  /**
   * Rejects client options the type system cannot, and checks a supplied client
   * eagerly so a misconfigured table fails where it is declared rather than on
   * its first query
   * @param options - The options passed to the Table decorator
   * @param tableClassName - Name of the table class being declared
   * @returns The client options, unchanged
   */
  private static validateClientOptions(
    options: TableMetadataOptions,
    tableClassName: string
  ): TableClientOptions {
    const { client, clientConfig } = options;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- TableClientOptions makes this unreachable by type, which is the point: only a JavaScript caller can declare both, and this is the check they get instead of a compile error
    if (client !== undefined && clientConfig !== undefined) {
      throw new Error(
        `Table ${tableClassName} declares both client and clientConfig. Declare one: clientConfig configures the client dyna-record builds, client replaces it`
      );
    }

    if (client !== undefined) {
      return { client: assertCanSend(client, tableClassName) };
    }

    if (clientConfig !== undefined) {
      return { clientConfig };
    }

    return {};
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
    const dateFields: DefaultDateFields[] = ["createdAt", "updatedAt"];

    return defaultAttrsMeta.reduce<{
      entityDefaults: Record<string, AttributeMetadata>;
      tableDefaults: Record<string, AttributeMetadata>;
    }>(
      (acc, [entityKey, tableKeyAlias]) => {
        const key = entityKey as DefaultFields;
        const { alias } = customDefaults[key] ?? tableKeyAlias;
        const isDateField = dateFields.includes(entityKey as DefaultDateFields);
        const kind: AttributeKind = isDateField ? "date" : "string";
        const meta = {
          name: entityKey,
          alias,
          kind,
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
   * Vector index metadata is emitted with the model descriptor's name only — never
   * the provider value, client config, or credentials.
   * @param {EntityMetadataStorage} entities - Entities that belong to this table, keyed by entity class name
   * @param {VectorIndexMetadata[]} vectorIndexes - Vector indexes defined on the table
   * @returns A plain object representation of the metadata
   */
  public toJSON(
    entities: EntityMetadataStorage,
    vectorIndexes: VectorIndexMetadata[] = []
  ): SerializedTableMetadata {
    return TableMetadataTransform.parse({
      name: this.name,
      delimiter: this.delimiter,
      defaultAttributes: this.defaultAttributes,
      defaultTableAttributes: this.defaultTableAttributes,
      partitionKeyAttribute: this.partitionKeyAttribute,
      sortKeyAttribute: this.sortKeyAttribute,
      reservedKeys: this.reservedKeys,
      entities,
      ...(vectorIndexes.length > 0 && { vectorIndexes })
    });
  }
}

export default TableMetadata;
