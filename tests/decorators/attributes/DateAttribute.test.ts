/* eslint-disable @typescript-eslint/no-unused-vars */
import { Entity, DateAttribute } from "../../../src/decorators";
import type { ForeignKey, NullableForeignKey } from "../../../src/types";
import { MockTable } from "../../integration/mockModels";

describe("BelongsTo", () => {
  describe("types", () => {
    it("does not allow the property its applied to to be optional", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: DateAttributes are not nullable
        @DateAttribute({ alias: "Key1" })
        public key1?: Date;
      }
    });

    it("Date is not a valid type to apply the DateAttribute decorator because its a not a type natively supported by dynamo", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: Can only be applied to a Date property
        @DateAttribute({ alias: "Key1" })
        public key1: string;
      }
    });
  });
});
