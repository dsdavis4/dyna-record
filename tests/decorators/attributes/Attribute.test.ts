/* eslint-disable @typescript-eslint/no-unused-vars */
import { Entity, Attribute } from "../../../src/decorators";
import Metadata from "../../../src/metadata";
import type { ForeignKey, NullableForeignKey } from "../../../src/types";
import { MockTable, Customer, Student } from "../../integration/mockModels";

describe("Attribute", () => {
  it("uses the provided table alias as attribute metadata if one is provided", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(Customer.name).name).toEqual({
      name: "name",
      alias: "Name",
      nullable: false
    });
  });

  it("defaults attribute metadata alias to the table key if alias is not provided", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(Student.name).name).toEqual({
      name: "name",
      alias: "name",
      nullable: false
    });
  });

  describe("types", () => {
    it("ForeignKey is not a valid type to apply the Attribute decorator", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: ForeignKey is not a valid type for Attribute decorator
        @Attribute({ alias: "Key1" })
        public key1: ForeignKey;
      }
    });

    it("NullableForeignKey is not a valid type to apply the Attribute decorator", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: NullableForeignKey is not a valid type for Attribute decorator
        @Attribute({ alias: "Key1" })
        public key1: NullableForeignKey;
      }
    });

    it("does not allow the property its applied to to be optional", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: Attributes can't be nullable
        @Attribute({ alias: "Key1" })
        public key1?: string;
      }
    });

    it("Date is not a valid type to apply the Attribute decorator because its a not a type natively supported by dynamo", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: Date is not a valid type for Attribute decorator
        @Attribute({ alias: "Key1" })
        public key1: Date;
      }
    });

    it("'alias' is optional", () => {
      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-no-error: Alias prop is optional
        @Attribute()
        public key1: string;
      }
    });

    it("if nullable is false the attribute can is required", () => {
      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-no-error: Nullable properties are required
        @Attribute({ alias: "Key1", nullable: false })
        public key1: string;

        // @ts-expect-error: Nullable properties are required
        @Attribute({ alias: "Key2", nullable: false })
        public key2?: string;
      }
    });

    it("nullable defaults to false and makes the property required", () => {
      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-no-error: Nullable properties are required
        @Attribute({ alias: "Key1" })
        public key1: string;

        // @ts-expect-error: Nullable properties are required
        @Attribute({ alias: "Key2" })
        public key2?: string;
      }
    });

    it("when nullable is true, it will allow the property to be optional", () => {
      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-no-error: Nullable properties are required
        @Attribute({ alias: "Key1", nullable: true })
        public key1?: string;
      }
    });
  });
});
