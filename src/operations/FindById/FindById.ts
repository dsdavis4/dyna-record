import type DynaRecord from "../../DynaRecord";
import { type RelationshipMetadata } from "../../metadata";
import { includedRelationshipsFilter } from "../../query-utils/Filters";
import { DynamoClient } from "../../dynamo-utils";
import type { Optional, RelationshipLookup } from "../../types";
import { safeAssign, tableItemToEntity } from "../../utils";
import OperationBase from "../OperationBase";
import type {
  FindByIdOptions,
  FindByIdIncludesRes,
  IncludedAssociations,
  SortedQueryResults
} from "./types";
import { buildEntityRelationshipMetaObj, consistentReadVal } from "../utils";
import { type QueryResult, type QueryResults } from "../Query";
import {
  isHasAndBelongsToManyRelationship,
  isHasManyRelationship
} from "../../metadata/utils";

/**
 * Facilitates the retrieval of an entity by its identifier (ID) from the database, potentially including its associated entities based on specified relationships.
 *
 * It supports fetching an entity solely by its ID or along with its related entities through specified associations, allowing for flexible retrieval of complex entity graphs in a single operation.
 *
 * @template T - The type of the entity being retrieved, extending `DynaRecord`.
 */
class FindById<T extends DynaRecord> extends OperationBase<T> {
  /**
   * Find an entity by Id and optionally include associations
   * @param {string} id - Entity Id
   * @param {Object} options - FindById options
   * @param {Object[]=} options.include - The associations to include in the query
   * @param {string} options.include[].association - The name of the association to include. Must be defined on the model
   * @returns An entity with optional included associations serialized
   */
  public async run<Inc extends IncludedAssociations<T> = []>(
    id: string,
    options?: FindByIdOptions<T, Inc>
  ): Promise<Optional<T | FindByIdIncludesRes<T, Inc>>> {
    if (options?.include === undefined) {
      return await this.findByIdOnly(id, {
        consistentRead: options?.consistentRead
      });
    } else {
      return await this.findByIdWithIncludes(id, {
        includedAssociations: options.include,
        consistentRead: options?.consistentRead
      });
    }
  }

  /**
   * Find an Entity by id without associations
   * @param {string} id - Entity Id
   * @returns An entity object or undefined
   */
  private async findByIdOnly(
    id: string,
    options: Pick<FindByIdOptions<T>, "consistentRead">
  ): Promise<Optional<T>> {
    const { name: tableName } = this.tableMetadata;

    const res = await DynamoClient.getItem({
      TableName: tableName,
      Key: {
        [this.partitionKeyAlias]: this.EntityClass.partitionKeyValue(id),
        [this.sortKeyAlias]: this.EntityClass.name
      },
      ConsistentRead: consistentReadVal(options.consistentRead)
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
  private async findByIdWithIncludes<Inc extends IncludedAssociations<T> = []>(
    id: string,
    options: Pick<FindByIdOptions<T>, "consistentRead"> & {
      includedAssociations: Inc;
    }
  ): Promise<Optional<FindByIdIncludesRes<T, Inc>>> {
    const includedRelMeta = this.getIncludedRelationships(
      options.includedAssociations
    );

    const includedTypesFilter = includedRelationshipsFilter(
      this.EntityClass.name,
      includedRelMeta
    );

    const queryResults = await this.EntityClass.query<DynaRecord>(id, {
      filter: includedTypesFilter,
      consistentRead: consistentReadVal(options.consistentRead)
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
  private getIncludedRelationships<Inc extends IncludedAssociations<T>>(
    includedAssociations: Inc
  ): RelationshipMetadata[] {
    return includedAssociations.reduce<RelationshipMetadata[]>(
      (acc, includedRel: IncludedAssociations<T>[number]) => {
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
  private resolveFindByIdIncludesResults<
    Inc extends IncludedAssociations<T> = []
  >(
    parentEntity: QueryResult<DynaRecord>,
    relatedEntities: QueryResults<DynaRecord>,
    includedRelMeta: RelationshipMetadata[]
  ): FindByIdIncludesRes<T, Inc> {
    const { relationsLookup } = buildEntityRelationshipMetaObj(includedRelMeta);

    this.setIncludedRelationshipDefaults(parentEntity, relationsLookup);

    relatedEntities.forEach(entity => {
      const rel = relationsLookup[entity.type];

      if (rel.type === "HasMany" || rel.type === "HasAndBelongsToMany") {
        const entities = parentEntity[rel.propertyName];

        if (Array.isArray(entities)) entities.push(entity);

        Object.assign(parentEntity, { [rel.propertyName]: entities });
      } else {
        Object.assign(parentEntity, { [rel.propertyName]: entity });
      }
    });

    return parentEntity as FindByIdIncludesRes<T, Inc>;
  }

  /**
   * Initializes default values for included relationships on a parent entity. It assigns
   * an empty array to each relationship property for HasMany and HasAndBelongsToMany specified in `relationsLookup` if the property exists on `parentEntity`.
   *
   * @param parentEntity - The parent entity to initialize relationship properties on.
   * @param relationsLookup - A mapping of relationship identifiers to their descriptions, including the relationship
   * type and the property name on the parent entity.
   */
  private setIncludedRelationshipDefaults(
    parentEntity: QueryResult<DynaRecord>,
    relationsLookup: RelationshipLookup
  ): void {
    Object.values(relationsLookup).forEach(rel => {
      if (
        isHasManyRelationship(rel) ||
        isHasAndBelongsToManyRelationship(rel)
      ) {
        safeAssign(parentEntity, rel.propertyName, []);
      }
    });
  }
}

export default FindById;
