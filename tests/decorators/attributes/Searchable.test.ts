/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  BooleanAttribute,
  DateAttribute,
  Entity,
  EnumAttribute,
  NumberAttribute,
  Searchable,
  StringAttribute
} from "../../../src/decorators/index.js";
import { MockTable, Listing, Article } from "../../integration/mockModels.js";
import Metadata from "../../../src/metadata/index.js";
import { ZodNullable, ZodString } from "zod";
import { type ForeignKey } from "../../../src/index.js";

describe("Searchable", () => {
  it("marks the layered-over attribute as the entity's searchable attribute", () => {
    expect.assertions(2);

    const entityMetadata = Metadata.getEntity(Listing.name);

    expect(entityMetadata.searchableAttribute).toEqual({
      name: "description",
      alias: "Description",
      nullable: false,
      kind: "string",
      type: expect.any(ZodString)
    });
    // The mark resolves to the exact metadata registered by the base decorator
    expect(entityMetadata.searchableAttribute).toBe(
      entityMetadata.attributes.description
    );
  });

  it("leaves the base attribute decorator's metadata intact", () => {
    expect.assertions(1);

    expect(Metadata.getEntityAttributes(Listing.name).description).toEqual({
      name: "description",
      alias: "Description",
      nullable: false,
      kind: "string",
      type: expect.any(ZodString)
    });
  });

  it("supports nullable searchable attributes through the base decorator", () => {
    expect.assertions(1);

    expect(Metadata.getEntity(Article.name).searchableAttribute).toEqual({
      name: "content",
      alias: "Content",
      nullable: true,
      kind: "string",
      type: expect.any(ZodNullable)
    });
  });

  it("does not mark entities without the decorator", () => {
    expect.assertions(1);

    expect(Metadata.getEntity("Store").searchableAttribute).toBeUndefined();
  });

  describe("types", () => {
    it("can be applied to properties carrying the Searchable brand", () => {
      @Entity
      class SearchableModelOne extends MockTable {
        declare readonly type: "SearchableModelOne";

        // @ts-expect-no-error: Searchable branded properties are valid
        @Searchable()
        @StringAttribute({ alias: "Key1" })
        public readonly key1: Searchable;
      }
    });

    it("requires the property type to carry the Searchable brand", () => {
      @Entity
      class SearchableModelTwo extends MockTable {
        declare readonly type: "SearchableModelTwo";

        // @ts-expect-error: plain string properties do not carry the Searchable brand
        @Searchable()
        @StringAttribute({ alias: "Key1" })
        public readonly key1: string;
      }
    });

    it("supports the nullable brand variant", () => {
      @Entity
      class SearchableModelThree extends MockTable {
        declare readonly type: "SearchableModelThree";

        // @ts-expect-no-error: optional Searchable properties are valid when nullable
        @Searchable()
        @StringAttribute({ alias: "Key1", nullable: true })
        public readonly key1?: Searchable;
      }
    });

    it("only accepts string types as the brand's type parameter", () => {
      // @ts-expect-error: Searchable only accepts string types; numbers cannot be embedded
      type NumberBrand = Searchable<number>;
      // @ts-expect-error: Searchable only accepts string types
      type BooleanBrand = Searchable<boolean>;
      // @ts-expect-no-error: string literal unions are valid string types
      type LiteralBrand = Searchable<"a" | "b">;
    });

    it("can be applied to enum attributes with a branded literal union", () => {
      @Entity
      class SearchableEnumModel extends MockTable {
        declare readonly type: "SearchableEnumModel";

        // @ts-expect-no-error: enum values are embeddable text; the branded union satisfies both layers
        @Searchable()
        @EnumAttribute({ alias: "Status", values: ["draft", "published"] })
        public readonly status: Searchable<"draft" | "published">;
      }
    });

    it("cannot be applied to non-text attribute types", () => {
      @Entity
      class SearchableRejectsNumber extends MockTable {
        declare readonly type: "SearchableRejectsNumber";

        // @ts-expect-error: number properties cannot carry the Searchable brand
        @Searchable()
        @NumberAttribute({ alias: "Count" })
        public readonly count: number;
      }

      @Entity
      class SearchableRejectsBoolean extends MockTable {
        declare readonly type: "SearchableRejectsBoolean";

        // @ts-expect-error: boolean properties cannot carry the Searchable brand
        @Searchable()
        @BooleanAttribute({ alias: "Active" })
        public readonly active: boolean;
      }

      @Entity
      class SearchableRejectsDate extends MockTable {
        declare readonly type: "SearchableRejectsDate";

        // @ts-expect-error: Date properties cannot carry the Searchable brand
        @Searchable()
        @DateAttribute({ alias: "CreatedOn" })
        public readonly createdOn: Date;
      }
    });

    it("does not accept other branded string types", () => {
      @Entity
      class SearchableModelFour extends MockTable {
        declare readonly type: "SearchableModelFour";

        // @ts-expect-error: ForeignKey does not carry the Searchable brand
        @Searchable()
        public readonly key1: ForeignKey;
      }
    });

    it("the brand is assignable to string on read", () => {
      const toDescription = (listing: Listing): string => {
        // @ts-expect-no-error: Searchable is assignable to string
        const description: string = listing.description;
        return description;
      };

      expect(toDescription).toBeDefined();
    });

    it("create accepts plain strings for searchable attributes", () => {
      const _create = async (): Promise<void> => {
        // @ts-expect-no-error: plain strings are accepted, the brand is stripped from create input
        await Listing.create({
          description: "some text",
          category: "books",
          storeId: "123"
        });
      };

      expect(_create).toBeDefined();
    });

    it("create rejects non-string values for searchable attributes", () => {
      const _create = async (): Promise<void> => {
        await Listing.create({
          // @ts-expect-error: non-string values are rejected for searchable attributes
          description: 5,
          category: "books",
          storeId: "123"
        });
      };

      expect(_create).toBeDefined();
    });

    it("create supports the nullable brand variant", () => {
      const _create = async (): Promise<void> => {
        // @ts-expect-no-error: nullable searchable attributes accept plain strings
        await Article.create({ title: "title", content: "some text" });

        // @ts-expect-no-error: nullable searchable attributes can be omitted
        await Article.create({ title: "title" });
      };

      expect(_create).toBeDefined();
    });

    it("update accepts plain strings for searchable attributes", () => {
      const _update = async (): Promise<void> => {
        // @ts-expect-no-error: plain strings are accepted, the brand is stripped from update input
        await Listing.update("123", { description: "some text" });

        // @ts-expect-no-error: nullable searchable attributes can be set to null on update
        await Article.update("123", { content: null });
      };

      expect(_update).toBeDefined();
    });

    it("update rejects non-string values for searchable attributes", () => {
      const _update = async (): Promise<void> => {
        await Article.update("123", {
          // @ts-expect-error: non-string values are rejected for searchable attributes
          content: 5
        });
      };

      expect(_update).toBeDefined();
    });
  });
});
