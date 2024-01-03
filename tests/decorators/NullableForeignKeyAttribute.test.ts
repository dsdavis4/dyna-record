import { Entity, NullableForeignKeyAttribute } from "../../src/decorators";
import type { NullableForeignKey, ForeignKey } from "../../src/types";
import { MockTable } from "../integration/mockModels";

describe("NullableForeignKeyAttribute", () => {
  describe("types", () => {
    it("does not have an error if the decorator is applied to an attribute of type NullableForeignKeyAttribute", () => {
      @Entity
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      class ModelOne extends MockTable {
        // @ts-expect-no-error: Attribute can be applied to an attribute of type NullableForeignKey
        @NullableForeignKeyAttribute({ alias: "Key1" })
        public key1: NullableForeignKey;
      }
    });

    it("does not have an error if the decorator is applied to an attribute of type NullableForeignKeyAttribute that is optional", () => {
      @Entity
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      class ModelOne extends MockTable {
        // @ts-expect-no-error: Attribute can be applied to an attribute of type NullableForeignKey that is optional
        @NullableForeignKeyAttribute({ alias: "Key1" })
        public key1?: NullableForeignKey;
      }
    });

    it("has an error if the decorator is applied to an attribute of type ForeignKey", () => {
      @Entity
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      class ModelOne extends MockTable {
        // @ts-expect-error: Attribute can not be applied to an attribute of type ForeignKey
        @NullableForeignKeyAttribute({ alias: "Key1" })
        public key1: ForeignKey;
      }
    });

    it("has an error if the decorator is applied to an attribute of type string", () => {
      @Entity
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      class ModelOne extends MockTable {
        // @ts-expect-error: Attribute can not be applied to an attribute of type string
        @NullableForeignKeyAttribute({ alias: "Key1" })
        public key1: string;
      }
    });
  });
});
