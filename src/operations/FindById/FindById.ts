import type DynaRecord from "../../DynaRecord";
import { type RelationshipMetadata } from "../../metadata";
import { includedRelationshipsFilter } from "../../query-utils/Filters";
import { DynamoClient, TransactGetBuilder } from "../../dynamo-utils";
import type { EntityClass, Optional } from "../../types";
import { tableItemToEntity } from "../../utils";
import OperationBase from "../OperationBase";
import type {
  FindByIdOptions,
  FindByIdIncludesRes,
  IncludedAssociations,
  SortedQueryResults
} from "./types";
import { buildEntityRelationshipMetaObj } from "../utils";
import { type QueryResult, type QueryResults } from "../Query";

/**
 * Facilitates the retrieval of an entity by its identifier (ID) from the database, potentially including its associated entities based on specified relationships.
 *
 * It supports fetching an entity solely by its ID or along with its related entities through specified associations, allowing for flexible retrieval of complex entity graphs in a single operation.
 *
 * @template T - The type of the entity being retrieved, extending `DynaRecord`.
 */
class FindById<T extends DynaRecord> extends OperationBase<T> {
  readonly #transactionBuilder: TransactGetBuilder;

  constructor(Entity: EntityClass<T>) {
    super(Entity);
    this.#transactionBuilder = new TransactGetBuilder();
  }

  /**
   * Find an entity by Id and optionally include associations
   * @param {string} id - Entity Id
   * @param {Object} options - FindById options
   * @param {Object[]=} options.include - The associations to include in the query
   * @param {string} options.include[].association - The name of the association to include. Must be defined on the model
   * @returns An entity with optional included associations serialized
   */
  public async run(
    id: string,
    options?: FindByIdOptions<T>
  ): Promise<Optional<T | FindByIdIncludesRes<T, FindByIdOptions<T>>>> {
    if (options?.include === undefined) {
      return await this.findByIdOnly(id);
    } else {
      return await this.findByIdWithIncludes(id, options.include);
    }
  }

  /**
   * Find an Entity by id without associations
   * @param {string} id - Entity Id
   * @returns An entity object or undefined
   */
  private async findByIdOnly(id: string): Promise<Optional<T>> {
    const { name: tableName } = this.tableMetadata;

    const res = await DynamoClient.getItem({
      TableName: tableName,
      Key: {
        [this.partitionKeyAlias]: this.EntityClass.partitionKeyValue(id),
        [this.sortKeyAlias]: this.EntityClass.name
      },
      ConsistentRead: true
    });

    if (res === undefined) {
      return undefined;
    } else {
      return tableItemToEntity<T>(this.EntityClass, res);
    }
  }

  /**
   * Find an entity with included associations
   * @param {string} id - Entity Id
   * @param {Object[]=} includedAssociations - The associations to include in the query
   * @param {string} includedAssociations[].association - The name of the association to include. Must be defined on the model
   * @returns An entity with included associations serialized
   */
  private async findByIdWithIncludes(
    id: string,
    includedAssociations: IncludedAssociations<T>
  ): Promise<Optional<FindByIdIncludesRes<T, FindByIdOptions<T>>>> {
    const includedRelMeta = this.getIncludedRelationships(includedAssociations);

    const includedTypesFilter = includedRelationshipsFilter(
      this.EntityClass.name,
      includedRelMeta
    );

    const queryResults = await this.EntityClass.query<DynaRecord>(id, {
      filter: includedTypesFilter
    });

    if (queryResults.length === 0) return undefined;

    const filtered = this.filterQueryResults(id, queryResults);

    if (filtered.entity === undefined) return;

    return this.resolveFindByIdIncludesResults(
      filtered.entity,
      filtered.relatedEntities,
      includedRelMeta
    );
  }

  /**
   * Filters query results by parent entity and related entities for processing
   * @param entityId - The id of the parent entity
   * @param queryResults - The results of the query on the parent partition
   * @returns
   */
  private filterQueryResults(
    entityId: string,
    queryResults: QueryResults<DynaRecord>
  ): SortedQueryResults {
    return queryResults.reduce<SortedQueryResults>(
      (acc, res) => {
        if (entityId === res.id) {
          acc.entity = res;
        } else {
          acc.relatedEntities.push(res);
        }

        return acc;
      },
      { entity: undefined, relatedEntities: [] }
    );
  }

  /**
   * Get relationship metadata for the associations included in the query
   * @param includedAssociations
   * @returns
   */
  private getIncludedRelationships(
    includedAssociations: IncludedAssociations<T>
  ): RelationshipMetadata[] {
    return includedAssociations.reduce<RelationshipMetadata[]>(
      (acc, includedRel) => {
        const key = includedRel.association as string;
        const included = this.entityMetadata.relationships[key];
        if (included !== undefined) acc.push(included);
        return acc;
      },
      []
    );
  }

  /**
   * Resolve query results into parent entity with included relationships
   * @param parentEntity
   * @param relatedEntities
   * @param includedRelMeta
   * @returns
   */
  private resolveFindByIdIncludesResults(
    parentEntity: QueryResult<DynaRecord>,
    relatedEntities: QueryResults<DynaRecord>,
    includedRelMeta: RelationshipMetadata[]
  ): FindByIdIncludesRes<T, FindByIdOptions<T>> {
    const { relationsLookup } = buildEntityRelationshipMetaObj(includedRelMeta);

    relatedEntities.forEach(entity => {
      const rel = relationsLookup[entity.type];

      if (rel.type === "HasMany" || rel.type === "HasAndBelongsToMany") {
        const entities = entity[rel.propertyName] ?? [];

        if (Array.isArray(entities)) entities.push(entity);

        Object.assign(parentEntity, { [rel.propertyName]: entities });
      } else {
        Object.assign(parentEntity, { [rel.propertyName]: entity });
      }
    });

    return parentEntity as FindByIdIncludesRes<T, FindByIdOptions<T>>;
  }
}

export default FindById;
