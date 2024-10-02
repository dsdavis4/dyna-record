/* eslint-disable @typescript-eslint/no-unused-vars */
import { Entity, DateAttribute, dateSerializer } from "../../../src/decorators";
import { MockTable, Order, Profile, Pet } from "../../integration/mockModels";
import Metadata from "../../../src/metadata";
import { z, ZodDate, ZodOptional } from "zod";

describe("DateAttribute", () => {
  it("uses the provided table alias as attribute metadata if one is provided", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(Order.name).orderDate).toEqual({
      name: "orderDate",
      alias: "OrderDate",
      nullable: false,
      serializers: dateSerializer,
      type: expect.any(ZodDate)
    });
  });

  it("defaults attribute metadata alias to the table key if alias is not provided", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(Profile.name).lastLogin).toEqual({
      name: "lastLogin",
      alias: "lastLogin",
      nullable: false,
      serializers: dateSerializer,
      type: expect.any(ZodDate)
    });
  });

  // TODO test like this for each attribute type
  it("zod type is optional if nullable is true", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(Pet.name).adoptedDate).toEqual({
      name: "adoptedDate",
      alias: "AdoptedDate",
      nullable: true,
      serializers: dateSerializer,
      type: expect.any(ZodOptional<ZodDate>)
    });
  });

  describe("types", () => {
    it("can be applied to Date attributes", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-no-error: Date is a valid type
        @DateAttribute({ alias: "Key1" })
        public key1: Date;
      }
    });

    it("does not allow the property its applied to to be optional", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: DateAttributes are not nullable
        @DateAttribute({ alias: "Key1" })
        public key1?: Date;
      }
    });

    it("does not support non-Date fields", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: string is not a valid type. Only Date is allowed
        @DateAttribute({ alias: "Key1" })
        public key1: string;
      }
    });

    it("'alias' is optional", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-no-error: Alias prop is optional
        @DateAttribute()
        public key1: Date;
      }
    });

    it("if nullable is false the attribute can is required", () => {
      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-no-error: Nullable properties are required
        @DateAttribute({ alias: "Key1", nullable: false })
        public key1: Date;

        // @ts-expect-error: Nullable properties are required
        @DateAttribute({ alias: "Key2", nullable: false })
        public key2?: Date;
      }
    });

    it("nullable defaults to false and makes the property required", () => {
      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-no-error: Nullable properties are required
        @DateAttribute({ alias: "Key1" })
        public key1: Date;

        // @ts-expect-error: Nullable properties are required
        @DateAttribute({ alias: "Key2" })
        public key2?: Date;
      }
    });

    it("when nullable is true, it will allow the property to be optional", () => {
      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-no-error: Nullable properties are required
        @DateAttribute({ alias: "Key1", nullable: true })
        public key1?: Date;
      }
    });
  });
});
