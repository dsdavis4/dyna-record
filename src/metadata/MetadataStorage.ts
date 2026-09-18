import type DynaRecord from "../DynaRecord.js";
import type { MakeOptional, Optional } from "../types.js";
import TableMetadata from "./TableMetadata.js";
import EntityMetadata from "./EntityMetadata.js";
import AttributeMetadata from "./AttributeMetadata.js";
import { FILTERABLE_ATTRIBUTE_KINDS } from "./filterScalarTypes.js";
import JoinTableMetadata from "./JoinTableMetadata.js";
import type VectorIndexMetadata from "./VectorIndexMetadata.js";
import type {
  VectorIndexConstructs,
  VectorIndexOptions
} from "./VectorIndexMetadata.js";
import VectorIndexRegistry from "./VectorIndexRegistry.js";
import { createRelationshipInstance } from "./relationship-metadata/utils.js";
import type { RelationshipMetadata } from "./relationship-metadata/index.js";
import type {
  AttributeKind,
  AttributeMetadataStorage,
  DefaultFields,
  EntityMetadataStorage,
  JoinTableMetadataStorage,
  TableMetadataOptions,
  TableMetadataStorage,
  AttributeMetadataOptions
} from "./types.js";

/**
 * Whether each attribute kind's values are embeddable text for @Searchable.
 * Exhaustive over {@link AttributeKind} — adding a new kind fails compilation
 * here until the new kind declares a stance. Must stay in agreement with the
 * `Searchable` brand's type-level constraint in src/types.ts
 */
const SEARCHABLE_BY_KIND = {
  string: true,
  enum: true,
  number: false,
  boolean: false,
  date: false,
  object: false,
  foreignKey: false
} as const satisfies Record<AttributeKind, boolean>;

const attributeKindsWhere = (
  kindMap: Record<AttributeKind, boolean>
): AttributeKind[] =>
  (Object.keys(kindMap) as AttributeKind[]).filter(kind => kindMap[kind]);

const SEARCHABLE_ATTRIBUTE_KINDS = attributeKindsWhere(SEARCHABLE_BY_KIND);

/**
 * Central storage for managing and accessing all metadata related to entities, attributes, relationships, and tables within the ORM.
 * It provides methods for retrieving and adding metadata for entities and their corresponding tables, handling relationships
 * and attributes, and ensuring the proper initialization of metadata upon first access.
 */
class MetadataStorage {
  readonly #tables: TableMetadataStorage = {};
  readonly #entities: EntityMetadataStorage = {};
  readonly #joinTables: JoinTableMetadataStorage = {};
  /**
   * Owns every vector index concern — declarations, membership, ownership,
   * and their validation. Composed rather than inlined: the registry needs
   * the entity and table graphs only while resolving, so it receives them
   * at initialization instead of holding a reference back to this store
   */
  readonly #vectorIndexes = new VectorIndexRegistry();

  /**
   * Side registry of @Searchable marks (attribute names keyed by entity name).
   * Layered decorators write here rather than into attribute metadata — no
   * TC39 decorator composition order guarantees the base attribute's metadata
   * exists when the layer runs. Reconciled against attribute metadata in init()
   */
  readonly #searchableAttributes: Record<string, string[]> = {};

  /**
   * Side registry of @SearchFilterable marks (attribute names keyed by entity
   * name). Reconciled against attribute metadata in init()
   */
  readonly #filterableAttributes: Record<string, string[]> = {};

  #initialized: boolean = false;

