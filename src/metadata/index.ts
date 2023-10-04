import type SingleTableDesign from "../SingleTableDesign";
import { type BelongsToLink } from "../relationships";

interface AttributeMetadata {
  name: string;
}

interface AttributeMetadataOptions {
  attributeName: string;
  alias: string;
}

type RelationshipType = "HasMany" | "BelongsTo" | "HasOne";

export type EntityClass<T> = (new () => T) & typeof SingleTableDesign;
type Entity = new (...args: any) => SingleTableDesign | BelongsToLink;

interface RelationshipMetadataBase {
  type: RelationshipType;
  target: EntityClass<SingleTableDesign>;
  propertyName: keyof SingleTableDesign;
}

export interface BelongsToRelationship extends RelationshipMetadataBase {
  type: "BelongsTo";
  foreignKey: keyof SingleTableDesign;
}

export interface HasOneRelationship extends RelationshipMetadataBase {
  type: "HasOne";
  foreignKey: keyof SingleTableDesign;
}

export interface HasManyRelationship extends RelationshipMetadataBase {
  type: "HasMany";
  targetKey: keyof SingleTableDesign;
}

export type RelationshipMetadata =
  | BelongsToRelationship
  | HasManyRelationship
  | HasOneRelationship;

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

export type TableMetadataNoKeys = Omit<TableMetadata, "primaryKey" | "sortKey">;

// TODO make jsdoc in this class better. See SingleTableDesign

class Metadata {
  private readonly tables: Record<string, TableMetadata> = {};
  private readonly entities: Record<string, EntityMetadata> = {};

  private initialized: boolean = false;
  private readonly entityClasses: Entity[] = [];

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
  public addEntity(
    // entityClass: typeof SingleTableDesign | typeof BelongsToLink,
    entityClass: Entity,
    tableClassName: string
  ): void {
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
        name: options.attributeName
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
    options: AttributeMetadataOptions
  ): void {
    const tableMetadata = this.getEntityTableMetadata(entityClass);

    if (tableMetadata !== undefined) {
      tableMetadata.primaryKey = options.alias;
    }

    this.addEntityAttribute(entityClass.constructor.name, options);
  }

  /**
   * Adds the sort key attribute to Table and Entity metadata storage
   * @param entityClass
   * @param options
   */
  public addSortKeyAttribute(
    entityClass: SingleTableDesign,
    options: AttributeMetadataOptions
  ): void {
    const tableMetadata = this.getEntityTableMetadata(entityClass);

    if (tableMetadata !== undefined) {
      tableMetadata.sortKey = options.alias;
    }

    this.addEntityAttribute(entityClass.constructor.name, options);
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
    const protoType = Object.getPrototypeOf(classPrototype);

    if (protoType === null) return;

    if (this.tables[protoType.constructor.name] !== undefined) {
      return this.tables[protoType.constructor.name];
    } else {
      return this.getEntityTableMetadata(protoType);
    }
  }
}

export default new Metadata();
