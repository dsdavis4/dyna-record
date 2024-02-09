/* eslint-disable @typescript-eslint/no-unused-vars */
import { Entity, DateNullableAttribute } from "../../../src/decorators";
import { MockTable } from "../../integration/mockModels";

describe("BelongsTo", () => {
  describe("types", () => {
    it("can be applied to Date attributes", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-no-error: Date is a valid type
        @DateNullableAttribute({ alias: "Key1" })
        public key1: Date;
      }
    });

    it("does allow the property its applied to to be optional", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-no-error: DateNullableAttributes can be nullable
        @DateNullableAttribute({ alias: "Key1" })
        public key1?: Date;
      }
    });

    it("does not support non-Date fields", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: Can only be applied to a Date property
        @DateNullableAttribute({ alias: "Key1" })
        public key1: string;
      }
    });
  });
});
