import { z, type ZodType } from "zod";
import type DynaRecord from "../../DynaRecord";
import Metadata from "../../metadata";
import type {
  AttributeDecoratorContext,
  NonNullAttributeOptions
} from "../types";
import type {
  ObjectSchema,
  InferObjectSchema,
  FieldDef,
  DiscriminatedUnionFieldDef
} from "./types";
import { createObjectSerializer } from "./serializers";

/**
 * Options for the `@ObjectAttribute` decorator.
 * Extends {@link NonNullAttributeOptions} with a required `schema` field describing the object shape.
 *
 * **Object attributes are never nullable.** DynamoDB cannot update nested document paths
 * (e.g. `address.geo.lat`) if the parent object does not exist, which causes:
 * `ValidationException: The document path provided in the update expression is invalid for update`.
 * To avoid this, `@ObjectAttribute` fields always exist as at least an empty object `{}`.
 *
 * The schema supports all {@link FieldDef} types: primitives, enums, nested objects, and arrays.
 * Non-object fields within the schema may still be nullable.
 *
 * @template S The specific ObjectSchema type used for type inference
 *
 * @example
 * ```typescript
 * @ObjectAttribute({ alias: "Address", schema: addressSchema })
 * public readonly address: InferObjectSchema<typeof addressSchema>;
 * ```
 */
export interface ObjectAttributeOptions<S extends ObjectSchema>
  extends NonNullAttributeOptions {
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
 * Object fields are never nullable — they always exist as at least `{}`.
 * Discriminated union fields use the full schema (not partial) since they
 * always use full replacement on update.
 */
function fieldDefToZodPartial(fieldDef: FieldDef): ZodType {
  if (fieldDef.type === "object") {
    return objectSchemaToZodPartial(fieldDef.fields);
  }

  if (fieldDef.type === "discriminatedUnion") {
    // Discriminated unions use full replacement — same schema as create
    return discriminatedUnionToZod(fieldDef);
  }

  // For non-object fields, use the standard schema (includes nullable wrapping)
  return fieldDefToZod(fieldDef);
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
  const variantSchemas = Object.entries(fieldDef.variants).map(
    ([variantKey, variantObjectSchema]) => {
      const variantZod = objectSchemaToZod(variantObjectSchema) as z.ZodObject;
      return variantZod.extend({
        [fieldDef.discriminator]: z.literal(variantKey)
      });
    }
  );

  let zodType: ZodType = z.discriminatedUnion(
    fieldDef.discriminator,
    variantSchemas as [z.ZodObject, z.ZodObject, ...z.ZodObject[]]
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
function fieldDefToZod(fieldDef: FieldDef): ZodType {
  // Object fields return early — they are never nullable
  if (fieldDef.type === "object") {
    return objectSchemaToZod(fieldDef.fields);
  }

  // Discriminated union fields handle their own nullable wrapping
  if (fieldDef.type === "discriminatedUnion") {
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

/**
 * A decorator for marking class fields as structured object attributes within the context of a single-table design entity.
 *
 * Objects are stored as native DynamoDB Map types and validated at runtime against the provided schema.
 * The TypeScript type is inferred from the schema using {@link InferObjectSchema}.
 *
 * **Object attributes are never nullable.** DynamoDB cannot update nested document paths
 * (e.g. `address.geo.lat`) if the parent object does not exist, which causes:
 * `ValidationException: The document path provided in the update expression is invalid for update`.
 * To prevent this, `@ObjectAttribute` fields must always exist as at least an empty object `{}`.
 * Similarly, nested object fields within the schema cannot be nullable.
 *
 * **Supported field types within the schema:**
 * - `"string"`, `"number"`, `"boolean"` — primitives (support `nullable: true`)
 * - `"enum"` — string literal unions (support `nullable: true`)
 * - `"date"` — dates stored as ISO strings (support `nullable: true`)
 * - `"object"` — nested objects, arbitrarily deep (**never nullable**)
 * - `"array"` — lists of any field type (support `nullable: true`, full replacement on update)
 *
 * Objects within arrays are not subject to the document path limitation because arrays
 * use full replacement on update. Partial updates of individual objects within arrays
 * are not supported.
 *
 * @template T The class type that the decorator is applied to
 * @template S The ObjectSchema type used for validation and type inference
 * @template K The inferred TypeScript type from the schema
 * @template P The decorator options type
 * @param props An {@link ObjectAttributeOptions} object providing the `schema` and optional `alias`.
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
function ObjectAttribute<T extends DynaRecord, const S extends ObjectSchema>(
  props: ObjectAttributeOptions<S>
) {
  return function (
    _value: undefined,
    context: AttributeDecoratorContext<
      T,
      InferObjectSchema<S>,
      ObjectAttributeOptions<S>
    >
  ) {
    context.addInitializer(function (this: T) {
      const { schema, ...restProps } = props;
      const zodSchema = objectSchemaToZod(schema);
      const partialZodSchema = objectSchemaToZodPartial(schema);
      const serializers = createObjectSerializer(schema);

      Metadata.addEntityAttribute(this.constructor.name, {
        attributeName: context.name.toString(),
        type: zodSchema,
        partialType: partialZodSchema,
        serializers,
        nullable: false,
        objectSchema: schema,
        ...restProps
      });
    });
  };
}

export default ObjectAttribute;
