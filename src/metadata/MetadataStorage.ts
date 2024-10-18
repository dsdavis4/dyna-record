import type DynaRecord from "../DynaRecord";
import type { MakeOptional } from "../types";
import TableMetadata from "./TableMetadata";
import EntityMetadata from "./EntityMetadata";
import AttributeMetadata from "./AttributeMetadata";
import JoinTableMetadata from "./JoinTableMetadata";
import { createRelationshipInstance } from "./relationship-metadata/utils";
import type { RelationshipMetadata } from "./relationship-metadata";
import type {
  AttributeMetadataStorage,
  DefaultFields,
  EntityMetadataStorage,
  JoinTableMetadataStorage,
  TableMetadataOptions,
  TableMetadataStorage,
  AttributeMetadataOptions
} from "./types";

/**
 * Central storage for managing and accessing all metadata related to entities, attributes, relationships, and tables within the ORM.
 * It provides methods for retrieving and adding metadata for entities and their corresponding tables, handling relationships
 * and attributes, and ensuring the proper initialization of metadata upon first access.
 */
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
      [tableMeta.partitionKeyAttribute.name]: tableMeta.partitionKeyAttribute,
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
      [tableMeta.partitionKeyAttribute.alias]: tableMeta.partitionKeyAttribute,
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

  // TODO typedoc
  public addEntityIdField(entityName: string, fieldName: string): void {
    const entityMetadata = this.#entities[entityName];
    entityMetadata.idField = fieldName;
  }

  /**
   * Adds the partition key attribute to Table metadata storage
   * @param entityClass
   * @param options
   */
  public addPartitionKeyAttribute(
    entityClass: DynaRecord,
    options: Parameters<TableMetadata["addPartitionKeyAttribute"]>[number]
  ): void {
    const tableMetadata = this.getEntityTableMetadata(entityClass);

    if (tableMetadata !== undefined) {
      tableMetadata.addPartitionKeyAttribute(options);
    }
  }

  /**
   * Adds the sort key attribute to Table metadata storage
   * @param entityClass
   * @param options
   */
  public addSortKeyAttribute(
    entityClass: DynaRecord,
    options: Parameters<TableMetadata["addPartitionKeyAttribute"]>[number]
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
    classPrototype: DynaRecord
  ): TableMetadata | undefined {
    const protoType: DynaRecord = Object.getPrototypeOf(classPrototype);

    if (protoType === null) return;

    if (this.#tables[protoType.constructor.name] !== undefined) {
      return this.#tables[protoType.constructor.name];
    } else {
      return this.getEntityTableMetadata(protoType);
    }
  }
}

export default MetadataStorage;
