/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Entity,
  IdAttribute,
  NumberAttribute,
  StringAttribute
} from "../../../src";
import Metadata from "../../../src/metadata";
import { MockTable } from "../../integration/mockModels";

@Entity
class CustomIdModel extends MockTable {
  @IdAttribute
  @StringAttribute({ alias: "MyAttribute" })
  public myAttribute: string;

  public someMethod(): string {
    return "abc123";
  }
}

@Entity
class DefaultIdModel extends MockTable {
  @StringAttribute({ alias: "MyAttribute" })
  public myAttribute: string;

  public someMethod(): string {
    return "abc123";
  }
}

describe("IdAttribute", () => {
  it("will set idField in entity metadata", () => {
    expect.assertions(2);

    // id override field present when IdAttribute decorator is applied
    expect(Metadata.getEntity(CustomIdModel.name).idField).toEqual(
      "myAttribute"
    );

    // id override field undefined when IdAttribute decorator is not applied
    expect(Metadata.getEntity(DefaultIdModel.name).idField).toEqual(undefined);
  });

  it("can only be applied to string fields", () => {
    class MyModel extends MockTable {
      // @ts-expect-no-error: IdAttribute can only be applied to strings
      @IdAttribute
      @StringAttribute({ alias: "MyAttribute" })
      public myAttribute: string;

      public someMethod(): string {
        return "abc123";
      }
    }

    class OtherModel extends MockTable {
      // @ts-expect-error: IdAttribute can only be applied to strings
      @IdAttribute
      @NumberAttribute({ alias: "MyAttribute" })
      public myAttribute: number;

      public someMethod(): string {
        return "abc123";
      }
    }
  });

  it("is not optional", () => {
    class MyModel extends MockTable {
      // @ts-expect-error: IdAttribute cannot be applied to optional properties
      @IdAttribute
      @StringAttribute({ alias: "MyAttribute", nullable: true })
      public myAttribute?: string;

      public someMethod(): string {
        return "abc123";
      }
    }
  });
});
