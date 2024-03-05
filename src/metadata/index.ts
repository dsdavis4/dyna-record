import type SingleTableDesign from "../SingleTableDesign";
import { dateSerializer } from "../decorators";
import type { JoinTable, BelongsToLink } from "../relationships";
import type {
  ForeignKey,
  DeepRequired,
  MakeOptional,
  StringObj
} from "../types";
import { type NativeScalarAttributeValue } from "@aws-sdk/util-dynamodb";

// TODO refactor this file... its a mess

/**
 * Function that takes a attribute from a Dynamo table item, and serialize it to a non-Dynamo native type (EX: Date)
 */
type EntitySerializer = (param: NativeScalarAttributeValue) => any;

/**
 * Function that takes a attribute from an Entity which is not a native Dynamo type and serializes it a type that is supported by Dynamo
 */
type TableSerializer = (param: any) => NativeScalarAttributeValue;

type KeysAttributeMetadataOptions = MakeOptional<
  Omit<AttributeMetadataOptions, "nullable">,
  "alias"
>;

/**
 * Functions for serializing attribute types that are not native to Dynamo from table item -> entity and entity -> table item
 * EX: See '@DateAttribute'
 */
export interface Serializers {
  /**
   * Function to serialize a Dynamo table item attribute to Entity attribute. Used when the type defined on the entity is not a native type to Dynamo (EX: Date)
   */
  toEntityAttribute: EntitySerializer;
  /**
   * Function to serialize an Entity attribute to an attribute type that Dynamo supports. (EX: Date->string)
   */
  toTableAttribute: TableSerializer;
}

export interface AttributeMetadata {
  name: string;
  alias: string;
  nullable: boolean;
  serializers?: Serializers;
}

interface AttributeMetadataOptions {
  attributeName: string;
  alias: string;
  nullable: boolean;
  serializers?: Serializers;
}

type RelationshipType =
  | "HasMany"
  | "BelongsTo"
  | "HasOne"
  | "HasAndBelongsToMany";

export type EntityClass<T> = (new () => T) & typeof SingleTableDesign;
type Entity = new (...args: any) => SingleTableDesign | BelongsToLink;

export type ForeignKeyAttribute = keyof SingleTableDesign & ForeignKey;

interface RelationshipMetadataBase {
  type: RelationshipType;
  target: EntityClass<SingleTableDesign>;
  propertyName: keyof SingleTableDesign;
}

export interface BelongsToRelationship extends RelationshipMetadataBase {
  type: "BelongsTo";
  foreignKey: ForeignKeyAttribute;
}

export interface HasOneRelationship extends RelationshipMetadataBase {
  type: "HasOne";
  foreignKey: ForeignKeyAttribute;
}

export interface HasManyRelationship extends RelationshipMetadataBase {
  type: "HasMany";
  foreignKey: ForeignKeyAttribute;
}

export interface HasAndBelongsToManyRelationship
  extends RelationshipMetadataBase {
  type: "HasAndBelongsToMany";
  joinTableName: string;
}

export type RelationshipMetadata =
  | BelongsToRelationship
  | HasManyRelationship
  | HasOneRelationship
  | HasAndBelongsToManyRelationship;

export type DefaultTableKeys =
  | "id"
  | "type"
  | "createdAt"
  | "updatedAt"
  | "foreignKey"
  | "foreignEntityType";

type DefaultDateFields = "createdAt" | "updatedAt";

export type DefaultEntityFields = "id" | "type" | DefaultDateFields;
type DefaultBelongsToLinkFields =
  | DefaultEntityFields
  | "foreignKey"
  | "foreignEntityType";
type DefaultFields = DefaultEntityFields | DefaultBelongsToLinkFields;

const defaultTableKeys = { primaryKey: "PK", sortKey: "SK" } as const;

// TODO here.... I am on working on defaulting the alias field. This is working on the PR
//       I am trying to get the table fields to reverse, so as to better match attribute defaults.
//       Why did this break....
export const tableDefaultFields: Record<DefaultFields, DefaultTableKeys> = {
  id: "id",
  type: "type",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
  foreignKey: "foreignKey",
  foreignEntityType: "foreignEntityType"
} as const;

type AttributeMetadataStorage = Record<string, AttributeMetadata>;
type RelationshipMetadataStorage = Record<string, RelationshipMetadata>;
type TableMetadataStorage = Record<string, DeepRequired<TableMetadata>>;
type EntityMetadataStorage = Record<string, EntityMetadata>;
type JoinTableMetadataStorage = Record<string, JoinTableMetadata[]>;

export interface EntityMetadata {
  tableClassName: string; //
  attributes: AttributeMetadataStorage;
  relationships: RelationshipMetadataStorage;
}

export interface TableMetadata {
  name: string;
  // TODO start here last time I finished the effort to support dynamic key names
  //      this would be good to do next while I have more context
  //      determine if I want to keep this up here, or refactor so everything goes through primaryKeyAttribute props
  // TODO should I refactor places to get this from  primaryKeyAttribute ?
  primaryKey: string;
  sortKey: string;
  // TODO should I refactor so that these are not redefined on entitiy metadata
  primaryKeyAttribute: AttributeMetadata;
  sortKeyAttribute: AttributeMetadata;
  delimiter: string;
  defaultAttributes: Record<string, AttributeMetadata>;
  // TODO should this be typeAttribte, similiar to primary key and sort key attribute
  typeField: string;
}

