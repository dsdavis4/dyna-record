/**
 * Maps schema type strings to their corresponding TypeScript types
 */
export interface PrimitiveTypeMap {
  string: string;
  number: number;
  boolean: boolean;
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
  // TODO update so this is "$type" that way it is clear if if type is an actual attribute on the object
  //    -- make a test for that
  //    -- Does this make it confusion that "fields" and "nullable" do not have the $?
  type: "object";
  fields: ObjectSchema;
  nullable?: boolean;
}

/**
 * A field definition within an ObjectSchema — either a primitive or a nested object
 */
export type FieldDef = PrimitiveFieldDef | ObjectFieldDef;

/**
 * Declarative schema for describing the shape of an object attribute.
 * Used with `@ObjectAttribute` to provide both runtime validation and TypeScript type inference.
 */
export type ObjectSchema = Record<string, FieldDef>;

/**
 * Infers the TypeScript type from an {@link ObjectSchema} definition.
 *
 * - Primitive fields map to their TS equivalents via {@link PrimitiveTypeMap}
 * - Nested object fields recurse through `InferObjectSchema`
 * - Fields with `nullable: true` become `T | null | undefined`
 *
 * @example
 * ```typescript
 * const schema = {
 *   name: { type: "string" },
 *   age: { type: "number", nullable: true },
 *   geo: { type: "object", fields: { lat: { type: "number" }, lng: { type: "number" } } }
 * } as const satisfies ObjectSchema;
 *
 * type MyType = InferObjectSchema<typeof schema>;
 * // { name: string; age?: number | null; geo: { lat: number; lng: number } }
 * ```
 */
export type InferObjectSchema<S extends ObjectSchema> = {
  [K in keyof S as S[K]["nullable"] extends true
    ? never
    : K]: S[K] extends ObjectFieldDef
    ? InferObjectSchema<S[K]["fields"]>
    : S[K] extends PrimitiveFieldDef
      ? PrimitiveTypeMap[S[K]["type"]]
      : never;
} & {
  [K in keyof S as S[K]["nullable"] extends true
    ? K
    : never]?: S[K] extends ObjectFieldDef
    ? InferObjectSchema<S[K]["fields"]> | null
    : S[K] extends PrimitiveFieldDef
      ? PrimitiveTypeMap[S[K]["type"]] | null
      : never;
};
