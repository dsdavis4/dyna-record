import type {
  QueryCommandOutput,
  TransactGetCommandOutput,
  TransactGetCommandInput,
  TransactWriteCommandInput
} from "@aws-sdk/lib-dynamodb";

/**
 * Represents the responses from a `TransactGetItems` operation in DynamoDB.
 */
export type TransactGetItemResponses = NonNullable<
  TransactGetCommandOutput["Responses"]
>;

/**
 * Represents the items returned from a `Query` operation in DynamoDB.
 */
export type QueryItems = NonNullable<QueryCommandOutput["Items"]>;

/**
 * Represents a non-nullable version of the `TransactItems` array from the `TransactGetCommandInput` interface. This type ensures that the `TransactItems` array cannot be null, enhancing type safety by enforcing the presence of transaction items in operations that require them. It is commonly used in contexts where a transaction involves multiple actions, and each item in the transaction must be explicitly defined without allowing for null values.
 *
 * @type {TransactItems} A type derived from `TransactGetCommandInput["TransactItems"]`, guaranteed to be non-nullable, representing an array of transaction items in a DynamoDB transaction.
 */
export type TransactGetItems = NonNullable<
  TransactGetCommandInput["TransactItems"]
>;

/**
 * Represents a non-nullable version of the `Get` operation within a `TransactItems` array item. This type is used to enforce the presence and correct structure of a `Get` operation within a transaction item, providing stronger type guarantees and facilitating the use of IntelliSense and compile-time checks in development environments.
 *
 * @type {Get} A derived type from `TransactItems[number]["Get"]`, guaranteed to be non-nullable, representing the structure of a `Get` operation in a DynamoDB transaction item.
 */
export type Get = NonNullable<TransactGetItems[number]["Get"]>;

/**
 * Represents a non-nullable version of the `TransactItems` array from the `TransactWriteCommandInput` interface. This type is crucial for operations that involve multiple write actions within a single transaction in DynamoDB, ensuring that the array of transaction items is always defined and non-null.
 *
 * @type {TransactWriteItems} A type derived from `TransactWriteCommandInput["TransactItems"]`, guaranteed to be non-nullable, indicating an array of transaction items for write operations in DynamoDB.
 */
export type TransactWriteItems = NonNullable<
  TransactWriteCommandInput["TransactItems"]
>;

/**
 * Represents the non-nullable structure of a `ConditionCheck` operation within a transaction item in DynamoDB. This type is essential for transactions that include condition checks to ensure specific prerequisites are met before executing the transaction. It enforces the presence and proper structure of condition check operations within transaction items.
 *
 * @type {ConditionCheck} A derived type from `TransactWriteItems[number]["ConditionCheck"]`, guaranteed to be non-nullable, specifying the structure of a `ConditionCheck` operation in a DynamoDB transaction item.
 */
export type ConditionCheck = NonNullable<
  TransactWriteItems[number]["ConditionCheck"]
>;

/**
 * Represents the non-nullable structure of a `Put` operation within a transaction item in DynamoDB. This type ensures that `Put` operations, which create or overwrite items in a table, are always present and correctly structured within transaction items, enhancing type safety and clarity in DynamoDB transactions.
 *
 * @type {Put} A derived type from `TransactWriteItems[number]["Put"]`, guaranteed to be non-nullable, detailing the structure of a `Put` operation in a DynamoDB transaction item.
 */
export type Put = NonNullable<TransactWriteItems[number]["Put"]>;

/**
 * Represents the non-nullable structure of an `Update` operation within a transaction item in DynamoDB. This type is used to enforce the presence and correct structure of `Update` operations, which modify existing items in a table, within transaction items. It contributes to clearer and safer transaction definitions in DynamoDB operations.
 *
 * @type {Update} A derived type from `TransactWriteItems[number]["Update"]`, guaranteed to be non-nullable, outlining the structure of an `Update` operation in a DynamoDB transaction item.
 */
export type Update = NonNullable<TransactWriteItems[number]["Update"]>;

/**
 * Represents the non-nullable structure of a `Delete` operation within a transaction item in DynamoDB. This type ensures that `Delete` operations, which remove items from a table, are always present and correctly structured within transaction items, providing stronger guarantees about transaction item configurations.
 *
 * @type {Delete} A derived type from `TransactWriteItems[number]["Delete"]`, guaranteed to be non-nullable, specifying the structure of a `Delete` operation in a DynamoDB transaction item.
 */
export type Delete = NonNullable<TransactWriteItems[number]["Delete"]>;
