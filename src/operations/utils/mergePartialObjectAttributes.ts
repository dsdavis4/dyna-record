import type { AttributeMetadataStorage } from "../../metadata";
import type { ObjectSchema } from "../../decorators/attributes/types";

/**
 * Deep merges partial ObjectAttribute updates into the target object.
 * For ObjectAttribute fields: recursively merges using the schema, removing null fields.
 * For regular fields: shallow assigns (existing behavior).
 */
export function mergePartialObjectAttributes(
  target: Record<string, unknown>,
  partial: Record<string, unknown>,
  entityAttrs: AttributeMetadataStorage
): void {
  for (const [key, val] of Object.entries(partial)) {
    if (!(key in entityAttrs)) {
      target[key] = val;
      continue;
    }
    const attrMeta = entityAttrs[key];

    if (attrMeta.objectSchema !== undefined) {
      // Deep merge for ObjectAttribute (objects are never nullable)
      const existing =
        (target[key] as Record<string, unknown> | undefined) ?? {};
      target[key] = deepMergeObject(
        existing,
        val as Record<string, unknown>,
        attrMeta.objectSchema
      );
    } else {
      target[key] = val;
    }
  }
}

/**
 * Recursively deep merges a partial object into an existing object using the schema
 * to determine which fields are nested objects (and should be recursed) vs leaf values
 * (which should be overwritten).
 * - null values cause the key to be deleted
 * - object-type fields per the schema are recursed
 * - everything else (primitives, arrays, dates, enums) is overwritten
 */
function deepMergeObject(
  existing: Record<string, unknown>,
  partial: Record<string, unknown>,
  schema: ObjectSchema
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Copy existing keys, skipping those being nulled
  for (const [key, val] of Object.entries(existing)) {
    if (partial[key] !== null) {
      result[key] = val;
    }
  }

  // Apply updates in a single pass
  for (const [key, val] of Object.entries(partial)) {
    if (val === null || val === undefined) {
      continue;
    }

    if (!(key in schema)) {
      result[key] = val;
      continue;
    }
    const fieldDef = schema[key];

    if (fieldDef.type === "object" && typeof existing[key] === "object") {
      result[key] = deepMergeObject(
        existing[key] as Record<string, unknown>,
        val as Record<string, unknown>,
        fieldDef.fields
      );
    } else {
      result[key] = val;
    }
  }

  return result;
}
