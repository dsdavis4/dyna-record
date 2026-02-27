/**
 * Maps schema type strings to their corresponding TypeScript types.
 *
 * Used by {@link InferFieldDef} to resolve primitive field types at the type level.
 *
 * | Schema type | TypeScript type |
 * |-------------|-----------------|
 * | `"string"`  | `string`        |
 * | `"number"`  | `number`        |
 * | `"boolean"` | `boolean`       |
 */
export interface PrimitiveTypeMap {
  string: string;
  number: number;
  boolean: boolean;
  date: Date; // TODO make sure this typedoc gets updated
}

/**
 * The allowed primitive type strings for object schema fields.
 *
 * Derived from the keys of {@link PrimitiveTypeMap}: `"string" | "number" | "boolean"`.
 */
export type PrimitiveFieldType = keyof PrimitiveTypeMap;

/**
 * A schema field definition for a primitive type (`"string"`, `"number"`, or `"boolean"`).
 *
 * @example
 * ```typescript
 * const schema = {
 *   name: { type: "string" },
 *   age: { type: "number", nullable: true },
 *   active: { type: "boolean" }
 * } as const satisfies ObjectSchema;
 * ```
 */
export interface PrimitiveFieldDef {
  /** The primitive type — `"string"`, `"number"`, or `"boolean"`. */
  type: PrimitiveFieldType;
  /** When `true`, the field becomes optional (`T | undefined`). */
  nullable?: boolean;
}

/**
 * A schema field definition for a nested object type.
 *
 * The `fields` property is itself an {@link ObjectSchema}, enabling arbitrarily deep nesting.
 *
 * @example
 * ```typescript
 * const schema = {
 *   geo: {
 *     type: "object",
 *     fields: {
 *       lat: { type: "number" },
 *       lng: { type: "number" }
 *     }
 *   }
 * } as const satisfies ObjectSchema;
 * ```
 */
export interface ObjectFieldDef {
  /** Must be `"object"` to indicate a nested object field. */
  type: "object";
  /** The nested {@link ObjectSchema} describing the object's shape. */
  fields: ObjectSchema;
  /** When `true`, the field becomes optional. */
  nullable?: boolean;
}

/**
 * A schema field definition for an array/list type.
 *
 * The `items` property describes the element type — primitives, enums, objects, or nested arrays.
 * Inferred as `Array<InferFieldDef<items>>`.
 *
 * @example
 * ```typescript
 * const schema = {
 *   tags: { type: "array", items: { type: "string" } },
 *   matrix: { type: "array", items: { type: "array", items: { type: "number" } } }
 * } as const satisfies ObjectSchema;
 * ```
 */
export interface ArrayFieldDef {
  /** Must be `"array"` to indicate a list/array field. */
  type: "array";
  /** A {@link FieldDef} describing the type of each array element. */
  items: FieldDef;
  /** When `true`, the field becomes optional. */
  nullable?: boolean;
}

/**
 * A schema field definition for an enum type.
 *
 * The `values` tuple defines the allowed string literals, used for both
 * TypeScript type inference (`values[number]` → string literal union) and
 * Zod runtime validation (`z.enum(values)`).
 *
 * Enum fields can appear at any nesting level: top-level, inside nested objects,
 * or as array items.
 *
 * @example
 * ```typescript
 * const schema = {
 *   // Top-level enum
 *   status: { type: "enum", values: ["active", "inactive"] },
 *
 *   // Nullable enum
 *   category: { type: "enum", values: ["home", "work", "other"], nullable: true },
 *
 *   // Enum inside a nested object
 *   geo: {
 *     type: "object",
 *     fields: {
 *       accuracy: { type: "enum", values: ["precise", "approximate"] }
 *     }
 *   },
 *
 *   // Array of enum values
 *   roles: { type: "array", items: { type: "enum", values: ["admin", "user", "guest"] } }
 * } as const satisfies ObjectSchema;
 *
 * type T = InferObjectSchema<typeof schema>;
 * // {
 * //   status: "active" | "inactive";
 * //   category?: "home" | "work" | "other";
 * //   geo: { accuracy: "precise" | "approximate" };
 * //   roles: ("admin" | "user" | "guest")[];
 * // }
 * ```
 */
export interface EnumFieldDef {
  /** Must be `"enum"` to indicate an enum field. */
  type: "enum";
  /**
   * A non-empty readonly tuple of allowed string values.
   *
   * At the type level, `values[number]` produces the union of allowed string literals.
   * At runtime, this is passed to `z.enum()` for validation.
   *
   * Must contain at least one value (enforced by the `[string, ...string[]]` tuple type).
   */
  values: readonly [string, ...string[]];
  /** When `true`, the field becomes optional. */
  nullable?: boolean;
}

