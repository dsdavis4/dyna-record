import type NoOrm from "../../NoOrm";
import { type QueryResult } from "../Query";

export interface DeleteOptions {
  errorMessage: string;
}

export type ItemKeys<T extends NoOrm> = Partial<QueryResult<T>>;
