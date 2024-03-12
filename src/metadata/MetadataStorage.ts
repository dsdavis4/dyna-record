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

export type ForeignKeyAttribute = keyof SingleTableDesign & ForeignKey;

export type AttributeMetadataStorage = Record<string, AttributeMetadata>;
export type RelationshipMetadataStorage = Record<string, RelationshipMetadata>;
type TableMetadataStorage = Record<string, TableMetadata>;
type EntityMetadataStorage = Record<string, EntityMetadata>;
type JoinTableMetadataStorage = Record<string, JoinTableMetadata[]>;

// TODO update any instance of private throughout the app to use '#'
class MetadataStorage {
  readonly #tables: TableMetadataStorage = {};
  readonly #entities: EntityMetadataStorage = {};
  readonly #joinTables: JoinTableMetadataStorage = {};

  #initialized: boolean = false;

  /**
   * Returns entity metadata given an entity name
   * @param {string} entityName - Name of the entity
   * @returns Entity metadata
   */
  public getEntity(entityName: string): EntityMetadata {
    this.init();
    return this.#entities[entityName];
  }

  /**
   * Returns table metadata given a table name
   * @param {string} tableName - Name of the table
   * @returns Table metadata
   */
  public getTable(tableName: string): TableMetadata {
    this.init();
    return this.#tables[tableName];
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
    return this.#joinTables[joinTableName];
  }

  /**
   * Returns attribute metadata for attributes defined keyed by entity key
   * @returns - {@link AttributeMetadataStorage}
   */
  public getEntityAttributes(entityName: string): AttributeMetadataStorage {
    const entityMetadata = this.getEntity(entityName);
    const tableMeta = this.getTable(entityMetadata.tableClassName);

    return {
      ...entityMetadata.attributes,
      ...tableMeta.defaultAttributes,
      [tableMeta.primaryKeyAttribute.name]: tableMeta.primaryKeyAttribute,
      [tableMeta.sortKeyAttribute.name]: tableMeta.sortKeyAttribute
    };
  }

  /**
   * Returns attribute metadata for attributes defined keyed by table alias
   * @param entityName - Name of the Entity class
   * @returns - {@link AttributeMetadataStorage}
   */
  public getEntityTableAttributes(
    entityName: string
  ): AttributeMetadataStorage {
    const entityMetadata = this.getEntity(entityName);
    const tableMeta = this.getTable(entityMetadata.tableClassName);

    return {
      ...entityMetadata.tableAttributes,
      ...tableMeta.defaultTableAttributes,
      [tableMeta.primaryKeyAttribute.alias]: tableMeta.primaryKeyAttribute,
      [tableMeta.sortKeyAttribute.alias]: tableMeta.sortKeyAttribute
    };
  }

  /**
   * Add a table to metadata storage
   * @param tableClassName
   * @param options
   */
  public addTable(tableClassName: string, options: TableMetadataOptions): void {
    this.#tables[tableClassName] = new TableMetadata(options);
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
    this.#entities[entityClass.name] = new EntityMetadata(
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
    const entityMetadata = this.#entities[entityName];
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
    const metadata = this.#joinTables[joinTableName];

    if (metadata === undefined) {
      const meta = new JoinTableMetadata(options.entity, options.foreignKey);
      this.#joinTables[joinTableName] = [meta];
    } else if (this.#joinTables[joinTableName].length === 1) {
      // There can only be two tables in a join table
      const meta = new JoinTableMetadata(options.entity, options.foreignKey);
      this.#joinTables[joinTableName].push(meta);
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
    const entityMetadata = this.#entities[entityName];
    const { defaultAttributes } = this.#tables[entityMetadata.tableClassName];

    const defaultAttrMeta =
      defaultAttributes[options.attributeName as DefaultFields];

    // The property is a default field assign it, otherwise instantiate new AttributeMetadata
    const meta = defaultAttrMeta ?? new AttributeMetadata(options);
    entityMetadata.addAttribute(meta);
  }

  /**
   * Adds the primary key attribute to Table metadata storage
   * @param entityClass
   * @param options
   */
  public addPrimaryKeyAttribute(
    entityClass: SingleTableDesign,
    options: Parameters<TableMetadata["addPrimaryKeyAttribute"]>[number]
  ): void {
    const tableMetadata = this.getEntityTableMetadata(entityClass);

    if (tableMetadata !== undefined) {
      tableMetadata.addPrimaryKeyAttribute(options);
    }
  }

  /**
   * Adds the sort key attribute to Table metadata storage
   * @param entityClass
   * @param options
   */
  public addSortKeyAttribute(
    entityClass: SingleTableDesign,
    options: Parameters<TableMetadata["addPrimaryKeyAttribute"]>[number]
  ): void {
    const tableMetadata = this.getEntityTableMetadata(entityClass);

    if (tableMetadata !== undefined) {
      tableMetadata.addSortKeyAttribute(options);
    }
  }

  /**
   * Initialize metadata object
   */
  private init(): void {
    if (!this.#initialized) {
      // Initialize all entities once to trigger Attribute decorators and fill metadata object
      Object.values(this.#entities).forEach(
        entityMeta => new entityMeta.EntityClass()
      );
      this.#initialized = true;
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

    if (this.#tables[protoType.constructor.name] !== undefined) {
      return this.#tables[protoType.constructor.name];
    } else {
      return this.getEntityTableMetadata(protoType);
    }
  }
}

export default MetadataStorage;