/**
 * A schema field definition for a date type.
 *
 * Date fields are stored as ISO 8601 strings in DynamoDB and exposed as
 * JavaScript `Date` objects on entities, mirroring `@DateAttribute` behavior.
 *
 * @example
 * ```typescript
 * const schema = {
 *   createdDate: { type: "date" },
 *   deletedAt: { type: "date", nullable: true }
 * } as const satisfies ObjectSchema;
 * ```
 */
export interface DateFieldDef {
  /** Must be `"date"` to indicate a date field. */
  type: "date";
  /** When `true`, the field becomes optional (`Date | undefined`). */
  nullable?: boolean;
}

/**
 * A field definition within an {@link ObjectSchema}.
 *
 * This is the union of all supported field types:
 * - {@link PrimitiveFieldDef} — `"string"`, `"number"`, `"boolean"`
 * - {@link DateFieldDef} — dates stored as ISO strings, exposed as `Date` objects
 * - {@link ObjectFieldDef} — nested objects via `fields`
 * - {@link ArrayFieldDef} — arrays/lists via `items`
 * - {@link EnumFieldDef} — string literal enums via `values`
 *
 * Each variant is discriminated by the `type` property.
 */
export type FieldDef =
  | PrimitiveFieldDef
  | DateFieldDef
  | ObjectFieldDef
  | ArrayFieldDef
  | EnumFieldDef;

/**
 * Declarative schema for describing the shape of an object attribute.
 *
 * Used with `@ObjectAttribute` to provide both runtime validation (via Zod) and
 * compile-time TypeScript type inference (via {@link InferObjectSchema}).
 *
 * Each key maps to a {@link FieldDef} describing the field's type, nesting, and nullability.
 *
 * **Important:** Always declare schemas with `as const satisfies ObjectSchema` to preserve
 * literal types for accurate type inference.
 *
 * @example
 * ```typescript
 * const mySchema = {
 *   name: { type: "string" },
 *   score: { type: "number" },
 *   status: { type: "enum", values: ["active", "inactive"] }
 * } as const satisfies ObjectSchema;
 * ```
 */
export type ObjectSchema = Record<string, FieldDef>;

/**
 * Infers the TypeScript type of a single {@link FieldDef}.
 *
 * Used internally by {@link InferObjectSchema} and for recursive array item inference.
 *
 * Resolution order:
 * 1. {@link ArrayFieldDef} → `Array<InferFieldDef<items>>`
 * 2. {@link ObjectFieldDef} → `InferObjectSchema<fields>`
 * 3. {@link EnumFieldDef} → `values[number]` (string literal union)
 * 4. {@link PrimitiveFieldDef} → `PrimitiveTypeMap[type]`
 */
export type InferFieldDef<F extends FieldDef> = F extends ArrayFieldDef
  ? Array<InferFieldDef<F["items"]>>
  : F extends ObjectFieldDef
    ? InferObjectSchema<F["fields"]>
    : F extends EnumFieldDef
      ? F["values"][number]
      : F extends PrimitiveFieldDef
        ? PrimitiveTypeMap[F["type"]]
        : never;

/**
 * Infers the TypeScript type from an {@link ObjectSchema} definition.
 *
 * - Primitive fields map to their TS equivalents via {@link PrimitiveTypeMap}
 * - Enum fields become a union of their `values` (`values[number]`)
 * - Nested object fields recurse through `InferObjectSchema`
 * - Array fields become `T[]` where `T` is inferred from `items`
 * - Fields with `nullable: true` become optional (`T | undefined`)
 *
 * @example
 * ```typescript
 * const schema = {
 *   name: { type: "string" },
 *   age: { type: "number", nullable: true },
 *   status: { type: "enum", values: ["active", "inactive"] },
 *   tags: { type: "array", items: { type: "string" } },
 *   geo: { type: "object", fields: { lat: { type: "number" }, lng: { type: "number" } } }
 * } as const satisfies ObjectSchema;
 *
 * type MyType = InferObjectSchema<typeof schema>;
 * // {
 * //   name: string;
 * //   status: "active" | "inactive";
 * //   tags: string[];
 * //   geo: { lat: number; lng: number };
 * //   age?: number;
 * // }
 * ```
 */
export type InferObjectSchema<S extends ObjectSchema> = {
  [K in keyof S as S[K]["nullable"] extends true ? never : K]: InferFieldDef<
    S[K]
  >;
} & {
  [K in keyof S as S[K]["nullable"] extends true ? K : never]?: InferFieldDef<
    S[K]
  >;
};
