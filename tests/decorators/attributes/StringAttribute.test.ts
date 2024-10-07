/* eslint-disable @typescript-eslint/no-unused-vars */
import { Entity, StringAttribute } from "../../../src/decorators";
import {
  MockTable,
  Customer,
  Student,
  Profile
} from "../../integration/mockModels";
import Metadata from "../../../src/metadata";
import { ZodNullable, ZodString, type ZodOptional } from "zod";
import { type ForeignKey, type NullableForeignKey } from "../../../src";

describe("StringAttribute", () => {
  it("uses the provided table alias as attribute metadata if one is provided", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(Customer.name).name).toEqual({
      name: "name",
      alias: "Name",
      nullable: false,
      type: expect.any(ZodString)
    });
  });

  it("defaults attribute metadata alias to the table key if alias is not provided", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(Student.name).name).toEqual({
      name: "name",
      alias: "name",
      nullable: false,
      type: expect.any(ZodString)
    });
  });

  it("zod type is optional if nullable is true", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(Profile.name).alternateEmail).toEqual({
      name: "alternateEmail",
      alias: "alternateEmail",
      nullable: true,
      type: expect.any(ZodNullable<ZodOptional<ZodString>>)
    });
  });

  describe("types", () => {
    it("can be applied to string attributes", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-no-error: string is a valid type
        @StringAttribute({ alias: "Key1" })
        public key1: string;
      }
    });

    it("does not allow the property its applied to to be optional if its not nullable", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: StringAttributes cant be optional unless nullable
        @StringAttribute({ alias: "Key1" })
        public key1?: string;
      }
    });

    it("does allow the property its applied to to be optional if its nullable", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-no-error: StringAttributes can be optional if nullable
        @StringAttribute({ alias: "Key1", nullable: true })
        public key1?: string;
      }
    });

    it("does not support non-string fields", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: Only string types are allowed
        @StringAttribute({ alias: "Key1" })
        public key1: Date;
      }
    });

    it("'alias' is optional", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-no-error: Alias prop is optional
        @StringAttribute()
        public key1: string;
      }
    });

    it("if nullable is false the attribute is required", () => {
      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-no-error: Nullable properties are required
        @StringAttribute({ alias: "Key1", nullable: false })
        public key1: string;

        // @ts-expect-error: Nullable properties are required
        @StringAttribute({ alias: "Key2", nullable: false })
        public key2?: string;
      }
    });

    it("nullable defaults to false and makes the property required", () => {
      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-no-error: Nullable properties are required
        @StringAttribute({ alias: "Key1" })
        public key1: string;

        // @ts-expect-error: Nullable properties are required
        @StringAttribute({ alias: "Key2" })
        public key2?: string;
      }
    });

    it("when nullable is true, it will allow the property to be optional", () => {
      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-no-error: Nullable properties are required
        @StringAttribute({ alias: "Key1", nullable: true })
        public key1?: string;
      }
    });

    it("ForeignKey is not a valid type to apply the StringAttribute decorator", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: ForeignKey is not a valid type for Attribute decorator
        @StringAttribute({ alias: "Key1" })
        public key1: ForeignKey;
      }
    });

    it("NullableForeignKey is not a valid type to apply the StringAttribute decorator", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: NullableForeignKey is not a valid type for StringAttribute decorator
        @StringAttribute({ alias: "Key1" })
        public key1: NullableForeignKey;
      }
    });
  });
});
