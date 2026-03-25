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
 * | `"date"`    | `Date`          |
 */
export interface PrimitiveTypeMap {
  string: string;
  number: number;
  boolean: boolean;
  date: Date;
}

/**
 * The allowed primitive type strings for object schema fields.
 *
 * Derived from the keys of {@link PrimitiveTypeMap}: `"string" | "number" | "boolean" | "date"`.
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
 * **Object fields are never nullable.** DynamoDB cannot update nested document paths
 * (e.g. `address.geo.lat`) if an intermediate object does not exist, which causes:
 * `ValidationException: The document path provided in the update expression is invalid for update`.
 * To avoid this, object-type fields always exist as at least an empty object `{}`.
 * Non-object fields within the object may still be nullable.
 *
 * Objects within arrays are not subject to this limitation because arrays use full
 * replacement on update rather than document path expressions.
 *
 * @example
 * ```typescript
 * const schema = {
 *   geo: {
 *     type: "object",
 *     fields: {
 *       lat: { type: "number" },
 *       lng: { type: "number" },
 *       notes: { type: "string", nullable: true }
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
  /**
   * A {@link FieldDef} describing the type of each array element.
   * All field types are supported as array items, including discriminated unions.
   * Arrays always use full replacement on update, so discriminated union items
   * are serialized per-element using variant-aware logic.
   */
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
 * A schema field definition for a discriminated union type.
 *
 * The `discriminator` names the key used to distinguish variants, and `variants`
 * maps each discriminator value to an {@link ObjectSchema} describing that variant's
 * fields. The discriminator key is automatically added to each variant's inferred type
 * as a string literal.
 *
 * **Update semantics:** Discriminated union fields always use **full replacement** on
 * update (`SET #field = :value`), never document path merging. This is because:
 * - Different variants have different field sets — a partial document path update could
 *   leave orphaned fields from a previous variant leaking through when variants change.
 * - Avoiding orphaned fields without full replacement would require a read-before-write
 *   to determine the current discriminator value.
 * - This matches array update semantics (also full replacement).
 *
 * Unlike {@link ObjectFieldDef}, discriminated union fields **can be nullable** because
 * they always use full replacement on update rather than document path expressions,
 * so there is no risk of DynamoDB failing on a missing parent path.
 *
 * **Scoping constraints:**
 * - Supported at the ObjectAttribute root level, as fields within an ObjectSchema,
 *   and as array items
 * - Not supported nested inside other discriminated unions
 *
 * @example
 * ```typescript
 * const schema = {
 *   shape: {
 *     type: "discriminatedUnion",
 *     discriminator: "kind",
 *     variants: {
 *       circle: { radius: { type: "number" } },
 *       square: { side: { type: "number" } }
 *     }
 *   }
 * } as const satisfies ObjectSchema;
 *
 * type T = InferObjectSchema<typeof schema>;
 * // { shape: { kind: "circle"; radius: number } | { kind: "square"; side: number } }
 * ```
 */
export interface DiscriminatedUnionFieldDef {
  /** Must be `"discriminatedUnion"` to indicate a discriminated union field. */
  type: "discriminatedUnion";
  /** The key name used to discriminate between variants. */
  discriminator: string;
  /**
   * A record mapping each discriminator value to a {@link NonUnionObjectSchema}
   * describing that variant's fields (excluding the discriminator itself).
   * Discriminated unions cannot be nested inside other discriminated unions.
   */
  variants: Readonly<Record<string, NonUnionObjectSchema>>;
  /** When `true`, the field becomes optional (`T | undefined`). */
  nullable?: boolean;
}

/**
 * A field definition that excludes {@link DiscriminatedUnionFieldDef}.
 *
 * Used in contexts where discriminated unions are not allowed:
 * - {@link DiscriminatedUnionFieldDef} `variants` — discriminated unions cannot
 *   be nested inside other discriminated unions
 */
export type NonUnionFieldDef =
  | PrimitiveFieldDef
  | DateFieldDef
  | ObjectFieldDef
  | ArrayFieldDef
  | EnumFieldDef;

/**
 * A field definition within an {@link ObjectSchema}.
 *
 * This is the union of all supported field types:
 * - {@link PrimitiveFieldDef} — `"string"`, `"number"`, `"boolean"`
 * - {@link DateFieldDef} — dates stored as ISO strings, exposed as `Date` objects
 * - {@link ObjectFieldDef} — nested objects via `fields`
 * - {@link ArrayFieldDef} — arrays/lists via `items`
 * - {@link EnumFieldDef} — string literal enums via `values`
 * - {@link DiscriminatedUnionFieldDef} — discriminated unions via `discriminator` + `variants`
 *
 * Each variant is discriminated by the `type` property.
 */
export type FieldDef = NonUnionFieldDef | DiscriminatedUnionFieldDef;

/**
 * ObjectSchema that excludes discriminated union fields.
 * Used for {@link DiscriminatedUnionFieldDef} variant schemas where
 * nested discriminated unions are not allowed.
 */
export type NonUnionObjectSchema = Record<string, NonUnionFieldDef>;

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
 * Infers the TypeScript type of a {@link DiscriminatedUnionFieldDef}.
 *
 * Iterates over the variant keys and for each produces a union member that is
 * `{ [discriminator]: VariantKey } & InferObjectSchema<VariantSchema>`.
 *
 * @example
 * ```typescript
 * // Given: discriminator: "kind", variants: { circle: { radius: { type: "number" } }, square: { side: { type: "number" } } }
 * // Produces: { kind: "circle"; radius: number } | { kind: "square"; side: number }
 * ```
 */
export type InferDiscriminatedUnion<F extends DiscriminatedUnionFieldDef> = {
  [V in keyof F["variants"] & string]: {
    [D in F["discriminator"]]: V;
  } & InferObjectSchema<F["variants"][V]>;
}[keyof F["variants"] & string];

/**
 * Infers the TypeScript type of a single {@link FieldDef}.
 *
 * Used internally by {@link InferObjectSchema} and for recursive array item inference.
 *
 * Resolution order:
 * 1. {@link DiscriminatedUnionFieldDef} → `InferDiscriminatedUnion<F>`
 * 2. {@link ArrayFieldDef} → `Array<InferFieldDef<items>>`
 * 3. {@link ObjectFieldDef} → `InferObjectSchema<fields>`
 * 4. {@link EnumFieldDef} → `values[number]` (string literal union)
 * 5. {@link PrimitiveFieldDef} → `PrimitiveTypeMap[type]`
 */
export type InferFieldDef<F extends FieldDef> =
  F extends DiscriminatedUnionFieldDef
    ? InferDiscriminatedUnion<F>
    : F extends ArrayFieldDef
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
 * - Nested object fields recurse through `InferObjectSchema` — always required (never nullable)
 * - Array fields become `T[]` where `T` is inferred from `items`
 * - Fields with `nullable: true` become optional (`T | undefined`)
 * - Object fields are always required because DynamoDB cannot update nested document paths
 *   if an intermediate object does not exist
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
  [K in keyof S as S[K] extends { nullable: true } ? never : K]: InferFieldDef<
    S[K]
  >;
} & {
  [K in keyof S as S[K] extends { nullable: true } ? K : never]?: InferFieldDef<
    S[K]
  >;
};
