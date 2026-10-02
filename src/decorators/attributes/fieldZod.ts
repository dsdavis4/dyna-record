import { z, type ZodType } from "zod";
import type {
  DiscriminatedUnionFieldDef,
  FieldDef,
  ObjectSchema
} from "./types.js";

/**
 * Schemas already built for a field definition.
 *
 * A filter resolves the same dot path more than once per query — the expression
 * and the attribute names are built in separate passes — and a path ending at
 * an object or a discriminated union rebuilds its whole subtree each time.
 * Field definitions are schema metadata that outlives any one query, so keying
 * on the definition itself is safe and releases with it
 */
const builtSchemas = new WeakMap<FieldDef, ZodType>();

/**
 * Builds a Zod shape record from an {@link ObjectSchema} using the provided
 * field converter function. Shared by both full and partial schema builders.
 */
function buildZodShape(
  schema: ObjectSchema,
  fieldConverter: (fieldDef: FieldDef) => ZodType
): Record<string, ZodType> {
  const shape: Record<string, ZodType> = {};
  for (const [key, fieldDef] of Object.entries(schema)) {
    shape[key] = fieldConverter(fieldDef);
  }
  return shape;
}

/**
 * Converts an {@link ObjectSchema} to a partial Zod schema for update validation.
 *
 * All fields become optional (can be omitted). Nullable fields accept `null`.
 * Non-nullable fields reject `null`. Nested objects are recursively partial.
 * Array items validate normally (full replacement).
 *
 * @param schema The object schema definition
 * @returns A ZodType that validates partial objects matching the schema
 */
export function objectSchemaToZodPartial(schema: ObjectSchema): ZodType {
  return z.object(buildZodShape(schema, fieldDefToZodPartial)).partial();
}

/**
 * Converts a single {@link FieldDef} to the corresponding partial Zod type.
 * Nested objects use partial schemas; all other types use the standard schema.
 * Object fields are never nullable — they always exist as at least `{}`.
 * Discriminated union fields use the full schema (not partial) since they
 * always use full replacement on update.
 */
function fieldDefToZodPartial(fieldDef: FieldDef): ZodType {
  switch (fieldDef.type) {
    case "object":
      return objectSchemaToZodPartial(fieldDef.fields);
    case "discriminatedUnion":
      // Discriminated unions use full replacement — same schema as create
      return discriminatedUnionToZod(fieldDef);
    default:
      // For non-object fields, use the standard schema (includes nullable wrapping)
      return fieldDefToZod(fieldDef);
  }
}

/**
 * Converts an {@link ObjectSchema} to a Zod schema for runtime validation.
 *
 * @param schema The object schema definition
 * @returns A ZodType that validates objects matching the schema
 */
export function objectSchemaToZod(schema: ObjectSchema): ZodType {
  return z.object(buildZodShape(schema, fieldDefToZod));
}

/**
 * Builds a Zod `discriminatedUnion` schema from a {@link DiscriminatedUnionFieldDef}.
 *
 * Each variant's ObjectSchema is converted to a `z.object()` and extended with a
 * `z.literal()` for the discriminator key. The resulting schemas are wrapped in
 * `z.discriminatedUnion()`.
 *
 * @param fieldDef The discriminated union field definition
 * @returns A ZodType that validates discriminated union values
 */
function discriminatedUnionToZod(
  fieldDef: DiscriminatedUnionFieldDef
): ZodType {
  const variantEntries = Object.entries(fieldDef.variants);

  if (variantEntries.length === 0) {
    throw new Error("DiscriminatedUnionFieldDef requires at least one variant");
  }

  const variantSchemas = variantEntries.map(
    ([variantKey, variantObjectSchema]) => {
      const variantZod = objectSchemaToZod(variantObjectSchema) as z.ZodObject;
      return variantZod.extend({
        [fieldDef.discriminator]: z.literal(variantKey)
      });
    }
  );

  let zodType: ZodType = z.discriminatedUnion(
    fieldDef.discriminator,
    variantSchemas as [z.ZodObject, ...z.ZodObject[]]
  );

  if (fieldDef.nullable === true) {
    zodType = zodType.optional().nullable();
  }

  return zodType;
}

/**
 * Converts a single {@link FieldDef} to the corresponding Zod type for runtime validation.
 *
 * Handles all field types:
 * - `"object"` → recursively builds a `z.object()` via {@link objectSchemaToZod}.
 *   Object fields are never nullable — DynamoDB requires them to exist for document path updates.
 * - `"discriminatedUnion"` → `z.discriminatedUnion()` via {@link discriminatedUnionToZod}
 * - `"array"` → `z.array()` wrapping a recursive call for the `items` type
 * - `"string"` → `z.string()`
 * - `"number"` → `z.number()`
 * - `"boolean"` → `z.boolean()`
 * - `"enum"` → `z.enum(values)` for string literal validation
 *
 * When `nullable` is `true` (non-object fields only), wraps the type with `.optional().nullable()`.
 *
 * @param fieldDef The field definition to convert
 * @returns A ZodType that validates values matching the field definition
 */
export function fieldDefToZod(fieldDef: FieldDef): ZodType {
  const built = builtSchemas.get(fieldDef);
  if (built !== undefined) return built;

  const schema = buildFieldDefZod(fieldDef);
  builtSchemas.set(fieldDef, schema);
  return schema;
}

/**
 * Builds a field's Zod schema. Call {@link fieldDefToZod}, which memoizes this
 * @param fieldDef The field definition
 * @returns A ZodType validating values of that field
 */
function buildFieldDefZod(fieldDef: FieldDef): ZodType {
  // These types handle their own nullable semantics or are never nullable
  switch (fieldDef.type) {
    case "object":
      return objectSchemaToZod(fieldDef.fields);
    case "discriminatedUnion":
      return discriminatedUnionToZod(fieldDef);
  }

  let zodType: ZodType;

  switch (fieldDef.type) {
    case "array":
      zodType = z.array(fieldDefToZod(fieldDef.items));
      break;
    case "string":
      zodType = z.string();
      break;
    case "number":
      zodType = z.number();
      break;
    case "boolean":
      zodType = z.boolean();
      break;
    case "date":
      zodType = z.date();
      break;
    case "enum":
      zodType = z.enum(fieldDef.values);
      break;
    default: {
      const _exhaustiveCheck: never = fieldDef;
      throw new Error("Unsupported field type");
    }
  }

  if (fieldDef.nullable === true) {
    zodType = zodType.optional().nullable();
  }

  return zodType;
}
