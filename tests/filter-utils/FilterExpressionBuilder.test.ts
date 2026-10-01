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
  inStock: { alias: "InStock", type: z.boolean() },
  serial: { alias: "Serial", type: z.bigint() },
  thumbnail: { alias: "Thumbnail", type: z.instanceof(Uint8Array) },
  discount: { alias: "Discount", type: z.number().nullable() },
  meta: {
    alias: "Meta",
    type: z.object({}),
    objectSchema: {
      label: { type: "string" },
      recordedAt: { type: "date" },
      tags: { type: "array", items: { type: "string" } },
      nested: {
        type: "object",
        fields: { deepAt: { type: "date" }, count: { type: "number" } }
      },
      history: {
        type: "array",
        items: { type: "object", fields: { at: { type: "date" } } }
      }
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

/**
 * Query-shaped builder whose resolver also supplies each attribute's zod type,
 * so both halves of the operand rule are observable: validation and conversion
 */
const typedQueryBuilder = (): FilterExpressionBuilder =>
  new FilterExpressionBuilder({
    capabilities: queryFilterCapabilities,
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

  describe("comparison and range conditions", () => {
    it("compiles each comparison operator to its DynamoDB comparator", () => {
      expect.assertions(4);

      // A fresh builder per assertion so each starts the placeholder counter
      // at the same point, which is what makes the four comparable
      expect(
        queryBuilderInstance().filterParams({ price: { $gt: 10 } })
      ).toEqual({ expression: "#Price > :Price1", values: { Price1: 10 } });
      expect(
        queryBuilderInstance().filterParams({ price: { $gte: 10 } })
      ).toEqual({ expression: "#Price >= :Price1", values: { Price1: 10 } });
      expect(
        queryBuilderInstance().filterParams({ price: { $lt: 10 } })
      ).toEqual({ expression: "#Price < :Price1", values: { Price1: 10 } });
      expect(
        queryBuilderInstance().filterParams({ price: { $lte: 10 } })
      ).toEqual({ expression: "#Price <= :Price1", values: { Price1: 10 } });
    });

    it("converts a comparison operand to the stored form", () => {
      expect.assertions(1);

      // The operand is a whole value of the attribute, so it is named as the
      // entity declares it and converted the way an equality value is
      expect(
        typedQueryBuilder().filterParams({
          createdAt: { $gte: new Date("2023-01-15T12:12:18.123Z") }
        })
      ).toEqual({
        expression: "#CreatedAt >= :CreatedAt1",
        values: { CreatedAt1: "2023-01-15T12:12:18.123Z" }
      });
    });

    it("leaves a comparison operand alone on an attribute that stores what it declares", () => {
      expect.assertions(1);

      expect(typedQueryBuilder().filterParams({ price: { $lt: 10 } })).toEqual({
        expression: "#Price < :Price1",
        values: { Price1: 10 }
      });
    });

    it("converts a comparison operand on a nested date field", () => {
      expect.assertions(1);

      expect(
        queryBuilderInstance().filterParams({
          "meta.recordedAt": { $gt: new Date("2023-01-15T12:12:18.123Z") }
        })
      ).toEqual({
        expression: "#Meta.#recordedAt > :MetarecordedAt1",
        values: { MetarecordedAt1: "2023-01-15T12:12:18.123Z" }
      });
    });

    it("composes several comparisons on one attribute with AND", () => {
      expect.assertions(1);

      // A half-open range, which is what composition is for
      expect(
        typedQueryBuilder().filterParams({
          createdAt: {
            $gte: new Date("2023-01-01T00:00:00.000Z"),
            $lt: new Date("2023-02-01T00:00:00.000Z")
          }
        })
      ).toEqual({
        expression: "#CreatedAt >= :CreatedAt1 AND #CreatedAt < :CreatedAt2",
        values: {
          CreatedAt1: "2023-01-01T00:00:00.000Z",
          CreatedAt2: "2023-02-01T00:00:00.000Z"
        }
      });
    });

    it("compiles composed comparisons in operator order rather than literal order", () => {
      expect.assertions(1);

      // The same condition written with its keys the other way round compiles
      // identically, so an expression is a function of the condition and not
      // of how the caller's object literal happened to be written
      expect(
        queryBuilderInstance().filterParams({
          price: { $lte: 100, $gt: 10 }
        })
      ).toEqual({
        expression: "#Price > :Price1 AND #Price <= :Price2",
        values: { Price1: 10, Price2: 100 }
      });
    });

    it("compiles $between with both bounds converted", () => {
      expect.assertions(1);

      expect(
        typedQueryBuilder().filterParams({
          createdAt: {
            $between: [
              new Date("2023-01-01T00:00:00.000Z"),
              new Date("2023-12-31T23:59:59.999Z")
            ]
          }
        })
      ).toEqual({
        expression: "#CreatedAt BETWEEN :CreatedAt1 AND :CreatedAt2",
        values: {
          CreatedAt1: "2023-01-01T00:00:00.000Z",
          CreatedAt2: "2023-12-31T23:59:59.999Z"
        }
      });
    });

    it("parenthesizes a multi-operand condition inside an $or block", () => {
      expect.assertions(1);

      // AND binds tighter than OR in DynamoDB, so the parentheses are not
      // strictly required — they are what makes the grouping legible, and
      // pinning them here catches a change that drops them for one operator
      expect(
        queryBuilderInstance().filterParams({
          $or: [{ price: { $between: [10, 100] } }, { name: "Scale-A" }]
        })
      ).toEqual({
        expression: "(#Price BETWEEN :Price1 AND :Price2) OR #Name = :Name3",
        values: { Price1: 10, Price2: 100, Name3: "Scale-A" }
      });
    });

    it("numbers each operand from the shared counter", () => {
      expect.assertions(1);

      expect(
        queryBuilderInstance().filterParams({
          price: { $gte: 10, $lt: 100 },
          category: { $between: ["a", "m"] }
        })
      ).toEqual({
        expression:
          "#Price >= :Price1 AND #Price < :Price2 AND #Category BETWEEN :Category3 AND :Category4",
        values: { Price1: 10, Price2: 100, Category3: "a", Category4: "m" }
      });
    });

    it("rejects an inverted $between, naming the attribute", () => {
      expect.assertions(2);

      expect(() =>
        queryBuilderInstance().filterParams({ price: { $between: [100, 10] } })
      ).toThrow(FilterError);
      expect(() =>
        queryBuilderInstance().filterParams({ price: { $between: [100, 10] } })
      ).toThrow(
        new FilterError(
          'Invalid filter value for attribute "price": the $between bounds are inverted. The lower bound comes first, and DynamoDB matches nothing for an inverted range rather than reporting an error'
        )
      );
    });

    it("rejects an inverted $between compared in the stored form", () => {
      expect.assertions(1);

      // A Date has no relational order DynamoDB sees — what it compares is the
      // ISO string, which is what the check has to compare too
      expect(() =>
        typedQueryBuilder().filterParams({
          createdAt: {
            $between: [
              new Date("2023-12-31T00:00:00.000Z"),
              new Date("2023-01-01T00:00:00.000Z")
            ]
          }
        })
      ).toThrow(
        new FilterError(
          'Invalid filter value for attribute "createdAt": the $between bounds are inverted. The lower bound comes first, and DynamoDB matches nothing for an inverted range rather than reporting an error'
        )
      );
    });

    it("accepts a $between whose bounds are equal", () => {
      expect.assertions(1);

      // BETWEEN is inclusive, so an equal pair matches that one value rather
      // than nothing — it is a degenerate range, not an inverted one
      expect(
        queryBuilderInstance().filterParams({ price: { $between: [10, 10] } })
      ).toEqual({
        expression: "#Price BETWEEN :Price1 AND :Price2",
        values: { Price1: 10, Price2: 10 }
      });
    });

    it("rejects a comparison operand the attribute cannot hold", () => {
      expect.assertions(1);

      expect(() =>
        typedQueryBuilder().filterParams({ price: { $gt: "ten" } })
      ).toThrow(
        new FilterError(
          'Invalid filter value for attribute "price": the value does not match the attribute\'s type'
        )
      );
    });

    it("rejects a comparison operand that resolved to undefined", () => {
      expect.assertions(1);

      // Forwarding an optional input: the key is present with nothing under
      // it, which would otherwise emit a placeholder with no value bound
      expect(() =>
        // @ts-expect-error an operand resolving to undefined is a plain JavaScript caller
        queryBuilderInstance().filterParams({ price: { $gt: undefined } })
      ).toThrow(
        new FilterError(
          'Invalid filter value for attribute "price": $gt was given no value'
        )
      );
    });

    it("rejects a $between bound that resolved to undefined", () => {
      expect.assertions(1);

      expect(() =>
        queryBuilderInstance().filterParams({
          // @ts-expect-error a bound resolving to undefined is a plain JavaScript caller
          price: { $between: [10, undefined] }
        })
      ).toThrow(
        new FilterError(
          'Invalid filter value for attribute "price": $between was given no value'
        )
      );
    });

    it("rejects a $between that is not an ordered pair", () => {
      expect.assertions(1);

      // The type requires a pair, so this answers for a plain JavaScript caller
      expect(() =>
        queryBuilderInstance().filterParams({
          // @ts-expect-error $between takes a pair; a third bound is a plain JavaScript caller
          price: { $between: [10, 20, 30] }
        })
      ).toThrow(
        new FilterError(
          'Invalid filter value for attribute "price": $between takes an ordered pair of bounds'
        )
      );
    });

    it("rejects a condition combining operators from different families", () => {
      expect.assertions(1);

      // The branch that compiles one would silently drop the other, giving a
      // query narrower or wider than asked for with nothing to indicate it
      expect(() =>
        queryBuilderInstance().filterParams({
          price: { $gt: 10, $between: [20, 30] }
        })
      ).toThrow(
        new FilterError(
          'Invalid filter value for attribute "price": a condition combines comparison and $between, and only comparison operators compose. Split it across separate conditions'
        )
      );
    });

    it("rejects $beginsWith combined with a comparison", () => {
      expect.assertions(1);

      expect(() =>
        queryBuilderInstance().filterParams({
          name: { $beginsWith: "Scale", $gt: "Scale-A" }
        })
      ).toThrow(
        new FilterError(
          'Invalid filter value for attribute "name": a condition combines comparison and $beginsWith, and only comparison operators compose. Split it across separate conditions'
        )
      );
    });

    it("leaves $beginsWith and $contains operands in the stored form", () => {
      expect.assertions(1);

      // The contrast the operand rule draws: a comparison on createdAt takes a
      // Date, while a $beginsWith on it takes a prefix of the stored string
      expect(
        typedQueryBuilder().filterParams({ createdAt: { $beginsWith: "2023" } })
      ).toEqual({
        expression: "begins_with(#CreatedAt, :CreatedAt1)",
        values: { CreatedAt1: "2023" }
      });
    });
  });

  describe("comparison and range operand boundaries", () => {
    it("treats a falsy operand as a value rather than a missing one", () => {
      expect.assertions(3);

      // 0, "" and false are the operands a definedness check written as a
      // truthiness check would silently drop
      expect(
        queryBuilderInstance().filterParams({ price: { $gt: 0 } })
      ).toEqual({ expression: "#Price > :Price1", values: { Price1: 0 } });
      expect(
        queryBuilderInstance().filterParams({ name: { $gte: "" } })
      ).toEqual({ expression: "#Name >= :Name1", values: { Name1: "" } });
      expect(
        queryBuilderInstance().filterParams({ inStock: { $lte: false } })
      ).toEqual({
        expression: "#InStock <= :InStock1",
        values: { InStock1: false }
      });
    });

    it("compiles a $between whose bounds are both falsy", () => {
      expect.assertions(1);

      expect(
        queryBuilderInstance().filterParams({ price: { $between: [0, 0] } })
      ).toEqual({
        expression: "#Price BETWEEN :Price1 AND :Price2",
        values: { Price1: 0, Price2: 0 }
      });
    });

    it("compiles bigint operands and orders them", () => {
      expect.assertions(2);

      expect(
        queryBuilderInstance().filterParams({ serial: { $gt: 10n } })
      ).toEqual({ expression: "#Serial > :Serial1", values: { Serial1: 10n } });
      expect(() =>
        queryBuilderInstance().filterParams({
          serial: { $between: [20n, 10n] }
        })
      ).toThrow(
        new FilterError(
          'Invalid filter value for attribute "serial": the $between bounds are inverted. The lower bound comes first, and DynamoDB matches nothing for an inverted range rather than reporting an error'
        )
      );
    });

    it("rejects an inverted $between on strings", () => {
      expect.assertions(1);

      expect(() =>
        queryBuilderInstance().filterParams({ name: { $between: ["m", "a"] } })
      ).toThrow(
        new FilterError(
          'Invalid filter value for attribute "name": the $between bounds are inverted. The lower bound comes first, and DynamoDB matches nothing for an inverted range rather than reporting an error`'.replace(
            "`",
            ""
          )
        )
      );
    });

    it("leaves an unorderable pair unchecked rather than checking it wrongly", () => {
      expect.assertions(2);

      // JavaScript's > does not reproduce DynamoDB's unsigned-byte ordering of
      // binary, and a boolean has no ordering at all, so neither is rejected
      // for inversion. Compiling them is better than guessing which way round
      // they belong
      expect(
        queryBuilderInstance().filterParams({
          thumbnail: {
            $between: [new Uint8Array([9]), new Uint8Array([1])]
          }
        })
      ).toEqual({
        expression: "#Thumbnail BETWEEN :Thumbnail1 AND :Thumbnail2",
        values: {
          Thumbnail1: new Uint8Array([9]),
          Thumbnail2: new Uint8Array([1])
        }
      });
      expect(
        queryBuilderInstance().filterParams({
          inStock: { $between: [true, false] }
        })
      ).toEqual({
        expression: "#InStock BETWEEN :InStock1 AND :InStock2",
        values: { InStock1: true, InStock2: false }
      });
    });

    it("rejects null as a comparison operand", () => {
      expect.assertions(4);

      for (const operator of ["$gt", "$gte", "$lt", "$lte"]) {
        expect(() =>
          // @ts-expect-error a null operand is a plain JavaScript caller
          queryBuilderInstance().filterParams({ price: { [operator]: null } })
        ).toThrow(
          new FilterError(
            `Invalid filter value for attribute "price": ${operator} cannot compare against null. dyna-record removes a nulled attribute rather than storing NULL, so no row can satisfy an ordered comparison against it`
          )
        );
      }
    });

    it("rejects null as either $between bound", () => {
      expect.assertions(2);

      const message =
        'Invalid filter value for attribute "price": $between cannot compare against null. dyna-record removes a nulled attribute rather than storing NULL, so no row can satisfy an ordered comparison against it';

      expect(() =>
        queryBuilderInstance().filterParams({
          price: { $between: [null, 5] }
        })
      ).toThrow(new FilterError(message));
      expect(() =>
        queryBuilderInstance().filterParams({
          price: { $between: [5, null] }
        })
      ).toThrow(new FilterError(message));
    });

    it("rejects a $between that is not a pair, at every arity", () => {
      expect.assertions(3);

      const message =
        'Invalid filter value for attribute "price": $between takes an ordered pair of bounds';

      expect(() =>
        // @ts-expect-error an empty pair is a plain JavaScript caller
        queryBuilderInstance().filterParams({ price: { $between: [] } })
      ).toThrow(new FilterError(message));
      expect(() =>
        // @ts-expect-error a single bound is a plain JavaScript caller
        queryBuilderInstance().filterParams({ price: { $between: [10] } })
      ).toThrow(new FilterError(message));
      expect(() =>
        // @ts-expect-error a non-array $between is a plain JavaScript caller
        queryBuilderInstance().filterParams({ price: { $between: "10-20" } })
      ).toThrow(new FilterError(message));
    });

    it("compiles all four comparisons on one attribute", () => {
      expect.assertions(1);

      // Contradictory as a query, but the composition rule does not depend on
      // how many operators compose, and the placeholder numbering must hold
      expect(
        queryBuilderInstance().filterParams({
          price: { $gt: 1, $gte: 2, $lt: 3, $lte: 4 }
        })
      ).toEqual({
        expression:
          "#Price > :Price1 AND #Price >= :Price2 AND #Price < :Price3 AND #Price <= :Price4",
        values: { Price1: 1, Price2: 2, Price3: 3, Price4: 4 }
      });
    });

    it("compiles a comparison alongside conditions on other attributes", () => {
      expect.assertions(1);

      expect(
        queryBuilderInstance().filterParams({
          name: "Scale-A",
          price: { $gte: 10 },
          category: { $beginsWith: "books" }
        })
      ).toEqual({
        expression:
          "#Name = :Name1 AND #Price >= :Price2 AND begins_with(#Category, :Category3)",
        values: { Name1: "Scale-A", Price2: 10, Category3: "books" }
      });
    });

    it("keeps placeholder numbering continuous across $or and top level ranges", () => {
      expect.assertions(1);

      expect(
        queryBuilderInstance().filterParams({
          price: { $gte: 10, $lt: 20 },
          $or: [{ category: { $between: ["a", "m"] } }, { name: { $gt: "A" } }]
        })
      ).toEqual({
        expression:
          "((#Category BETWEEN :Category1 AND :Category2) OR #Name > :Name3) AND (#Price >= :Price4 AND #Price < :Price5)",
        values: {
          Category1: "a",
          Category2: "m",
          Name3: "A",
          Price4: 10,
          Price5: 20
        }
      });
    });
  });

  describe("comparison and range conditions on nested paths", () => {
    it("converts a comparison operand on a deeply nested date field", () => {
      expect.assertions(1);

      expect(
        queryBuilderInstance().filterParams({
          "meta.nested.deepAt": { $lte: new Date("2023-06-01T00:00:00.000Z") }
        })
      ).toEqual({
        expression: "#Meta.#nested.#deepAt <= :MetanesteddeepAt1",
        values: { MetanesteddeepAt1: "2023-06-01T00:00:00.000Z" }
      });
    });

    it("converts both $between bounds on a nested date field", () => {
      expect.assertions(1);

      expect(
        queryBuilderInstance().filterParams({
          "meta.recordedAt": {
            $between: [
              new Date("2023-01-01T00:00:00.000Z"),
              new Date("2023-12-31T00:00:00.000Z")
            ]
          }
        })
      ).toEqual({
        expression:
          "#Meta.#recordedAt BETWEEN :MetarecordedAt1 AND :MetarecordedAt2",
        values: {
          MetarecordedAt1: "2023-01-01T00:00:00.000Z",
          MetarecordedAt2: "2023-12-31T00:00:00.000Z"
        }
      });
    });

    it("validates a comparison operand against the nested field's own type", () => {
      expect.assertions(1);

      expect(() =>
        queryBuilderInstance().filterParams({
          "meta.nested.count": { $gt: "ten" }
        })
      ).toThrow(
        new FilterError(
          'Invalid filter value for attribute "meta.nested.count": the value does not match the attribute\'s type'
        )
      );
    });

    it("leaves a comparison operand in the stored form on a path through an array", () => {
      expect.assertions(1);

      // A path cannot identify which element it means, so no field definition
      // resolves and the operand is neither validated nor converted
      expect(
        queryBuilderInstance().filterParams({
          "meta.history.at": { $gte: "2023-01-01T00:00:00.000Z" }
        })
      ).toEqual({
        expression: "#Meta.#history.#at >= :MetahistoryAt1".replace(
          "At1",
          "at1"
        ),
        values: { Metahistoryat1: "2023-01-01T00:00:00.000Z" }
      });
    });

    it("leaves a comparison operand in the stored form on a path naming no field", () => {
      expect.assertions(1);

      expect(
        queryBuilderInstance().filterParams({
          "meta.unknown": { $gt: "x" }
        })
      ).toEqual({
        expression: "#Meta.#unknown > :Metaunknown1",
        values: { Metaunknown1: "x" }
      });
    });

    it("rejects a comparison on an array-typed nested field without validating it", () => {
      expect.assertions(1);

      // An array field's schema describes the list, not an element, so no
      // validation runs and the operand compiles as supplied
      expect(
        queryBuilderInstance().filterParams({ "meta.tags": { $gt: "a" } })
      ).toEqual({
        expression: "#Meta.#tags > :Metatags1",
        values: { Metatags1: "a" }
      });
    });
  });

  describe("operator object shape", () => {
    it("rejects an empty operator object", () => {
      expect.assertions(1);

      // Without this it compiles to an equality against {} — a condition
      // DynamoDB accepts, matches nothing for, and reports no error about
      expect(() =>
        // @ts-expect-error an empty operator object is no condition at all
        queryBuilderInstance().filterParams({ price: {} })
      ).toThrow(
        new FilterError(
          'Invalid filter value for attribute "price": the condition is an object naming no supported operator. The supported operators are $gt, $gte, $lt, $lte, $between, $beginsWith, $contains'
        )
      );
    });

    it("rejects an object naming an operator that does not exist", () => {
      expect.assertions(1);

      expect(() =>
        // @ts-expect-error $ne is not a supported operator
        queryBuilderInstance().filterParams({ price: { $ne: 5 } })
      ).toThrow(
        new FilterError(
          'Invalid filter value for attribute "price": the condition is an object naming no supported operator. The supported operators are $gt, $gte, $lt, $lte, $between, $beginsWith, $contains'
        )
      );
    });

    it("rejects a plain object that is not an operator object at all", () => {
      expect.assertions(1);

      expect(() =>
        // @ts-expect-error a whole-object equality is not a supported condition
        queryBuilderInstance().filterParams({ meta: { label: "x" } })
      ).toThrow(
        new FilterError(
          'Invalid filter value for attribute "meta": the condition is an object naming no supported operator. The supported operators are $gt, $gte, $lt, $lte, $between, $beginsWith, $contains'
        )
      );
    });

    it("does not mistake a Date or a Uint8Array for an operator object", () => {
      expect.assertions(2);

      // Both are objects to typeof and whole values to a filter
      expect(
        queryBuilderInstance().filterParams({
          createdAt: new Date("2023-01-15T12:12:18.123Z")
        })
      ).toEqual({
        expression: "#CreatedAt = :CreatedAt1",
        values: { CreatedAt1: "2023-01-15T12:12:18.123Z" }
      });
      expect(
        queryBuilderInstance().filterParams({
          thumbnail: new Uint8Array([1, 2])
        })
      ).toEqual({
        expression: "#Thumbnail = :Thumbnail1",
        values: { Thumbnail1: new Uint8Array([1, 2]) }
      });
    });

    it("rejects each combination of operator families", () => {
      expect.assertions(5);

      const combine =
        (condition: object): (() => unknown) =>
        () =>
          queryBuilderInstance().filterParams({
            name: condition
          } as never);

      expect(combine({ $gt: "a", $between: ["a", "b"] })).toThrow(
        "a condition combines comparison and $between"
      );
      expect(combine({ $gt: "a", $beginsWith: "a" })).toThrow(
        "a condition combines comparison and $beginsWith"
      );
      expect(combine({ $gt: "a", $contains: "a" })).toThrow(
        "a condition combines comparison and $contains"
      );
      expect(combine({ $between: ["a", "b"], $beginsWith: "a" })).toThrow(
        "a condition combines $between and $beginsWith"
      );
      expect(combine({ $beginsWith: "a", $contains: "a" })).toThrow(
        "a condition combines $beginsWith and $contains"
      );
    });

    it("names all three families when a condition combines three", () => {
      expect.assertions(1);

      expect(() =>
        queryBuilderInstance().filterParams({
          name: { $gt: "a", $between: ["a", "b"], $contains: "a" }
        } as never)
      ).toThrow(
        "a condition combines comparison and $between and $contains, and only comparison operators compose. Split it across separate conditions"
      );
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
