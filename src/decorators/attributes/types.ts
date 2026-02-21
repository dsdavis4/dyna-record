/**
 * Maps schema type strings to their corresponding TypeScript types
 */
export interface PrimitiveTypeMap {
  string: string;
  number: number;
  boolean: boolean;
  // TODO a enum or string literal be allowed here?
}

/**
 * The allowed primitive type strings for object schema fields
 */
export type PrimitiveFieldType = keyof PrimitiveTypeMap;

/**
 * A schema field definition for a primitive type (string, number, boolean)
 */
export interface PrimitiveFieldDef {
  type: PrimitiveFieldType;
  nullable?: boolean;
}

/**
 * A schema field definition for a nested object type
 */
export interface ObjectFieldDef {
  type: "object";
  fields: ObjectSchema;
  nullable?: boolean;
}

/**
 * A schema field definition for an array/list type.
 * The `items` property describes the element type — primitives, objects, or nested arrays.
 */
export interface ArrayFieldDef {
  type: "array";
  items: FieldDef;
  nullable?: boolean;
}

/**
 * A field definition within an ObjectSchema — a primitive, nested object, or array
 */
export type FieldDef = PrimitiveFieldDef | ObjectFieldDef | ArrayFieldDef;

/**
 * Declarative schema for describing the shape of an object attribute.
 * Used with `@ObjectAttribute` to provide both runtime validation and TypeScript type inference.
 */
export type ObjectSchema = Record<string, FieldDef>;

/**
 * Infers the TypeScript type of a single {@link FieldDef}.
 * Used internally by {@link InferObjectSchema} and for recursive array item inference.
 */
export type InferFieldDef<F extends FieldDef> = F extends ArrayFieldDef
  ? Array<InferFieldDef<F["items"]>>
  : F extends ObjectFieldDef
    ? InferObjectSchema<F["fields"]>
    : F extends PrimitiveFieldDef
      ? PrimitiveTypeMap[F["type"]]
      : never;

/**
 * Infers the TypeScript type from an {@link ObjectSchema} definition.
 *
 * - Primitive fields map to their TS equivalents via {@link PrimitiveTypeMap}
 * - Nested object fields recurse through `InferObjectSchema`
 * - Array fields become `T[]` where `T` is inferred from `items`
 * - Fields with `nullable: true` become `T | null | undefined`
 *
 * @example
 * ```typescript
 * const schema = {
 *   name: { type: "string" },
 *   age: { type: "number", nullable: true },
 *   tags: { type: "array", items: { type: "string" } },
 *   geo: { type: "object", fields: { lat: { type: "number" }, lng: { type: "number" } } }
 * } as const satisfies ObjectSchema;
 *
 * type MyType = InferObjectSchema<typeof schema>;
 * // { name: string; age?: number | null; tags: string[]; geo: { lat: number; lng: number } }
 * ```
 */
export type InferObjectSchema<S extends ObjectSchema> = {
  [K in keyof S as S[K]["nullable"] extends true ? never : K]: InferFieldDef<
    S[K]
  >;
} & {
  [K in keyof S as S[K]["nullable"] extends true ? K : never]?: InferFieldDef<
    S[K]
  > | null;
};
