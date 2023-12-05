import type { QueryItems } from "../../DynamoClient";
import type SingleTableDesign from "../../SingleTableDesign";
import type { EntityAttributes } from "../types";
import type { BelongsToLinkDynamoItem } from "../../types";
import type { FindByIdOptions } from "./FindById";
import type {
  BelongsToRelationship,
  RelationshipMetadata
} from "../../metadata";

export type IncludedAssociations<T extends SingleTableDesign> = NonNullable<
  FindByIdOptions<T>["include"]
>;

export interface SortedQueryResults {
  item: QueryItems[number];
  belongsToLinks: BelongsToLinkDynamoItem[];
}

type IncludedKeys<
  T extends SingleTableDesign,
  Opts extends FindByIdOptions<T>
> = Opts extends Required<FindByIdOptions<T>>
  ? [...NonNullable<Opts>["include"]][number]["association"]
  : never;

type EntityKeysWithIncludedAssociations<
  T extends SingleTableDesign,
  P extends keyof T
> = {
  [K in P]: T[K] extends SingleTableDesign
    ? EntityAttributes<T>
    : T[K] extends SingleTableDesign[]
    ? Array<EntityAttributes<T>>
    : T[K];
};

export type FindByIdIncludesRes<
  T extends SingleTableDesign,
  Opts extends FindByIdOptions<T>
> = EntityKeysWithIncludedAssociations<
  T,
  keyof EntityAttributes<T> | IncludedKeys<T, Opts>
>;

export type RelationshipLookup = Record<string, RelationshipMetadata>;

export interface RelationshipObj {
  relationsLookup: RelationshipLookup;
  belongsToRelationships: BelongsToRelationship[];
}
