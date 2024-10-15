/* eslint-disable @typescript-eslint/no-unused-vars */
import { Entity, BooleanAttribute } from "../../../src/decorators";
import { MockTable } from "../../integration/mockModels";
import Metadata from "../../../src/metadata";
import { ZodBoolean, ZodNullable, type ZodOptional } from "zod";

@Entity
class MyEntity extends MockTable {
  @BooleanAttribute({ alias: "MyBoolean" })
  public readonly myBoolean: boolean;

  @BooleanAttribute()
  public readonly myOtherBoolean: boolean;

  @BooleanAttribute({ alias: "MyNullableBoolean", nullable: true })
  public readonly myNullableBoolean?: boolean;
}

describe("BooleanAttribute", () => {
  it("uses the provided table alias as attribute metadata if one is provided", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(MyEntity.name).myBoolean).toEqual({
      name: "myBoolean",
      alias: "MyBoolean",
      nullable: false,
      type: expect.any(ZodBoolean)
    });
  });

  it("defaults attribute metadata alias to the table key if alias is not provided", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(MyEntity.name).myOtherBoolean).toEqual({
      name: "myOtherBoolean",
      alias: "myOtherBoolean",
      nullable: false,
      type: expect.any(ZodBoolean)
    });
  });

  it("zod type is optional if nullable is true", () => {
    expect.assertions(1);

    expect(
      Metadata.getEntityAttributes(MyEntity.name).myNullableBoolean
    ).toEqual({
      name: "myNullableBoolean",
      alias: "MyNullableBoolean",
      nullable: true,
      type: expect.any(ZodNullable<ZodOptional<ZodBoolean>>)
    });
  });

  describe("types", () => {
    it("can be applied to boolean attributes", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-no-error: boolean is a valid type
        @BooleanAttribute({ alias: "Key1" })
        public key1: boolean;
      }
    });

    it("does not allow the property its applied to to be optional if its not nullable", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: BooleanAttributes cant be optional unless nullable
        @BooleanAttribute({ alias: "Key1" })
        public key1?: boolean;
      }
    });

    it("does allow the property its applied to to be optional if its nullable", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-no-error: BooleanAttributes can be optional if nullable
        @BooleanAttribute({ alias: "Key1", nullable: true })
        public key1?: boolean;
      }
    });

    it("does not support non-boolean fields", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: string is not a valid type. Only boolean is allowed
        @BooleanAttribute({ alias: "Key1" })
        public key1: string;
      }
    });

    it("'alias' is optional", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-no-error: Alias prop is optional
        @BooleanAttribute()
        public key1: boolean;
      }
    });

    it("if nullable is false the attribute is required", () => {
      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-no-error: Nullable properties are required
        @BooleanAttribute({ alias: "Key1", nullable: false })
        public key1: boolean;

        // @ts-expect-error: Nullable properties are required
        @BooleanAttribute({ alias: "Key2", nullable: false })
        public key2?: boolean;
      }
    });

    it("nullable defaults to false and makes the property required", () => {
      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-no-error: Nullable properties are required
        @BooleanAttribute({ alias: "Key1" })
        public key1: boolean;

        // @ts-expect-error: Nullable properties are required
        @BooleanAttribute({ alias: "Key2" })
        public key2?: boolean;
      }
    });

    it("when nullable is true, it will allow the property to be optional", () => {
      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-no-error: Nullable properties are optional
        @BooleanAttribute({ alias: "Key1", nullable: true })
        public key1?: boolean;
      }
    });
  });
});
