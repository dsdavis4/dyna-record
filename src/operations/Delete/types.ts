import type DynaRecord from "../../DynaRecord";
import { type QueryResult } from "../Query";

export interface DeleteOptions {
  errorMessage: string;
}

export type ItemKeys<T extends DynaRecord> = Partial<QueryResult<T>>;
