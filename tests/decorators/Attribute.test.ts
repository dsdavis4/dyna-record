/* eslint-disable @typescript-eslint/no-unused-vars */
import { Entity, Attribute } from "../../src/decorators";
import type { ForeignKey, NullableForeignKey } from "../../src/types";
import { MockTable } from "../integration/mockModels";

describe("BelongsTo", () => {
  describe("types", () => {
    it("ForeignKey is not a valid type to apply the Attribute decorator", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: ForeignKey is not a valid type for Attribute decorator
        @Attribute({ alias: "Key1" })
        public key1: ForeignKey;
      }
    });

    it("NullableForeignKey is not a valid type to apply the Attribute decorator", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: NullableForeignKey is not a valid type for Attribute decorator
        @Attribute({ alias: "Key1" })
        public key1: NullableForeignKey;
      }
    });

    it("does not allow the property its applied to to be optional", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: Attributes can't be nullable
        @Attribute({ alias: "Key1" })
        public key1?: string;
      }
    });

    it("Date is not a valid type to apply the Attribute decorator because its a not a type natively supported by dynamo", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: Date is not a valid type for Attribute decorator
        @Attribute({ alias: "Key1" })
        public key1: Date;
      }
    });
  });
});
