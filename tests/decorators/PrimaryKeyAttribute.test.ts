import { PrimaryKeyAttribute } from "../../src/decorators";
import { type PrimaryKey } from "../../src/types";

describe("PrimaryKeyAttribute", () => {
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
});
