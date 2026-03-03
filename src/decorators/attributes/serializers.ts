import type { NativeAttributeValue } from "@aws-sdk/util-dynamodb";
import type { ObjectSchema, FieldDef } from "./types";
import type { Serializers } from "../../metadata/types";

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

/**
 * Recursively walks an {@link ObjectSchema} and converts the entity value to its
 * DynamoDB representation.
 *
 * - `"date"` fields are converted from `Date` objects to ISO 8601 strings.
 * - `"object"` fields recurse into their nested schema.
 * - `"array"` fields map each item through the same conversion.
 * - `null` and `undefined` values are stripped from the result so that nullable
 *   fields set to `null` are removed from the stored object rather than persisted
 *   as `null` in DynamoDB.
 * - All other field types pass through unchanged.
 *
 * @param schema The {@link ObjectSchema} describing the object shape
 * @param value  The entity-level object value to convert
 * @returns A new object suitable for DynamoDB storage
 */
export function objectToTableItem(
  schema: ObjectSchema,
  value: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, fieldDef] of Object.entries(schema)) {
    const val = value[key];
    if (val === undefined || val === null) {
      continue;
    }
    result[key] = convertFieldToTableItem(fieldDef, val);
  }
  return result;
}

function convertFieldToTableItem(fieldDef: FieldDef, val: unknown): unknown {
  switch (fieldDef.type) {
    case "date":
      return (val as Date).toISOString();
    case "object":
      return objectToTableItem(fieldDef.fields, val as Record<string, unknown>);
    case "array":
      return (val as unknown[]).map(item =>
        convertFieldToTableItem(fieldDef.items, item)
      );
    default:
      return val;
  }
}

/**
 * Recursively walks an {@link ObjectSchema} and converts a DynamoDB table item
 * back to its entity representation.
 *
 * - `"date"` fields are converted from ISO 8601 strings to `Date` objects.
 * - `"object"` fields recurse into their nested schema.
 * - `"array"` fields map each item through the same conversion.
 * - `null` and `undefined` values are stripped from the result so that absent
 *   fields are represented as `undefined` (omitted) on the entity, consistent
 *   with root-level nullable attribute behaviour.
 * - All other field types pass through unchanged.
 *
 * @param schema The {@link ObjectSchema} describing the object shape
 * @param value  The DynamoDB table item to convert
 * @returns A new object with entity-level types (e.g. `Date` instead of string)
 */
export function tableItemToObject(
  schema: ObjectSchema,
  value: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, fieldDef] of Object.entries(schema)) {
    const val = value[key];
    if (val === undefined || val === null) {
      continue;
    }
    result[key] = convertFieldToEntityValue(fieldDef, val);
  }
  return result;
}

function convertFieldToEntityValue(fieldDef: FieldDef, val: unknown): unknown {
  switch (fieldDef.type) {
    case "date":
      return new Date(val as string);
    case "object":
      return tableItemToObject(fieldDef.fields, val as Record<string, unknown>);
    case "array":
      return (val as unknown[]).map(item =>
        convertFieldToEntityValue(fieldDef.items, item)
      );
    default:
      return val;
  }
}

/**
 * Creates a {@link Serializers} pair for an {@link ObjectSchema}.
 *
 * The returned serializers handle:
 * - Converting `Date` fields to/from ISO 8601 strings for DynamoDB storage.
 * - Stripping `null` and `undefined` values so that nullable fields set to
 *   `null` during updates are removed from the stored object.
 *
 * @param schema The {@link ObjectSchema} describing the object shape
 * @returns A `Serializers` object with `toTableAttribute` and `toEntityAttribute` functions
 */
export function createObjectSerializer(schema: ObjectSchema): Serializers {
  return {
    toTableAttribute: (val: Record<string, unknown>) =>
      objectToTableItem(schema, val),
    toEntityAttribute: (val: Record<string, unknown>) =>
      tableItemToObject(schema, val)
  };
}
