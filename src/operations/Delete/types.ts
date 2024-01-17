import type SingleTableDesign from "../../SingleTableDesign";
import { type QueryResult } from "../Query";

export interface DeleteOptions {
  errorMessage: string;
}

export type ItemKeys<T extends SingleTableDesign> = Partial<QueryResult<T>>;
