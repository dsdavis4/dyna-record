import { type NativeAttributeValue } from "@aws-sdk/util-dynamodb";
import DynamoClient from "../../dynamo-utils/DynamoClient.js";
import { embedQueryVector } from "../../embedding/embed.js";
import { FilterError, ValidationError } from "../../errors.js";
import {
  FilterExpressionBuilder,
  searchFilterAttributeResolver,
  searchFilterCapabilities,
  type FilterAttributeResolver
} from "../../filter-utils/index.js";
import Metadata, {
  type TableMetadata,
  type VectorIndexSchema
} from "../../metadata/index.js";
import type { StringObj } from "../../types.js";
import { isString, tableItemToEntity } from "../../utils.js";
import type {
  SearchOptions,
  SearchQuery,
  SearchResult,
  SearchResults
} from "./types.js";

/**
 * The number of results returned when `topK` is not provided
 */
const DEFAULT_TOP_K = 10;

/**
 * The maximum `topK` DynamoDB supports on a vector search
 */
const MAX_TOP_K = 100;

/**
 * The compiled `SearchConditionExpression` with its attribute name aliases
 * and value placeholders
 */
interface SearchCondition {
  expression: string;
  names: StringObj;
  values: Record<string, NativeAttributeValue>;
}

/**
 * Represents a vector similarity search against a vector index, compiling to
 * exactly one `SearchVectors` operation.
 *
 * Search is anchored on the index definition and its table — not an entity
 * class — because a global index search has no anchor entity and every search
 * returns a union of the index's member entities. Results are dispatched to
 * their entity classes by the table's `type` discriminator.
 *
 * **What it does:**
 * - Embeds query text through the index's embedding provider, or accepts a
 *   precomputed vector of the index's dimensions.
 * - Compiles the `HASH` scope equality (scoped indexes), the optional `in:`
 *   entity type predicate, and the optional equality filters into the
 *   operation's single condition expression.
 * - Hydrates each result into a complete typed entity instance carrying
 *   `similarity` (per the index model's distance function) and the raw
 *   `score`.
 */
class Search {
  readonly #index: VectorIndexSchema;
  readonly #tableMetadata: TableMetadata;

  constructor(index: VectorIndexSchema) {
    this.#index = index;
    // Looking up the table triggers lazy metadata initialization, which
    // resolves the index's search schema (members, HASH, inline filters)
    this.#tableMetadata = Metadata.getTable(index.tableClassName);
  }

  /**
   * Executes the search operation.
   * @param query - The query text to embed, or `{ vector }` with a precomputed vector.
   * @param options - {@link SearchOptions}
   * @returns A promise resolving to the {@link SearchResults}, ordered most-similar-first.
   */
  public async run(
    query: SearchQuery,
    options?: SearchOptions
  ): Promise<SearchResults> {
    const topK = this.resolveTopK(options?.topK);
    // The condition compiles before the query embeds so invalid input never
    // costs a provider call
    const condition = this.buildSearchCondition(options);
    const searchVector = await this.resolveSearchVector(query);

    const searchResults = await DynamoClient.searchVectors({
      TableName: this.#tableMetadata.name,
      IndexName: this.#index.name,
      SearchVector: searchVector,
      TopK: topK,
      ...(condition.expression !== "" && {
        SearchConditionExpression: condition.expression,
        ExpressionAttributeNames: condition.names,
        ExpressionAttributeValues: condition.values
      })
    });

    return searchResults.map(res => this.resolveSearchResult(res));
  }

  /**
   * Validates and defaults the `topK` option
   * @param topK - The caller-provided `topK`, if any
   * @returns The number of results to request
   */
  private resolveTopK(topK?: number): number {
    if (topK === undefined) return DEFAULT_TOP_K;

    if (!Number.isInteger(topK) || topK < 1 || topK > MAX_TOP_K) {
      throw new ValidationError(
        `topK must be an integer between 1 and ${String(MAX_TOP_K)}. Received: ${String(topK)}`
      );
    }

    return topK;
  }

