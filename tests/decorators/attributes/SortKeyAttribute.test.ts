/* eslint-disable @typescript-eslint/no-unused-vars */
import { Entity, SortKeyAttribute } from "../../../src/decorators";
import { type SortKey } from "../../../src/types";
import Metadata from "../../../src/metadata";
import { Customer, MockTable, Student } from "../../integration/mockModels";

describe("SortKeyAttribute", () => {
  it("uses the provided table alias as attribute metadata if one is provided", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(Customer.name).sk).toEqual({
      name: "sk",
      alias: "SK",
      nullable: false
    });
  });

  it("defaults attribute metadata alias to the table key if alias is not provided", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(Student.name).mySk).toEqual({
      name: "mySk",
      alias: "mySk",
      nullable: false
    });
  });

  describe("types", () => {
    it("requires the attribute to be of type SortKey", () => {
      class MockClass extends MockTable {
        // @ts-expect-no-error: attribute must be of type SortKey
        @SortKeyAttribute({ alias: "SortKeyAlias" })
        public SortKey: SortKey;
      }

      class MockClass2 {
        // @ts-expect-error: attribute must be of type SortKey
        @SortKeyAttribute({ alias: "SortKeyAlias" })
        public SortKey: string;
      }
    });

    it("'alias' is optional", () => {
      class MockClass extends MockTable {
        // @ts-expect-no-error: Alias prop is optional
        @SortKeyAttribute()
        public SortKey: SortKey;
      }
    });

    it("'nullable' is not valid because its expected to use @NullableAttribute", () => {
      @Entity
      class MockClass extends MockTable {
        // @ts-expect-error: Nullable prop is not allowed
        @SortKeyAttribute({ alias: "Key1", nullable: false })
        public key1: SortKey;
      }
    });
  });
});
