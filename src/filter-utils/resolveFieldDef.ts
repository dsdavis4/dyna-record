import type { FieldDef, ObjectSchema } from "../decorators/attributes/types.js";
import { convertFieldToTableItem } from "../decorators/attributes/serializers.js";
import type { DynamoNativeValue, Optional } from "../types.js";

/**
 * Walks an `@ObjectAttribute`'s schema to the field a dot path names.
 *
 * Returns `undefined` when the path cannot be resolved to a field whose schema
 * describes a condition value — the attribute is not an object, a segment names
 * no field, the path descends through an array or a discriminated union (whose
 * element and variant schemas a single path cannot identify), or it ends at an
 * array, whose schema describes the list rather than the element a condition
 * carries. A caller that gets `undefined` leaves the value unvalidated and
 * unconverted, which is how dot paths behaved everywhere before per-field
 * resolution existed.
 * @param schema - The object schema of the attribute the path starts at
 * @param segments - The path segments below that attribute
 * @returns The field definition the path names, or undefined
 */
export const resolveFieldDef = (
  schema: Optional<ObjectSchema>,
  segments: string[]
): Optional<FieldDef> => {
  let fields: Optional<ObjectSchema> = schema;
  let fieldDef: Optional<FieldDef>;

  for (const segment of segments) {
    if (fields === undefined) return undefined;

    // Presence rather than an undefined check: ObjectSchema's index signature
    // types every key as present, so the compiler treats the miss as impossible
    if (!Object.hasOwn(fields, segment)) return undefined;

    fieldDef = fields[segment];
    fields = fieldDef.type === "object" ? fieldDef.fields : undefined;
  }

  // An array field's schema describes the list, while a condition on it carries
  // an element — an IN list of them, or a $contains operand — so validating a
  // condition value against it would reject every one
  return fieldDef?.type === "array" ? undefined : fieldDef;
};

/**
 * Converts a nested field's condition value to the form the table stores.
 *
 * The one assertion on this path. `convertFieldToTableItem` walks a schema whose
 * leaves it cannot type — its own pass-through branch forwards a value the
 * field's zod schema has already validated — so its declared return is
 * `unknown`. Every value reaching here has passed that schema, because the
 * expression builder validates before it converts
 * @param fieldDef - The field the dot path names
 * @param value - The condition value, in the form the entity declares it
 * @returns The value as the table stores it
 */
export const toStoredFieldValue = (
  fieldDef: FieldDef,
  value: unknown
): DynamoNativeValue =>
  convertFieldToTableItem(fieldDef, value) as DynamoNativeValue;

/**
 * Whether a field's stored form differs from its declared one.
 *
 * Only these field types convert: a date is declared as a `Date` and stored as
 * an ISO string, and an object or a discriminated union may contain one at any
 * depth. A string, number, boolean or enum stores exactly what it declares, so
 * a condition on one needs no conversion — and the remedy that points a caller
 * at the declared form would be wrong advice for it
 * @param fieldDef - The field the dot path names
 * @returns Whether a condition value for it has to be converted
 */
export const fieldConverts = (fieldDef: FieldDef): boolean =>
  fieldDef.type === "date" ||
  fieldDef.type === "object" ||
  fieldDef.type === "discriminatedUnion";
