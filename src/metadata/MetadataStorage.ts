import type SingleTableDesign from "../SingleTableDesign";
import type { ForeignKey, MakeOptional } from "../types";
import TableMetadata, {
  type DefaultFields,
  type TableMetadataOptions
} from "./TableMetadata";
import EntityMetadata from "./EntityMetadata";
import AttributeMetadata, {
  type AttributeMetadataOptions
} from "./AttributeMetadata";
import JoinTableMetadata from "./JoinTableMetadata";
import { createRelationshipInstance } from "./relationship-metadata/utils";
import type { RelationshipMetadata } from "./relationship-metadata";

type KeysAttributeMetadataOptions = MakeOptional<
  Omit<AttributeMetadataOptions, "nullable">,
  "alias"
>;

export type ForeignKeyAttribute = keyof SingleTableDesign & ForeignKey;

export type AttributeMetadataStorage = Record<string, AttributeMetadata>;
export type RelationshipMetadataStorage = Record<string, RelationshipMetadata>;
type TableMetadataStorage = Record<string, TableMetadata>;
type EntityMetadataStorage = Record<string, EntityMetadata>;
type JoinTableMetadataStorage = Record<string, JoinTableMetadata[]>;

// TODO update private in here to be '#'
// TODO update any instance of private throughout the app to use '#'
class MetadataStorage {
  private readonly tables: TableMetadataStorage = {};
  private readonly entities: EntityMetadataStorage = {};
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

  // TODO is this used..
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
    this.tables[tableClassName] = new TableMetadata(options);
  }

  /**
   * Add an entity to metadata storage
   * @param entityName
   * @param tableName
   */
  public addEntity(
    entityClass: EntityMetadata["EntityClass"],
    tableClassName: string
  ): void {
    this.entities[entityClass.name] = new EntityMetadata(
      entityClass,
      tableClassName
    );
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
      entityMetadata.relationships[options.propertyName] =
        createRelationshipInstance(options);
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
      const meta = new JoinTableMetadata(options.entity, options.foreignKey);
      this.joinTables[joinTableName] = [meta];
    } else if (this.joinTables[joinTableName].length === 1) {
      // There can only be two tables in a join table
      const meta = new JoinTableMetadata(options.entity, options.foreignKey);
      this.joinTables[joinTableName].push(meta);
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

    const defaultAttrMeta =
      defaultAttributes[options.attributeName as DefaultFields];

    if (defaultAttrMeta === undefined) {
      const alias = options.alias ?? options.attributeName;
      const attrMetaOptions = { ...options, alias };

      const meta = new AttributeMetadata(options);

      // If this is not one of the default attributes, build it from options
      entityMetadata.attributes[options.attributeName] = meta;
      entityMetadata.tableAttributes[attrMetaOptions.alias] = meta;
    } else {
      // If this is a default attribute, use default attribute settings
      entityMetadata.attributes[defaultAttrMeta.name] = defaultAttrMeta;
      entityMetadata.tableAttributes[defaultAttrMeta.alias] = defaultAttrMeta;
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
      const opts = { ...options, nullable: false };

      tableMetadata.primaryKeyAttribute = new AttributeMetadata(opts);

      // TODO if I refactor so that primary key attribute meta is only on the table metadata, and not replicated through all entity metadata, then I wont need htis
      this.addEntityAttribute(entityClass.constructor.name, opts);
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
      const opts = { ...options, nullable: false };

      tableMetadata.sortKeyAttribute = new AttributeMetadata(opts);

      // TODO if I refactor so that primary key attribute meta is only on the table metadata, and not replicated through all entity metadata, then I wont need htis
      this.addEntityAttribute(entityClass.constructor.name, opts);
    }
  }

  /**
   * Initialize metadata object
   */
  private init(): void {
    if (!this.initialized) {
      // Initialize all entities once to trigger Attribute decorators and fill metadata object
      Object.values(this.entities).forEach(
        entityMeta => new entityMeta.EntityClass()
      );
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

export default MetadataStorage;
