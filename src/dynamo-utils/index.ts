export { default as TransactWriteBuilder } from "./TransactWriteBuilder.js";
export { default as TransactGetBuilder } from "./TransactGetBuilder.js";
export { default as DynamoClient } from "./DynamoClient.js";
export {
  resolveClient,
  assertCanSend,
  getDefaultClient
} from "./clientResolution.js";
export type {
  DynaRecordDocumentClient,
  TableClientOptions
} from "./clientResolution.js";

export * from "./TransactWriteBuilder.js";
export * from "./TransactGetBuilder.js";
export * from "./errors.js";
export * from "./types.js";
