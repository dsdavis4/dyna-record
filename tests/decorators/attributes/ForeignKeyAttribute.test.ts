import { Entity, ForeignKeyAttribute } from "../../../src/decorators";
import type { NullableForeignKey, ForeignKey } from "../../../src/types";
import { MockTable, Order, Assignment } from "../../integration/mockModels";
import Metadata from "../../../src/metadata";

describe("ForeignKeyAttribute", () => {
  it("uses the provided table alias as attribute metadata if one is provided", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(Order.name).CustomerId).toEqual({
      name: "customerId",
      alias: "CustomerId",
      nullable: false
    });
  });

  it("defaults attribute metadata alias to the table key if alias is not provided", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(Assignment.name).courseId).toEqual({
      name: "courseId",
      alias: "courseId",
      nullable: false
    });
  });

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

    it("'alias' is optional", () => {
      @Entity
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      class ModelOne extends MockTable {
        // @ts-expect-no-error: 'alias' is optional
        @ForeignKeyAttribute()
        public key1: ForeignKey;
      }
    });
  });
});
