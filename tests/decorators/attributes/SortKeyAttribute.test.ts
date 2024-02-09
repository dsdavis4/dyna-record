import { SortKeyAttribute } from "../../../src/decorators";
import { type SortKey } from "../../../src/types";

describe("SortKeyAttribute", () => {
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
});
