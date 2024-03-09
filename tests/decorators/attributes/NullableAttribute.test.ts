/* eslint-disable @typescript-eslint/no-unused-vars */
import { Entity, NullableAttribute } from "../../../src/decorators";
import type { ForeignKey, NullableForeignKey } from "../../../src/types";
import {
  MockTable,
  ContactInformation,
  Profile
} from "../../integration/mockModels";
import Metadata from "../../../src/metadata";

describe("NullableAttribute", () => {
  it("uses the provided table alias as attribute metadata if one is provided", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(ContactInformation.name).phone).toEqual(
      {
        name: "phone",
        alias: "Phone",
        nullable: true
      }
    );
  });

  it("defaults attribute metadata alias to the table key if alias is not provided", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(Profile.name).alternateEmail).toEqual({
      name: "alternateEmail",
      alias: "alternateEmail",
      nullable: true
    });
  });

  describe("types", () => {
    it("ForeignKey is not a valid type to apply the NullableAttribute decorator", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: ForeignKey is not a valid type for NullableAttribute decorator
        @NullableAttribute({ alias: "Key1" })
        public key1: ForeignKey;
      }
    });

    it("NullableForeignKey is not a valid type to apply the NullableAttribute decorator", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: NullableForeignKey is not a valid type for NullableAttribute decorator
        @NullableAttribute({ alias: "Key1" })
        public key1: NullableForeignKey;
      }
    });

    it("does allow the property its applied to to be optional", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-no-error: NullableAttributes can be nullable
        @NullableAttribute({ alias: "Key1" })
        public key1?: string;
      }
    });

    it("Date is not a valid type to apply the NullableAttribute decorator because its a not a type natively supported by dynamo", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: Date is not a valid type for NullableAttribute decorator
        @NullableAttribute({ alias: "Key1" })
        public key1: Date;
      }
    });

    it("'alias' is optional", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-no-error: Alias prop is optional
        @NullableAttribute()
        public key1?: string;
      }
    });
  });
});
