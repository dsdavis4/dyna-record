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
      type: expect.any(ZodObject),
      serializers: {
        toTableAttribute: expect.any(Function),
        toEntityAttribute: expect.any(Function)
      }
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

  it("has serializers attached when schema contains date fields", () => {
    expect.assertions(2);

    const attr = Metadata.getEntityAttributes(
      MyClassWithAllAttributeTypes.name
    ).objectAttribute;

    expect(attr.serializers).toBeDefined();
    expect(attr.serializers).toEqual({
      toTableAttribute: expect.any(Function), // TODO move the object serialize to a file, then assert that its the one called. Just like how the date serialize and tests work
      toEntityAttribute: expect.any(Function)
    });
  });

  it("does not have serializers attached when schema has no date fields", () => {
    expect.assertions(1);

    const attr = Metadata.getEntityAttributes(
      MyClassWithAllAttributeTypes.name
    ).nullableObjectAttribute;

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

    describe("date fields", () => {
      it("supports date fields in schema", () => {
        const dateSchema = {
          createdAt: { type: "date" }
        } as const satisfies ObjectSchema;

        @Entity
        class ModelOne extends MockTable {
          // @ts-expect-no-error: date field infers Date type
          @ObjectAttribute({ schema: dateSchema })
          public key1: InferObjectSchema<typeof dateSchema>;
        }
      });

      it("infers Date type from date field", () => {
        const dateSchema = {
          createdAt: { type: "date" }
        } as const satisfies ObjectSchema;

        type Inferred = InferObjectSchema<typeof dateSchema>;

        // @ts-expect-no-error: createdAt is Date
        const good: Inferred = { createdAt: new Date() };

        // @ts-expect-error: createdAt must be Date, not string
        const bad: Inferred = { createdAt: "2023-01-01" };
      });

      it("supports nullable date fields", () => {
        const dateSchema = {
          deletedAt: { type: "date", nullable: true }
        } as const satisfies ObjectSchema;

        type Inferred = InferObjectSchema<typeof dateSchema>;

        // @ts-expect-error: nullable date does not accept null (consistent with root-level nullable attributes)
        const withNull: Inferred = { deletedAt: null };

        // @ts-expect-no-error: nullable date accepts Date
        const withValue: Inferred = { deletedAt: new Date() };

        // @ts-expect-no-error: nullable date accepts undefined (optional)
        const withUndefined: Inferred = { deletedAt: undefined };
      });

      it("supports date inside nested objects", () => {
        const nestedDateSchema = {
          meta: {
            type: "object",
            fields: {
              createdAt: { type: "date" }
            }
          }
        } as const satisfies ObjectSchema;

        type Inferred = InferObjectSchema<typeof nestedDateSchema>;

        // @ts-expect-no-error: nested date accepts Date
        const good: Inferred = { meta: { createdAt: new Date() } };

        // @ts-expect-error: nested date must be Date, not string
        const bad: Inferred = { meta: { createdAt: "2023-01-01" } };
      });

      it("supports date as array items", () => {
        const arrayDateSchema = {
          timestamps: {
            type: "array",
            items: { type: "date" }
          }
        } as const satisfies ObjectSchema;

        type Inferred = InferObjectSchema<typeof arrayDateSchema>;

        // @ts-expect-no-error: array of Dates
        const good: Inferred = { timestamps: [new Date(), new Date()] };

        // @ts-expect-error: array item must be Date, not string
        const bad: Inferred = { timestamps: ["2023-01-01"] };
      });

      it("values is not allowed on date type fields", () => {
        const badSchema = {
          // @ts-expect-error: values is not a valid property on date fields
          createdAt: { type: "date", values: ["a", "b"] }
        } as const satisfies ObjectSchema;
      });
    });

    describe("enum fields", () => {
      it("values is not allowed on string type fields", () => {
        const badSchema = {
          // @ts-expect-error: values is not a valid property on string fields
          name: { type: "string", values: ["a", "b"] }
        } as const satisfies ObjectSchema;
      });

      it("values is not allowed on number type fields", () => {
        const badSchema = {
          // @ts-expect-error: values is not a valid property on number fields
          count: { type: "number", values: ["a", "b"] }
        } as const satisfies ObjectSchema;
      });

      it("values is not allowed on boolean type fields", () => {
        const badSchema = {
          // @ts-expect-error: values is not a valid property on boolean fields
          active: { type: "boolean", values: ["a", "b"] }
        } as const satisfies ObjectSchema;
      });

      it("values is not allowed on object type fields", () => {
        const badSchema = {
          geo: {
            type: "object",
            fields: { lat: { type: "number" } },
            // @ts-expect-error: values is not a valid property on object fields
            values: ["a", "b"]
          }
        } as const satisfies ObjectSchema;
      });

      it("values is not allowed on array type fields", () => {
        const badSchema = {
          tags: {
            type: "array",
            items: { type: "string" },
            // @ts-expect-error: values is not a valid property on array fields
            values: ["a", "b"]
          }
        } as const satisfies ObjectSchema;
      });

      it("enum type requires values property", () => {
        const badSchema = {
          // @ts-expect-error: enum type requires values
          status: { type: "enum" }
        } as const satisfies ObjectSchema;
      });

      it("enum values must be a non-empty tuple", () => {
        const badSchema = {
          // @ts-expect-error: values must have at least one element
          status: { type: "enum", values: [] }
        } as const satisfies ObjectSchema;
      });

      it("supports enum fields in schema", () => {
        const enumSchema = {
          status: { type: "enum", values: ["active", "inactive"] }
        } as const satisfies ObjectSchema;

        @Entity
        class ModelOne extends MockTable {
          // @ts-expect-no-error: enum field infers union type
          @ObjectAttribute({ schema: enumSchema })
          public key1: InferObjectSchema<typeof enumSchema>;
        }
      });

      it("infers correct union type from enum values", () => {
        const enumSchema = {
          status: { type: "enum", values: ["active", "inactive"] }
        } as const satisfies ObjectSchema;

        type Inferred = InferObjectSchema<typeof enumSchema>;

        // @ts-expect-no-error: status accepts valid enum values
        const good: Inferred = { status: "active" };

        // @ts-expect-error: status does not accept invalid values
        const bad: Inferred = { status: "unknown" };
      });

      it("supports nullable enum fields", () => {
        const enumSchema = {
          status: {
            type: "enum",
            values: ["active", "inactive"],
            nullable: true
          }
        } as const satisfies ObjectSchema;

        type Inferred = InferObjectSchema<typeof enumSchema>;

        // @ts-expect-error: nullable enum does not accept null (consistent with root-level nullable attributes)
        const withNull: Inferred = { status: null };

        // @ts-expect-no-error: nullable enum accepts valid value
        const withValue: Inferred = { status: "active" };

        // @ts-expect-no-error: nullable enum accepts undefined (optional)
        const withUndefined: Inferred = { status: undefined };
      });

      it("supports enum inside nested objects", () => {
        const nestedEnumSchema = {
          geo: {
            type: "object",
            fields: {
              accuracy: { type: "enum", values: ["precise", "approximate"] }
            }
          }
        } as const satisfies ObjectSchema;

        type Inferred = InferObjectSchema<typeof nestedEnumSchema>;

        // @ts-expect-no-error: nested enum accepts valid value
        const good: Inferred = { geo: { accuracy: "precise" } };

        // @ts-expect-error: nested enum does not accept invalid value
        const bad: Inferred = { geo: { accuracy: "wrong" } };
      });

      it("supports enum as array items", () => {
        const arrayEnumSchema = {
          roles: {
            type: "array",
            items: { type: "enum", values: ["admin", "user", "guest"] }
          }
        } as const satisfies ObjectSchema;

        type Inferred = InferObjectSchema<typeof arrayEnumSchema>;

        // @ts-expect-no-error: array of valid enum values
        const good: Inferred = { roles: ["admin", "user"] };

        // @ts-expect-error: array item is not a valid enum value
        const bad: Inferred = { roles: ["invalid"] };
      });
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
        const wrongArraySchema = {
          tags: { type: "array", items: { type: "number" } },
          scores: { type: "array", items: { type: "number" }, nullable: true }
        } as const satisfies ObjectSchema;

        @Entity
        class ModelOne extends MockTable {
          // @ts-expect-error: arraySchema expects string[] for tags, but wrongArraySchema infers number[]
          @ObjectAttribute({ schema: arraySchema })
          public key1: InferObjectSchema<typeof wrongArraySchema>;
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
