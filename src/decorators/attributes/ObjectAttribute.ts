import { z, type ZodType } from "zod";
import type DynaRecord from "../../DynaRecord";
import Metadata from "../../metadata";
import type { AttributeDecoratorContext, AttributeOptions } from "../types";
import type { ObjectSchema, InferObjectSchema, FieldDef } from "./types";

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
 * Recursively converts `Date` objects to ISO strings for DynamoDB storage.
 */
function objectSchemaToTableItem(
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

/**
 * Converts a single field value to its DynamoDB representation.
 */
function convertFieldToTableItem(fieldDef: FieldDef, val: unknown): unknown {
  switch (fieldDef.type) {
    case "date":
      return (val as Date).toISOString();
    case "object":
      return objectSchemaToTableItem(
        fieldDef.fields,
        val as Record<string, unknown>
      );
    case "array":
      return (val as unknown[]).map(item =>
        convertFieldToTableItem(fieldDef.items, item)
      );
    default:
      return val;
  }
}

/**
 * Recursively converts ISO strings back to `Date` objects when reading from DynamoDB.
 */
function tableItemToObjectValue(
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

/**
 * Converts a single field value from DynamoDB to its entity representation.
 */
function convertFieldToEntityValue(fieldDef: FieldDef, val: unknown): unknown {
  switch (fieldDef.type) {
    case "date":
      return new Date(val as string);
    case "object":
      return tableItemToObjectValue(
        fieldDef.fields,
        val as Record<string, unknown>
      );
    case "array":
      return (val as unknown[]).map(item =>
        convertFieldToEntityValue(fieldDef.items, item)
      );
    default:
      return val;
  }
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

        // TODO move this to where other serializers are, and then update the ObjectAttribute test to assert that the serializer is the one called
        const serializers = {
          toTableAttribute: (val: Record<string, unknown>) =>
            objectSchemaToTableItem(schema, val),
          toEntityAttribute: (val: Record<string, unknown>) =>
            tableItemToObjectValue(schema, val)
        };

        Metadata.addEntityAttribute(this.constructor.name, {
          attributeName: context.name.toString(),
          nullable: props?.nullable,
          type: zodSchema,
          serializers,
          ...restProps
        });
      });
    }
  };
}

export default ObjectAttribute;
