/**
 * dyna-record — strongly-typed DynamoDB ORM with single-table relational
 * modeling.
 *
 * The default export is the {@link DynaRecord} base class; all entity
 * decorators, relationship decorators, utility types, and error classes are
 * re-exported from `./src`. Dual-published as ESM (`import`) and CJS
 * (`require`); both forms resolve correct types under TypeScript 6 with
 * `moduleResolution: NodeNext` or `bundler`.
 *
 * @packageDocumentation
 */
import DynaRecord from "./src/DynaRecord";

export default DynaRecord;
export * from "./src";