export interface JoinTableMetadata {
  entity: EntityClass<SingleTableDesign>;
  foreignKey: keyof JoinTable<SingleTableDesign, SingleTableDesign>;
}

export type TableMetadataOptions = Omit<
  TableMetadata,
  | "primaryKey"
  | "sortKey"
  | "defaultAttributes"
  | "typeField"
  | "primaryKeyAttribute"
  | "sortKeyAttribute"
> & {
  // TODO would this read more clearly and be more flexible as Record<DefaultFields, {alias: string}> but use AttributeAliasOnlyProp
  // EX:
  // @Table({
  //   name: "temp-table",
  //   delimiter: "#",
  //   defaultFields: {
  //     id: {alias: "Id"},
  //   }
  // })
  defaultFields?: Record<DefaultFields, string>;
};

// TODO update private in here to be '#'
// TODO update any instance of private throughout the app to use '#'
class Metadata {
  private readonly tables: TableMetadataStorage = {};
  private readonly entities: EntityMetadataStorage = {};
  private readonly entityClasses: Entity[] = [];
  private readonly joinTables: JoinTableMetadataStorage = {};

  private initialized: boolean = false;

  /**
   * Returns entity metadata given an entity name
   * @param {string} entityName - Name of the entity
   * @returns Entity metadata
   */
  public getEntity(entityName: string): EntityMetadata {
    this.init();
    return this.entities[entityName];
  }

  /**
   * Returns table metadata given a table name
   * @param {string} tableName - Name of the table
   * @returns Table metadata
   */
  public getTable(tableName: string): DeepRequired<TableMetadata> {
    this.init();
    return this.tables[tableName];
  }

  /**
   * Returns table metadata for an entity given an entity name
   * @param {string} entityName - Name of the entity
   * @returns Table metadata
   */
  public getEntityTable(entityName: string): DeepRequired<TableMetadata> {
    this.init();
    const entityMetadata = this.getEntity(entityName);
    return this.getTable(entityMetadata.tableClassName);
  }

  /**
   * Returns JoinTable metadata by name
   * @param {string} joinTableName - Name of the JoinTable class
   * @returns joinTableName metadata
   */
  public getJoinTable(joinTableName: string): JoinTableMetadata[] {
    this.init();
    return this.joinTables[joinTableName];
  }

  /**
   * Returns attribute metadata for attributes defined directly on the entity, as well as table default attributes
   * @param entityName - Name of the Entity class
   * @returns - {@link AttributeMetadataStorage}
   */
  public getEntityAttributes(entityName: string): AttributeMetadataStorage {
    const entityMetadata = this.getEntity(entityName);
    const { defaultAttributes } = this.getTable(entityMetadata.tableClassName);
    return { ...entityMetadata.attributes, ...defaultAttributes };
  }

  /**
   * Add a table to metadata storage
   * @param tableClassName
   * @param options
   */
  public addTable(tableClassName: string, options: TableMetadataOptions): void {
    this.tables[tableClassName] = {
      primaryKey: "",
      sortKey: "",
      name: options.name,
      delimiter: options.delimiter,
      defaultAttributes: this.buildDefaultAttributes(options),
      typeField: options.defaultFields?.type ?? tableDefaultFields.type,
      // Placeholders, these are set later
      primaryKeyAttribute: {
        name: "",
        alias: defaultTableKeys.primaryKey,
        nullable: false,
        serializers: { toEntityAttribute: () => "", toTableAttribute: () => "" }
      },
      sortKeyAttribute: {
        name: "",
        alias: defaultTableKeys.sortKey,
        nullable: false,
        serializers: { toEntityAttribute: () => "", toTableAttribute: () => "" }
      }
    };
  }

  /**
   * Creates default attribute metadata. Use {@link tableDefaultFields} unless consuming table decorator specifies overrides
   * @param options - {@link TableMetadataOptions}
   * @returns
   */
  private buildDefaultAttributes(
    options: TableMetadataOptions
  ): Record<DefaultTableKeys, AttributeMetadata> {
    const defaultAttrsMeta = Object.entries(tableDefaultFields);
    const customDefaults: StringObj = options.defaultFields ?? {};

    return defaultAttrsMeta.reduce<Record<string, AttributeMetadata>>(
      (acc, [entityKey, tableKeyAlias]) => {
        const alias = customDefaults[entityKey] ?? tableKeyAlias;
        const dateFields: DefaultDateFields[] = ["createdAt", "updatedAt"];
        const isDateField = dateFields.includes(entityKey as DefaultDateFields);
        acc[alias] = {
          name: entityKey,
          alias,
          nullable: false,
          serializers: isDateField ? dateSerializer : undefined
        };
        return acc;
      },
      {}
    );
  }

