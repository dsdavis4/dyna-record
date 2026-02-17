import type DynaRecord from "../../DynaRecord";
import type {
  EntityAttributesInstance,
  EntityAttributesOnly,
  FunctionFields,
  RelationshipAttributeNames
} from "../types";
import { type QueryResult, type QueryResults } from "../Query";

/**
 * An array of objects each describing an entity relationship association to include.
 */
export type IncludedAssociations<T extends DynaRecord> = Array<{
  association: RelationshipAttributeNames<T>;
}>;

/**
 * Options for the FindById operation.
 *
 * @template T - The type of the entity.
 * @template Inc - The entity relationships to include in the results
 */
export interface FindByIdOptions<
  T extends DynaRecord,
  Inc extends IncludedAssociations<T> = []
> {
  include?: Inc;
  /**
   * Whether to use consistent reads for the operation. Defaults to false.
   * @default false
   */
  consistentRead?: boolean;
}

/**
 * Describes the structure of query results, sorting them into the main entity item and any associated items. Used during processing
 *
 * @property {QueryItems[number]} item - The main entity item retrieved from the query.
 * @property {QueryItems[]} relatedEntities - An array of `denormalized records` instances associated with the main entity item.
 */
export interface SortedQueryResults {
  entity?: QueryResult<DynaRecord>;
  relatedEntities: QueryResults<DynaRecord>;
}

/**
 * Extract the association keys from the include array.
 */
type IncludedKeys<
  T extends DynaRecord,
  Inc extends IncludedAssociations<T> = []
> = Inc[number]["association"];

/**
 * Given an entity type T and a set of keys, produce the output type that augments the
 * entity attributes with included associations.
 */
type EntityKeysWithIncludedAssociations<
  T extends DynaRecord,
  P extends keyof T
> = {
  [K in P]: T[K] extends DynaRecord
    ? EntityAttributesInstance<T[K]>
    : T[K] extends DynaRecord[]
      ? Array<EntityAttributesInstance<T[K][number]>>
      : T[K] extends DynaRecord | undefined
        ? EntityAttributesInstance<Exclude<T[K], undefined>> | undefined
        : T[K];
};

/**
 * The result type for a FindById operation that includes associations.
 *
 * @template T - The type of the entity.
 * @template Inc - The entities relationships of the include array.
 */
export type FindByIdIncludesRes<
  T extends DynaRecord,
  Inc extends IncludedAssociations<T> = []
> = EntityKeysWithIncludedAssociations<
  T,
  keyof EntityAttributesOnly<T> | IncludedKeys<T, Inc> | FunctionFields<T>
>;
