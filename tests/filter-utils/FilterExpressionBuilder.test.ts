import { z } from "zod";
import {
  FilterExpressionBuilder,
  queryFilterCapabilities,
  searchFilterCapabilities,
  type FilterAttributeResolver
} from "../../src/filter-utils/index.js";
import { FilterError } from "../../src/errors.js";

const attributes: Record<string, { alias: string; type: z.ZodType }> = {
  pk: { alias: "PK", type: z.string() },
  type: { alias: "Type", type: z.string() },
  name: { alias: "Name", type: z.string() },
  category: { alias: "Category", type: z.string() },
  price: { alias: "Price", type: z.number() },
  meta: { alias: "Meta", type: z.object({}) }
};

/**
 * Stub resolver over a fixed attribute map. Query-shaped: resolves aliases
 * only, so no value validation runs
 */
const aliasResolver: FilterAttributeResolver = (attributeKey, filterKey) => {
  if (!(attributeKey in attributes)) {
    throw new FilterError(`Invalid filter key "${filterKey}"`);
  }
  return { alias: attributes[attributeKey].alias };
};

/**
 * Stub resolver that also supplies each attribute's zod type, enabling the
 * value guard
 */
const typedResolver: FilterAttributeResolver = (attributeKey, filterKey) => {
  if (!(attributeKey in attributes)) {
    throw new FilterError(`Invalid filter key "${filterKey}"`);
  }
  return attributes[attributeKey];
};

const queryBuilderInstance = (): FilterExpressionBuilder =>
  new FilterExpressionBuilder({
    capabilities: queryFilterCapabilities,
    resolveAttribute: aliasResolver
  });

const searchBuilderInstance = (): FilterExpressionBuilder =>
  new FilterExpressionBuilder({
    capabilities: searchFilterCapabilities,
    resolveAttribute: typedResolver
  });

