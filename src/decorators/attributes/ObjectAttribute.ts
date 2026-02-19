import { z, type ZodType } from "zod";
import type DynaRecord from "../../DynaRecord";
import Metadata from "../../metadata";
import type { AttributeDecoratorContext, AttributeOptions } from "../types";
import type { ObjectSchema, InferObjectSchema, FieldDef } from "./types";

/**
 * Options for the `@ObjectAttribute` decorator.
 * Extends {@link AttributeOptions} with a required `schema` field describing the object shape.
 *
 * @template S The specific ObjectSchema type used for type inference
 */
export interface ObjectAttributeOptions<S extends ObjectSchema>
  extends AttributeOptions {
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
 * Converts a single {@link FieldDef} to the corresponding Zod type
 */
function fieldDefToZod(fieldDef: FieldDef): ZodType {
  let zodType: ZodType;

  if (fieldDef.type === "object") {
    zodType = objectSchemaToZod(fieldDef.fields);
  } else if (fieldDef.type === "array") {
    zodType = z.array(fieldDefToZod(fieldDef.items));
  } else if (fieldDef.type === "string") {
    zodType = z.string();
  } else if (fieldDef.type === "number") {
    zodType = z.number();
  } else {
    zodType = z.boolean();
  }

  if (fieldDef.nullable === true) {
    zodType = zodType.nullable().optional();
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
 *   zip: { type: "number", nullable: true }
 * } as const satisfies ObjectSchema;
 *
 * class MyEntity extends MyTable {
 *   @ObjectAttribute({ alias: 'Address', schema: addressSchema })
 *   public address: InferObjectSchema<typeof addressSchema>;
 *
 *   @ObjectAttribute({ alias: 'Meta', schema: metaSchema, nullable: true })
 *   public meta?: InferObjectSchema<typeof metaSchema>;
 * }
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

        Metadata.addEntityAttribute(this.constructor.name, {
          attributeName: context.name.toString(),
          nullable: props?.nullable,
          type: zodSchema,
          ...restProps
        });
      });
    }
  };
}

export default ObjectAttribute;
