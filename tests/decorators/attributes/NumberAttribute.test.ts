/* eslint-disable @typescript-eslint/no-unused-vars */
import { Entity, NumberAttribute } from "../../../src/decorators";
import { MockTable } from "../../integration/mockModels";
import Metadata from "../../../src/metadata";
import { ZodBoolean, ZodNullable, ZodNumber, type ZodOptional } from "zod";

@Entity
class MyEntity extends MockTable {
  @NumberAttribute({ alias: "MyNumber" })
  public readonly myNumber: number;

  @NumberAttribute()
  public readonly myOtherNumber: number;

  @NumberAttribute({ alias: "MyNullableNumber", nullable: true })
  public readonly myNullableNumber?: number;
}

describe("NumberAttribute", () => {
  it("uses the provided table alias as attribute metadata if one is provided", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(MyEntity.name).myNumber).toEqual({
      name: "myNumber",
      alias: "MyNumber",
      nullable: false,
      type: expect.any(ZodNumber)
    });
  });

  it("defaults attribute metadata alias to the table key if alias is not provided", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(MyEntity.name).myOtherNumber).toEqual({
      name: "myOtherNumber",
      alias: "myOtherNumber",
      nullable: false,
      type: expect.any(ZodNumber)
    });
  });

  it("zod type is optional if nullable is true", () => {
    expect.assertions(1);

    expect(
      Metadata.getEntityAttributes(MyEntity.name).myNullableNumber
    ).toEqual({
      name: "myNullableNumber",
      alias: "MyNullableNumber",
      nullable: true,
      type: expect.any(ZodNullable<ZodOptional<ZodNumber>>)
    });
  });

  describe("types", () => {
    it("can be applied to number attributes", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-no-error: number is a valid type
        @NumberAttribute({ alias: "Key1" })
        public key1: number;
      }
    });

    it("does not allow the property its applied to to be optional if its not nullable", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: NumberAttributes cant be optional unless nullable
        @NumberAttribute({ alias: "Key1" })
        public key1?: number;
      }
    });

    it("does allow the property its applied to to be optional if its nullable", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-no-error: NumberAttributes can be optional if nullable
        @NumberAttribute({ alias: "Key1", nullable: true })
        public key1?: number;
      }
    });

    it("does not support non-number fields", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: string is not a valid type. Only number is allowed
        @NumberAttribute({ alias: "Key1" })
        public key1: string;
      }
    });

    it("'alias' is optional", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-no-error: Alias prop is optional
        @NumberAttribute()
        public key1: number;
      }
    });

    it("if nullable is false the attribute is required", () => {
      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-no-error: Nullable properties are required
        @NumberAttribute({ alias: "Key1", nullable: false })
        public key1: number;

        // @ts-expect-error: Nullable properties are required
        @NumberAttribute({ alias: "Key2", nullable: false })
        public key2?: number;
      }
    });

    it("nullable defaults to false and makes the property required", () => {
      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-no-error: Nullable properties are required
        @NumberAttribute({ alias: "Key1" })
        public key1: number;

        // @ts-expect-error: Nullable properties are required
        @NumberAttribute({ alias: "Key2" })
        public key2?: number;
      }
    });

    it("when nullable is true, it will allow the property to be optional", () => {
      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-no-error: Nullable properties are required
        @NumberAttribute({ alias: "Key1", nullable: true })
        public key1?: number;
      }
    });
  });
});
