/* eslint-disable @typescript-eslint/no-unused-vars */
import { Entity, ForeignKeyAttribute } from "../../../src/decorators";
import type { NullableForeignKey, ForeignKey } from "../../../src/types";
import { MockTable, Order, Assignment } from "../../integration/mockModels";
import Metadata from "../../../src/metadata";

describe("ForeignKeyAttribute", () => {
  it("uses the provided table alias as attribute metadata if one is provided", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(Order.name).customerId).toEqual({
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
      class ModelOne extends MockTable {
        // @ts-expect-no-error: Attribute can be applied to an attribute of type ForeignKey
        @ForeignKeyAttribute({ alias: "Key1" })
        public key1: ForeignKey;
      }
    });

    it("has an error if the decorator is applied to an attribute of type NullableForeignKey when its not nullable", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: Attribute can not be applied to an attribute of type NullableForeignKey
        @ForeignKeyAttribute({ alias: "Key1" })
        public key1: NullableForeignKey;
      }
    });

    it("has an error if the decorator is applied to an attribute of type ForeignKey when its nullable", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: Attribute can not be applied to an attribute of type NullableForeignKey
        @ForeignKeyAttribute({ alias: "Key1", nullable: true })
        public key1: ForeignKey;
      }
    });

    it("has an error if the decorator is applied to an attribute of type string", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: Attribute can not be applied to an attribute of type string
        @ForeignKeyAttribute({ alias: "Key1" })
        public key1: string;
      }
    });

    it("has an error if the decorator is applied to an attribute of type ForeignKey but its optional", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: Attribute cannot be applied to an optional property
        @ForeignKeyAttribute({ alias: "Key1" })
        public key1?: ForeignKey;
      }
    });

    it("'alias' is optional", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-no-error: 'alias' is optional
        @ForeignKeyAttribute()
        public key1: ForeignKey;
      }
    });

    it("if nullable is false the attribute can is required", () => {
      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-no-error: Nullable properties are required
        @ForeignKeyAttribute({ alias: "Key1", nullable: false })
        public key1: ForeignKey;

        // @ts-expect-error: Nullable properties are required
        @ForeignKeyAttribute({ alias: "Key2", nullable: false })
        public key2?: ForeignKey;
      }
    });

    it("nullable defaults to false and makes the property required", () => {
      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-no-error: Nullable properties are required
        @ForeignKeyAttribute({ alias: "Key1" })
        public key1: ForeignKey;

        // @ts-expect-error: Nullable properties are required
        @ForeignKeyAttribute({ alias: "Key2" })
        public key2?: ForeignKey;
      }
    });

    it("when nullable is true, it will allow the property to be optional and be NullableForeignKey", () => {
      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-no-error: Nullable properties are required
        @ForeignKeyAttribute({ alias: "Key1", nullable: true })
        public key1?: NullableForeignKey;
      }
    });
  });
});
