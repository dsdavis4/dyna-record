import type { NativeAttributeValue } from "@aws-sdk/util-dynamodb";

/**
 * Provides serialization and deserialization functions for date attributes when interfacing with a DynamoDB table, enabling the conversion between the table's string-based date representation and JavaScript's `Date` object. DynamoDb dos not support Date types naturally, this utility allows for Date attributes to be serialized to an entity and stored as ISO strings in Dynamo.
 *
 * - `toEntityAttribute`: Converts a DynamoDB attribute value to a JavaScript `Date` object.
 * - `toTableAttribute`: Converts a JavaScript `Date` object to a string representation suitable for DynamoDB storage, specifically using the ISO 8601 format. This ensures that date information is stored in a consistent and queryable format within DynamoDB.
 *
 */
export const dateSerializer = {
  toEntityAttribute: (val: NativeAttributeValue) => {
    if (typeof val === "string") {
      return new Date(val);
    }
    return val;
  },
  toTableAttribute: (val?: Date) => val?.toISOString() ?? undefined
};
