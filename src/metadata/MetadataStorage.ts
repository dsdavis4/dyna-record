import type DynaRecord from "../DynaRecord.js";
import type { EntityClass, MakeOptional, Optional } from "../types.js";
import TableMetadata from "./TableMetadata.js";
import EntityMetadata from "./EntityMetadata.js";
import AttributeMetadata from "./AttributeMetadata.js";
import JoinTableMetadata from "./JoinTableMetadata.js";
import VectorIndexMetadata, {
  isValidVectorAttributeName,
  reservedVectorAttributePrefix,
  type VectorIndexConstructs,
  type VectorIndexOptions
} from "./VectorIndexMetadata.js";
import { createRelationshipInstance } from "./relationship-metadata/utils.js";
import type { RelationshipMetadata } from "./relationship-metadata/index.js";
import type {
  AttributeKind,
  AttributeMetadataStorage,
  DefaultFields,
  EntityMetadataStorage,
  ForeignKeyAttributeMetadata,
  JoinTableMetadataStorage,
  TableMetadataOptions,
  TableMetadataStorage,
  AttributeMetadataOptions
} from "./types.js";

// https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ServiceQuotas.html
const MAX_VECTOR_INDEXES_PER_TABLE = 5;

/**
 * DynamoDB allows at most 18 inline filters per vector index. dyna-record's
 * count includes the entity type filter the library declares automatically on
 * every index (the HASH element does not count against this quota)
 */
const MAX_INLINE_FILTERS_PER_INDEX = 18;

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

/**
 * Whether each attribute kind's values are equality-comparable scalars for
 * @SearchFilterable. Exhaustive over {@link AttributeKind} — adding a new
 * kind fails compilation here until the new kind declares a stance. Must stay
 * in agreement with the `SearchFilterable` brand's type-level constraint in
 * src/types.ts (dates and objects have no reliable equality semantics as
 * inline filters)
 */
const FILTERABLE_BY_KIND = {
  string: true,
  number: true,
  boolean: true,
  enum: true,
  foreignKey: true,
  date: false,
  object: false
} as const satisfies Record<AttributeKind, boolean>;

const attributeKindsWhere = (
  kindMap: Record<AttributeKind, boolean>
): AttributeKind[] =>
  (Object.keys(kindMap) as AttributeKind[]).filter(kind => kindMap[kind]);

const SEARCHABLE_ATTRIBUTE_KINDS = attributeKindsWhere(SEARCHABLE_BY_KIND);

/**
 * Whether a declaration carries a non-empty members list. The options type
 * requires members, but plain JS consumers are caught by this runtime
 * backstop rather than a crash — the widened parameter is the boundary that
 * keeps the check meaningful under control-flow narrowing
 * @param members - The declared members list, if any
 * @returns Whether at least one member is declared
 */
const hasDeclaredMembers = (
  members: Optional<VectorIndexOptions["members"]>
): boolean => members !== undefined && members.length > 0;

const FILTERABLE_ATTRIBUTE_KINDS = attributeKindsWhere(FILTERABLE_BY_KIND);

/**
 * Central storage for managing and accessing all metadata related to entities, attributes, relationships, and tables within the ORM.
 * It provides methods for retrieving and adding metadata for entities and their corresponding tables, handling relationships
 * and attributes, and ensuring the proper initialization of metadata upon first access.
 */
class MetadataStorage {
  readonly #tables: TableMetadataStorage = {};
  readonly #entities: EntityMetadataStorage = {};
  readonly #joinTables: JoinTableMetadataStorage = {};
  readonly #vectorIndexes: Record<string, VectorIndexMetadata[]> = {};