describe("FilterExpressionBuilder", () => {
  describe("query capabilities", () => {
    it("compiles the full filter vocabulary", () => {
      expect.assertions(1);

      const builder = queryBuilderInstance();

      expect(
        builder.filterParams({
          type: "Process",
          name: ["Process1", "Process2"],
          $or: [
            { category: { $beginsWith: "books" } },
            { name: { $contains: "test" } }
          ]
        })
      ).toEqual({
        expression:
          "(begins_with(#Category, :Category1) OR contains(#Name, :Name2)) AND (#Type = :Type3 AND #Name IN (:Name4,:Name5))",
        values: {
          Category1: "books",
          Name2: "test",
          Type3: "Process",
          Name4: "Process1",
          Name5: "Process2"
        }
      });
    });

    it("shares the value placeholder counter between filter and key condition compilation", () => {
      expect.assertions(2);

      const builder = queryBuilderInstance();

      expect(builder.filterParams({ name: "Scale-A" })).toEqual({
        expression: "#Name = :Name1",
        values: { Name1: "Scale-A" }
      });
      expect(builder.andFilter({ pk: "Scale#123" })).toEqual({
        expression: "#PK = :PK2",
        values: { PK2: "Scale#123" }
      });
    });

    it("compiles dot-path notation for nested Map attributes", () => {
      expect.assertions(1);

      const builder = queryBuilderInstance();

      expect(builder.filterParams({ "meta.location": "warehouse" })).toEqual({
        expression: "#Meta.#location = :Metalocation1",
        values: { Metalocation1: "warehouse" }
      });
    });

    it("builds ExpressionAttributeNames entries for key conditions and filters", () => {
      expect.assertions(1);

      const builder = queryBuilderInstance();

      expect(
        builder.expressionAttributeNames(["pk"], {
          "meta.location": "warehouse",
          $or: [{ type: "Scale" }]
        })
      ).toEqual({
        "#PK": "PK",
        "#Type": "Type",
        "#Meta": "Meta",
        "#location": "location"
      });
    });

    it("allows multiple conditions on the same attribute", () => {
      expect.assertions(1);

      const builder = queryBuilderInstance();

      expect(
        builder.filterParams({
          name: { $beginsWith: "Scale" },
          $or: [{ name: "Scale-A" }]
        })
      ).toEqual({
        expression: "(#Name = :Name1) AND (begins_with(#Name, :Name2))",
        values: { Name1: "Scale-A", Name2: "Scale" }
      });
    });
  });

  describe("search capabilities", () => {
    it("compiles equality conditions joined by AND with every attribute name aliased", () => {
      expect.assertions(2);

      const builder = searchBuilderInstance();
      const filter = { category: "books", price: 10 };

      expect(builder.filterParams(filter)).toEqual({
        expression: "#Category = :Category1 AND #Price = :Price2",
        values: { Category1: "books", Price2: 10 }
      });
      expect(builder.expressionAttributeNames([], filter)).toEqual({
        "#Category": "Category",
        "#Price": "Price"
      });
    });

    it("shares the value placeholder counter and attribute tracking across compilations", () => {
      expect.assertions(2);

      const builder = searchBuilderInstance();

      expect(builder.andFilter({ pk: "Store#123" })).toEqual({
        expression: "#PK = :PK1",
        values: { PK1: "Store#123" }
      });
      expect(builder.filterParams({ category: "books" })).toEqual({
        expression: "#Category = :Category2",
        values: { Category2: "books" }
      });
    });

    it("rejects a second condition on the same attribute across compilations", () => {
      expect.assertions(2);

      const builder = searchBuilderInstance();
      builder.filterParams({ category: "books" });

      expect(() => builder.filterParams({ category: "movies" })).toThrowError(
        FilterError
      );
      expect(() => builder.filterParams({ category: "movies" })).toThrowError(
        'search filters support a single condition per attribute. Attribute "category" has more than one condition'
      );
    });

    it("rejects $or conditions", () => {
      expect.assertions(2);

      const builder = searchBuilderInstance();

      expect(() =>
        builder.filterParams({ $or: [{ category: "books" }] })
      ).toThrowError(FilterError);
      expect(() =>
        builder.filterParams({ $or: [{ category: "books" }] })
      ).toThrowError("$or conditions are not supported in search filters");
    });

    it("rejects IN conditions (array values)", () => {
      expect.assertions(2);

      const builder = searchBuilderInstance();

      expect(() =>
        builder.filterParams({ category: ["books", "movies"] })
      ).toThrowError(FilterError);
      expect(() =>
        builder.filterParams({ category: ["books", "movies"] })
      ).toThrowError(
        'IN conditions (array values) are not supported in search filters. Attribute "category" has an array value'
      );
    });

    it("rejects $beginsWith conditions", () => {
      expect.assertions(2);

      const builder = searchBuilderInstance();

      expect(() =>
        builder.filterParams({ category: { $beginsWith: "boo" } })
      ).toThrowError(FilterError);
      expect(() =>
        builder.filterParams({ category: { $beginsWith: "boo" } })
      ).toThrowError(
        '$beginsWith conditions are not supported in search filters. Attribute "category" has a $beginsWith condition'
      );
    });

    it("rejects $contains conditions", () => {
      expect.assertions(2);

      const builder = searchBuilderInstance();

      expect(() =>
        builder.filterParams({ category: { $contains: "boo" } })
      ).toThrowError(FilterError);
      expect(() =>
        builder.filterParams({ category: { $contains: "boo" } })
      ).toThrowError(
        '$contains conditions are not supported in search filters. Attribute "category" has a $contains condition'
      );
    });

    it("rejects dot-path notation", () => {
      expect.assertions(2);

      const builder = searchBuilderInstance();

      expect(() =>
        builder.filterParams({ "meta.location": "warehouse" })
      ).toThrowError(FilterError);
      expect(() =>
        builder.filterParams({ "meta.location": "warehouse" })
      ).toThrowError(
        'Nested attribute paths are not supported in search filters. Received filter key "meta.location"'
      );
    });

    it("rejects a value that does not match the attribute's zod type", () => {
      expect.assertions(2);

      const builder = searchBuilderInstance();

      expect(() => builder.filterParams({ price: "cheap" })).toThrowError(
        FilterError
      );
      expect(() => builder.filterParams({ price: "cheap" })).toThrowError(
        'Invalid filter value for attribute "price": the value does not match the attribute\'s type'
      );
    });

    it("rejects a nested operator object where a scalar is expected", () => {
      expect.assertions(2);

      const builder = searchBuilderInstance();

      expect(() => builder.filterParams({ price: { $gt: 10 } })).toThrowError(
        FilterError
      );
      expect(() => builder.filterParams({ price: { $gt: 10 } })).toThrowError(
        'Invalid filter value for attribute "price": the value does not match the attribute\'s type'
      );
    });

    it("includes the zod issues as the error cause when a value is rejected", () => {
      expect.assertions(2);

      const builder = searchBuilderInstance();

      try {
        builder.filterParams({ price: "cheap" });
      } catch (error) {
        expect(error).toBeInstanceOf(FilterError);
        expect((error as FilterError).cause).toEqual([
          expect.objectContaining({ code: "invalid_type" })
        ]);
      }
    });
  });
});
