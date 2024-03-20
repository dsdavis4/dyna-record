import type NoOrm from "../../NoOrm";
import type {
  KeyConditions,
  QueryOptions as QueryBuilderOptions,
  SortKeyCondition
} from "../../query-utils";
import type { BelongsToLink } from "../../relationships";
import type { EntityAttributes } from "../types";

export interface QueryOptions extends QueryBuilderOptions {
  skCondition?: SortKeyCondition;
}

export type EntityKeyConditions<T> = {
  [K in keyof T]?: KeyConditions;
};

export type QueryResults<T extends NoOrm> = Array<
  EntityAttributes<T> | BelongsToLink
>;

export type QueryResult<T extends NoOrm> = QueryResults<T>[number];
