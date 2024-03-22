import type { QueryItems } from "../../dynamo-utils";
import type NoOrm from "../../NoOrm";
import type { EntityAttributes, RelationshipAttributeNames } from "../types";
import type { BelongsToLinkDynamoItem } from "../../types";

export interface FindByIdOptions<T extends NoOrm> {
  include?: Array<{ association: RelationshipAttributeNames<T> }>;
}

export type IncludedAssociations<T extends NoOrm> = NonNullable<
  FindByIdOptions<T>["include"]
>;

export interface SortedQueryResults {
  item: QueryItems[number];
  belongsToLinks: BelongsToLinkDynamoItem[];
}

type IncludedKeys<T extends NoOrm, Opts extends FindByIdOptions<T>> =
  Opts extends Required<FindByIdOptions<T>>
    ? [...NonNullable<Opts>["include"]][number]["association"]
    : never;

type EntityKeysWithIncludedAssociations<T extends NoOrm, P extends keyof T> = {
  [K in P]: T[K] extends NoOrm
    ? EntityAttributes<T>
    : T[K] extends NoOrm[]
      ? Array<EntityAttributes<T>>
      : T[K];
};

export type FindByIdIncludesRes<
  T extends NoOrm,
  Opts extends FindByIdOptions<T>
> = EntityKeysWithIncludedAssociations<
  T,
  keyof EntityAttributes<T> | IncludedKeys<T, Opts>
>;
