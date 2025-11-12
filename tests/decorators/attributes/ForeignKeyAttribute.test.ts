/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Entity,
  ForeignKeyAttribute,
  StringAttribute
} from "../../../src/decorators";
import type { NullableForeignKey, ForeignKey } from "../../../src/types";
import {
  MockTable,
  Order,
  Assignment,
  MyClassWithAllAttributeTypes,
  Customer,
  Course
} from "../../integration/mockModels";
import Metadata from "../../../src/metadata";
import { ZodNullable, ZodString } from "zod";

describe("ForeignKeyAttribute", () => {
  it("uses the provided table alias as attribute metadata if one is provided", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(Order.name).customerId).toEqual({
      name: "customerId",
      alias: "CustomerId",
      nullable: false,
      foreignKeyTarget: Customer,
      type: expect.any(ZodString)
    });
  });

  it("defaults attribute metadata alias to the table key if alias is not provided", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(Assignment.name).courseId).toEqual({
      name: "courseId",
      alias: "courseId",
      nullable: false,
      foreignKeyTarget: Course,
      type: expect.any(ZodString)
    });
  });

  it("zod type is optional if nullable is true", () => {
    expect.assertions(1);

    expect(
      Metadata.getEntityAttributes(MyClassWithAllAttributeTypes.name)
        .nullableForeignKeyAttribute
    ).toEqual({
      name: "nullableForeignKeyAttribute",
      alias: "nullableForeignKeyAttribute",
      nullable: true,
      foreignKeyTarget: Customer,
      type: expect.any(ZodNullable<ZodString>)
    });
  });

  describe("types", () => {
    it("does not have an error if the decorator is applied to an attribute of type ForeignKey", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-no-error: Attribute can be applied to an attribute of type ForeignKey
        @ForeignKeyAttribute(() => Customer, { alias: "Key1" })
        public key1: ForeignKey<Customer>;
      }
    });

    it("has an error if the decorator is applied to an attribute of type NullableForeignKey when its not nullable", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: Attribute can not be applied to an attribute of type NullableForeignKey
        @ForeignKeyAttribute(() => Customer, { alias: "Key1" })
        public key1: NullableForeignKey<Customer>;
      }
    });

    it("has an error if the decorator is applied to an attribute of type ForeignKey when its nullable", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: Attribute can not be applied to an attribute of type NullableForeignKey
        @ForeignKeyAttribute(() => Customer, { alias: "Key1", nullable: true })
        public key1: ForeignKey<Customer>;
      }
    });

    it("has an error if the decorator is applied to an attribute of type string", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: Attribute can not be applied to an attribute of type string
        @ForeignKeyAttribute(() => Customer, { alias: "Key1" })
        public key1: string;
      }
    });

    it("has an error if the decorator is applied to an attribute of type ForeignKey but its optional", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: Attribute cannot be applied to an optional property
        @ForeignKeyAttribute(() => Customer, { alias: "Key1" })
        public key1?: ForeignKey<Customer>;
      }
    });

    it("'alias' is optional", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-no-error: 'alias' is optional
        @ForeignKeyAttribute(() => Customer)
        public key1: ForeignKey<Customer>;
      }
    });

    it("if nullable is false the attribute can is required", () => {
      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-no-error: Nullable properties are required
        @ForeignKeyAttribute(() => Customer, { alias: "Key1", nullable: false })
        public key1: ForeignKey<Customer>;

        // @ts-expect-error: Nullable properties are required
        @ForeignKeyAttribute(() => Customer, { alias: "Key2", nullable: false })
        public key2?: ForeignKey<Customer>;
      }
    });

    it("nullable defaults to false and makes the property required", () => {
      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-no-error: Nullable properties are required
        @ForeignKeyAttribute(() => Customer, { alias: "Key1" })
        public key1: ForeignKey<Customer>;

        // @ts-expect-error: Nullable properties are required
        @ForeignKeyAttribute(() => Customer, { alias: "Key2" })
        public key2?: ForeignKey<Customer>;
      }
    });

    it("when nullable is true, it will allow the property to be optional and be NullableForeignKey", () => {
      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-no-error: Nullable properties are optional
        @ForeignKeyAttribute(() => Customer, { alias: "Key1", nullable: true })
        public key1?: NullableForeignKey<Customer>;
      }
    });

    // TODO
    it("ForeignKey target must be of type DynaRecord", () => {
      interface TargetTest1 {
        someThing: string;
      }

      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-error: Target must be of type DynaRecord"
        @ForeignKeyAttribute(() => TargetTest1, { alias: "Key1" })
        // @ts-expect-error: Target must be of type DynaRecord"
        public key1: ForeignKey<TargetTest1>;
      }
    });

    it("ForeignKey target match decorator target", () => {
      @Entity
      class OtherModel1 extends MockTable {
        @StringAttribute({ alias: "TheKey1" })
        public theKey1: string;
      }

      @Entity
      class OtherModel2 extends MockTable {
        @StringAttribute({ alias: "TheKey2" })
        public theKey2: string;
      }

      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-error: target match decorator target
        @ForeignKeyAttribute(() => OtherModel1, { alias: "Key1" })
        public key1: ForeignKey<OtherModel2>;
      }
    });

    it("NullableForeignKey target must be of type DynaRecord", () => {
      interface TargetTest2 {
        someThing: string;
      }

      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-error: Target must be of type DynaRecord"
        @ForeignKeyAttribute(() => TargetTest2, {
          alias: "Key1",
          nullable: true
        })
        // @ts-expect-error: Target must be of type DynaRecord"
        public key1?: NullableForeignKey<TargetTest2>;
      }
    });

    it("NullableForeignKey target match decorator target", () => {
      @Entity
      class OtherModel1 extends MockTable {
        @StringAttribute({ alias: "TheKey1" })
        public theKey1: string;
      }

      @Entity
      class OtherModel2 extends MockTable {
        @StringAttribute({ alias: "TheKey2" })
        public theKey2: string;
      }

      @Entity
      class SomeModel extends MockTable {
        // @ts-expect-error: target match decorator target
        @ForeignKeyAttribute(() => OtherModel1, {
          alias: "Key1",
          nullable: true
        })
        public key1: NullableForeignKey<OtherModel2>;
      }
    });
  });
});
