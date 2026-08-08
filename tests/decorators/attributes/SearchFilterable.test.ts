/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  BelongsTo,
  BooleanAttribute,
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
    it("can be applied to string attributes carrying the brand", () => {
      @Entity
      class FilterableModelOne extends MockTable {
        declare readonly type: "FilterableModelOne";

        // @ts-expect-no-error: branded string attributes are valid filterables
        @SearchFilterable()
        @StringAttribute({ alias: "Key1" })
        public readonly key1: SearchFilterable;
      }
    });

    it("can be applied to number attributes carrying the brand", () => {
      @Entity
      class FilterableModelTwo extends MockTable {
        declare readonly type: "FilterableModelTwo";

        // @ts-expect-no-error: branded number attributes are valid filterables
        @SearchFilterable()
        @NumberAttribute({ alias: "Key1" })
        public readonly key1: SearchFilterable<number>;
      }
    });

    it("can be applied to foreign key attributes carrying both brands", () => {
      @Entity
      class FilterableModelThree extends MockTable {
        declare readonly type: "FilterableModelThree";

        // @ts-expect-no-error: foreign keys are valid filterables (sub-scope narrowing)
        @SearchFilterable()
        @ForeignKeyAttribute(() => Customer, { alias: "CustomerId" })
        public readonly customerId: SearchFilterable<ForeignKey<Customer>>;

        // @ts-expect-no-error: the double-branded key still satisfies the relationship's foreign key
        @BelongsTo(() => Customer, { foreignKey: "customerId" })
        public readonly customer: Customer;
      }
    });

    it("can be applied to enum attributes carrying a branded literal union", () => {
      @Entity
      class FilterableModelFour extends MockTable {
        declare readonly type: "FilterableModelFour";

        // @ts-expect-no-error: branded enum attributes are valid filterables (equality on a literal union)
        @SearchFilterable()
        @EnumAttribute({ alias: "Status", values: ["draft", "published"] })
        public readonly status: SearchFilterable<"draft" | "published">;
      }
    });

    it("can be applied to boolean attributes carrying the brand", () => {
      @Entity
      class FilterableModelFive extends MockTable {
        declare readonly type: "FilterableModelFive";

        // @ts-expect-no-error: branded boolean attributes are valid filterables (equality)
        @SearchFilterable()
        @BooleanAttribute({ alias: "Featured" })
        public readonly featured: SearchFilterable<boolean>;
      }
    });

    it("requires the property type to carry the SearchFilterable brand", () => {
      @Entity
      class FilterableRejectsUnbranded extends MockTable {
        declare readonly type: "FilterableRejectsUnbranded";

        // @ts-expect-error: plain string properties do not carry the SearchFilterable brand
        @SearchFilterable()
        @StringAttribute({ alias: "Key1" })
        public readonly key1: string;
      }

      @Entity
      class FilterableRejectsUnbrandedFk extends MockTable {
        declare readonly type: "FilterableRejectsUnbrandedFk";

        // @ts-expect-error: unbranded foreign keys do not carry the SearchFilterable brand
        @SearchFilterable()
        @ForeignKeyAttribute(() => Customer, { alias: "CustomerId" })
        public readonly customerId: ForeignKey<Customer>;
      }
    });

    it("only accepts equality-comparable scalars as the brand's type parameter", () => {
      // @ts-expect-error: Date attributes are not filterable at the type level (no equality semantics on serialized dates)
      type DateBrand = SearchFilterable<Date>;
      // @ts-expect-error: objects are not equality-filterable scalars
      type ObjectBrand = SearchFilterable<{ a: string }>;
      // @ts-expect-no-error: string literal unions are valid scalar types
      type LiteralBrand = SearchFilterable<"a" | "b">;
    });

    it("the brand is assignable to its underlying type on read", () => {
      const toCategory = (listing: Listing): string => {
        // @ts-expect-no-error: SearchFilterable is assignable to its underlying type
        const category: string = listing.category;
        return category;
      };

      expect(toCategory).toBeDefined();
    });

    it("create and update inputs accept plain values for branded filterables", () => {
      const createInput = (): void => {
        void Listing.create({
          // @ts-expect-no-error: the searchable brand is stripped on input
          description: "some description",
          // @ts-expect-no-error: the filterable brand is stripped on input
          category: "books",
          // @ts-expect-no-error: foreign keys accept plain strings
          storeId: "123"
        });
      };

      expect(createInput).toBeDefined();
    });
  });
});
