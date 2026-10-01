import { z } from "zod";
import {
  FilterExpressionBuilder,
  queryFilterCapabilities,
  searchFilterCapabilities,
  type FilterAttributeResolver
} from "../../src/filter-utils/index.js";
import { FilterError } from "../../src/errors.js";
import { dateSerializer } from "../../src/decorators/attributes/serializers.js";
import type { Serializers } from "../../src/metadata/types.js";
import type { ObjectSchema } from "../../src/decorators/attributes/types.js";

const attributes: Record<
  string,
  {
    alias: string;
    type: z.ZodType;
    serializers?: Serializers;
    objectSchema?: ObjectSchema;
  }
> = {
  pk: { alias: "PK", type: z.string() },
  type: { alias: "Type", type: z.string() },
  name: { alias: "Name", type: z.string() },
  category: { alias: "Category", type: z.string() },
  price: { alias: "Price", type: z.number() },
  meta: {
    alias: "Meta",
    type: z.object({}),
    objectSchema: {
      label: { type: "string" },
      recordedAt: { type: "date" }
    } as const satisfies ObjectSchema
  },
  // Declared as a Date, stored as an ISO string — the pairing the whole
  // declared-form/stored-form split exists for
  createdAt: { alias: "CreatedAt", type: z.date(), serializers: dateSerializer }
};

/**
 * Stub resolver over a fixed attribute map. Query-shaped: resolves aliases
 * only, so no value validation runs
 */
