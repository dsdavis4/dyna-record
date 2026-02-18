import type { NativeScalarAttributeValue } from "@aws-sdk/util-dynamodb";

/**
 * Provides serialization and deserialization functions for date attributes when interfacing with a DynamoDB table, enabling the conversion between the table's string-based date representation and JavaScript's `Date` object. DynamoDb dos not support Date types naturally, this utility allows for Date attributes to be serialized to an entity and stored as ISO strings in Dynamo.
 *
 * - `toEntityAttribute`: Converts a DynamoDB attribute value to a JavaScript `Date` object.
 * - `toTableAttribute`: Converts a JavaScript `Date` object to a string representation suitable for DynamoDB storage, specifically using the ISO 8601 format. This ensures that date information is stored in a consistent and queryable format within DynamoDB.
 *
 */
export const dateSerializer = {
  toEntityAttribute: (val: NativeScalarAttributeValue) => {
    if (typeof val === "string") {
      return new Date(val);
    }
    return val;
  },
  toTableAttribute: (val?: Date) => val?.toISOString() ?? undefined
};

// TODO I dont think they have to be stored as strings. They can be stored as map or list types
/**
 * Provides serialization and deserialization functions for object attributes when interfacing with a DynamoDB table.
 * Objects are stored as JSON strings in DynamoDB since DynamoDB does not natively support nested object types in a single-table design context.
 *
 * - `toEntityAttribute`: Parses a JSON string from DynamoDB into a JavaScript object.
 * - `toTableAttribute`: Converts a JavaScript object to a JSON string for DynamoDB storage.
 */
export const objectSerializer = {
  toEntityAttribute: (val: NativeScalarAttributeValue) => {
    if (typeof val === "string") {
      return JSON.parse(val);
    }
    return val;
  },
  toTableAttribute: (val?: Record<string, unknown>) =>
    val == null ? val : JSON.stringify(val)
};
