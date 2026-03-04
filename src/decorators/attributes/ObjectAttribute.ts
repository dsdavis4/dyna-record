import { z, type ZodType } from "zod";
import type DynaRecord from "../../DynaRecord";
import Metadata from "../../metadata";
import type { AttributeDecoratorContext, AttributeOptions } from "../types";
import type { ObjectSchema, InferObjectSchema, FieldDef } from "./types";
import { createObjectSerializer } from "./serializers";

/**
 * Options for the `@ObjectAttribute` decorator.
 * Extends {@link AttributeOptions} with a required `schema` field describing the object shape.
 *
 * The schema supports all {@link FieldDef} types: primitives, enums, nested objects, and arrays.
 *
 * @template S The specific ObjectSchema type used for type inference
 *
 * @example
 * ```typescript
 * @ObjectAttribute({ alias: "Address", schema: addressSchema })
 * public readonly address: InferObjectSchema<typeof addressSchema>;
 *
 * @ObjectAttribute({ alias: "Meta", schema: metaSchema, nullable: true })
 * public readonly meta?: InferObjectSchema<typeof metaSchema>;
 * ```
 */
export interface ObjectAttributeOptions<S extends ObjectSchema>
  extends AttributeOptions {
  /**
   * The {@link ObjectSchema} defining the structure of the object attribute.
   *
   * Must be declared with `as const satisfies ObjectSchema` for accurate type inference.
   */
  schema: S;
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
function objectSchemaToZodPartial(schema: ObjectSchema): ZodType {
  const shape: Record<string, ZodType> = {};

  for (const [key, fieldDef] of Object.entries(schema)) {
    shape[key] = fieldDefToZodPartial(fieldDef);
  }

  return z.object(shape).partial();
}

/**
 * Converts a single {@link FieldDef} to the corresponding partial Zod type.
 * Nested objects use partial schemas; all other types use the standard schema.
 * Nullable handling is applied at the end.
 */
function fieldDefToZodPartial(fieldDef: FieldDef): ZodType {
  let zodType: ZodType;

  if (fieldDef.type === "object") {
    zodType = objectSchemaToZodPartial(fieldDef.fields);
  } else {
    zodType = fieldDefToZod(fieldDef);
    // fieldDefToZod already applied nullable wrapping, so return directly
    return zodType;
  }

  if (fieldDef.nullable === true) {
    zodType = zodType.optional().nullable();
  }

  return zodType;
}

/**
 * Converts an {@link ObjectSchema} to a Zod schema for runtime validation.
 *
 * @param schema The object schema definition
 * @returns A ZodType that validates objects matching the schema
 */
function objectSchemaToZod(schema: ObjectSchema): ZodType {
  const shape: Record<string, ZodType> = {};

  for (const [key, fieldDef] of Object.entries(schema)) {
    shape[key] = fieldDefToZod(fieldDef);
  }

  return z.object(shape);
}

/**
 * Converts a single {@link FieldDef} to the corresponding Zod type for runtime validation.
 *
 * Handles all field types:
 * - `"object"` → recursively builds a `z.object()` via {@link objectSchemaToZod}
 * - `"array"` → `z.array()` wrapping a recursive call for the `items` type
 * - `"string"` → `z.string()`
 * - `"number"` → `z.number()`
 * - `"boolean"` → `z.boolean()`
 * - `"enum"` → `z.enum(values)` for string literal validation
 *
 * When `nullable` is `true`, wraps the type with `.optional().nullable()`.
 *
 * @param fieldDef The field definition to convert
 * @returns A ZodType that validates values matching the field definition
 */
function fieldDefToZod(fieldDef: FieldDef): ZodType {
  let zodType: ZodType;

  switch (fieldDef.type) {
    case "object":
      zodType = objectSchemaToZod(fieldDef.fields);
      break;
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _exhaustiveCheck: never = fieldDef;
      throw new Error("Unsupported field type");
    }
  }

  if (fieldDef.nullable === true) {
    zodType = zodType.optional().nullable();
  }

  return zodType;
}

