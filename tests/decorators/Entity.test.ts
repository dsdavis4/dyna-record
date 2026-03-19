/* eslint-disable @typescript-eslint/no-unused-vars */
import DynaRecord from "../../index";
import { Table, Entity } from "../../src/decorators";
import {
  PartitionKeyAttribute,
  SortKeyAttribute,
  StringAttribute
} from "../../src/decorators";
import type { PartitionKey, SortKey } from "../../src/types";

@Table({ name: "entity-test-table" })
abstract class TestTable extends DynaRecord {
  @PartitionKeyAttribute({ alias: "PK" })
  public readonly pk: PartitionKey;

  @SortKeyAttribute({ alias: "SK" })
  public readonly sk: SortKey;
}

describe("Entity decorator", () => {
  describe("types", () => {
    it("accepts an entity with declare readonly type", () => {
      // @ts-expect-no-error: Entity has declare readonly type
      @Entity
      class ValidEntity extends TestTable {
        declare readonly type: "ValidEntity";

        @StringAttribute({ alias: "Name" })
        public readonly name: string;
      }
    });

    it("rejects an entity without declare readonly type", () => {
      // @ts-expect-error: Entity must declare readonly type
      @Entity
      class MissingTypeEntity extends TestTable {
        @StringAttribute({ alias: "Name" })
        public readonly name: string;
      }
    });

    it("rejects an entity with type: string instead of a literal", () => {
      // @ts-expect-error: type must be a string literal, not 'string'
      @Entity
      class WideTypeEntity extends TestTable {
        declare readonly type: string;

        @StringAttribute({ alias: "Name" })
        public readonly name: string;
      }
    });
  });
});
