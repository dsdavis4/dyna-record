import type { QueryItems } from "../../dynamo-utils";
import type DynaRecord from "../../DynaRecord";
import type {
  EntityAttributes,
  FunctionFields,
  RelationshipAttributeNames
} from "../types";
import type { BelongsToLinkDynamoItem } from "../../types";
import { QueryResult, QueryResults } from "../Query";

/**
 * Defines options for the `FindById` operation, allowing specification of additional associations to include in the query result.
 *
 * @template T - The type of the entity being queried, extending `DynaRecord`.
 *
 * @property {Array<{ association: RelationshipAttributeNames<T> }>} [include] - An array of association names to be included in the result of the query. Each association name must be a valid relationship attribute name for the entity `T`.
 */
export interface FindByIdOptions<T extends DynaRecord> {
  include?: Array<{ association: RelationshipAttributeNames<T> }>;
}

/**
 * Represents a list of associations to be included in the query result, derived from the `FindByIdOptions`.
 *
 * @template T - The type of the entity being queried, extending `DynaRecord`.
 */
export type IncludedAssociations<T extends DynaRecord> = NonNullable<
  FindByIdOptions<T>["include"]
>;

/**
 * Describes the structure of query results, sorting them into the main entity item and any associated `BelongsToLink` items. Used during processing
 *
 * @property {QueryItems[number]} item - The main entity item retrieved from the query.
 * @property {BelongsToLinkDynamoItem[]} belongsToLinks - An array of `BelongsToLinkDynamoItem` instances associated with the main entity item.
 */
export interface SortedQueryResults {
  entity?: QueryResult<DynaRecord>;
  relatedEntities: QueryResults<DynaRecord>;
}

/**
 * Derives the keys of included associations from `FindByIdOptions`, representing the names of relationships specified to be included in the query result.
 *
 * @template T - The type of the entity being queried, extending `DynaRecord`.
 * @template Opts - The options for the `FindById` operation.
 */
type IncludedKeys<T extends DynaRecord, Opts extends FindByIdOptions<T>> =
  Opts extends Required<FindByIdOptions<T>>
    ? [...NonNullable<Opts>["include"]][number]["association"]
    : never;

/**
 * Describes the entity attributes, extending them with any specified included associations for comprehensive query results.
 *
 * @template T - The type of the entity being queried, extending `DynaRecord`.
 * @template P - The properties of the entity `T`.
 */
type EntityKeysWithIncludedAssociations<
  T extends DynaRecord,
  P extends keyof T
> = {
  [K in P]: T[K] extends DynaRecord
    ? EntityAttributes<T>
    : T[K] extends DynaRecord[]
      ? Array<EntityAttributes<T[K][number]>>
      : T[K];
};

/**
 * Represents the result of a `FindById` operation, including the main entity and any specified associated entities.
 *
 * @template T - The type of the main entity, extending `DynaRecord`.
 * @template Opts - The options for the `FindById` operation, specifying included associations.
 */
export type FindByIdIncludesRes<
  T extends DynaRecord,
  Opts extends FindByIdOptions<T>
> = EntityKeysWithIncludedAssociations<
  T,
  keyof EntityAttributes<T> | IncludedKeys<T, Opts> | FunctionFields<T>
>;
