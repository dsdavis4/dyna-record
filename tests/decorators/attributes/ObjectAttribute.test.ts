/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Entity,
  ObjectAttribute,
  objectToTableItem,
  tableItemToObject
} from "../../../src/decorators";
import type { ObjectSchema, InferObjectSchema } from "../../../src/decorators";
import {
  MockTable,
  MyClassWithAllAttributeTypes,
  contactSchema,
  addressSchema,
  ArrayOfObjectsEntity,
  DiscriminatedUnionEntity,
  paymentSchema,
  nullableUnionSchema
} from "../../integration/mockModels";
import Metadata from "../../../src/metadata";
import { ZodObject, ZodDiscriminatedUnion } from "zod";

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

describe("ObjectAttribute", () => {
  it("creates attribute metadata with correct properties", () => {
    expect.assertions(1);

    const attr = Metadata.getEntityAttributes(
      MyClassWithAllAttributeTypes.name
    ).objectAttribute;

    expect(attr).toEqual({
      name: "objectAttribute",
      alias: "objectAttribute",
      nullable: false,
      type: expect.any(ZodObject),
      partialType: expect.any(ZodObject),
      objectSchema: contactSchema,
      serializers: {
        toTableAttribute: expect.any(Function),
        toEntityAttribute: expect.any(Function)
      }
    });
  });

  it("uses the provided table alias as attribute metadata if one is provided", () => {
    expect.assertions(1);

    expect(
      Metadata.getEntityAttributes(ArrayOfObjectsEntity.name).data
    ).toEqual(
      expect.objectContaining({
        name: "data",
        alias: "Data"
      })
    );
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

  it("serializers use objectToTableItem for toTableAttribute", () => {
    expect.assertions(2);

    const attr = Metadata.getEntityAttributes(
      MyClassWithAllAttributeTypes.name
    ).objectAttribute;

    const testDate = new Date("2024-01-01T00:00:00.000Z");
    const input = {
      name: "test",
      email: "a@b.com",
      tags: [],
      status: "active",
      createdDate: testDate
    };

    expect(attr.serializers).toBeDefined();
    expect(attr.serializers?.toTableAttribute(input)).toEqual({
      createdDate: "2024-01-01T00:00:00.000Z",
      email: "a@b.com",
      name: "test",
      status: "active",
      tags: []
    });
  });

  it("serializers use tableItemToObject for toEntityAttribute", () => {
    expect.assertions(2);

    const attr = Metadata.getEntityAttributes(
      MyClassWithAllAttributeTypes.name
    ).objectAttribute;

    const input = {
      name: "test",
      email: "a@b.com",
      tags: [],
      status: "active",
      createdDate: "2024-01-01T00:00:00.000Z"
    };

    expect(attr.serializers).toBeDefined();
    expect(attr.serializers?.toEntityAttribute(input)).toEqual({
      createdDate: new Date("2024-01-01T00:00:00.000Z"),
      email: "a@b.com",
      name: "test",
      status: "active",
      tags: []
    });
  });

  it("has serializers attached for object attributes without date fields", () => {
    expect.assertions(2);

    const attr = Metadata.getEntityAttributes(
      MyClassWithAllAttributeTypes.name
    ).addressAttribute;

    const input = { street: "123 Main", city: "Springfield" };

    expect(attr.serializers).toBeDefined();
    expect(attr.serializers?.toTableAttribute(input)).toEqual({
      city: "Springfield",
      street: "123 Main"
    });
  });

  describe("types", () => {
    it("requires the schema and type to be the same", () => {
      @Entity
      class ModelOne extends MockTable {
        declare readonly type: "ModelOne";
        // @ts-expect-no-error: InferObjectSchema is a valid type
        @ObjectAttribute({ alias: "Key1", schema: testSchema })
        public key1: InferObjectSchema<typeof testSchema>;
      }

      @Entity
      class ModelTwo extends MockTable {
        declare readonly type: "ModelTwo";
        // @ts-expect-error: type of attribute and schema are not the same
        @ObjectAttribute({ alias: "Key1", schema: testSchema })
        public key1: InferObjectSchema<typeof testSchema2>;
      }
    });

    // ObjectAttributes are always non nullable because DynamoDB cannot update nested document paths
    // (e.g. `address.geo.lat`) if the parent object does not exist, which causes:
    // `ValidationException: The document path provided in the update expression is invalid for update`.
    // To avoid this, `@ObjectAttribute` fields always exist as at least an empty object `{}`.
    it("nullable is not a valid property because its always non nullable", () => {
      @Entity
      class ModelOne extends MockTable {
        declare readonly type: "ModelOne";
        @ObjectAttribute({
          alias: "Key1",
          schema: testSchema,
          // @ts-expect-error: nullable property is not valid
          nullable: true
        })
        public key1: InferObjectSchema<typeof testSchema>;
      }

      @Entity
      class ModelTwo extends MockTable {
        declare readonly type: "ModelTwo";
        @ObjectAttribute({
          alias: "Key1",
          schema: testSchema,
          // @ts-expect-error: nullable property is not valid
          nullable: false
        })
        public key1: InferObjectSchema<typeof testSchema>;
      }
    });

    it("does not support wrong types", () => {
      @Entity
      class ModelOne extends MockTable {
        declare readonly type: "ModelOne";
        // @ts-expect-error: string is not a valid type. Only InferObjectSchema is allowed
        @ObjectAttribute({ alias: "Key1", schema: testSchema })
        public key1: string;
      }
    });

    it("'alias' is optional", () => {
      @Entity
      class ModelOne extends MockTable {
        declare readonly type: "ModelOne";
        // @ts-expect-no-error: Alias prop is optional
        @ObjectAttribute({ schema: testSchema })
        public key1: InferObjectSchema<typeof testSchema>;
      }
    });

    it("ObjectAttribute is always required (never optional)", () => {
      @Entity
      class SomeModel extends MockTable {
        declare readonly type: "SomeModel";
        // @ts-expect-no-error: ObjectAttribute properties are always required
        @ObjectAttribute({ alias: "Key1", schema: testSchema })
        public key1: InferObjectSchema<typeof testSchema>;

        // @ts-expect-error: ObjectAttribute properties cannot be optional
        @ObjectAttribute({ alias: "Key2", schema: testSchema })
        public key2?: InferObjectSchema<typeof testSchema>;
      }
    });

    it("object fields within a schema cannot have nullable via ObjectFieldDef", () => {
      const schemaWithNullableField = {
        nested: {
          type: "object",
          fields: { name: { type: "string" } },
          // @ts-expect-error: nullable is not a valid property on ObjectFieldDef
          nullable: true
        }
      } as const satisfies ObjectSchema;
    });

    describe("date fields", () => {
      it("supports date fields in schema", () => {
        const dateSchema = {
          createdAt: { type: "date" }
        } as const satisfies ObjectSchema;

        @Entity
        class ModelOne extends MockTable {
          declare readonly type: "ModelOne";
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
          declare readonly type: "ModelOne";
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
          declare readonly type: "ModelOne";
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
          declare readonly type: "ModelOne";
          // @ts-expect-error: arraySchema expects string[] for tags, but wrongArraySchema infers number[]
          @ObjectAttribute({ schema: arraySchema })
          public key1: InferObjectSchema<typeof wrongArraySchema>;
        }
      });

      it("supports array of objects", () => {
        @Entity
        class ModelOne extends MockTable {
          declare readonly type: "ModelOne";
          // @ts-expect-no-error: array of objects matches schema
          @ObjectAttribute({ schema: arrayOfObjectsSchema })
          public key1: InferObjectSchema<typeof arrayOfObjectsSchema>;
        }
      });

      it("supports nested arrays", () => {
        @Entity
        class ModelOne extends MockTable {
          declare readonly type: "ModelOne";
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
          declare readonly type: "ModelOne";
          // @ts-expect-no-error: nullable array fields are optional
          @ObjectAttribute({ schema: nullableArraySchema })
          public key1: InferObjectSchema<typeof nullableArraySchema>;
        }
      });

      it("infers Date type for array of date items", () => {
        const arrayDateSchema = {
          timestamps: { type: "array", items: { type: "date" } }
        } as const satisfies ObjectSchema;

        type Inferred = InferObjectSchema<typeof arrayDateSchema>;

        // @ts-expect-no-error: array of Dates inferred correctly
        const good: Inferred = { timestamps: [new Date(), new Date()] };

        // @ts-expect-no-error: empty array is valid
        const empty: Inferred = { timestamps: [] };

        // @ts-expect-error: array item must be Date, not string
        const wrongType: Inferred = { timestamps: ["bad"] };
      });

      it("rejects wrong types for array of date items", () => {
        const arrayDateSchema = {
          timestamps: { type: "array", items: { type: "date" } }
        } as const satisfies ObjectSchema;

        type Inferred = InferObjectSchema<typeof arrayDateSchema>;

        // @ts-expect-error: array item must be Date, not string
        const badStrings: Inferred = { timestamps: ["2023-01-01"] };

        // @ts-expect-error: array item must be Date, not number
        const badNumbers: Inferred = { timestamps: [1234567890] };
      });
    });

    describe("discriminated union fields", () => {
      it("supports discriminated union fields in schema", () => {
        const duSchema = {
          shape: {
            type: "discriminatedUnion",
            discriminator: "kind",
            variants: {
              circle: { radius: { type: "number" } },
              square: { side: { type: "number" } }
            }
          }
        } as const satisfies ObjectSchema;

        @Entity
        class ModelDU extends MockTable {
          declare readonly type: "ModelDU";
          // @ts-expect-no-error: discriminated union infers correct type
          @ObjectAttribute({ schema: duSchema })
          public key1: InferObjectSchema<typeof duSchema>;
        }
      });

      it("infers correct discriminated union type", () => {
        const duSchema = {
          shape: {
            type: "discriminatedUnion",
            discriminator: "kind",
            variants: {
              circle: { radius: { type: "number" } },
              square: { side: { type: "number" } }
            }
          }
        } as const satisfies ObjectSchema;

        type Inferred = InferObjectSchema<typeof duSchema>;

        // @ts-expect-no-error: circle variant is valid
        const circle: Inferred = { shape: { kind: "circle", radius: 5 } };

        // @ts-expect-no-error: square variant is valid
        const square: Inferred = { shape: { kind: "square", side: 10 } };

        // @ts-expect-error: invalid discriminator value
        const bad: Inferred = { shape: { kind: "triangle", sides: 3 } };
      });

      it("supports type narrowing via discriminator check", () => {
        const duSchema = {
          shape: {
            type: "discriminatedUnion",
            discriminator: "kind",
            variants: {
              circle: { radius: { type: "number" } },
              square: { side: { type: "number" } }
            }
          }
        } as const satisfies ObjectSchema;

        type Inferred = InferObjectSchema<typeof duSchema>;
        const val: Inferred = { shape: { kind: "circle", radius: 5 } };

        if (val.shape.kind === "circle") {
          // @ts-expect-no-error: after narrowing, radius is accessible
          const r: number = val.shape.radius;
        }

        if (val.shape.kind === "square") {
          // @ts-expect-no-error: after narrowing, side is accessible
          const s: number = val.shape.side;
        }
      });

      it("supports nullable discriminated union fields", () => {
        const duSchema = {
          pref: {
            type: "discriminatedUnion",
            discriminator: "channel",
            variants: {
              email: { address: { type: "string" } },
              sms: { phone: { type: "string" } }
            },
            nullable: true
          }
        } as const satisfies ObjectSchema;

        type Inferred = InferObjectSchema<typeof duSchema>;

        // @ts-expect-no-error: nullable discriminated union accepts undefined
        const withUndefined: Inferred = { pref: undefined };

        // @ts-expect-no-error: nullable discriminated union accepts value
        const withValue: Inferred = {
          pref: { channel: "email", address: "a@b.com" }
        };

        // @ts-expect-no-error: can omit nullable field entirely
        const withoutField: Inferred = {};
      });

      it("supports discriminated union inside nested objects", () => {
        const nestedDUSchema = {
          config: {
            type: "object",
            fields: {
              notification: {
                type: "discriminatedUnion",
                discriminator: "method",
                variants: {
                  push: { token: { type: "string" } },
                  email: { address: { type: "string" } }
                }
              }
            }
          }
        } as const satisfies ObjectSchema;

        type Inferred = InferObjectSchema<typeof nestedDUSchema>;

        // @ts-expect-no-error: nested discriminated union works
        const good: Inferred = {
          config: { notification: { method: "push", token: "abc123" } }
        };

        const bad: Inferred = {
          // @ts-expect-error: wrong variant field - push expects token not address
          config: { notification: { method: "push", address: "a@b.com" } }
        };
      });

      it("supports variants with dates, enums, and nested objects", () => {
        const complexDUSchema = {
          event: {
            type: "discriminatedUnion",
            discriminator: "type",
            variants: {
              meeting: {
                startTime: { type: "date" },
                location: {
                  type: "object",
                  fields: { room: { type: "string" } }
                }
              },
              deadline: {
                dueDate: { type: "date" },
                priority: {
                  type: "enum",
                  values: ["low", "medium", "high"]
                }
              }
            }
          }
        } as const satisfies ObjectSchema;

        type Inferred = InferObjectSchema<typeof complexDUSchema>;

        // @ts-expect-no-error: meeting variant with Date and nested object
        const meeting: Inferred = {
          event: {
            type: "meeting",
            startTime: new Date(),
            location: { room: "A1" }
          }
        };

        // @ts-expect-no-error: deadline variant with Date and enum
        const deadline: Inferred = {
          event: { type: "deadline", dueDate: new Date(), priority: "high" }
        };

        const badPriority: Inferred = {
          event: {
            type: "deadline",
            dueDate: new Date(),
            // @ts-expect-error: invalid enum value
            priority: "urgent"
          }
        };
      });

      it("rejects wrong schema/type mismatch", () => {
        const duSchema = {
          shape: {
            type: "discriminatedUnion",
            discriminator: "kind",
            variants: {
              circle: { radius: { type: "number" } },
              square: { side: { type: "number" } }
            }
          }
        } as const satisfies ObjectSchema;

        const otherSchema = {
          name: { type: "string" }
        } as const satisfies ObjectSchema;

        @Entity
        class ModelBad extends MockTable {
          declare readonly type: "ModelBad";
          // @ts-expect-error: schema and type don't match
          @ObjectAttribute({ schema: duSchema })
          public key1: InferObjectSchema<typeof otherSchema>;
        }
      });

      it("does not allow discriminated union as array items", () => {
        const badSchema = {
          items: {
            type: "array",
            items: {
              // @ts-expect-error: "discriminatedUnion" is not assignable to NonUnionFieldDef
              type: "discriminatedUnion",
              discriminator: "kind",
              variants: {
                a: { val: { type: "string" } }
              }
            }
          }
        } as const satisfies ObjectSchema;
      });

      it("does not allow discriminated union nested inside another discriminated union variant", () => {
        const badSchema = {
          outer: {
            type: "discriminatedUnion",
            discriminator: "kind",
            variants: {
              a: {
                inner: {
                  // @ts-expect-error: "discriminatedUnion" is not assignable to NonUnionFieldDef
                  type: "discriminatedUnion",
                  discriminator: "subKind",
                  variants: {
                    x: { val: { type: "string" } }
                  }
                }
              }
            }
          }
        } as const satisfies ObjectSchema;
      });

      it("throws at class definition time if discriminated union has zero variants", () => {
        expect(() => {
          @Entity
          class ModelEmpty extends MockTable {
            declare readonly type: "ModelEmpty";
            @ObjectAttribute({
              schema: {
                field: {
                  type: "discriminatedUnion",
                  discriminator: "kind",
                  variants: {}
                }
              }
            })
            public field: never;
          }
        }).toThrow("DiscriminatedUnionFieldDef requires at least one variant");
      });

      it("discriminated union fields require full replacement (not partial) on update type", () => {
        const duSchema = {
          shape: {
            type: "discriminatedUnion",
            discriminator: "kind",
            variants: {
              circle: { radius: { type: "number" } },
              square: { side: { type: "number" } }
            }
          }
        } as const satisfies ObjectSchema;

        type Inferred = InferObjectSchema<typeof duSchema>;

        // @ts-expect-no-error: full variant is valid
        const full: Inferred = { shape: { kind: "circle", radius: 5 } };

        // @ts-expect-error: partial variant missing required field
        const partial: Inferred = { shape: { kind: "circle" } };
      });
    });
  });

  describe("discriminated union metadata", () => {
    it("creates attribute metadata with ZodDiscriminatedUnion type for discriminated union fields", () => {
      expect.assertions(1);

      const attr = Metadata.getEntityAttributes(
        DiscriminatedUnionEntity.name
      ).payment;

      expect(attr).toEqual({
        name: "payment",
        alias: "Payment",
        nullable: false,
        type: expect.any(ZodObject),
        partialType: expect.any(ZodObject),
        objectSchema: paymentSchema,
        serializers: {
          toTableAttribute: expect.any(Function),
          toEntityAttribute: expect.any(Function)
        }
      });
    });

    it("serializers handle discriminated union with date fields (toTableAttribute)", () => {
      expect.assertions(2);

      const attr = Metadata.getEntityAttributes(
        DiscriminatedUnionEntity.name
      ).payment;

      const testDate = new Date("2024-06-15T12:00:00.000Z");
      const input = {
        method: {
          type: "creditCard",
          cardNumber: "4111",
          expiry: "12/25",
          expiryDate: testDate
        },
        amount: 100,
        note: "test"
      };

      expect(attr.serializers).toBeDefined();
      expect(attr.serializers?.toTableAttribute(input)).toEqual({
        method: {
          type: "creditCard",
          cardNumber: "4111",
          expiry: "12/25",
          expiryDate: "2024-06-15T12:00:00.000Z"
        },
        amount: 100,
        note: "test"
      });
    });

    it("serializers handle discriminated union with date fields (toEntityAttribute)", () => {
      expect.assertions(2);

      const attr = Metadata.getEntityAttributes(
        DiscriminatedUnionEntity.name
      ).payment;

      const input = {
        method: {
          type: "creditCard",
          cardNumber: "4111",
          expiry: "12/25",
          expiryDate: "2024-06-15T12:00:00.000Z"
        },
        amount: 100,
        note: "test"
      };

      expect(attr.serializers).toBeDefined();
      expect(attr.serializers?.toEntityAttribute(input)).toEqual({
        method: {
          type: "creditCard",
          cardNumber: "4111",
          expiry: "12/25",
          expiryDate: new Date("2024-06-15T12:00:00.000Z")
        },
        amount: 100,
        note: "test"
      });
    });

    it("serializers handle different variants correctly", () => {
      expect.assertions(1);

      const attr = Metadata.getEntityAttributes(
        DiscriminatedUnionEntity.name
      ).payment;

      const input = {
        method: {
          type: "crypto",
          walletAddress: "0xabc",
          network: "ethereum"
        },
        amount: 50
      };

      expect(attr.serializers?.toTableAttribute(input)).toEqual({
        method: {
          type: "crypto",
          walletAddress: "0xabc",
          network: "ethereum"
        },
        amount: 50
      });
    });

    it("Zod full schema validates discriminated union variants", () => {
      const attr = Metadata.getEntityAttributes(
        DiscriminatedUnionEntity.name
      ).payment;

      const zodSchema = attr.type;

      // Valid: creditCard variant
      expect(
        zodSchema.safeParse({
          method: {
            type: "creditCard",
            cardNumber: "4111",
            expiry: "12/25",
            expiryDate: new Date()
          },
          amount: 100
        }).success
      ).toBe(true);

      // Valid: bankTransfer variant
      expect(
        zodSchema.safeParse({
          method: {
            type: "bankTransfer",
            bankName: "Chase",
            accountNumber: "123",
            routingNumber: "456"
          },
          amount: 50
        }).success
      ).toBe(true);

      // Invalid: unknown variant
      expect(
        zodSchema.safeParse({
          method: { type: "paypal", email: "a@b.com" },
          amount: 50
        }).success
      ).toBe(false);

      // Invalid: missing discriminator
      expect(
        zodSchema.safeParse({
          method: { cardNumber: "4111", expiry: "12/25" },
          amount: 50
        }).success
      ).toBe(false);

      // Invalid: wrong fields for variant
      expect(
        zodSchema.safeParse({
          method: { type: "creditCard", bankName: "Chase" },
          amount: 50
        }).success
      ).toBe(false);
    });

    it("Zod partial schema requires complete variant (full replacement)", () => {
      const attr = Metadata.getEntityAttributes(
        DiscriminatedUnionEntity.name
      ).payment;

      const partialSchema = attr.partialType!;

      // Valid: complete variant in partial update context
      expect(
        partialSchema.safeParse({
          method: {
            type: "creditCard",
            cardNumber: "4111",
            expiry: "12/25",
            expiryDate: new Date()
          }
        }).success
      ).toBe(true);

      // Valid: only non-union fields
      expect(partialSchema.safeParse({ amount: 200 }).success).toBe(true);

      // Invalid: union field without discriminator
      expect(
        partialSchema.safeParse({
          method: { cardNumber: "4111" }
        }).success
      ).toBe(false);
    });

    it("Zod schema accepts null for nullable discriminated union fields", () => {
      const attr = Metadata.getEntityAttributes(
        DiscriminatedUnionEntity.name
      ).nullableUnion;

      const zodSchema = attr.type;

      // Valid: preference is null
      expect(zodSchema.safeParse({ preference: null }).success).toBe(true);

      // Valid: preference is undefined (omitted)
      expect(zodSchema.safeParse({}).success).toBe(true);

      // Valid: preference is a valid variant
      expect(
        zodSchema.safeParse({
          preference: { channel: "email", address: "a@b.com" }
        }).success
      ).toBe(true);

      // Invalid: preference is not a valid variant
      expect(
        zodSchema.safeParse({
          preference: { channel: "pigeon" }
        }).success
      ).toBe(false);
    });

    it("serializers pass through discriminated union with unknown discriminator value", () => {
      expect.assertions(2);

      const attr = Metadata.getEntityAttributes(
        DiscriminatedUnionEntity.name
      ).payment;

      const input = {
        method: {
          type: "unknownMethod",
          someField: "value"
        },
        amount: 10
      };

      // Unknown variant passes through without transformation
      expect(attr.serializers?.toTableAttribute(input)).toEqual({
        method: {
          type: "unknownMethod",
          someField: "value"
        },
        amount: 10
      });

      // Same for deserialization
      expect(attr.serializers?.toEntityAttribute(input)).toEqual({
        method: {
          type: "unknownMethod",
          someField: "value"
        },
        amount: 10
      });
    });
  });
});
