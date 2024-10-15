/* eslint-disable @typescript-eslint/no-unused-vars */
import { Entity, EnumAttribute } from "../../../src/decorators";
import { MockTable } from "../../integration/mockModels";
import Metadata from "../../../src/metadata";
import { ZodEnum, ZodNullable, type ZodString, type ZodOptional } from "zod";
import { type ForeignKey, type NullableForeignKey } from "../../../src";

type EnumValues = "val-1" | "val-2";

@Entity
class MyEntity extends MockTable {
  @EnumAttribute({ alias: "SomeEnum", values: ["val-1", "val-2"] })
  public readonly someEnum: EnumValues;

  @EnumAttribute({ values: ["val-1", "val-2"] })
  public readonly noAliasEnum: EnumValues;

  @EnumAttribute({
    alias: "SomeNullableEnum",
    values: ["val-1", "val-2"],
    nullable: true
  })
  public readonly someNullableEnum?: EnumValues;
}

describe("EnumAttribute", () => {
  it("uses the provided table alias as attribute metadata if one is provided", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(MyEntity.name).someEnum).toEqual({
      name: "someEnum",
      alias: "SomeEnum",
      nullable: false,
      type: expect.any(ZodEnum)
    });
  });

  it("defaults attribute metadata alias to the table key if alias is not provided", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(MyEntity.name).noAliasEnum).toEqual({
      name: "noAliasEnum",
      alias: "noAliasEnum",
      nullable: false,
      type: expect.any(ZodEnum)
    });
  });

  it("zod type is optional if nullable is true", () => {
    expect.assertions(1);

    expect(
      Metadata.getEntityAttributes(MyEntity.name).someNullableEnum
    ).toEqual({
      name: "someNullableEnum",
      alias: "SomeNullableEnum",
      nullable: true,
      type: expect.any(ZodNullable<ZodOptional<ZodString>>)
    });
  });

  describe("types", () => {
    it("can be applied to enum attributes", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-no-error: EnumValues is a valid type
        @EnumAttribute({ alias: "Key1", values: ["1", "2"] })
        public key1: "1" | "2";
      }

      @Entity
      class ModelTwo extends MockTable {
        // @ts-expect-no-error: EnumValues is a valid type
        @EnumAttribute({ alias: "Key1", values: ["val-1", "val-2"] })
        public key1: EnumValues;
      }
    });

    it("does not allow the property its applied to to be optional if its not nullable", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: EnumAttributes cant be optional unless nullable
        @EnumAttribute({ alias: "Key1", values: ["val-1", "val-2"] })
        public key1?: EnumValues;
      }
    });

    it("does allow the property its applied to to be optional if its nullable", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-no-error: EnumAttributes can be optional if nullable
        @EnumAttribute({
          alias: "Key1",
          values: ["val-1", "val-2"],
          nullable: true
        })
        public key1?: EnumValues;
      }
    });

    it("does not support values that are not part of the enum", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: Only enum values types are allowed
        @EnumAttribute({ alias: "Key1", values: ["1", "2"] })
        public key1: "1" | "3";
      }

      @Entity
      class ModelTwo extends MockTable {
        // @ts-expect-error: Only enum values types are allowed
        @EnumAttribute({ alias: "Key1", values: ["val-1", "val-3"] })
        public key1: EnumValues;
      }

      @Entity
      class ModelThree extends MockTable {
        // @ts-expect-error: Only enum values types are allowed
        @EnumAttribute({ alias: "Key1", values: ["1", "2"] })
        public key1: string;
      }
    });

    it("'alias' is optional", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-no-error: Alias prop is optional
        @EnumAttribute({ values: ["1", "2"] })
        public key1: "1" | "2";
      }
    });

    it("if nullable is false the attribute is required", () => {
      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-no-error: Nullable properties are required
        @EnumAttribute({
          alias: "Key1",
          values: ["val-1", "val-2"],
          nullable: false
        })
        public key1: EnumValues;

        // @ts-expect-error: Nullable properties are required
        @EnumAttribute({
          alias: "Key2",
          values: ["val-1", "val-2"],
          nullable: false
        })
        public key2?: EnumValues;
      }
    });

    it("nullable defaults to false and makes the property required", () => {
      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-no-error: Nullable properties are required
        @EnumAttribute({ values: ["val-1", "val-2"] })
        public key1: EnumValues;

        // @ts-expect-error: Nullable properties are required
        @EnumAttribute({ alias: "Key2", values: ["val-1", "val-2"] })
        public key2?: EnumValues;
      }
    });

    it("when nullable is true, it will allow the property to be optional", () => {
      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-no-error: Nullable properties are optional
        @EnumAttribute({ values: ["val-1", "val-2"], nullable: true })
        public key1?: EnumValues;
      }
    });

    it("ForeignKey is not a valid type to apply the EnumAttribute decorator", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: ForeignKey is not a valid type for Attribute decorator
        @EnumAttribute({ values: ["val-1", "val-2"] })
        public key1: ForeignKey;
      }
    });

    it("NullableForeignKey is not a valid type to apply the EnumAttribute decorator", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: NullableForeignKey is not a valid type for EnumAttribute decorator
        @EnumAttribute({
          alias: "Key1",
          nullable: true,
          values: ["val-1", "val-2"]
        })
        public key1?: NullableForeignKey;
      }
    });
  });
});
