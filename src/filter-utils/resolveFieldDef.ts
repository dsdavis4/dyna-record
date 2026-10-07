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
 * Several outcomes rather than a field-or-undefined, because the ways of
 * failing call for different answers. `unknown` means dyna-record cannot see
 * what the path names — a discriminated union variant, whose fields the walk
 * does not follow — and every guard abstains on it. The rest mean the path is
 * definitely wrong, each in a way DynamoDB answers with no rows and no error:
 * `listWithoutIndex` descends *through* a list without saying which element,
 * `indexOnNonList` indexes a field that holds no list, `undeclaredField` names
 * a field a declared object does not have, and `pathPastScalar` continues below
 * a value that has no fields at all.
 */
export type FieldResolution =
  | { outcome: "resolved"; fieldDef: FieldDef }
  | { outcome: "unknown" }
  | { outcome: "listWithoutIndex"; segment: string }
  | { outcome: "indexOnNonList"; segment: string }
  | { outcome: "undeclaredField"; field: string; declared: string[] }
  | { outcome: "pathPastScalar"; segment: string; field: string };

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
 * rather than left to return no rows — as is a segment a declared object does
 * not have, and one continuing below a scalar. Only a discriminated union stops
 * the walk short of a judgement: its variants' fields are not followed.
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
  let previous: Optional<PathSegment>;

  for (const [position, segment] of segments.entries()) {
    if (fields === undefined) {
      // No schema to walk, or a union whose variant the path does not say:
      // the field may exist, so the walk cannot judge it
      if (
        previous === undefined ||
        fieldDef === undefined ||
        fieldDef.type === "discriminatedUnion"
      ) {
        return { outcome: "unknown" };
      }

      // Anything else without fields is a scalar — an object has fields, and a
      // list with the path continuing was reported below — so nothing lies
      // under it for the segment to name
      return {
        outcome: "pathPastScalar",
        segment: previous.raw,
        field: segment.name
      };
    }

    // Presence rather than an undefined check: ObjectSchema's index signature
    // types every key as present, so the compiler treats the miss as impossible
    if (!Object.hasOwn(fields, segment.name)) {
      return {
        outcome: "undeclaredField",
        field: segment.name,
        declared: Object.keys(fields)
      };
    }

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
    previous = segment;
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
 * Joins a field to the path of an undeclared field found below it, so a list
 * index reads as one (`entries[0].sku`) and a field as one (`source.by`).
 * @param head - The field or index the walk descended through
 * @param rest - The path found below it
 * @returns The joined path
 */
const joinPath = (head: string, rest: string): string =>
  rest.startsWith("[") ? `${head}${rest}` : `${head}.${rest}`;

/**
 * The first field a value carries that its definition does not declare, as a
 * path from the value's top.
 *
 * Zod's object schemas strip an undeclared key rather than rejecting it, which
 * is right for a value about to be written — the write stores only what the
 * schema declares — and wrong for a value that is compared whole, because the
 * stripped value is not the one the caller described. Walks objects at any
 * depth, each element of a list, and the variant a discriminated union's
 * discriminator names; the discriminator itself is declared by the union.
 *
 * Expects a value its definition's zod schema has accepted, so a shape this
 * walk does not follow — a variant the union does not declare — has already
 * been rejected and is not judged again here
 * @param fieldDef - The definition the value was validated against
 * @param value - The value, in the form the entity declares it
 * @returns The undeclared field's path, or undefined when every field is declared
 */
export const undeclaredFieldIn = (
  fieldDef: FieldDef,
  value: unknown
): Optional<string> => {
  if (fieldDef.type === "array") {
    if (!Array.isArray(value)) return undefined;

    for (const [index, item] of value.entries()) {
      const found = undeclaredFieldIn(fieldDef.items, item);
      if (found !== undefined) return joinPath(`[${String(index)}]`, found);
    }
    return undefined;
  }

  if (fieldDef.type !== "object" && fieldDef.type !== "discriminatedUnion") {
    return undefined;
  }

  if (typeof value !== "object" || value === null) return undefined;

  // Annotated rather than inferred: `Object.entries` on an `object` types each
  // value as `any`, and the walk only ever hands a value on as `unknown`
  const entries: Array<[string, unknown]> = Object.entries(value);
  let fields: Optional<ObjectSchema>;

  if (fieldDef.type === "object") {
    fields = fieldDef.fields;
  } else {
    const variant = entries.find(([key]) => key === fieldDef.discriminator);
    const name = variant?.[1];
    fields =
      typeof name === "string" && Object.hasOwn(fieldDef.variants, name)
        ? fieldDef.variants[name]
        : undefined;
  }

  if (fields === undefined) return undefined;

  for (const [key, field] of entries) {
    // The union declares its discriminator, not the variant
    const isDiscriminator =
      fieldDef.type === "discriminatedUnion" && key === fieldDef.discriminator;
    if (isDiscriminator) continue;

    if (!Object.hasOwn(fields, key)) return key;

    const found = undeclaredFieldIn(fields[key], field);
    if (found !== undefined) return joinPath(key, found);
  }

  return undefined;
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

// Re-exported from the module that owns the conversion, so a caller resolving a
// field and a caller converting one consult the same answer
export { fieldConverts };