  /**
   * Add an entity to metadata storage
   * @param entityName
   * @param tableName
   */
  public addEntity(entityClass: Entity, tableClassName: string): void {
    this.entityClasses.push(entityClass);
    this.entities[entityClass.name] = {
      tableClassName,
      attributes: {},
      relationships: {}
    };
  }

  /**
   * Adds a relationship to an Entity's metadata storage
   * @param entityName
   * @param options
   */
  public addEntityRelationship(
    entityName: string,
    options: RelationshipMetadata
  ): void {
    const entityMetadata = this.entities[entityName];
    if (entityMetadata.relationships[options.propertyName] === undefined) {
      entityMetadata.relationships[options.propertyName] = options;
    }
  }

  /**
   * Adds JoinTable metadata to storage
   * @param joinTableName
   * @param options
   */
  public addJoinTable(joinTableName: string, options: JoinTableMetadata): void {
    const metadata = this.joinTables[joinTableName];

    if (metadata === undefined) {
      this.joinTables[joinTableName] = [options];
    } else if (this.joinTables[joinTableName].length === 1) {
      // There can only be two tables in a join table
      this.joinTables[joinTableName].push(options);
    }
  }

  /**
   * Adds an attribute to an Entity's metadata storage
   * @param entityName
   * @param options
   */
  public addEntityAttribute(
    entityName: string,
    options: MakeOptional<AttributeMetadataOptions, "alias">
  ): void {
    const entityMetadata = this.entities[entityName];
    const { defaultAttributes } = this.tables[entityMetadata.tableClassName];

    // TODO how to not loop as much...
    //      Instead of doing that ^ I should refactor so default fields are on the table, instead of the entity
    const defaultAttrMeta = Object.values(defaultAttributes).find(
      attr => attr.name === options.attributeName
    );

    if (defaultAttrMeta === undefined) {
      const alias = options.alias ?? options.attributeName;
      const attrMeta = { ...options, alias };

      // If this is not one of the default attributes, build it from options
      entityMetadata.attributes[alias] = this.buildAttributeMetadata(attrMeta);
    } else {
      // If this is a default attribute, use default attribute settings
      entityMetadata.attributes[defaultAttrMeta.alias] = defaultAttrMeta;
    }
  }

  /**
   * Adds the primary key attribute to Table and Entity metadata storage
   * @param entityClass
   * @param options
   */
  public addPrimaryKeyAttribute(
    entityClass: SingleTableDesign,
    options: KeysAttributeMetadataOptions
  ): void {
    const tableMetadata = this.getEntityTableMetadata(entityClass);

    if (tableMetadata !== undefined) {
      const alias = options.alias ?? options.attributeName;
      const attrMeta = { ...options, nullable: false, alias };

      tableMetadata.primaryKey = alias;
      tableMetadata.primaryKeyAttribute = this.buildAttributeMetadata(attrMeta);

      // TODO if I refactor so that primary key attribute meta is only on the table metadata, and not replicated through all entity metadata, then I wont need htis
      this.addEntityAttribute(entityClass.constructor.name, attrMeta);
    }
  }

  /**
   * Adds the sort key attribute to Table and Entity metadata storage
   * @param entityClass
   * @param options
   */
  public addSortKeyAttribute(
    entityClass: SingleTableDesign,
    options: KeysAttributeMetadataOptions
  ): void {
    const tableMetadata = this.getEntityTableMetadata(entityClass);

    if (tableMetadata !== undefined) {
      const alias = options.alias ?? options.attributeName;
      const attrMeta = { ...options, nullable: false, alias };

      tableMetadata.sortKey = alias;
      tableMetadata.sortKeyAttribute = this.buildAttributeMetadata(attrMeta);

      // TODO if I refactor so that primary key attribute meta is only on the table metadata, and not replicated through all entity metadata, then I wont need htis
      this.addEntityAttribute(entityClass.constructor.name, attrMeta);
    }
  }

  /**
   * Initialize metadata object
   */
  private init(): void {
    if (!this.initialized) {
      // Initialize all entities once to trigger Attribute decorators and fill metadata object
      this.entityClasses.forEach(EntityClass => new EntityClass()); // TODO can I free up memory by clearing this out after init? Its only used here..
      this.initialized = true;
    }
  }

  /**
   * Recursively search prototype chain and return TableMetadata for an entity class if it exists
   * @param classPrototype
   * @returns
   */
  private getEntityTableMetadata(
    classPrototype: SingleTableDesign
  ): TableMetadata | undefined {
    const protoType: SingleTableDesign = Object.getPrototypeOf(classPrototype);

    if (protoType === null) return;

    if (this.tables[protoType.constructor.name] !== undefined) {
      return this.tables[protoType.constructor.name];
    } else {
      return this.getEntityTableMetadata(protoType);
    }
  }

  /**
   * Build an attribute metadata object from options
   * @param options - {@link AttributeMetadataOptions}
   * @returns
   */
  private buildAttributeMetadata(
    options: AttributeMetadataOptions
  ): AttributeMetadata {
    return {
      name: options.attributeName,
      alias: options.alias,
      nullable: options.nullable,
      serializers: options.serializers
    };
  }
}

export default new Metadata();
