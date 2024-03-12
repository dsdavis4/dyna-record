import { PrimaryKeyAttribute } from "../../../src/decorators";
import { type PrimaryKey } from "../../../src/types";
import { Customer, Student } from "../../integration/mockModels";
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      class MockClass {
        // @ts-expect-no-error: attribute must be of type PrimaryKey
        @PrimaryKeyAttribute({ alias: "PrimaryKeyAlias" })
        public primaryKey: PrimaryKey;
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      class MockClass2 {
        // @ts-expect-error: attribute must be of type PrimaryKey
        @PrimaryKeyAttribute({ alias: "PrimaryKeyAlias" })
        public primaryKey: string;
      }
    });

    it("'alias' is optional", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      class MockClass {
        // @ts-expect-no-error: Alias prop is optional
        @PrimaryKeyAttribute()
        public primaryKey: PrimaryKey;
      }
    });
  });
});
