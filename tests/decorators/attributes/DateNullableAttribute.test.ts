/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Entity,
  DateNullableAttribute,
  dateSerializer
} from "../../../src/decorators";
import { MockTable } from "../../integration/mockModels";
import Metadata from "../../../src/metadata";

@Entity
class ModelA extends MockTable {
  // @ts-expect-no-error: Alias prop is optional
  @DateNullableAttribute()
  public key1?: Date;
}

@Entity
class ModelB extends MockTable {
  // @ts-expect-no-error: Alias prop is optional
  @DateNullableAttribute({ alias: "Key1" })
  public key1?: Date;
}

describe("DateNullableAttribute", () => {
  it("uses the provided table alias as attribute metadata if one is provided", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(ModelA.name).key1).toEqual({
      name: "key1",
      alias: "key1",
      nullable: true,
      serializers: dateSerializer
    });
  });

  it("defaults attribute metadata alias to the table key if alias is not provided", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(ModelB.name).Key1).toEqual({
      name: "key1",
      alias: "Key1",
      nullable: true,
      serializers: dateSerializer
    });
  });

  describe("types", () => {
    it("can be applied to Date attributes", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-no-error: Date is a valid type
        @DateNullableAttribute({ alias: "Key1" })
        public key1: Date;
      }
    });

    it("does allow the property its applied to to be optional", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-no-error: DateNullableAttributes can be nullable
        @DateNullableAttribute({ alias: "Key1" })
        public key1?: Date;
      }
    });

    it("does not support non-Date fields", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: Can only be applied to a Date property
        @DateNullableAttribute({ alias: "Key1" })
        public key1: string;
      }
    });

    it("'alias' is optional", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-no-error: Alias prop is optional
        @DateNullableAttribute()
        public key1: Date;
      }
    });
  });
});
