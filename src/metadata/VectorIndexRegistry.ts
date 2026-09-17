import type DynaRecord from "../DynaRecord.js";
import type { EntityClass, Optional } from "../types.js";
import type EntityMetadata from "./EntityMetadata.js";
import type TableMetadata from "./TableMetadata.js";
import VectorIndexMetadata, {
  isValidVectorAttributeName,
  reservedVectorAttributePrefix,
  type VectorIndexConstructs,
  type VectorIndexOptions
} from "./VectorIndexMetadata.js";
import type {
  EntityMetadataStorage,
  ForeignKeyAttributeMetadata,
  TableMetadataStorage
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
 * A table's searchable entities, sorted by entity name
 */
type SearchableEntities = Array<[string, EntityMetadata]>;

/**
 * The metadata the registry resolves against. Passed in rather than held as
 * a back-reference: membership and scoping are a function of the entity and
 * table graphs at initialization, so the registry needs them only for the
 * duration of {@link VectorIndexRegistry.resolve}
 */
interface ResolutionContext {
  entities: EntityMetadataStorage;
  tables: TableMetadataStorage;
}

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

/**
 * Every option {@link VectorIndexOptions} defines. An unknown key is a
 * compile error for a typed caller; this set is the runtime backstop that
 * gives a plain-JS caller the same answer instead of silently ignoring it.
 */
const KNOWN_INDEX_OPTIONS = new Set<string>([
  "name",
  "vectorAttribute",
  "model",
  "provider",
  "scopedBy",
  "members"
]);

/**
 * Records a declaration's claim on a table-unique value, throwing when
 * another declaration already claimed it
 * @param claimed - Values already claimed, keyed to the declaration that claimed each
 * @param value - The value this declaration claims
 * @param claimant - The declaration key claiming it
 * @param describeCollision - Builds the error message from the prior claimant's key
 */
const claimUniqueValue = (
  claimed: Map<string, string>,
  value: string,
  claimant: string,
  describeCollision: (holder: string) => string
): void => {
  const holder = claimed.get(value);
  if (holder !== undefined) {
    throw new Error(describeCollision(holder));
  }
  claimed.set(value, claimant);
};

/**
 * Owns every vector index concern: the indexes declared per table, which
 * index owns each searchable entity, and the validation that both are
 * coherent.
 *
 * Registration happens at module evaluation, when consumers call the
 * `vectorIndexes` factory — the registry validates only what a declaration
 * can answer on its own (one call per table, vector attribute shape and
 * uniqueness, name uniqueness, non-empty membership) and never touches the
 * entity graph, which is still filling in. Everything that needs that graph
 * — resolving member thunks, the scoping HASH, inline filters, and the one
 * owning index per entity — waits for {@link VectorIndexRegistry.resolve} at
 * metadata initialization.
 *
 * {@link MetadataStorage} composes this registry rather than inheriting from
 * it, and hands it the entity and table graphs at resolution time, so the
 * registry holds no reference back to the store.
 */
class VectorIndexRegistry {
  readonly #indexesByTable: Record<string, VectorIndexMetadata[]> = {};

  /**
   * The owning vector index of each searchable entity (keyed by entity
   * name). The owner is the one index whose membership contains the entity —
   * write paths embed with its model and write vectors under its attribute
   */
  readonly #owningIndexByEntity: Record<string, VectorIndexMetadata> = {};

  /**
   * The vector attributes of every index on a searchable entity's table
   * other than its owner's (keyed by entity name). Vector writes REMOVE
   * these so a row never stays resident in an index that no longer owns its
   * entity
   */
  readonly #siblingAttributesByEntity: Record<string, string[]> = {};

  /**
   * Registers a table's complete vector index declarations. Mutates the
   * registry directly and intentionally never triggers metadata
   * initialization, which would freeze the entity graph while index
   * constants are still being declared at module evaluation. Entity thunks
   * in the options are resolved later, by {@link VectorIndexRegistry.resolve}
   * @param tableClassName - Name of the table class the indexes are defined on
   * @param defs - Declarations keyed by export name; see {@link VectorIndexOptions}
   * @returns The registered {@link VectorIndexMetadata} constructs, keyed as declared
   */
  public register<const T extends Record<string, VectorIndexOptions>>(
    tableClassName: string,
    defs: T
  ): VectorIndexConstructs<T> {
    if (tableClassName in this.#indexesByTable) {
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

      claimUniqueValue(
        seenAttributes,
        options.vectorAttribute,
        key,
        holder =>
          `Vector indexes ${holder} and ${key} on table ${tableClassName} both declare vectorAttribute ${options.vectorAttribute}. The vector attribute is an index's physical membership surface — give each index its own`
      );

      claimUniqueValue(
        seenNames,
        options.name,
        key,
        holder =>
          `Vector indexes ${holder} and ${key} on table ${tableClassName} both declare the IndexName ${options.name}. Give each index its own name`
      );

      if (!hasDeclaredMembers(options.members)) {
        throw new Error(
          `Vector index ${options.name} declares no members. An index's members list is its complete membership — list every searchable entity the index owns`
        );
      }

      // An unknown key is silently meaningless otherwise: a caller who sets
      // `distanceFunction` on the index rather than the model would get the
      // model's value with no indication their option was dropped
      const unknownOptions = Object.keys(options).filter(
        option => !KNOWN_INDEX_OPTIONS.has(option)
      );
      if (unknownOptions.length > 0) {
        throw new Error(
          `Vector index ${options.name} declares unknown options (${unknownOptions.join(", ")}). Valid options are ${[...KNOWN_INDEX_OPTIONS].join(", ")} — embedding settings such as dimensions and distance function belong on the model descriptor`
        );
      }
    }

    const registered = entries.map(([key, options]) => {
      const meta = new VectorIndexMetadata(tableClassName, options);
      (this.#indexesByTable[tableClassName] ??= []).push(meta);
      return [key, meta] as const;
    });

    // The one unavoidable assertion for the construct's phantom type
    // parameters: Members/Scoped have no runtime representation, so no value
    // can witness them — this factory is the trust boundary that stamps each
    // entry's declaration-inferred brand onto the construct it built for
    // that entry. The unknown step is required because the phantom brand
    // shares no structure with the unbranded record
    return Object.fromEntries(
      registered
    ) as unknown as VectorIndexConstructs<T>;
  }

  /**
   * Returns the vector indexes declared on a table
   * @param tableClassName - Name of the table class
   * @returns Array of {@link VectorIndexMetadata}
   */
  public indexesFor(tableClassName: string): VectorIndexMetadata[] {
    return this.#indexesByTable[tableClassName] ?? [];
  }

  /**
   * Returns the vector index that owns a searchable entity — the index whose
   * membership contains it, whose model embeds it, and whose vector
   * attribute its vectors are written under
   * @param entityName - Name of the searchable entity
   * @returns The owning {@link VectorIndexMetadata}, or undefined for
   * non-searchable entities
   */
  public owningIndexFor(entityName: string): Optional<VectorIndexMetadata> {
    return this.#owningIndexByEntity[entityName];
  }

  /**
   * Returns the vector attributes a searchable entity's row must not carry —
   * every index on its table except its owner
   * @param entityName - Name of the searchable entity
   * @returns The sibling indexes' vector attributes, empty when the table has one index
   */
  public siblingAttributesFor(entityName: string): string[] {
    return this.#siblingAttributesByEntity[entityName] ?? [];
  }

  /**
   * Resolves and validates every table's vector indexes against the entity
   * graph: reserved-prefix collisions, the per-table index quota, provider
   * presence, explicit membership, one owning index per searchable entity,
   * inline filter consistency and quota, and each table's vector-excluding
   * read projection.
   *
   * Vector attributes are intentionally never registered in entity attribute
   * metadata — serialization and copy paths drop unregistered attributes,
   * which keeps vectors off denormalized records automatically
   * @param context - {@link ResolutionContext}
   */
  public resolve(context: ResolutionContext): void {
    this.validateReservedPrefix(context.entities);

    for (const [tableClassName, tableMetadata] of Object.entries(
      context.tables
    )) {
      const indexes = this.indexesFor(tableClassName);
      const searchableEntities = Object.entries(context.entities)
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
        this.resolveIndex(index, tableMetadata, searchableEntities, context);
      }

      this.resolveOwnership(tableClassName, indexes, searchableEntities);

      if (indexes.length > 0) {
        this.buildReadProjection(tableClassName, tableMetadata, context);
      }
    }
  }

  /**
   * Rejects consumer attributes whose property name or table alias uses the
   * reserved vector attribute prefix. Prefix-level check covering every
   * per-index vector attribute a table may declare, now or later
   * @param entities - The registered entity metadata
   */
  private validateReservedPrefix(entities: EntityMetadataStorage): void {
    for (const [entityName, entityMetadata] of Object.entries(entities)) {
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
   * Assigns each searchable entity of a table its owning vector index — the
   * one index whose resolved membership contains it — and the sibling
   * attributes its rows must not carry. An entity owned by no index would
   * silently never be embedded or searchable, and an entity owned by more
   * than one would need multiple embeds and vectors per row; both fail here
   * @param tableClassName - Name of the table class
   * @param indexes - The table's resolved vector indexes
   * @param searchableEntities - The table's searchable entities, sorted by entity name
   */
  private resolveOwnership(
    tableClassName: string,
    indexes: VectorIndexMetadata[],
    searchableEntities: SearchableEntities
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

      const [owner] = owners;
      this.#owningIndexByEntity[entityName] = owner;
      this.#siblingAttributesByEntity[entityName] = indexes
        .filter(index => index !== owner)
        .map(index => index.vectorAttribute);
    }
  }

  /**
   * Builds the vector-excluding read projection for a table with a vector
   * index. DynamoDB has no exclusion form, so the projection is an inclusion
   * list: the union of table aliases across every entity mapped to the table
   * (plus the table's key and default attributes), minus the vector
   * attributes. The union is what makes it safe on adjacency-list queries
   * whose results span entity types
   * @param tableClassName - Name of the table class
   * @param tableMetadata - The table's metadata
   * @param context - {@link ResolutionContext}
   */
  private buildReadProjection(
    tableClassName: string,
    tableMetadata: TableMetadata,
    context: ResolutionContext
  ): void {
    const aliases = new Set<string>([
      tableMetadata.partitionKeyAttribute.alias,
      tableMetadata.sortKeyAttribute.alias,
      ...Object.values(tableMetadata.defaultAttributes).map(
        attrMeta => attrMeta.alias
      )
    ]);

    for (const entityMetadata of Object.values(context.entities)) {
      if (entityMetadata.tableClassName !== tableClassName) continue;

      for (const attrMeta of Object.values(entityMetadata.attributes)) {
        aliases.add(attrMeta.alias);
      }
    }

    // Vector attributes are never registered as entity attributes, so the
    // inclusion list excludes them by construction; deleting defensively
    // covers any alias that slipped in through table defaults
    for (const index of this.indexesFor(tableClassName)) {
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
   * explicit membership (the declared members list is the complete
   * membership), the scoping foreign key on every member's canonical row,
   * inline filter alias consistency, and the 18 inline filter quota counting
   * the auto-declared entity type filter (the HASH does not count)
   * @param index - The vector index to resolve
   * @param tableMetadata - Metadata of the table the index is defined on
   * @param searchableEntities - The table's searchable entities, sorted by entity name
   * @param context - {@link ResolutionContext}
   */
  private resolveIndex(
    index: VectorIndexMetadata,
    tableMetadata: TableMetadata,
    searchableEntities: SearchableEntities,
    context: ResolutionContext
  ): void {
    if (searchableEntities.length > 0 && index.provider === undefined) {
      throw new Error(
        `Vector index ${index.name} has no embedding provider configured. Set provider (an embed function) on the index's entry in ${index.tableClassName}.vectorIndexes`
      );
    }

    const members = this.resolveMembers(index, searchableEntities);

    let hashAlias: Optional<string>;
    if (index.scopedBy !== undefined) {
      hashAlias = this.resolveScopingHash(
        index.scopedBy(),
        index,
        members,
        context
      );
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
   * the index's table. An empty membership is rejected earlier, at
   * registration, so it cannot reach here
   * @param index - The vector index being resolved
   * @param searchableEntities - The table's searchable entities, sorted by entity name
   * @returns The index's members, sorted by entity name
   */
  private resolveMembers(
    index: VectorIndexMetadata,
    searchableEntities: SearchableEntities
  ): SearchableEntities {
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

    // No empty-membership check is needed here: registration rejects an index
    // declaring no members, so the loop above always adds at least one name
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
   * @param context - {@link ResolutionContext}
   * @returns The HASH alias
   */
  private resolveScopingHash(
    scopeParent: EntityClass<DynaRecord>,
    index: VectorIndexMetadata,
    members: SearchableEntities,
    context: ResolutionContext
  ): Optional<string> {
    if (!(scopeParent.name in context.entities)) {
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
}

export default VectorIndexRegistry;
