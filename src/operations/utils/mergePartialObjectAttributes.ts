import type { AttributeMetadataStorage } from "../../metadata";

/**
 * Deep merges partial ObjectAttribute updates into the target object.
 * For ObjectAttribute fields: recursively merges, removing null fields.
 * For regular fields: shallow assigns (existing behavior).
 */
export function mergePartialObjectAttributes(
  target: Record<string, unknown>,
  partial: Record<string, unknown>,
  entityAttrs: AttributeMetadataStorage
): void {
  for (const [key, val] of Object.entries(partial)) {
    const attrMeta = entityAttrs[key];

    if (attrMeta?.objectSchema !== undefined && val != null) {
      // Deep merge for ObjectAttribute
      const existing =
        (target[key] as Record<string, unknown> | undefined) ?? {};
      target[key] = deepMergeObject(existing, val as Record<string, unknown>);
    } else {
      target[key] = val;
    }
  }
}

/**
 * Recursively deep merges a partial object into an existing object.
 * - null values cause the key to be deleted
 * - nested plain objects are recursed
 * - everything else is overwritten
 */
function deepMergeObject(
  existing: Record<string, unknown>,
  partial: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const nullKeys = new Set<string>();

  // Collect keys being set to null
  for (const [key, val] of Object.entries(partial)) {
    if (val === null) {
      nullKeys.add(key);
    }
  }

  // Copy existing keys that aren't being nulled out
  for (const [key, val] of Object.entries(existing)) {
    if (!nullKeys.has(key)) {
      result[key] = val;
    }
  }

  // Apply updates
  for (const [key, val] of Object.entries(partial)) {
    if (val === null) {
      continue;
    }

    const isNestedMerge =
      val !== undefined &&
      typeof val === "object" &&
      !Array.isArray(val) &&
      !(val instanceof Date) &&
      typeof existing[key] === "object" &&
      existing[key] !== null &&
      !Array.isArray(existing[key]) &&
      !(existing[key] instanceof Date);

    if (isNestedMerge) {
      result[key] = deepMergeObject(
        existing[key] as Record<string, unknown>,
        val as Record<string, unknown>
      );
    } else {
      result[key] = val;
    }
  }

  return result;
}
