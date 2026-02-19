/* eslint-disable @typescript-eslint/no-unused-vars */
import { Entity, ObjectAttribute } from "../../../src/decorators";
import type { ObjectSchema, InferObjectSchema } from "../../../src/decorators";
import {
  MockTable,
  MyClassWithAllAttributeTypes
} from "../../integration/mockModels";
import Metadata from "../../../src/metadata";
import { ZodObject, ZodNullable, type ZodOptional } from "zod";

describe("ObjectAttribute", () => {
  it("uses the provided table alias as attribute metadata if one is provided", () => {
    expect.assertions(1);

    expect(
      Metadata.getEntityAttributes(MyClassWithAllAttributeTypes.name)
        .objectAttribute
    ).toEqual({
      name: "objectAttribute",
      alias: "objectAttribute",
      nullable: false,
      type: expect.any(ZodObject)
    });
  });

  it("defaults attribute metadata alias to the table key if alias is not provided", () => {
    expect.assertions(1);

    expect(
      Metadata.getEntityAttributes(MyClassWithAllAttributeTypes.name)
        .objectAttribute
    ).toEqual(
      expect.objectContaining({
        name: "objectAttribute",
        alias: "objectAttribute"
      })
    );
  });

  it("zod type is optional if nullable is true", () => {
    expect.assertions(1);

    expect(
      Metadata.getEntityAttributes(MyClassWithAllAttributeTypes.name)
        .nullableObjectAttribute
    ).toEqual({
      name: "nullableObjectAttribute",
      alias: "nullableObjectAttribute",
      nullable: true,
      type: expect.any(ZodNullable<ZodOptional<ZodObject<any>>>)
    });
  });

  it("does not have serializers attached (objects use native DynamoDB Map types)", () => {
    expect.assertions(1);

    const attr = Metadata.getEntityAttributes(
      MyClassWithAllAttributeTypes.name
    ).objectAttribute;

    expect(attr.serializers).toBeUndefined();
  });

  describe("types", () => {
    const testSchema = {
      name: { type: "string" },
      count: { type: "number" }
    } as const satisfies ObjectSchema;

    const testSchema2 = {
      isCool: { type: "boolean" },
      geo: {
        type: "object",
        fields: {
          lat: { type: "number" },
          lng: { type: "number" }
        }
      }
    } as const satisfies ObjectSchema;

    it("can be applied to InferObjectSchema attributes", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: type of attribute and schema are not the same
        @ObjectAttribute({ alias: "Key1", schema: testSchema })
        public key1: InferObjectSchema<typeof testSchema2>;
      }
    });

    it("requires the schema and type to be the same", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-no-error: InferObjectSchema is a valid type
        @ObjectAttribute({ alias: "Key1", schema: testSchema })
        public key1: InferObjectSchema<typeof testSchema>;
      }
    });

    it("does not allow the property its applied to to be optional if its not nullable", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: ObjectAttributes cant be optional unless nullable
        @ObjectAttribute({ alias: "Key1", schema: testSchema })
        public key1?: InferObjectSchema<typeof testSchema>;
      }
    });

    it("does allow the property its applied to to be optional if its nullable", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-no-error: ObjectAttributes can be optional if nullable
        @ObjectAttribute({
          alias: "Key1",
          schema: testSchema,
          nullable: true
        })
        public key1?: InferObjectSchema<typeof testSchema>;
      }
    });

    it("does not support wrong types", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: string is not a valid type. Only InferObjectSchema is allowed
        @ObjectAttribute({ alias: "Key1", schema: testSchema })
        public key1: string;
      }
    });

    it("'alias' is optional", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-no-error: Alias prop is optional
        @ObjectAttribute({ schema: testSchema })
        public key1: InferObjectSchema<typeof testSchema>;
      }
    });

    it("if nullable is false the attribute is required", () => {
      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-no-error: Non-nullable properties are required
        @ObjectAttribute({
          alias: "Key1",
          schema: testSchema,
          nullable: false
        })
        public key1: InferObjectSchema<typeof testSchema>;

        // @ts-expect-error: Non-nullable properties are required
        @ObjectAttribute({
          alias: "Key2",
          schema: testSchema,
          nullable: false
        })
        public key2?: InferObjectSchema<typeof testSchema>;
      }
    });

    it("nullable defaults to false and makes the property required", () => {
      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-no-error: Non-nullable properties are required
        @ObjectAttribute({ alias: "Key1", schema: testSchema })
        public key1: InferObjectSchema<typeof testSchema>;

        // @ts-expect-error: Non-nullable properties are required
        @ObjectAttribute({ alias: "Key2", schema: testSchema })
        public key2?: InferObjectSchema<typeof testSchema>;
      }
    });

    it("when nullable is true, it will allow the property to be optional", () => {
      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-no-error: Nullable properties are optional
        @ObjectAttribute({
          alias: "Key1",
          schema: testSchema,
          nullable: true
        })
        public key1?: InferObjectSchema<typeof testSchema>;
      }
    });

    describe("array fields", () => {
      const arraySchema = {
        tags: { type: "array", items: { type: "string" } },
        scores: { type: "array", items: { type: "number" }, nullable: true }
      } as const satisfies ObjectSchema;

      const arrayOfObjectsSchema = {
        addresses: {
          type: "array",
          items: {
            type: "object",
            fields: {
              street: { type: "string" },
              city: { type: "string" }
            }
          }
        }
      } as const satisfies ObjectSchema;

      const nestedArraySchema = {
        matrix: {
          type: "array",
          items: { type: "array", items: { type: "number" } }
        }
      } as const satisfies ObjectSchema;

      it("supports array of primitives", () => {
        @Entity
        class ModelOne extends MockTable {
          // @ts-expect-no-error: string[] matches array of string items
          @ObjectAttribute({ schema: arraySchema })
          public key1: InferObjectSchema<typeof arraySchema>;
        }
      });

      it("rejects wrong array item type", () => {
        @Entity
        class ModelOne extends MockTable {
          // @ts-expect-error: number[] does not match array of string items
          @ObjectAttribute({ schema: arraySchema })
          public key1: { tags: number[]; scores?: number[] | null };
        }
      });

      it("supports array of objects", () => {
        @Entity
        class ModelOne extends MockTable {
          // @ts-expect-no-error: array of objects matches schema
          @ObjectAttribute({ schema: arrayOfObjectsSchema })
          public key1: InferObjectSchema<typeof arrayOfObjectsSchema>;
        }
      });

      it("supports nested arrays", () => {
        @Entity
        class ModelOne extends MockTable {
          // @ts-expect-no-error: number[][] matches nested array schema
          @ObjectAttribute({ schema: nestedArraySchema })
          public key1: InferObjectSchema<typeof nestedArraySchema>;
        }
      });

      it("supports nullable array fields", () => {
        const nullableArraySchema = {
          items: { type: "array", items: { type: "string" }, nullable: true }
        } as const satisfies ObjectSchema;

        @Entity
        class ModelOne extends MockTable {
          // @ts-expect-no-error: nullable array fields are optional
          @ObjectAttribute({ schema: nullableArraySchema })
          public key1: InferObjectSchema<typeof nullableArraySchema>;
        }
      });
    });
  });
});
