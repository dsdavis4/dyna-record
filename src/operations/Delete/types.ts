import type DynaRecord from "../../DynaRecord";
import { type QueryResult } from "../Query";

export interface DeleteOptions {
  errorMessage: string;
}

// TODO it tis used?
export type ItemKeys<T extends DynaRecord> = Partial<QueryResult<T>>;
