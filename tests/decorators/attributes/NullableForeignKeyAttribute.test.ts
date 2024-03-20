/* eslint-disable @typescript-eslint/no-unused-vars */
import { Entity, NullableForeignKeyAttribute } from "../../../src/decorators";
import type { NullableForeignKey, ForeignKey } from "../../../src/types";
import {
  MockTable,
  ContactInformation,
  Course
} from "../../integration/mockModels";
import Metadata from "../../../src/metadata";

describe("NullableForeignKeyAttribute", () => {
  it("uses the provided table alias as attribute metadata if one is provided", () => {
    expect.assertions(1);

    expect(
      Metadata.getEntityAttributes(ContactInformation.name).customerId
    ).toEqual({
      name: "customerId",
      alias: "CustomerId",
      nullable: true
    });
  });

  it("defaults attribute metadata alias to the table key if alias is not provided", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(Course.name).teacherId).toEqual({
      name: "teacherId",
      alias: "teacherId",
      nullable: true
    });
  });

  describe("types", () => {
    it("does not have an error if the decorator is applied to an attribute of type NullableForeignKeyAttribute", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-no-error: Attribute can be applied to an attribute of type NullableForeignKey
        @NullableForeignKeyAttribute({ alias: "Key1" })
        public key1: NullableForeignKey;
      }
    });

    it("does not have an error if the decorator is applied to an attribute of type NullableForeignKeyAttribute that is optional", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-no-error: Attribute can be applied to an attribute of type NullableForeignKey that is optional
        @NullableForeignKeyAttribute({ alias: "Key1" })
        public key1?: NullableForeignKey;
      }
    });

    it("has an error if the decorator is applied to an attribute of type ForeignKey", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: Attribute can not be applied to an attribute of type ForeignKey
        @NullableForeignKeyAttribute({ alias: "Key1" })
        public key1: ForeignKey;
      }
    });

    it("has an error if the decorator is applied to an attribute of type string", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: Attribute can not be applied to an attribute of type string
        @NullableForeignKeyAttribute({ alias: "Key1" })
        public key1: string;
      }
    });

    it("'alias' is optional", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-no-error: Alias prop is optional
        @NullableForeignKeyAttribute()
        public key1?: NullableForeignKey;
      }
    });

    it("'nullable' is not valid because its expected to use @NullableAttribute", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: Nullable prop is not allowed
        @NullableForeignKeyAttribute({ alias: "Key1", nullable: true })
        public key1?: string;
      }
    });
  });
});
