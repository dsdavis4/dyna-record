import type SingleTableDesign from "../SingleTableDesign";
import { type JoinTable, type BelongsToLink } from "../relationships";
import type { ForeignKey } from "../types";
import { type NativeScalarAttributeValue } from "@aws-sdk/util-dynamodb";

/**
 * Function that takes a attribute from a Dynamo table item, and serialize it to a non-Dynamo native type (EX: Date)
 */
type EntitySerializer = (param: NativeScalarAttributeValue) => any;

/**
 * Function that takes a attribute from an Entity which is not a native Dynamo type and serializes it a type that is supported by Dynamo
 */
type TableSerializer = (param: any) => NativeScalarAttributeValue;

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

export interface EntityMetadata {
  tableClassName: string; //
  attributes: Record<string, AttributeMetadata>;
  relationships: Record<string, RelationshipMetadata>;
}

export interface TableMetadata {
  name: string;
  primaryKey: string;
  sortKey: string;
  delimiter: string;
}

export interface JoinTableMetadata {
  entity: EntityClass<SingleTableDesign>;
  foreignKey: keyof JoinTable<SingleTableDesign, SingleTableDesign>;
}

export type TableMetadataNoKeys = Omit<TableMetadata, "primaryKey" | "sortKey">;

class Metadata {
  private readonly tables: Record<string, TableMetadata> = {};
  private readonly entities: Record<string, EntityMetadata> = {};
  private readonly entityClasses: Entity[] = [];
  private readonly joinTables: Record<string, JoinTableMetadata[]> = {};

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
  public getTable(tableName: string): TableMetadata {
    this.init();
    return this.tables[tableName];
  }

  /**
   * Returns table metadata for an entity given an entity name
   * @param {string} entityName - Name of the entity
   * @returns Table metadata
   */
  public getEntityTable(entityName: string): TableMetadata {
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
   * Add a table to metadata storage
   * @param tableClassName
   * @param options
   */
  public addTable(tableClassName: string, options: TableMetadataNoKeys): void {
    this.tables[tableClassName] = { ...options, primaryKey: "", sortKey: "" };
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
    options: AttributeMetadataOptions
  ): void {
    const entityMetadata = this.entities[entityName];

    if (entityMetadata.attributes[options.alias] === undefined) {
      entityMetadata.attributes[options.alias] = {
        name: options.attributeName,
        nullable: options.nullable,
        serializers: options.serializers
      };
    }
  }

  /**
   * Adds the primary key attribute to Table and Entity metadata storage
   * @param entityClass
   * @param options
   */
  public addPrimaryKeyAttribute(
    entityClass: SingleTableDesign,
    options: Omit<AttributeMetadataOptions, "nullable">
  ): void {
    const tableMetadata = this.getEntityTableMetadata(entityClass);

    if (tableMetadata !== undefined) {
      tableMetadata.primaryKey = options.alias;
    }

    this.addEntityAttribute(entityClass.constructor.name, {
      ...options,
      nullable: false
    });
  }

  /**
   * Adds the sort key attribute to Table and Entity metadata storage
   * @param entityClass
   * @param options
   */
  public addSortKeyAttribute(
    entityClass: SingleTableDesign,
    options: Omit<AttributeMetadataOptions, "nullable">
  ): void {
    const tableMetadata = this.getEntityTableMetadata(entityClass);

    if (tableMetadata !== undefined) {
      tableMetadata.sortKey = options.alias;
    }

    this.addEntityAttribute(entityClass.constructor.name, {
      ...options,
      nullable: false
    });
  }

  /**
   * Initialize metadata object
   */
  private init(): void {
    if (!this.initialized) {
      // Initialize all entities once to trigger Attribute decorators and fill metadata object
      this.entityClasses.forEach(EntityClass => new EntityClass());
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
}

export default new Metadata();
