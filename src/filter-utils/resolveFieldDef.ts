import type { FieldDef, ObjectSchema } from "../decorators/attributes/types.js";
import {
  convertFieldToTableItem,
  fieldConverts
} from "../decorators/attributes/serializers.js";
import type { DynamoNativeValue, Optional } from "../types.js";

/**
 * Walks an `@ObjectAttribute`'s schema to the field a dot path names.
 *
 * Returns `undefined` when the path names no field at all — the attribute is
 * not an object, a segment names nothing, or the path descends through an array
 * or a discriminated union, whose element and variant schemas a single path
 * cannot identify. A caller that gets `undefined` leaves the value unvalidated
 * and unconverted, which is how dot paths behaved everywhere before per-field
 * resolution existed.
 *
 * A path ending *at* an array resolves: the field exists and its stored form is
 * a List, which is what decides whether a fragment operator applies to it. What
 * its schema cannot do is validate a condition value, because the schema
 * describes the list while a condition carries an element — that judgement
 * belongs to the caller, which has the condition in hand.
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

  return fieldDef;
};

/**
 * Whether a field's own schema can validate a condition value on it.
 *
 * Exhaustive over `FieldDef`, so a new field type fails compilation here until
 * it declares a stance — the standard the stored-form map sets, applied to the
 * other per-field question a condition has to ask.
 *
 * An array is the one that cannot: its schema describes the list, while a
 * condition on it carries an element — an `IN` element, or a `$contains`
 * operand — so validating against it would reject every one. A discriminated
 * union can: a path ending at one names the whole field, and a condition on it
 * carries a whole variant.
 */
const VALIDATES_CONDITION_VALUE: Record<FieldDef["type"], boolean> = {
  string: true,
  number: true,
  boolean: true,
  date: true,
  enum: true,
  object: true,
  discriminatedUnion: true,
  array: false
};

/**
 * Whether a condition value on this field can be validated against the field's
 * own schema.
 * @param fieldDef - The field a dot path names
 * @returns Whether the schema describes the value a condition carries
 */
export const fieldValidatesConditionValue = (fieldDef: FieldDef): boolean =>
  VALIDATES_CONDITION_VALUE[fieldDef.type];

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

// Re-exported from the module that owns the conversion, so a caller resolving a
// field and a caller converting one consult the same answer
export { fieldConverts };
