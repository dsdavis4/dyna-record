/**
 * dyna-record — strongly-typed DynamoDB ORM with single-table relational
 * modeling.
 *
 * The default export is the {@link DynaRecord} base class; all entity
 * decorators, relationship decorators, utility types, and error classes are
 * re-exported from `./src`.
 *
 * @packageDocumentation
 */
import DynaRecord from "./src/DynaRecord.js";

export default DynaRecord;
export * from "./src/index.js";