/**
 * A decorator for marking class fields as structured object attributes within the context of a single-table design entity.
 *
 * Objects are stored as native DynamoDB Map types and validated at runtime against the provided schema.
 * The TypeScript type is inferred from the schema using {@link InferObjectSchema}.
 *
 * Can be set to nullable via decorator props.
 *
 * **Supported field types within the schema:**
 * - `"string"`, `"number"`, `"boolean"` — primitives
 * - `"enum"` — string literal unions, validated at runtime via `z.enum()`
 * - `"object"` — nested objects (arbitrarily deep)
 * - `"array"` — lists of any field type
 *
 * All field types support `nullable: true` to remove them
 *
 * @template T The class type that the decorator is applied to
 * @template S The ObjectSchema type used for validation and type inference
 * @template K The inferred TypeScript type from the schema
 * @template P The decorator options type
 * @param props An {@link ObjectAttributeOptions} object providing the `schema` and optional `alias` and `nullable` configuration.
 * @returns A class field decorator function
 *
 * Usage example:
 * ```typescript
 * const addressSchema = {
 *   street: { type: "string" },
 *   city: { type: "string" },
 *   zip: { type: "number", nullable: true },
 *   category: { type: "enum", values: ["home", "work", "other"] },
 *   geo: {
 *     type: "object",
 *     fields: {
 *       lat: { type: "number" },
 *       lng: { type: "number" },
 *       accuracy: { type: "enum", values: ["precise", "approximate"] }
 *     }
 *   }
 * } as const satisfies ObjectSchema;
 *
 * class MyEntity extends MyTable {
 *   @ObjectAttribute({ alias: 'Address', schema: addressSchema })
 *   public address: InferObjectSchema<typeof addressSchema>;
 *
 *   @ObjectAttribute({ alias: 'Meta', schema: metaSchema, nullable: true })
 *   public meta?: InferObjectSchema<typeof metaSchema>;
 * }
 *
 * // TypeScript infers:
 * // address.category → "home" | "work" | "other"
 * // address.geo.accuracy → "precise" | "approximate"
 * ```
 *
 * **Partial updates:** When updating an entity, `@ObjectAttribute` fields support partial
 * updates — only the fields you provide are modified, omitted fields are preserved. Under
 * the hood, dyna-record generates DynamoDB document path expressions
 * (e.g., `SET #address.#street = :address_street`) instead of replacing the entire map.
 * Nested objects are recursively merged. Arrays within objects are full replacement.
 * Setting a nullable field within an object to `null` generates a `REMOVE` expression
 * for that specific field.
 *
 * ```typescript
 * // Only updates street — city, zip, geo are preserved
 * await MyEntity.update("id", { address: { street: "456 Oak Ave" } });
 *
 * // Remove a nullable field within the object
 * await MyEntity.update("id", { address: { zip: null } });
 *
 * // Setting a nullable ObjectAttribute itself to null removes the entire object
 * await MyEntity.update("id", { meta: null });
 * ```
 *
 * Object attributes support filtering in queries using dot-path notation for nested fields
 * and the {@link ContainsFilter | $contains} operator for List membership checks.
 *
 * ```typescript
 * await MyEntity.query("123", {
 *   filter: { "address.city": "Springfield" }
 * });
 *
 * await MyEntity.query("123", {
 *   filter: { "address.tags": { $contains: "home" } }
 * });
 * ```
 */
function ObjectAttribute<
  T extends DynaRecord,
  const S extends ObjectSchema,
  P extends ObjectAttributeOptions<S>
>(props: P) {
  return function (
    _value: undefined,
    context: AttributeDecoratorContext<T, InferObjectSchema<S>, P>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function (this: T) {
        const { schema, ...restProps } = props;
        const zodSchema = objectSchemaToZod(schema);
        const partialZodSchema = objectSchemaToZodPartial(schema);
        const serializers = createObjectSerializer(schema);

        Metadata.addEntityAttribute(this.constructor.name, {
          attributeName: context.name.toString(),
          nullable: props?.nullable,
          type: zodSchema,
          partialType: partialZodSchema,
          serializers,
          objectSchema: schema,
          ...restProps
        });
      });
    }
  };
}

export default ObjectAttribute;
