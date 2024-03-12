/* eslint-disable @typescript-eslint/no-unused-vars */
import { Entity, DateAttribute, dateSerializer } from "../../../src/decorators";
import { MockTable, Order, Profile } from "../../integration/mockModels";
import Metadata from "../../../src/metadata";

describe("DateAttribute", () => {
  it("uses the provided table alias as attribute metadata if one is provided", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(Order.name).orderDate).toEqual({
      name: "orderDate",
      alias: "OrderDate",
      nullable: false,
      serializers: dateSerializer
    });
  });

  it("defaults attribute metadata alias to the table key if alias is not provided", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(Profile.name).lastLogin).toEqual({
      name: "lastLogin",
      alias: "lastLogin",
      nullable: false,
      serializers: dateSerializer
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
  });
});
