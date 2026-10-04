import type DynaRecord from "../../DynaRecord.js";
import Metadata from "../../metadata/index.js";
import type {
  AttributeDecoratorContext,
  NonNullAttributeOptions
} from "../types.js";
import type { ObjectSchema, InferObjectSchema } from "./types.js";
import { createObjectSerializer } from "./serializers.js";
import { objectSchemaToZod, objectSchemaToZodPartial } from "./fieldZod.js";

/**
 * Options for the `@ObjectAttribute` decorator.
 * Extends {@link NonNullAttributeOptions} with a required `schema` field describing the object shape.
 *
 * **Object attributes are never nullable.** DynamoDB cannot update nested document paths
 * (e.g. `address.geo.lat`) if the parent object does not exist, which causes:
 * `ValidationException: The document path provided in the update expression is invalid for update`.
 * To avoid this, `@ObjectAttribute` fields always exist as at least an empty object `{}`.
 *
 * The schema supports all {@link FieldDef} types: primitives, enums, nested objects, arrays, and discriminated unions.
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
 * - `"discriminatedUnion"` — tagged unions via `discriminator` + `variants` (support `nullable: true`, full replacement on update)
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
 * **Discriminated union fields** always use **full replacement** on update — the user
 * must provide a complete variant object. See {@link DiscriminatedUnionFieldDef} for
 * the rationale.
 *
 * Object attributes support filtering in queries using dot-path notation for nested fields.
 * A dot-path key is typed by the field it names and offers the operators that field's stored
 * form can carry — so a nested date field takes `Date` operands and accepts ranges, a nested
 * string field accepts `$beginsWith`, and an array field accepts `$contains` for List
 * membership.
 *
 * A path *through* an array names one element with DynamoDB's index syntax, `tags[0]`, and
 * is typed by that element's own field. DynamoDB has no path meaning "every element", so a
 * path omitting the index is rejected with a `FilterError` rather than compiled into a
 * condition that matches nothing.
 *
 * ```typescript
 * await MyEntity.query("123", {
 *   filter: { "address.city": "Springfield" }
 * });
 *
 * await MyEntity.query("123", {
 *   filter: { "address.tags": { $contains: "home" } }
 * });
 *
 * // A range on a nested number field
 * await MyEntity.query("123", {
 *   filter: { "address.geo.lat": { $between: [40, 41] } }
 * });
 *
 * // One element of a List, and a field of it
 * await MyEntity.query("123", {
 *   filter: { "address.contacts[0].name": "Jane" }
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
    // Fail fast: surface schema validation errors at class definition time.
    const { schema, ...restProps } = props;
    const zodSchema = objectSchemaToZod(schema);
    const partialZodSchema = objectSchemaToZodPartial(schema);
    const serializers = createObjectSerializer(schema);

    context.addInitializer(function (this: T) {
      Metadata.addEntityAttribute(this.constructor.name, {
        attributeName: context.name.toString(),
        kind: "object",
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
