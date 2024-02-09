/* eslint-disable @typescript-eslint/no-unused-vars */
import { Entity, DateAttribute } from "../../../src/decorators";
import { MockTable } from "../../integration/mockModels";

describe("BelongsTo", () => {
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
  });
});