  /**
   * Resolves the search vector from the query input: embeds text through the
   * index's provider, or validates a precomputed vector's dimensions
   * @param query - The query text or `{ vector }` input
   * @returns The search vector
   */
  private async resolveSearchVector(query: SearchQuery): Promise<number[]> {
    if (isString(query)) {
      if (query === "") {
        throw new ValidationError("Search query text cannot be empty");
      }
      return await embedQueryVector(query, this.#index);
    }

    const { vector } = query;
    const { dimensions } = this.#index.model;

    if (vector.length !== dimensions) {
      throw new ValidationError(
        `Search vector has ${String(vector.length)} dimensions; vector index ${this.#index.name} requires ${String(dimensions)} dimensions`
      );
    }

    return vector;
  }

  /**
   * Compiles the search's single condition expression: the `HASH` scope
   * equality for scoped indexes, the `in:` entity type predicate, and the
   * equality filters — all joined with AND.
   *
   * Value placeholders cannot collide across the three sources: the scope
   * and type predicates use their bare attribute alias while filter
   * placeholders are always counter-suffixed by the expression builder.
   * @param options - The search options
   * @returns The compiled {@link SearchCondition} (empty expression when unconditioned)
   */
  private buildSearchCondition(options?: SearchOptions): SearchCondition {
    const terms: string[] = [];
    let names: StringObj = {};
    let values: Record<string, NativeAttributeValue> = {};

    const { hashAlias } = this.#index;

    if (hashAlias !== undefined) {
      const scopeId = options?.scopeId;
      if (!isString(scopeId) || scopeId === "") {
        throw new ValidationError(
          `Vector index ${this.#index.name} is scoped — provide the scope id of the ${this.#index.scopedBy?.().name ?? "scope parent"} to search within`
        );
      }
      terms.push(`#${hashAlias} = :${hashAlias}`);
      names[`#${hashAlias}`] = hashAlias;
      values[`:${hashAlias}`] = scopeId;
    } else if (options?.scopeId !== undefined) {
      throw new ValidationError(
        `Vector index ${this.#index.name} is global — it does not take a scope id`
      );
    }

    if (options?.in !== undefined) {
      const typePredicate = this.buildTypePredicate(options.in);
      terms.push(typePredicate.expression);
      names = { ...names, ...typePredicate.names };
      values = { ...values, ...typePredicate.values };
    }

    if (options?.filter !== undefined) {
      const filterCondition = this.buildFilterCondition(options.filter);
      terms.push(filterCondition.expression);
      names = { ...names, ...filterCondition.names };
      values = { ...values, ...filterCondition.values };
    }

    return { expression: terms.join(" AND "), names, values };
  }

  /**
   * Builds the entity type equality predicate for the `in:` option,
   * validating the named entity is a member of the index
   * @param entityName - The member entity name to narrow the search to
   * @returns The type predicate's {@link SearchCondition}
   */
  private buildTypePredicate(entityName: string): SearchCondition {
    if (!this.#index.memberEntities.includes(entityName)) {
      throw new ValidationError(
        `Invalid search option in: "${entityName}" is not a member of vector index ${this.#index.name}. Members are: ${this.#index.memberEntities.join(", ")}`
      );
    }

    const typeAlias = this.#tableMetadata.defaultAttributes.type.alias;

    return {
      expression: `#${typeAlias} = :${typeAlias}`,
      names: { [`#${typeAlias}`]: typeAlias },
      values: { [`:${typeAlias}`]: entityName }
    };
  }

  /**
   * Compiles the equality filters through the shared filter core with the
   * search capability set and the index-member attribute resolver
   * @param filter - The search filter conditions
   * @returns The filters' {@link SearchCondition}
   */
  private buildFilterCondition(
    filter: NonNullable<SearchOptions["filter"]>
  ): SearchCondition {
    const builder = new FilterExpressionBuilder({
      capabilities: searchFilterCapabilities,
      resolveAttribute: this.buildFilterAttributeResolver()
    });

    // The filter type admits undefined values (optional keys of the typed
    // filter params); an explicitly-undefined condition is no condition
    const definedConditions = Object.fromEntries(
      Object.entries(filter).filter(([, value]) => value !== undefined)
    );

    const filterParams = builder.filterParams(definedConditions);

    return {
      expression: filterParams.expression,
      names: builder.expressionAttributeNames([], filter),
      values: Object.entries(filterParams.values).reduce<
        Record<string, NativeAttributeValue>
      >(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- NativeAttributeValue is 'any' from AWS SDK
        (acc, [placeholder, value]) => ({ ...acc, [`:${placeholder}`]: value }),
        {}
      )
    };
  }

  /**
   * Wraps the index-member attribute resolver with the scope guard: on a
   * scoped index the `HASH` attribute already carries a mandatory equality,
   * and DynamoDB allows one condition per attribute — a filter on it must be
   * rejected before the operation fails at AWS
   * @returns The guarded {@link FilterAttributeResolver}
   */
  private buildFilterAttributeResolver(): FilterAttributeResolver {
    const resolveAttribute = searchFilterAttributeResolver(this.#index);

    return (attributeKey, filterKey) => {
      const resolved = resolveAttribute(attributeKey, filterKey);

      if (resolved.alias === this.#index.hashAlias) {
        throw new FilterError(
          `Invalid search filter key "${filterKey}": attribute "${attributeKey}" is the scope of vector index ${this.#index.name} and is already constrained by the search's scope id`
        );
      }

      return resolved;
    };
  }

  /**
   * Resolves a raw search result into a typed {@link SearchResult}:
   * dispatches the item to its entity class by the table's `type`
   * discriminator and converts the raw score to a similarity through the
   * index model's distance function
   * @param res - A raw `SearchVectors` result
   * @returns The typed {@link SearchResult}
   */
  private resolveSearchResult(res: {
    Item?: Record<string, NativeAttributeValue>;
    Score?: number;
  }): SearchResult {
    const { Item: item, Score: score } = res;

    if (item === undefined || score === undefined) {
      throw new Error("Malformed search result. Missing item or score");
    }

    const typeAlias = this.#tableMetadata.defaultAttributes.type.alias;
    const entityName: unknown = item[typeAlias];

    if (!isString(entityName)) {
      throw new Error("Malformed data. Unable to infer entity type");
    }

    const entityMeta = Metadata.getEntity(entityName);

    return {
      entity: tableItemToEntity(entityMeta.EntityClass, item),
      similarity: this.#index.model.scoreToSimilarity(score),
      score
    };
  }
}

export default Search;