const aliasResolver: FilterAttributeResolver = (attributeKey, filterKey) => {
  if (!(attributeKey in attributes)) {
    throw new FilterError(`Invalid filter key "${filterKey}"`);
  }
  const { alias, serializers, objectSchema } = attributes[attributeKey];
  return { alias, serializers, objectSchema };
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

  describe("value validation", () => {
    it("rejects a value that does not match the attribute's declared type", () => {
      expect.assertions(1);

      // The builder's own FilterParams has no per-attribute typing — that
      // lives at the query surface — so the runtime guard is what rejects this
      expect(() =>
        searchBuilderInstance().filterParams({ price: "not a number" })
      ).toThrow(
        'Invalid filter value for attribute "price": the value does not match the attribute\'s type'
      );
    });

    it("validates each element of an IN condition", () => {
      expect.assertions(1);

      // An IN condition is a set of equality candidates, so each element is a
      // value of the attribute in its own right
      const builder = new FilterExpressionBuilder({
        capabilities: queryFilterCapabilities,
        resolveAttribute: typedResolver
      });

      expect(() => builder.filterParams({ price: [1, "two"] })).toThrow(
        'Invalid filter value for attribute "price": the value does not match the attribute\'s type'
      );
    });

    it("does not validate a nested value against the enclosing attribute's type", () => {
      expect.assertions(1);

      // The resolver answers for the top level attribute; a nested field's
      // value is not a value of the object that contains it
      const builder = new FilterExpressionBuilder({
        capabilities: queryFilterCapabilities,
        resolveAttribute: typedResolver
      });

      expect(builder.filterParams({ "meta.label": "anything" })).toEqual({
        expression: "#Meta.#label = :Metalabel1",
        values: { Metalabel1: "anything" }
      });
    });
  });

  describe("declared form to stored form", () => {
    const iso = "2023-01-15T12:12:18.123Z";

    it("converts an equality value to the form the table stores", () => {
      expect.assertions(1);

      expect(
        queryBuilderInstance().filterParams({ createdAt: new Date(iso) })
      ).toEqual({
        expression: "#CreatedAt = :CreatedAt1",
        values: { CreatedAt1: iso }
      });
    });

    it("converts every element of an IN condition", () => {
      expect.assertions(1);

      const other = "2024-02-20T08:00:00.000Z";

      expect(
        queryBuilderInstance().filterParams({
          createdAt: [new Date(iso), new Date(other)]
        })
      ).toEqual({
        expression: "#CreatedAt IN (:CreatedAt1,:CreatedAt2)",
        values: { CreatedAt1: iso, CreatedAt2: other }
      });
    });

    it("leaves a $contains operand alone", () => {
      expect.assertions(1);

      expect(
        queryBuilderInstance().filterParams({
          createdAt: { $contains: "-01-" }
        })
      ).toEqual({
        expression: "contains(#CreatedAt, :CreatedAt1)",
        values: { CreatedAt1: "-01-" }
      });
    });

    it("converts a nested field as the field it names", () => {
      expect.assertions(1);

      // Resolved through the attribute's object schema to the field's own
      // definition, so a nested date takes a Date like a top level one
      expect(
        queryBuilderInstance().filterParams({
          "meta.recordedAt": new Date(iso)
        })
      ).toEqual({
        expression: "#Meta.#recordedAt = :MetarecordedAt1",
        values: { MetarecordedAt1: iso }
      });
    });

    it("leaves a nested value alone when the path cannot be resolved", () => {
      expect.assertions(1);

      // An array element has no single field definition, so the value is
      // written as stored
      expect(
        queryBuilderInstance().filterParams({ "meta.missing.deeper": iso })
      ).toEqual({
        expression: "#Meta.#missing.#deeper = :Metamissingdeeper1",
        values: { Metamissingdeeper1: iso }
      });
    });
  });

  describe("values are validated in their declared form", () => {
    const typedQueryBuilder = (): FilterExpressionBuilder =>
      new FilterExpressionBuilder({
        capabilities: queryFilterCapabilities,
        resolveAttribute: typedResolver
      });

    it("accepts a Date for an attribute declared as a Date", () => {
      expect.assertions(1);

      // The only test that runs a Date through the validator: the conversion
      // tests above use a resolver that supplies no schema, so validation is
      // skipped there
      expect(
        typedQueryBuilder().filterParams({
          createdAt: new Date("2023-01-15T12:12:18.123Z")
        })
      ).toEqual({
        expression: "#CreatedAt = :CreatedAt1",
        values: { CreatedAt1: "2023-01-15T12:12:18.123Z" }
      });
    });

    it("rejects the stored string where the declared form is a Date", () => {
      expect.assertions(1);

      // Equality names the attribute as declared; matching by stored prefix is
      // what $beginsWith is for
      expect(() =>
        typedQueryBuilder().filterParams({ createdAt: "2023" })
      ).toThrow(
        new FilterError(
          'Invalid filter value for attribute "createdAt": the value does not match the attribute\'s type. A filter names an attribute as the entity declares it, and this one is stored in a different form — pass its declared value ($beginsWith matches the stored form by prefix)'
        )
      );
    });

    it("says nothing extra for a nested field stored as declared", () => {
      expect.assertions(1);

      // The remedy points at the declared form, which is wrong advice for a
      // field that stores exactly what it declares
      expect(() =>
        typedQueryBuilder().filterParams({ "meta.label": 123 })
      ).toThrow(
        new FilterError(
          'Invalid filter value for attribute "meta.label": the value does not match the attribute\'s type'
        )
      );
    });

    it("says nothing extra for an attribute stored as declared", () => {
      expect.assertions(1);

      expect(() => typedQueryBuilder().filterParams({ price: "free" })).toThrow(
        new FilterError(
          'Invalid filter value for attribute "price": the value does not match the attribute\'s type'
        )
      );
    });

    it("still accepts a $beginsWith year on a date attribute", () => {
      expect.assertions(1);

      expect(
        typedQueryBuilder().filterParams({
          createdAt: { $beginsWith: "2023" }
        })
      ).toEqual({
        expression: "begins_with(#CreatedAt, :CreatedAt1)",
        values: { CreatedAt1: "2023" }
      });
    });
  });

  describe("conditions with no value", () => {
    it("drops a filter condition explicitly set to undefined", () => {
      expect.assertions(1);

      // Filter keys are optional, so forwarding an optional input is the
      // ordinary way to build one
      // Legal under FilterParams: filter keys are optional, so an optional
      // input that resolved to undefined type-checks
      expect(queryBuilderInstance().filterParams({ name: undefined })).toEqual({
        expression: "",
        values: {}
      });
    });

    it("keeps the remaining conditions when one is dropped", () => {
      expect.assertions(1);

      expect(
        queryBuilderInstance().filterParams({
          name: "Testing",
          price: undefined
        })
      ).toEqual({ expression: "#Name = :Name1", values: { Name1: "Testing" } });
    });

    it("drops an undefined $or rather than reading it as an attribute", () => {
      expect.assertions(1);

      expect(
        queryBuilderInstance().filterParams({ $or: undefined, name: "Testing" })
      ).toEqual({ expression: "#Name = :Name1", values: { Name1: "Testing" } });
    });

    it("names no attribute for a dropped condition", () => {
      expect.assertions(1);

      // An ExpressionAttributeNames entry with no reference in the expression
      // is rejected by DynamoDB
      expect(
        queryBuilderInstance().expressionAttributeNames([], { name: undefined })
      ).toEqual({});
    });

    it("rejects an operator given no value", () => {
      expect.assertions(1);

      expect(() =>
        queryBuilderInstance().filterParams({
          // @ts-expect-error the operator type declares a string operand, so
          // only a plain JavaScript caller or an optional input reaches this
          name: { $beginsWith: undefined }
        })
      ).toThrow(
        'Invalid filter value for attribute "name": $beginsWith was given no value'
      );
    });

    it("rejects a key condition with no value rather than dropping it", () => {
      expect.assertions(1);

      // Dropping a key condition would widen the query to the whole partition,
      // where dropping a filter only widens within it
      expect(() =>
        queryBuilderInstance().andFilter({ name: undefined })
      ).toThrow(
        'Invalid key condition for attribute "name": the condition has no value'
      );
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

    it("rejects a comparison operator, naming the context", () => {
      expect.assertions(2);

      const builder = searchBuilderInstance();

      expect(() => builder.filterParams({ price: { $gt: 10 } })).toThrowError(
        FilterError
      );
      expect(() => builder.filterParams({ price: { $gt: 10 } })).toThrowError(
        'Comparison conditions are not supported in search filters. Attribute "price" has a comparison condition'
      );
    });

    it("includes the zod issues as the error cause when a value is rejected", () => {
      expect.assertions(2);

      const builder = searchBuilderInstance();

      try {
        builder.filterParams({ price: "cheap" });
      } catch (error: any) {
        expect(error).toBeInstanceOf(FilterError);
        expect(error.cause).toEqual([
          expect.objectContaining({ code: "invalid_type" })
        ]);
      }
    });
  });
});
