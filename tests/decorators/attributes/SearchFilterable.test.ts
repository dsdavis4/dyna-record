/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  BooleanAttribute,
  DateAttribute,
  Entity,
  EnumAttribute,
  ForeignKeyAttribute,
  NumberAttribute,
  SearchFilterable,
  StringAttribute
} from "../../../src/decorators/index.js";
import {
  MockTable,
  Customer,
  Listing,
  Store
} from "../../integration/mockModels.js";
import Metadata from "../../../src/metadata/index.js";
import { ZodString } from "zod";
import { type ForeignKey } from "../../../src/index.js";

describe("SearchFilterable", () => {
  it("marks the layered-over attribute as an inline filter attribute", () => {
    expect.assertions(2);

    const entityMetadata = Metadata.getEntity(Listing.name);

    expect(entityMetadata.searchFilterableAttributes).toEqual([
      {
        name: "category",
        alias: "Category",
        nullable: false,
        kind: "string",
        type: expect.any(ZodString)
      }
    ]);
    // The mark resolves to the exact metadata registered by the base decorator
    expect(entityMetadata.searchFilterableAttributes[0]).toBe(
      entityMetadata.attributes.category
    );
  });

  it("leaves the base attribute decorator's metadata intact", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(Listing.name).category).toEqual({
      name: "category",
      alias: "Category",
      nullable: false,
      kind: "string",
      type: expect.any(ZodString)
    });
  });

  it("does not mark entities without the decorator", () => {
    expect.assertions(1);

    expect(Metadata.getEntity(Store.name).searchFilterableAttributes).toEqual(
      []
    );
  });

  describe("types", () => {
    it("can be applied to string attributes", () => {
      @Entity
      class FilterableModelOne extends MockTable {
        declare readonly type: "FilterableModelOne";

        // @ts-expect-no-error: string attributes are valid filterables
        @SearchFilterable()
        @StringAttribute({ alias: "Key1" })
        public readonly key1: string;
      }
    });

    it("can be applied to number attributes", () => {
      @Entity
      class FilterableModelTwo extends MockTable {
        declare readonly type: "FilterableModelTwo";

        // @ts-expect-no-error: number attributes are valid filterables
        @SearchFilterable()
        @NumberAttribute({ alias: "Key1" })
        public readonly key1: number;
      }
    });

    it("can be applied to foreign key attributes", () => {
      @Entity
      class FilterableModelThree extends MockTable {
        declare readonly type: "FilterableModelThree";

        // @ts-expect-no-error: foreign keys are valid filterables (sub-scope narrowing)
        @SearchFilterable()
        @ForeignKeyAttribute(() => Customer, { alias: "CustomerId" })
        public readonly customerId: ForeignKey<Customer>;
      }
    });

    it("can be applied to enum attributes", () => {
      @Entity
      class FilterableModelFour extends MockTable {
        declare readonly type: "FilterableModelFour";

        // @ts-expect-no-error: enum attributes are valid filterables (equality on a literal union)
        @SearchFilterable()
        @EnumAttribute({ alias: "Status", values: ["draft", "published"] })
        public readonly status: "draft" | "published";
      }
    });

    it("can be applied to boolean attributes", () => {
      @Entity
      class FilterableModelFive extends MockTable {
        declare readonly type: "FilterableModelFive";

        // @ts-expect-no-error: boolean attributes are valid filterables (equality)
        @SearchFilterable()
        @BooleanAttribute({ alias: "Featured" })
        public readonly featured: boolean;
      }
    });

    it("can be applied to date attributes", () => {
      @Entity
      class FilterableModelSix extends MockTable {
        declare readonly type: "FilterableModelSix";

        // @ts-expect-no-error: date attributes are valid filterables (equality on the serialized value)
        @SearchFilterable()
        @DateAttribute({ alias: "PublishedOn" })
        public readonly publishedOn: Date;
      }
    });
  });
});
