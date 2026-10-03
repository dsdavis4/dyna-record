import type { FieldDef, ObjectSchema } from "../decorators/attributes/types.js";
import {
  convertFieldToTableItem,
  fieldConverts
} from "../decorators/attributes/serializers.js";
import type { DynamoNativeValue, Optional } from "../types.js";

/**
 * One segment of a dot path: a field name, plus any list indexes applied to it.
 *
 * `audit[0]` names the first element of the `audit` list, and `grid[0][1]` the
 * second element of that element. The index is DynamoDB's own document-path
 * syntax, and it lives outside the attribute name — `#audit[0]`, never
 * `#audit_0` — because an index is not part of what the attribute is called.
 */
export interface PathSegment {
  /** The field name, with any indexes stripped. */
  name: string;
  /** The list indexes applied to it, outermost first. */
  indexes: number[];
  /** The segment as the caller wrote it, for error messages. */
  raw: string;
}

/**
 * Splits a path segment into the field it names and the indexes applied to it.
 *
 * An attribute name may itself contain brackets, which makes `a[0]` ambiguous
 * in principle. It is read as an index, because that is what DynamoDB's path
 * syntax means by it and what a caller writing it intends; a field genuinely
 * named `a[0]` is reachable only by not being declared that way.
 * @param raw - The segment as written
 * @returns The name and indexes it carries
 */
export const parseSegment = (raw: string): PathSegment => {
  const match = /^(.*?)((?:\[\d+\])*)$/.exec(raw);

  // The pattern matches any string, so a miss is impossible; the guard exists
  // because the compiler cannot know that
  if (match === null) return { name: raw, indexes: [], raw };

  const [, name, suffix] = match;
  const indexes = [...suffix.matchAll(/\[(\d+)\]/g)].map(([, n]) => Number(n));

  return { name, indexes, raw };
};

/**
 * What walking a dot path through a schema found.
 *
 * Three outcomes rather than a field-or-undefined, because the two ways of
 * failing call for different answers. `unknown` means dyna-record cannot see
 * what the path names — a discriminated union variant, or a segment naming no
 * declared field — and every guard abstains on it. `listWithoutIndex` means the
 * path is definitely wrong: it descends *through* a list without saying which
 * element, which DynamoDB answers with no rows and no error.
 */
export type FieldResolution =
  | { outcome: "resolved"; fieldDef: FieldDef }
  | { outcome: "unknown" }
  | { outcome: "listWithoutIndex"; segment: string }
  | { outcome: "indexOnNonList"; segment: string };

/**
 * Walks an `@ObjectAttribute`'s schema to the field a dot path names.
 *
 * A path ending *at* an array resolves: the field exists and its stored form is
 * a List, which is what decides whether a fragment operator applies to it. What
 * its schema cannot do is validate a condition value, because the schema
 * describes the list while a condition carries an element — that judgement
 * belongs to the caller, which has the condition in hand.
 *
 * A path continuing *through* an array needs an index to say which element it
 * means. Without one it names nothing DynamoDB can reach, so it is reported
 * rather than left to return no rows.
 * @param schema - The object schema of the attribute the path starts at
 * @param segments - The parsed path segments below that attribute
 * @returns What the walk found
 */
export const resolveFieldDef = (
  schema: Optional<ObjectSchema>,
  segments: PathSegment[]
): FieldResolution => {
  let fields: Optional<ObjectSchema> = schema;
  let fieldDef: Optional<FieldDef>;

  for (const [position, segment] of segments.entries()) {
    if (fields === undefined) return { outcome: "unknown" };

    // Presence rather than an undefined check: ObjectSchema's index signature
    // types every key as present, so the compiler treats the miss as impossible
    if (!Object.hasOwn(fields, segment.name)) return { outcome: "unknown" };

    fieldDef = fields[segment.name];

    // Each index steps into the list's element type
    for (const _index of segment.indexes) {
      // An index addresses a List element. On any other form there is no
      // element to address, so the path reaches nothing
      if (fieldDef.type !== "array") {
        return { outcome: "indexOnNonList", segment: segment.raw };
      }

      fieldDef = fieldDef.items;
    }

    const isLast = position === segments.length - 1;

    // Still a list, and the path continues: no index said which element
    if (!isLast && fieldDef.type === "array") {
      return { outcome: "listWithoutIndex", segment: segment.raw };
    }

    fields = fieldDef.type === "object" ? fieldDef.fields : undefined;
  }

  return fieldDef === undefined
    ? { outcome: "unknown" }
    : { outcome: "resolved", fieldDef };
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