  /**
   * The owning vector index of each searchable entity (keyed by entity
   * name), resolved at metadata initialization. The owner is the one index
   * whose membership contains the entity — write paths embed with its model
   * and write vectors under its attribute
   */
  readonly #owningVectorIndexByEntity: Record<string, VectorIndexMetadata> =
    {};

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
   * Registers a table's complete vector index declarations. Mutates the store
   * directly and intentionally never touches a metadata accessor — accessors
   * trigger init(), which would freeze metadata against a partial entity
   * graph when index constants are declared at module evaluation. Entity
   * thunks in the options are resolved at metadata initialization, not here;
   * everything checkable from the declarations alone (one call per table,
   * vector attribute shape and uniqueness, name uniqueness, a global index
   * being the table's only index, a scoped index declaring members) fails
   * fast here at definition time.
   * @param tableClassName - Name of the table class the indexes are defined on
   * @param defs - Declarations keyed by export name; see {@link VectorIndexOptions}
   * @returns The registered {@link VectorIndexMetadata} constructs, keyed as declared
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

    if (tableClassName in this.#vectorIndexes) {
      throw new Error(
        `vectorIndexes was already called for table ${tableClassName}. A table declares all of its vector indexes in one vectorIndexes call — merge the declarations into that call`
      );
    }

    const entries = Object.entries(defs);

    if (entries.length === 0) {
      throw new Error(
        `vectorIndexes on table ${tableClassName} declares no indexes. Declare at least one index, or remove the call`
      );
    }

    const seenAttributes = new Map<string, string>();
    const seenNames = new Map<string, string>();
    for (const [key, options] of entries) {
      if (!isValidVectorAttributeName(options.vectorAttribute)) {
        throw new Error(
          `Vector index ${options.name} declares vectorAttribute ${options.vectorAttribute}. A vector attribute must be ${reservedVectorAttributePrefix} or start with ${reservedVectorAttributePrefix}_`
        );
      }

      const attributeHolder = seenAttributes.get(options.vectorAttribute);
      if (attributeHolder !== undefined) {
        throw new Error(
          `Vector indexes ${attributeHolder} and ${key} on table ${tableClassName} both declare vectorAttribute ${options.vectorAttribute}. The vector attribute is an index's physical membership surface — give each index its own`
        );
      }
      seenAttributes.set(options.vectorAttribute, key);

      const nameHolder = seenNames.get(options.name);
      if (nameHolder !== undefined) {
        throw new Error(
          `Vector indexes ${nameHolder} and ${key} on table ${tableClassName} both declare the IndexName ${options.name}. Give each index its own name`
        );
      }
      seenNames.set(options.name, key);

      if (!hasDeclaredMembers(options.members)) {
        throw new Error(
          `Vector index ${options.name} declares no members. An index's members list is its complete membership — list every searchable entity the index owns`
        );
      }
    }

    const registered = entries.map(([key, options]) => {
      const meta = new VectorIndexMetadata(tableClassName, options);
      (this.#vectorIndexes[tableClassName] ??= []).push(meta);
      return [key, meta] as const;
    });

    // The one unavoidable assertion for the construct's phantom type
    // parameters: Members/Scoped have no runtime representation, so no value
    // can witness them — this factory is the trust boundary that stamps each
    // entry's declaration-inferred brand onto the construct it built for
    // that entry. The unknown step is required because the phantom brand
    // shares no structure with the unbranded record
    return Object.fromEntries(registered) as unknown as VectorIndexConstructs<T>;
  }

  /**
   * Returns the vector indexes defined on a table
   * @param {string} tableClassName - Name of the table class
   * @returns Array of {@link VectorIndexMetadata}
   */
  public getVectorIndexes(tableClassName: string): VectorIndexMetadata[] {
    this.init();
    return this.#vectorIndexes[tableClassName] ?? [];
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
    this.validateVectorSearchAliases();
    this.resolveVectorIndexes();
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
            `@SearchFilterable on ${entityName}.${attributeName} must be layered over a string, number, boolean, enum, or foreign key attribute decorator (EX: @StringAttribute)`
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
   * Rejects consumer attributes whose property name or table alias uses the
   * reserved vector attribute prefix. Prefix-level check covering every
   * per-index vector attribute a table may declare, now or later
   */
  private validateVectorSearchAliases(): void {
    for (const [entityName, entityMetadata] of Object.entries(this.#entities)) {
      for (const attrMeta of Object.values(entityMetadata.attributes)) {
        const collision = [attrMeta.name, attrMeta.alias].find(value =>
          value.startsWith(reservedVectorAttributePrefix)
        );
        if (collision !== undefined) {
          throw new Error(
            `Attribute ${entityName}.${attrMeta.name} uses ${collision}, which starts with ${reservedVectorAttributePrefix} — that prefix is reserved for library-managed vector attributes`
          );
        }
      }
    }
  }

  /**
   * Resolves and validates the vector indexes of every table: per-table index
   * quota, provider presence, explicit membership, one owning index per
   * searchable entity, inline filter consistency and quota. Vector
   * attributes are intentionally never registered in entity attribute
   * metadata — serialization and copy paths drop unregistered attributes,
   * which keeps vectors off denormalized records automatically
   */
  private resolveVectorIndexes(): void {
    for (const [tableClassName, tableMetadata] of Object.entries(
      this.#tables
    )) {
      const indexes = this.#vectorIndexes[tableClassName] ?? [];
      const searchableEntities = Object.entries(this.#entities)
        .filter(
          ([, entityMeta]) =>
            entityMeta.tableClassName === tableClassName &&
            entityMeta.searchableAttribute !== undefined
        )
        .sort(([a], [b]) => a.localeCompare(b));

      if (indexes.length > MAX_VECTOR_INDEXES_PER_TABLE) {
        throw new Error(
          `Table ${tableClassName} defines ${String(
            indexes.length
          )} vector indexes. DynamoDB supports at most ${String(
            MAX_VECTOR_INDEXES_PER_TABLE
          )} vector indexes per table`
        );
      }

      if (searchableEntities.length > 0 && indexes.length === 0) {
        throw new Error(
          `Table ${tableClassName} has searchable entities (${searchableEntities
            .map(([entityName]) => entityName)
            .join(
              ", "
            )}) but no vector index with an embedding provider. Define one with ${tableClassName}.vectorIndexes({ myIndex: { name, vectorAttribute, model, provider } })`
        );
      }

      for (const index of indexes) {
        this.resolveVectorIndex(index, tableMetadata, searchableEntities);
      }

      this.resolveOwningIndexes(tableClassName, indexes, searchableEntities);

      if (indexes.length > 0) {
        this.buildReadProjection(tableClassName, tableMetadata);
      }
    }
  }

  /**
   * Assigns each searchable entity of a table its owning vector index —
   * the one index whose resolved membership contains it. An entity owned by
   * no index would silently never be embedded or searchable, and an entity
   * owned by more than one would need multiple embeds and vectors per row;
   * both fail here
   * @param tableClassName - Name of the table class
   * @param indexes - The table's resolved vector indexes
   * @param searchableEntities - The table's searchable entities, sorted by entity name
   */
  private resolveOwningIndexes(
    tableClassName: string,
    indexes: VectorIndexMetadata[],
    searchableEntities: Array<[string, EntityMetadata]>
  ): void {
    for (const [entityName] of searchableEntities) {
      const owners = indexes.filter(index =>
        index.memberEntities.includes(entityName)
      );

      if (owners.length === 0) {
        throw new Error(
          `Entity ${entityName} is searchable but is not a member of any vector index on table ${tableClassName} (${indexes
            .map(index => index.name)
            .join(
              ", "
            )}). Add () => ${entityName} to the members list of the index that should own it`
        );
      }

      if (owners.length > 1) {
        throw new Error(
          `Entity ${entityName} is a member of multiple vector indexes (${owners
            .map(index => index.name)
            .join(
              ", "
            )}) on table ${tableClassName}. Multi-index membership is not currently supported — each searchable entity belongs to exactly one index; remove it from all but one members list`
        );
      }

      this.#owningVectorIndexByEntity[entityName] = owners[0];
    }
  }

  /**
   * Returns the vector index that owns a searchable entity — the index whose
   * membership contains it, whose model embeds it, and whose vector
   * attribute its vectors are written under
   * @param entityName - Name of the searchable entity
   * @returns The owning {@link VectorIndexMetadata}, or undefined for
   * non-searchable entities
   */
  public getOwningVectorIndex(
    entityName: string
  ): Optional<VectorIndexMetadata> {
    this.init();
    return this.#owningVectorIndexByEntity[entityName];
  }

  /**
   * Builds the vector-excluding read projection for a table with a vector
   * index. DynamoDB has no exclusion form, so the projection is an inclusion
   * list: the union of table aliases across every entity mapped to the table
   * (plus the table's key and default attributes), minus the vector alias.
   * The union is what makes it safe on adjacency-list queries whose results
   * span entity types
   * @param tableClassName - Name of the table class
   * @param tableMetadata - The table's metadata
   */
  private buildReadProjection(
    tableClassName: string,
    tableMetadata: TableMetadata
  ): void {
    const aliases = new Set<string>([
      tableMetadata.partitionKeyAttribute.alias,
      tableMetadata.sortKeyAttribute.alias,
      ...Object.values(tableMetadata.defaultAttributes).map(
        attrMeta => attrMeta.alias
      )
    ]);

    for (const entityMetadata of Object.values(this.#entities)) {
      if (entityMetadata.tableClassName !== tableClassName) continue;

      for (const attrMeta of Object.values(entityMetadata.attributes)) {
        aliases.add(attrMeta.alias);
      }
    }

    // Vector attributes are never registered as entity attributes, so the
    // inclusion list excludes them by construction; deleting defensively
    // covers any alias that slipped in through table defaults
    for (const index of this.#vectorIndexes[tableClassName] ?? []) {
      aliases.delete(index.vectorAttribute);
    }

    const sortedAliases = [...aliases].sort((a, b) => a.localeCompare(b));

    tableMetadata.readProjection = {
      expression: sortedAliases.map(alias => `#${alias}`).join(", "),
      attributeNames: Object.fromEntries(
        sortedAliases.map(alias => [`#${alias}`, alias])
      )
    };
  }

  /**
   * Resolves and validates a single vector index: provider presence,
   * explicit scoped membership (the declared members list is the complete
   * membership), the scoping foreign key on every member's canonical row,
   * inline filter alias consistency, and the 18 inline filter quota counting
   * the auto-declared entity type filter (the HASH does not count)
   * @param index - The vector index to resolve
   * @param tableMetadata - Metadata of the table the index is defined on
   * @param searchableEntities - The table's searchable entities, sorted by entity name
   */
  private resolveVectorIndex(
    index: VectorIndexMetadata,
    tableMetadata: TableMetadata,
    searchableEntities: Array<[string, EntityMetadata]>
  ): void {
    if (searchableEntities.length > 0 && index.provider === undefined) {
      throw new Error(
        `Vector index ${index.name} has no embedding provider configured. Set provider (an embed function) on the index's entry in ${index.tableClassName}.vectorIndexes`
      );
    }

    const members = this.resolveMembers(index, searchableEntities);

    let hashAlias: Optional<string>;
    if (index.scopedBy !== undefined) {
      hashAlias = this.resolveScopingHash(index.scopedBy(), index, members);
    }

    // One inline filter is one table attribute: a filterable property must
    // resolve to the same table alias across every member entity
    const filterAliasByProperty = new Map<string, string>();
    for (const [, entityMetadata] of members) {
      for (const attrMeta of entityMetadata.searchFilterableAttributes) {
        const existingAlias = filterAliasByProperty.get(attrMeta.name);
        if (existingAlias !== undefined && existingAlias !== attrMeta.alias) {
          throw new Error(
            `@SearchFilterable property ${attrMeta.name} resolves to different table aliases (${existingAlias}, ${attrMeta.alias}) across members of vector index ${index.name}. One inline filter is one table attribute; align the alias across entities`
          );
        }
        filterAliasByProperty.set(attrMeta.name, attrMeta.alias);
      }
    }

    // The entity type discriminator is auto-declared as an inline filter on
    // every index and counts against the quota; the HASH does not count
    const typeAlias = tableMetadata.defaultAttributes.type.alias;
    const inlineFilterAliases = [
      ...new Set([typeAlias, ...filterAliasByProperty.values()])
    ].sort();

    if (inlineFilterAliases.length > MAX_INLINE_FILTERS_PER_INDEX) {
      throw new Error(
        `Vector index ${index.name} declares ${String(
          inlineFilterAliases.length
        )} inline filters counting the entity type filter the library adds automatically. DynamoDB supports at most ${String(
          MAX_INLINE_FILTERS_PER_INDEX
        )} inline filters per index`
      );
    }

    index.resolveSearchSchema({
      memberEntities: members.map(([entityName]) => entityName),
      hashAlias,
      inlineFilterAliases
    });
  }

  /**
   * Resolves an index's members — the explicit members list is the complete
   * membership; nothing is derived and there is no universal membership.
   * Rejects a listed member that is not a registered searchable entity of
   * the index's table, and an empty resolved membership
   * @param index - The vector index being resolved
   * @param searchableEntities - The table's searchable entities, sorted by entity name
   * @returns The index's members, sorted by entity name
   */
  private resolveMembers(
    index: VectorIndexMetadata,
    searchableEntities: Array<[string, EntityMetadata]>
  ): Array<[string, EntityMetadata]> {
    const searchableByName = new Map(searchableEntities);
    const memberNames = new Set<string>();

    for (const entityThunk of index.members) {
      const memberName = entityThunk().name;
      const memberMetadata = searchableByName.get(memberName);
      if (memberMetadata === undefined) {
        throw new Error(
          `Entity ${memberName} is listed in the members of vector index ${index.name} but is not a searchable entity of table ${index.tableClassName}. Members must be entities of the index's table that declare a @Searchable attribute`
        );
      }
      memberNames.add(memberName);
    }

    if (memberNames.size === 0) {
      throw new Error(
        `Vector index ${index.name} resolved to no members. An index's members list is its complete membership — list every searchable entity the index owns`
      );
    }

    return searchableEntities.filter(([entityName]) =>
      memberNames.has(entityName)
    );
  }

  /**
   * Resolves a scoped index's HASH alias — the members' scoping foreign
   * key. Rejects an unregistered scope parent and a member without the
   * scoping foreign key on its canonical row
   * @param scopeParent - The resolved scope parent entity class
   * @param index - The vector index being resolved
   * @param members - The index's resolved members
   * @returns The HASH alias
   */
  private resolveScopingHash(
    scopeParent: EntityClass<DynaRecord>,
    index: VectorIndexMetadata,
    members: Array<[string, EntityMetadata]>
  ): Optional<string> {
    if (!(scopeParent.name in this.#entities)) {
      throw new Error(
        `Vector index ${index.name} is scoped by ${scopeParent.name}, which is not a registered entity`
      );
    }

    const memberScopingFks = members.map(([entityName, entityMetadata]) => {
      const scopingFk = this.findScopingFk(entityMetadata, scopeParent);
      if (scopingFk === undefined) {
        throw new Error(
          `Entity ${entityName} is a member of vector index ${index.name} but has no foreign key attribute referencing ${scopeParent.name} on its own record (HasAndBelongsToMany relationships store foreign keys on the join table). Add a @ForeignKeyAttribute referencing ${scopeParent.name} to ${entityName}`
        );
      }
      return scopingFk;
    });

    // The scoped search compiles one HASH equality on one table attribute:
    // the scope foreign key must resolve to the same alias across every
    // member (mirrors the @SearchFilterable alias-consistency check)
    const [firstScopingFk] = memberScopingFks;
    for (const scopingFk of memberScopingFks) {
      if (scopingFk.alias !== firstScopingFk.alias) {
        throw new Error(
          `The foreign key referencing ${scopeParent.name} resolves to different table aliases (${firstScopingFk.alias}, ${scopingFk.alias}) across members of vector index ${index.name}. The scoped HASH is one table attribute; align the alias across entities`
        );
      }
    }

    return memberScopingFks[0]?.alias;
  }

  /**
   * Returns the entity's foreign key attribute referencing the scope parent,
   * if one exists on its canonical record
   * @param entityMetadata - Metadata of the entity to inspect
   * @param scopeParent - The scope parent entity class
   * @returns The scoping foreign key attribute metadata, if present
   */
  private findScopingFk(
    entityMetadata: EntityMetadata,
    scopeParent: EntityClass<DynaRecord>
  ): Optional<ForeignKeyAttributeMetadata> {
    return entityMetadata.foreignKeyAttributes.find(
      attrMeta => attrMeta.foreignKeyTarget === scopeParent
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
