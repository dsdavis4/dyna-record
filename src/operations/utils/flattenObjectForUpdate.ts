import type { ObjectSchema } from "../../decorators/attributes/types";
import { convertFieldToTableItem } from "../../decorators/attributes/serializers";
import type { DocumentPathOperation } from "./types";

/**
 * Flattens a partial object value into document path operations for DynamoDB
 * update expressions.
 *
 * For each field in the partial value:
 * - `undefined` → skip (not being updated)
 * - `null` → REMOVE operation
 * - Nested object (`fieldDef.type === "object"`) → recurse, prepending parent path
 * - Everything else (primitives, arrays, dates, enums) → serialize and SET
 *
 * @param parentPath Path segments leading to this object (e.g. ["address"] or ["address", "geo"])
 * @param schema The ObjectSchema describing the object shape
 * @param partialValue The partial object value to flatten
 * @returns Array of DocumentPathOperation for use in expressionBuilder
 */
export function flattenObjectForUpdate(
  parentPath: string[],
  schema: ObjectSchema,
  partialValue: Record<string, unknown>
): DocumentPathOperation[] {
  const ops: DocumentPathOperation[] = [];

  for (const [key, val] of Object.entries(partialValue)) {
    if (!(key in schema)) continue;
    const fieldDef = schema[key];

    const fieldPath = [...parentPath, key];

    if (val === undefined) {
      continue;
    }

    if (val === null) {
      ops.push({ type: "remove", path: fieldPath });
      continue;
    }

    if (fieldDef.type === "object") {
      // Recurse into nested objects
      const nestedOps = flattenObjectForUpdate(
        fieldPath,
        fieldDef.fields,
        val as Record<string, unknown>
      );
      ops.push(...nestedOps);
      continue;
    }

    // Primitives, arrays, dates, enums → serialize and SET
    const serialized = convertFieldToTableItem(fieldDef, val);
    ops.push({ type: "set", path: fieldPath, value: serialized });
  }

  return ops;
}
