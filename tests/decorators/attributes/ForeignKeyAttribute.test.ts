import { Entity, ForeignKeyAttribute } from "../../../src/decorators";
import type { NullableForeignKey, ForeignKey } from "../../../src/types";
import { MockTable } from "../../integration/mockModels";

describe("ForeignKeyAttribute", () => {
  describe("types", () => {
    it("does not have an error if the decorator is applied to an attribute of type ForeignKey", () => {
      @Entity
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      class ModelOne extends MockTable {
        // @ts-expect-no-error: Attribute can be applied to an attribute of type ForeignKey
        @ForeignKeyAttribute({ alias: "Key1" })
        public key1: ForeignKey;
      }
    });

    it("has an error if the decorator is applied to an attribute of type NullableForeignKey", () => {
      @Entity
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      class ModelOne extends MockTable {
        // @ts-expect-error: Attribute can not be applied to an attribute of type NullableForeignKey
        @ForeignKeyAttribute({ alias: "Key1" })
        public key1: NullableForeignKey;
      }
    });

    it("has an error if the decorator is applied to an attribute of type string", () => {
      @Entity
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      class ModelOne extends MockTable {
        // @ts-expect-error: Attribute can not be applied to an attribute of type string
        @ForeignKeyAttribute({ alias: "Key1" })
        public key1: string;
      }
    });

    it("has an error if the decorator is applied to an attribute of type ForeignKey but its optional", () => {
      @Entity
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      class ModelOne extends MockTable {
        // @ts-expect-error: Attribute cannot be applied to an optional property
        @ForeignKeyAttribute({ alias: "Key1" })
        public key1?: ForeignKey;
      }
    });
  });
});