  /**
   * A metadata validation failure is cached and re-thrown on every subsequent
   * metadata access — otherwise the first operation would throw and later
   * operations would silently proceed on invalid metadata
   */
  #initializationError?: Error;

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
   * Returns all entities that belong to a specific table
   * @param {string} tableClassName - Name of the table class
   * @returns Record of entity metadata keyed by entity class name
   */
  public getEntitiesForTable(tableClassName: string): EntityMetadataStorage {
    this.init();
    const entities: EntityMetadataStorage = {};
    for (const [entityName, entityMetadata] of Object.entries(this.#entities)) {
      if (entityMetadata.tableClassName === tableClassName) {
        entities[entityName] = entityMetadata;
      }
    }
    return entities;
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
   * Add an entity to metadata storage. The table the entity belongs to is
   * resolved by walking the entity's class hierarchy until a class decorated
   * with the Table decorator is found, supporting entities that extend other
   * entities or intermediate abstract classes.
   * @param entityClass
   */
  public addEntity(entityClass: EntityMetadata["EntityClass"]): void {
    const tableClassName = this.resolveTableClassName(entityClass);
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
    if (!(options.propertyName in entityMetadata.relationships)) {
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
    if (!(joinTableName in this.#joinTables)) {
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

    // The property is a default field assign it, otherwise instantiate new AttributeMetadata
    const meta =
      options.attributeName in defaultAttributes
        ? defaultAttributes[options.attributeName as DefaultFields]
        : new AttributeMetadata(options);
    entityMetadata.addAttribute(meta);
  }

  /**
   * Store the entities optional id field attribute. Used with @IdAttribute
   * @param entityName
   * @param fieldName
   */
  public addEntityIdField(entityName: string, fieldName: string): void {
    const entityMetadata = this.#entities[entityName];
    entityMetadata.idField = fieldName;
  }

  /**
   * Marks an entity attribute as the entity's searchable text. Used with
   * @Searchable. The mark is reconciled against attribute metadata at
   * metadata initialization
   * @param entityName
   * @param attributeName
   */
  public addSearchableAttribute(
    entityName: string,
    attributeName: string
  ): void {
    this.addAttributeMark(
      this.#searchableAttributes,
      entityName,
      attributeName
    );
  }

  /**
   * Marks an entity attribute as an inline filter on the vector indexes
   * containing the entity. Used with @SearchFilterable. The mark is
   * reconciled against attribute metadata at metadata initialization
   * @param entityName
   * @param attributeName
   */
  public addFilterableAttribute(
    entityName: string,
    attributeName: string
  ): void {
    this.addAttributeMark(
      this.#filterableAttributes,
      entityName,
      attributeName
    );
  }

  /**
   * Records a decorator mark in a side registry, deduplicating repeat
   * applications
   * @param registry - The side registry to record into
   * @param entityName - Name of the entity the mark applies to
   * @param attributeName - Name of the marked attribute
   */
  private addAttributeMark(
    registry: Record<string, string[]>,
    entityName: string,
    attributeName: string
  ): void {
    const marks = (registry[entityName] ??= []);
    if (!marks.includes(attributeName)) {
      marks.push(attributeName);
    }
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
   * Registers a table's complete vector index declarations. Intentionally
   * never triggers initialization — index constants are declared at module
   * evaluation, while the entity graph is still filling in
   * @param tableClassName - Name of the table class the indexes are defined on
   * @param defs - Declarations keyed by export name; see {@link VectorIndexOptions}
   * @returns The registered vector index constructs, keyed as declared
   */
  public addVectorIndexes<const T extends Record<string, VectorIndexOptions>>(
    tableClassName: string,
    defs: T
  ): VectorIndexConstructs<T> {
    if (!(tableClassName in this.#tables)) {
      throw new Error(
        `vectorIndexes can only be defined on a table class decorated with @Table. ${tableClassName} is not a registered table`
      );
    }

    return this.#vectorIndexes.register(tableClassName, defs);
  }

  /**
   * Returns the vector indexes defined on a table
   * @param tableClassName - Name of the table class
   * @returns Array of vector index metadata
   */
  public getVectorIndexes(tableClassName: string): VectorIndexMetadata[] {
    this.init();
    return this.#vectorIndexes.indexesFor(tableClassName);
  }

  /**
   * Returns the vector index that owns a searchable entity — the index whose
   * membership contains it, whose model embeds it, and whose vector
   * attribute its vectors are written under
   * @param entityName - Name of the searchable entity
   * @returns The owning vector index, or undefined for non-searchable entities
   */
  public getOwningVectorIndex(
    entityName: string
  ): Optional<VectorIndexMetadata> {
    this.init();
    return this.#vectorIndexes.owningIndexFor(entityName);
  }

  /**
   * Returns the vector attributes a searchable entity's row must not carry —
   * every index on its table except its owner. Vector writes REMOVE these so
   * an entity moved between indexes leaves no stale vector behind
   * @param entityName - Name of the searchable entity
   * @returns The sibling indexes' vector attributes, empty when the table has one index
   */
  public getSiblingVectorAttributes(entityName: string): string[] {
    this.init();
    return this.#vectorIndexes.siblingAttributesFor(entityName);
  }

  /**
   * Initialize metadata object.
   *
   * Vector search reconciliation and validation run after the initialized
   * flag is set (accessor calls during init would re-enter it — infinite
   * recursion). A validation failure is cached and re-thrown on every
   * subsequent metadata access. Validation completeness is scoped to the
   * entity modules already evaluated at first metadata access — an entity
   * module loaded after initialization is registered but never reconciled
   * or validated.
   */
  private init(): void {
    if (!this.#initialized) {
      // Initialize all entities once to trigger Attribute decorators and fill metadata object
      Object.values(this.#entities).forEach(
        entityMeta => new entityMeta.EntityClass()
      );
      this.#initialized = true;
      try {
        this.initVectorSearch();
      } catch (error) {
        this.#initializationError =
          error instanceof Error ? error : new Error(String(error));
      }
    }

    if (this.#initializationError !== undefined) {
      throw this.#initializationError;
    }
  }

  /**
   * Reconciles the @Searchable/@SearchFilterable side registries and vector
   * index definitions against attribute metadata, and runs every vector
   * search validation. Operates on the stores directly
   */
  private initVectorSearch(): void {
    this.reconcileSearchableMarks();
    this.reconcileFilterableMarks();
    this.#vectorIndexes.resolve({
      entities: this.#entities,
      tables: this.#tables
    });
  }

  /**
   * Reconciles the searchable marks written by the layered `@Searchable`
   * decorator against the attribute metadata registered by the base attribute
   * decorators. Rejects multiple @Searchable attributes on an entity and
   * @Searchable marks that do not resolve to a string attribute
   */
  private reconcileSearchableMarks(): void {
    for (const [entityName, marks] of Object.entries(
      this.#searchableAttributes
    )) {
      if (!(entityName in this.#entities)) continue;
      const entityMetadata = this.#entities[entityName];

      if (marks.length > 1) {
        throw new Error(
          `Entity ${entityName} declares @Searchable on multiple attributes (${marks.join(
            ", "
          )}). Only one searchable attribute is allowed per entity`
        );
      }

      const [attributeName] = marks;
      if (
        !this.isMarkedAttributeValid(
          entityMetadata,
          attributeName,
          SEARCHABLE_ATTRIBUTE_KINDS
        )
      ) {
        throw new Error(
          `@Searchable on ${entityName}.${attributeName} must be layered over a string or enum attribute decorator (EX: @StringAttribute, @EnumAttribute)`
        );
      }
      entityMetadata.searchableAttribute =
        entityMetadata.attributes[attributeName];
    }
  }

  /**
   * Reconciles the filterable marks written by the layered `@SearchFilterable`
   * decorator against the attribute metadata registered by the base attribute
   * decorators. Rejects marks that do not resolve to a registered attribute
   */
  private reconcileFilterableMarks(): void {
    for (const [entityName, marks] of Object.entries(
      this.#filterableAttributes
    )) {
      if (!(entityName in this.#entities)) continue;
      const entityMetadata = this.#entities[entityName];

      for (const attributeName of marks) {
        if (
          !this.isMarkedAttributeValid(
            entityMetadata,
            attributeName,
            FILTERABLE_ATTRIBUTE_KINDS
          )
        ) {
          throw new Error(
            `@SearchFilterable on ${entityName}.${attributeName} must be layered over a string, number, enum, or foreign key attribute decorator (EX: @StringAttribute)`
          );
        }
        entityMetadata.searchFilterableAttributes.push(
          entityMetadata.attributes[attributeName]
        );
      }
    }
  }

  /**
   * Whether a decorator mark resolves to a registered attribute of an
   * allowed kind
   * @param entityMetadata - Metadata of the marked entity
   * @param attributeName - Name of the marked attribute
   * @param allowedKinds - The attribute kinds the mark's decorator allows
   * @returns Whether the mark is valid
   */
  private isMarkedAttributeValid(
    entityMetadata: EntityMetadata,
    attributeName: string,
    allowedKinds: AttributeKind[]
  ): boolean {
    return (
      attributeName in entityMetadata.attributes &&
      allowedKinds.includes(entityMetadata.attributes[attributeName].kind)
    );
  }

  /**
   * Walks an entity class's hierarchy and returns the name of the first
   * ancestor registered as a table via the Table decorator. Throws if the
   * entity does not extend a table class anywhere in its hierarchy.
   * @param entityClass
   * @returns Name of the table class the entity belongs to
   */
  private resolveTableClassName(
    entityClass: EntityMetadata["EntityClass"]
  ): string {
    let current: unknown = Object.getPrototypeOf(entityClass);

    // The constructor chain ends at Function.prototype, whose name is ""
    while (typeof current === "function" && current.name !== "") {
      if (current.name in this.#tables) return current.name;
      current = Object.getPrototypeOf(current);
    }

    throw new Error(
      `Entity ${entityClass.name} must extend a class decorated with @Table, either directly or through its class hierarchy`
    );
  }

  /**
   * Recursively search prototype chain and return TableMetadata for an entity class if it exists
   * @param classPrototype
   * @returns
   */
  private getEntityTableMetadata(
    classPrototype: DynaRecord
  ): TableMetadata | undefined {
    const protoType = Object.getPrototypeOf(
      classPrototype
    ) as DynaRecord | null;

    if (protoType === null) return;

    if (protoType.constructor.name in this.#tables) {
      return this.#tables[protoType.constructor.name];
    } else {
      return this.getEntityTableMetadata(protoType);
    }
  }
}

export default MetadataStorage;
