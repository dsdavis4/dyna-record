import { SortKeyAttribute } from "../../../src/decorators";
import { type SortKey } from "../../../src/types";
import Metadata from "../../../src/metadata";
import { Customer, Student } from "../../integration/mockModels";

describe("SortKeyAttribute", () => {
  it("uses the provided table alias as attribute metadata if one is provided", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(Customer.name).SK).toEqual({
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      class MockClass {
        // @ts-expect-no-error: attribute must be of type SortKey
        @SortKeyAttribute({ alias: "SortKeyAlias" })
        public SortKey: SortKey;
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      class MockClass2 {
        // @ts-expect-error: attribute must be of type SortKey
        @SortKeyAttribute({ alias: "SortKeyAlias" })
        public SortKey: string;
      }
    });

    it("'alias' is optional", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      class MockClass {
        // @ts-expect-no-error: Alias prop is optional
        @SortKeyAttribute()
        public SortKey: SortKey;
      }
    });
  });
});
