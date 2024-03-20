/* eslint-disable @typescript-eslint/no-unused-vars */
import { Entity, PrimaryKeyAttribute } from "../../../src/decorators";
import { type PrimaryKey } from "../../../src/types";
import { Customer, MockTable, Student } from "../../integration/mockModels";
import Metadata from "../../../src/metadata";

describe("PrimaryKeyAttribute", () => {
  it("uses the provided table alias as attribute metadata if one is provided", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(Customer.name).pk).toEqual({
      name: "pk",
      alias: "PK",
      nullable: false
    });
  });

  it("defaults attribute metadata alias to the table key if alias is not provided", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(Student.name).myPk).toEqual({
      name: "myPk",
      alias: "myPk",
      nullable: false
    });
  });

  describe("types", () => {
    it("requires the attribute to be of type PrimaryKey", () => {
      @Entity
      class MockClass extends MockTable {
        // @ts-expect-no-error: attribute must be of type PrimaryKey
        @PrimaryKeyAttribute({ alias: "PrimaryKeyAlias" })
        public primaryKey: PrimaryKey;
      }

      @Entity
      class MockClass2 extends MockTable {
        // @ts-expect-error: attribute must be of type PrimaryKey
        @PrimaryKeyAttribute({ alias: "PrimaryKeyAlias" })
        public primaryKey: string;
      }
    });

    it("'alias' is optional", () => {
      @Entity
      class MockClass extends MockTable {
        // @ts-expect-no-error: Alias prop is optional
        @PrimaryKeyAttribute()
        public primaryKey: PrimaryKey;
      }
    });

    it("'nullable' is not valid because its expected to use @NullableAttribute", () => {
      @Entity
      class MockClass extends MockTable {
        // @ts-expect-error: Nullable prop is not allowed
        @PrimaryKeyAttribute({ alias: "Key1", nullable: false })
        public key1: PrimaryKey;
      }
    });
  });
});
