import { z } from "zod";
import {
  FilterExpressionBuilder,
  keyConditionCapabilities,
  queryFilterCapabilities,
  searchFilterCapabilities,
  type FilterAttributeResolver
} from "../../src/filter-utils/index.js";
import { FilterError } from "../../src/errors.js";
import { dateSerializer } from "../../src/decorators/attributes/serializers.js";
import type { Serializers } from "../../src/metadata/types.js";
import type { ObjectSchema } from "../../src/decorators/attributes/types.js";
import type { AttributeKind } from "../../src/metadata/types.js";
import type {
  FilterCapabilities,
  FilterParams,
  FilterTypes,
  FilterValue,
  KeyConditions
} from "../../src/filter-utils/index.js";

const attributes: Record<
  string,
  {
    alias: string;
    type: z.ZodType;
    kind?: AttributeKind;
    serializers?: Serializers;
    objectSchema?: ObjectSchema;
  }
> = {
  pk: { alias: "PK", type: z.string(), kind: "string" },
  type: { alias: "Type", type: z.string(), kind: "string" },
  name: { alias: "Name", type: z.string(), kind: "string" },
  category: { alias: "Category", type: z.string(), kind: "string" },
  price: { alias: "Price", type: z.number(), kind: "number" },
  inStock: { alias: "InStock", type: z.boolean(), kind: "boolean" },
  // A bigint stores as a Number, so it takes the number kind
  serial: { alias: "Serial", type: z.bigint(), kind: "number" },
  // No kind: this library models no binary attribute kind, so a binary value
  // is reachable only where the form could not be resolved
  thumbnail: { alias: "Thumbnail", type: z.instanceof(Uint8Array) },
  discount: { alias: "Discount", type: z.number().nullable(), kind: "number" },
  meta: {
    alias: "Meta",
    type: z.object({}),
    kind: "object",
    objectSchema: {
      // An ObjectSchema key is an unrestricted string, so a field name may
      // contain characters an expression token cannot
      "odd name": { type: "string" },
      "odd-name": { type: "string" },
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
  createdAt: {
    alias: "CreatedAt",
    type: z.date(),
    kind: "date",
    serializers: dateSerializer
  }
};

/**
 * Stub resolver over a fixed attribute map. Query-shaped: resolves aliases
 * only, so no value validation runs
 */
const aliasResolver: FilterAttributeResolver = (attributeKey, filterKey) => {
  if (!(attributeKey in attributes)) {
    throw new FilterError(`Invalid filter key "${filterKey}"`);
  }
  const { alias, kind, serializers, objectSchema } = attributes[attributeKey];
  return { alias, kind, serializers, objectSchema };
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

      // A segment naming no declared field has no field definition, so the
      // value is written as stored
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

    it("rejects composed comparisons that bound an empty range", () => {
      expect.assertions(2);

      // $between already refuses the inverted spelling of the same range, and
      // the half-open form is the one the documentation presents as the way to
      // write one — so this is consistency, not a new rule
      const message =
        "the comparison bounds an empty range. Its lower bound is not below its upper bound";

      expect(() =>
        queryBuilderInstance().filterParams({ price: { $gte: 100, $lt: 1 } })
      ).toThrow(message);
      // An exclusive bound makes equal endpoints empty too
      expect(() =>
        queryBuilderInstance().filterParams({ price: { $gt: 5, $lt: 5 } })
      ).toThrow(message);
    });

    it("accepts a composed range that can match", () => {
      expect.assertions(3);

      // Two inclusive bounds on the same value match exactly that value, the
      // same degenerate-but-satisfiable case an equal $between pair is
      expect(
        queryBuilderInstance().filterParams({ price: { $gte: 5, $lte: 5 } })
      ).toEqual({
        expression: "#Price >= :Price1 AND #Price <= :Price2",
        values: { Price1: 5, Price2: 5 }
      });
      expect(
        queryBuilderInstance().filterParams({ price: { $gte: 1, $lt: 100 } })
      ).toEqual({
        expression: "#Price >= :Price1 AND #Price < :Price2",
        values: { Price1: 1, Price2: 100 }
      });
      // One-sided has no range to be empty
      expect(
        queryBuilderInstance().filterParams({ price: { $gte: 100 } })
      ).toEqual({
        expression: "#Price >= :Price1",
        values: { Price1: 100 }
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
          'Invalid filter value for attribute "price": the $between bounds are inverted. The lower bound comes first'
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
          'Invalid filter value for attribute "createdAt": the $between bounds are inverted. The lower bound comes first'
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
      expect.assertions(2);

      // 0 and "" are the operands a definedness check written as a truthiness
      // check would silently drop. `false` is not among them, because a
      // boolean has no ordering for a comparison to use in the first place
      expect(
        queryBuilderInstance().filterParams({ price: { $gt: 0 } })
      ).toEqual({ expression: "#Price > :Price1", values: { Price1: 0 } });
      expect(
        queryBuilderInstance().filterParams({ name: { $gte: "" } })
      ).toEqual({ expression: "#Name >= :Name1", values: { Name1: "" } });
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
          'Invalid filter value for attribute "serial": the $between bounds are inverted. The lower bound comes first'
        )
      );
    });

    it("rejects an inverted $between on strings", () => {
      expect.assertions(1);

      expect(() =>
        queryBuilderInstance().filterParams({ name: { $between: ["m", "a"] } })
      ).toThrow(
        new FilterError(
          'Invalid filter value for attribute "name": the $between bounds are inverted. The lower bound comes first`'.replace(
            "`",
            ""
          )
        )
      );
    });

    it("leaves an inverted binary pair unchecked rather than checking it wrongly", () => {
      expect.assertions(1);

      // DynamoDB orders Binary, so the range is representable — but
      // JavaScript's > does not reproduce its unsigned-byte ordering, so the
      // inversion check stays out of it. Compiling the pair is better than
      // guessing which way round it belongs
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
    });

    it("rejects a range on a boolean attribute", () => {
      expect.assertions(1);

      // There is no ordering between two booleans, so the condition holds for
      // no row and DynamoDB reports nothing about it
      expect(() =>
        queryBuilderInstance().filterParams({
          // @ts-expect-error a boolean range is a compile error too; this is the JavaScript backstop
          inStock: { $between: [true, false] }
        })
      ).toThrow(
        new FilterError(
          'Invalid filter value for attribute "inStock": $between does not apply to a value stored as a boolean. DynamoDB orders String, Number and Binary values; a Boolean, a Map and a List have no ordering, so the comparison can never hold'
        )
      );
    });

    it("rejects null as an operand of any whole-value condition", () => {
      expect.assertions(6);

      // No item holds NULL for an attribute, because dyna-record removes a
      // nulled one rather than storing it — so this is true of every arm, not
      // only the ordered ones, and belongs where every whole value passes
      const message =
        'Invalid filter value for attribute "price": a condition cannot compare against null. dyna-record removes a nulled attribute rather than storing NULL, so no item holds one to match';

      for (const operator of ["$gt", "$gte", "$lt", "$lte"]) {
        expect(() =>
          // @ts-expect-error a null operand is a plain JavaScript caller
          queryBuilderInstance().filterParams({ price: { [operator]: null } })
        ).toThrow(new FilterError(message));
      }

      // The two arms where it used to compile. The IN case hid best: the real
      // values still matched, so the dead branch never announced itself
      expect(() =>
        queryBuilderInstance().filterParams({ price: null })
      ).toThrow(new FilterError(message));
      expect(() =>
        queryBuilderInstance().filterParams({ price: [1, null] })
      ).toThrow(new FilterError(message));
    });

    it("rejects a non-finite number as an ordered operand", () => {
      expect.assertions(2);

      // DynamoDB has no Number for NaN or Infinity, so no row can hold one for
      // a comparison to order against. An attribute with a schema never gets
      // here (zod's number() rejects both); a path naming no field has none
      const message = "cannot order this value";

      expect(() =>
        queryBuilderInstance().filterParams({
          "meta.unknown.at": { $gt: Number.NaN }
        })
      ).toThrow(message);
      expect(() =>
        queryBuilderInstance().filterParams({
          "meta.unknown.at": { $between: [1, Number.POSITIVE_INFINITY] }
        })
      ).toThrow(message);
    });

    it("rejects null as either $between bound", () => {
      expect.assertions(2);

      const message =
        'Invalid filter value for attribute "price": a condition cannot compare against null. dyna-record removes a nulled attribute rather than storing NULL, so no item holds one to match';

      expect(() =>
        queryBuilderInstance().filterParams({
          // @ts-expect-error a null bound is a plain JavaScript caller
          price: { $between: [null, 5] }
        })
      ).toThrow(new FilterError(message));
      expect(() =>
        queryBuilderInstance().filterParams({
          // @ts-expect-error a null bound is a plain JavaScript caller
          price: { $between: [5, null] }
        })
      ).toThrow(new FilterError(message));
    });

    it("rejects an IN element that resolved to undefined", () => {
      expect.assertions(1);

      // Forwarding an optional input into a list. Without the check the
      // element still takes a placeholder and the expression references one
      // with no value bound to it, which DynamoDB answers with a
      // ValidationException naming neither the attribute nor the operator
      expect(() =>
        // @ts-expect-error an undefined element is a plain JavaScript caller
        queryBuilderInstance().filterParams({ name: ["a", undefined, "b"] })
      ).toThrow(
        new FilterError(
          'Invalid filter value for attribute "name": IN was given no value'
        )
      );
    });

    it("rejects an IN element that is an operator object", () => {
      expect.assertions(2);

      // The elements are where the condition-shape guard cannot reach: it
      // exempts arrays wholesale, because there an array IS the condition. So
      // a nested operator bound as a Map operand, which DynamoDB compares,
      // matches nothing, and reports nothing
      expect(() =>
        queryBuilderInstance().filterParams({
          "meta.tags": [{ $beginsWith: "a" }]
        })
      ).toThrow(
        'Invalid filter value for attribute "meta.tags": an IN element names $beginsWith'
      );
      expect(() =>
        queryBuilderInstance().filterParams({
          "meta.unknown.at": [{ $gt: 1 }]
        })
      ).toThrow("an IN element names comparison");
    });

    it("shapes an IN element like the attribute's own value", () => {
      expect.assertions(2);

      // IN compares the whole attribute against each element, so on a
      // List-stored field the element is a list. A scalar there asks whether
      // the list equals that scalar, which it never does
      expect(
        queryBuilderInstance().filterParams({
          // @ts-expect-error the entity-level type offers this; the builder's own FilterParams does not
          "meta.tags": [["a"], ["b"]]
        })
      ).toEqual({
        expression: "#Meta.#tags IN (:Metatags1,:Metatags2)",
        values: { Metatags1: ["a"], Metatags2: ["b"] }
      });

      expect(() =>
        queryBuilderInstance().filterParams({
          // @ts-expect-error a list is not a value a string attribute can hold
          name: [["a"]]
        })
      ).toThrow(
        'Invalid filter value for attribute "name": the operand is not a value this attribute can hold, which is stored as a string'
      );
    });

    it("rejects an equality operand the attribute cannot hold", () => {
      expect.assertions(2);

      // The equality arm was the one whole-value arm with no shape check, so
      // the mistake the IN arm reports was silent here. A List compared to a
      // String matches nothing, and DynamoDB says nothing about it
      expect(() =>
        queryBuilderInstance().filterParams({ "meta.tags": "vip" })
      ).toThrow(
        'Invalid filter value for attribute "meta.tags": the operand is not a value this attribute can hold, which is stored as a list. A comparison asks whether the whole list equals the operand, so a single value never matches — $contains is the membership test'
      );

      // A scalar attribute is unaffected
      expect(
        queryBuilderInstance().filterParams({ "meta.label": "warehouse" })
      ).toEqual({
        expression: "#Meta.#label = :Metalabel1",
        values: { Metalabel1: "warehouse" }
      });
    });

    it("takes an object $contains operand on a List of objects", () => {
      expect.assertions(2);

      // contains() compares a substring of a String but an *element* of a
      // List, and an element may be a Map — which is what a List of objects
      // holds. Requiring a scalar refused the membership test the library
      // documents for exactly that schema
      expect(
        queryBuilderInstance().filterParams({
          // @ts-expect-error ContainsFilter's operand type is a scalar; the runtime takes a List element
          "meta.history": { $contains: { at: "2023" } }
        })
      ).toEqual({
        expression: "contains(#Meta.#history, :Metahistory1)",
        values: { Metahistory1: { at: "2023" } }
      });

      // Where the form is a String, a substring is still what it compares
      expect(() =>
        queryBuilderInstance().filterParams({
          // @ts-expect-error a Map is not a substring
          "meta.label": { $contains: { a: 1 } }
        })
      ).toThrow(
        'Invalid filter value for attribute "meta.label": $contains takes a substring of the stored value, which is a string'
      );
    });

    it("points an IN of scalars on a List field at $contains", () => {
      expect.assertions(2);

      // The membership reading a caller almost certainly meant. DynamoDB
      // compares the list to each scalar, matches nothing, and reports nothing
      expect(() =>
        queryBuilderInstance().filterParams({ "meta.tags": ["a", "b"] })
      ).toThrow(
        'Invalid filter value for attribute "meta.tags": the operand is not a value this attribute can hold, which is stored as a list. A comparison asks whether the whole list equals the operand, so a single value never matches — $contains is the membership test'
      );

      expect(
        queryBuilderInstance().filterParams({ "meta.tags": { $contains: "a" } })
      ).toEqual({
        expression: "contains(#Meta.#tags, :Metatags1)",
        values: { Metatags1: "a" }
      });
    });

    it("keeps an object IN element where the attribute stores a Map", () => {
      expect.assertions(1);

      // The equality case's rule applies per element too
      expect(
        queryBuilderInstance().filterParams({
          meta: [{ label: "x" }]
        })
      ).toEqual({
        expression: "#Meta IN (:Meta1)",
        values: { Meta1: { label: "x" } }
      });
    });

    it("rejects an empty IN condition", () => {
      expect.assertions(1);

      // `#Name IN ()` is not valid DynamoDB syntax, and a membership test
      // against nothing could not match in any case
      expect(() => queryBuilderInstance().filterParams({ name: [] })).toThrow(
        new FilterError(
          'Invalid filter value for attribute "name": an IN condition has no values. DynamoDB has no syntax for an empty list, and a membership test against nothing matches nothing'
        )
      );
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

    it("resolves a comparison through an indexed path to the element's field", () => {
      expect.assertions(1);

      // The index names one element, so the field definition below the list
      // resolves and the operand is validated and converted as that field —
      // here a Date declared on the element, stored as an ISO string
      expect(
        queryBuilderInstance().filterParams({
          "meta.history[0].at": { $gte: new Date("2023-01-01T00:00:00.000Z") }
        })
      ).toEqual({
        expression: "#Meta.#history[0].#at >= :Metahistory0at1",
        values: { Metahistory0at1: "2023-01-01T00:00:00.000Z" }
      });
    });

    it("rejects an index on a field that holds no list", () => {
      expect.assertions(1);

      // An index addresses a List element. On a String there is none, and
      // DynamoDB answers the path with no rows rather than an error
      expect(() =>
        queryBuilderInstance().filterParams({
          "meta.label[0]": "a"
        })
      ).toThrow(
        'Invalid filter key "meta.label[0]": "label[0]" indexes "label", which does not hold a list'
      );
    });

    it("rejects a path that runs through a list without naming an element", () => {
      expect.assertions(1);

      // DynamoDB has no path to "every element", so such a condition compiles,
      // matches nothing and reports nothing. The remedy is an index
      expect(() =>
        queryBuilderInstance().filterParams({
          "meta.history.at": { $gte: new Date("2023-01-01T00:00:00.000Z") }
        })
      ).toThrow(
        'Invalid filter key "meta.history.at": "history" is a list, and a condition below it has to name an element — write "history[0]" for the first'
      );
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

    it("rejects a comparison on an array-typed nested field", () => {
      expect.assertions(1);

      // A List has no ordering, so there is nothing for a comparator to do
      // here. Its schema would not have validated the operand either — it
      // describes the list rather than an element — but the stored form is the
      // reason the condition cannot work at all
      expect(() =>
        queryBuilderInstance().filterParams({ "meta.tags": { $gt: "a" } })
      ).toThrow(
        new FilterError(
          'Invalid filter value for attribute "meta.tags": $gt does not apply to a value stored as a list. DynamoDB orders String, Number and Binary values; a Boolean, a Map and a List have no ordering, so the comparison can never hold'
        )
      );
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
      expect.assertions(2);

      // A `$`-prefixed key is this vocabulary's mark of an operator, so one
      // that names none is a typo. Asked independently of what the attribute
      // can hold — otherwise abstaining on an unresolved form lets it through
      // as an equality against the operator object itself
      expect(() =>
        // @ts-expect-error $ne is not a supported operator
        queryBuilderInstance().filterParams({ price: { $ne: 5 } })
      ).toThrow(
        new FilterError(
          'Invalid filter value for attribute "price": $ne is not a supported operator. The supported operators are $gt, $gte, $lt, $lte, $between, $beginsWith, $contains'
        )
      );

      // Including where the field cannot be resolved, which is where the
      // abstention would otherwise apply
      expect(() =>
        queryBuilderInstance().filterParams({
          // @ts-expect-error $ne is not a supported operator
          "meta.unknown.at": { $ne: 5 }
        })
      ).toThrow("$ne is not a supported operator");
    });

    it("takes a plain object as a whole-value equality on a Map attribute", () => {
      expect.assertions(1);

      // DynamoDB's `=` compares Maps, so on a Map-stored attribute an object
      // naming no operator is the attribute's own value rather than a mistyped
      // operator. The shape guard has to know the difference, or it rejects a
      // legitimate equality — which it did until the stored form reached it
      expect(
        queryBuilderInstance().filterParams({
          // @ts-expect-error the entity-level type offers this; the builder's own FilterParams does not
          meta: { label: "x" }
        })
      ).toEqual({
        expression: "#Meta = :Meta1",
        values: { Meta1: { label: "x" } }
      });
    });

    it("still rejects a plain object on an attribute stored as a scalar", () => {
      expect.assertions(1);

      // Where the attribute is not a Map, an object naming no operator can
      // only be a mistake
      expect(() =>
        // @ts-expect-error an object is not a value a string attribute can hold
        queryBuilderInstance().filterParams({ name: { label: "x" } })
      ).toThrow(
        new FilterError(
          'Invalid filter value for attribute "name": the condition is an object naming no supported operator. The supported operators are $gt, $gte, $lt, $lte, $between, $beginsWith, $contains'
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

  describe("fragment operand shapes", () => {
    it("rejects a $beginsWith operand that is not a string", () => {
      expect.assertions(2);

      // "Neither validated nor converted" is about the attribute's schema —
      // there is no "Date that starts with 2026". It is not a reason to skip
      // the weaker check that a prefix is a string
      const message =
        "$beginsWith takes a string prefix of the stored value, and this operand is neither";

      expect(() =>
        // @ts-expect-error a number is not a prefix
        queryBuilderInstance().filterParams({ name: { $beginsWith: 5 } })
      ).toThrow(message);
      expect(() =>
        // @ts-expect-error nor is an object
        queryBuilderInstance().filterParams({ name: { $beginsWith: { a: 1 } } })
      ).toThrow(message);
    });

    it("rejects a $contains operand that is not a substring of a String", () => {
      expect.assertions(4);

      // The operator-shaped and attribute-shaped checks each existed; nothing
      // asked the joint question — this attribute is stored as a String, so
      // must the operand be one? A number there compares a scalar against a
      // String and answers nothing
      const message =
        "$contains takes a substring of the stored value, which is a string";

      expect(() =>
        // @ts-expect-error a Map is not a substring
        queryBuilderInstance().filterParams({ name: { $contains: { a: 1 } } })
      ).toThrow(message);
      expect(() =>
        queryBuilderInstance().filterParams({ name: { $contains: null } })
      ).toThrow(message);
      expect(() =>
        queryBuilderInstance().filterParams({ name: { $contains: 2026 } })
      ).toThrow(message);
      expect(() =>
        queryBuilderInstance().filterParams({ name: { $contains: true } })
      ).toThrow(message);
    });

    it("keeps the operands those operators do take", () => {
      expect.assertions(2);

      expect(
        queryBuilderInstance().filterParams({ name: { $beginsWith: "Sc" } })
      ).toEqual({
        expression: "begins_with(#Name, :Name1)",
        values: { Name1: "Sc" }
      });
      expect(
        queryBuilderInstance().filterParams({ name: { $contains: "cal" } })
      ).toEqual({
        expression: "contains(#Name, :Name1)",
        values: { Name1: "cal" }
      });
    });
  });

  describe("expressionAttributeNames vocabulary", () => {
    it("resolves key paths under the key condition vocabulary", () => {
      expect.assertions(2);

      // The compilation threads a per-compilation capability set; this call
      // site did not, so a dotted key condition passed the nested-path gate
      // here. Only the order of the two calls in QueryBuilder.build hid it
      expect(() =>
        queryBuilderInstance().expressionAttributeNames(["meta.label"])
      ).toThrow(
        'Nested attribute paths are not supported in key conditions. Received filter key "meta.label"'
      );
      expect(queryBuilderInstance().expressionAttributeNames(["name"])).toEqual(
        { "#Name": "Name" }
      );
    });

    it("still resolves filter paths under the filter vocabulary", () => {
      expect.assertions(1);

      // A dot path is a filter's to use, so the two halves of this call cannot
      // share one set
      expect(
        queryBuilderInstance().expressionAttributeNames([], {
          "meta.label": "x"
        })
      ).toEqual({ "#Meta": "Meta", "#label": "label" });
    });
  });

  describe("fragment operators and the stored form", () => {
    it("keeps $beginsWith on an attribute stored as a string", () => {
      expect.assertions(1);

      expect(
        queryBuilderInstance().filterParams({ name: { $beginsWith: "Scale" } })
      ).toEqual({
        expression: "begins_with(#Name, :Name1)",
        values: { Name1: "Scale" }
      });
    });

    it("keeps $beginsWith on a date attribute", () => {
      expect.assertions(1);

      // The case the whole distinction exists for: declared a Date, stored an
      // ISO string, and matching by year prefix is what the operator is for.
      // A rule written against the declared type would have taken this away
      expect(
        typedQueryBuilder().filterParams({ createdAt: { $beginsWith: "2023" } })
      ).toEqual({
        expression: "begins_with(#CreatedAt, :CreatedAt1)",
        values: { CreatedAt1: "2023" }
      });
    });

    it("rejects $beginsWith on an attribute stored as a number", () => {
      expect.assertions(2);

      // The builder's own FilterParams is not typed per attribute — that lives
      // at the query surface — so the runtime gate is what rejects this here,
      // and is also what answers for an untyped caller there

      expect(() =>
        queryBuilderInstance().filterParams({ price: { $beginsWith: "1" } })
      ).toThrow(FilterError);
      expect(() =>
        queryBuilderInstance().filterParams({ price: { $beginsWith: "1" } })
      ).toThrow(
        new FilterError(
          'Invalid filter value for attribute "price": $beginsWith does not apply to a value stored as a number. begins_with tests a prefix, which DynamoDB applies to String attributes'
        )
      );
    });

    it("rejects $beginsWith on an attribute stored as a boolean", () => {
      expect.assertions(1);

      expect(() =>
        queryBuilderInstance().filterParams({ inStock: { $beginsWith: "t" } })
      ).toThrow(
        new FilterError(
          'Invalid filter value for attribute "inStock": $beginsWith does not apply to a value stored as a boolean. begins_with tests a prefix, which DynamoDB applies to String attributes'
        )
      );
    });

    it("rejects $beginsWith on an attribute stored as a map", () => {
      expect.assertions(1);

      expect(() =>
        queryBuilderInstance().filterParams({ meta: { $beginsWith: "x" } })
      ).toThrow(
        new FilterError(
          'Invalid filter value for attribute "meta": $beginsWith does not apply to a value stored as a map. begins_with tests a prefix, which DynamoDB applies to String attributes'
        )
      );
    });

    it("keeps $contains on an attribute stored as a string", () => {
      expect.assertions(1);

      expect(
        queryBuilderInstance().filterParams({ name: { $contains: "cale" } })
      ).toEqual({
        expression: "contains(#Name, :Name1)",
        values: { Name1: "cale" }
      });
    });

    it("rejects $contains on an attribute stored as a number", () => {
      expect.assertions(1);

      expect(() =>
        queryBuilderInstance().filterParams({ price: { $contains: 1 } })
      ).toThrow(
        new FilterError(
          'Invalid filter value for attribute "price": $contains does not apply to a value stored as a number. contains tests a substring of a String or membership of a List or Set'
        )
      );
    });

    it("keeps $contains on a nested array field, for List membership", () => {
      expect.assertions(1);

      // An array field resolves now, so its stored form is known to be a List
      // — which is what keeps membership available while taking the prefix
      // operator away
      expect(
        queryBuilderInstance().filterParams({
          "meta.tags": { $contains: "home" }
        })
      ).toEqual({
        expression: "contains(#Meta.#tags, :Metatags1)",
        values: { Metatags1: "home" }
      });
    });

    it("rejects $beginsWith on a nested array field", () => {
      expect.assertions(1);

      expect(() =>
        queryBuilderInstance().filterParams({
          "meta.tags": { $beginsWith: "ho" }
        })
      ).toThrow(
        new FilterError(
          'Invalid filter value for attribute "meta.tags": $beginsWith does not apply to a value stored as a list. begins_with tests a prefix, which DynamoDB applies to String attributes'
        )
      );
    });

    it("keeps $beginsWith on a nested string field", () => {
      expect.assertions(1);

      expect(
        queryBuilderInstance().filterParams({
          "meta.label": { $beginsWith: "wa" }
        })
      ).toEqual({
        expression: "begins_with(#Meta.#label, :Metalabel1)",
        values: { Metalabel1: "wa" }
      });
    });

    it("keeps $beginsWith on a nested date field", () => {
      expect.assertions(1);

      expect(
        queryBuilderInstance().filterParams({
          "meta.recordedAt": { $beginsWith: "2023" }
        })
      ).toEqual({
        expression: "begins_with(#Meta.#recordedAt, :MetarecordedAt1)",
        values: { MetarecordedAt1: "2023" }
      });
    });

    it("rejects $beginsWith on a nested number field", () => {
      expect.assertions(1);

      expect(() =>
        queryBuilderInstance().filterParams({
          "meta.nested.count": { $beginsWith: "1" }
        })
      ).toThrow(
        new FilterError(
          'Invalid filter value for attribute "meta.nested.count": $beginsWith does not apply to a value stored as a number. begins_with tests a prefix, which DynamoDB applies to String attributes'
        )
      );
    });

    it("rejects $beginsWith on a nested object field", () => {
      expect.assertions(1);

      expect(() =>
        queryBuilderInstance().filterParams({
          "meta.nested": { $beginsWith: "x" }
        })
      ).toThrow(
        new FilterError(
          'Invalid filter value for attribute "meta.nested": $beginsWith does not apply to a value stored as a map. begins_with tests a prefix, which DynamoDB applies to String attributes'
        )
      );
    });

    it("still rejects an unorderable operand where the field cannot be resolved", () => {
      expect.assertions(3);

      // The attribute-side gate abstains here on purpose: a path naming no
      // declared field has no field definition, so dyna-record cannot know the
      // stored form. The value is then all there is to go on, and it is enough —
      // without this the condition compiles and can never match
      const message =
        "cannot order this value. An ordered comparison takes a String, a Number or Binary value";

      expect(() =>
        queryBuilderInstance().filterParams({
          // @ts-expect-error a boolean operand is a plain JavaScript caller
          "meta.unknown.at": { $gt: true }
        })
      ).toThrow(message);
      expect(() =>
        queryBuilderInstance().filterParams({
          // @ts-expect-error a boolean pair is a plain JavaScript caller
          "meta.unknown.at": { $between: [true, false] }
        })
      ).toThrow(message);
      expect(() =>
        queryBuilderInstance().filterParams({
          // @ts-expect-error a Map operand is a plain JavaScript caller
          "meta.unknown.at": { $gt: { a: 1 } }
        })
      ).toThrow(message);
    });

    it("accepts an orderable operand where the field cannot be resolved", () => {
      expect.assertions(1);

      // The value-side check must not narrow what an unresolved path accepts
      // beyond what DynamoDB can order
      expect(
        queryBuilderInstance().filterParams({
          "meta.unknown.at": { $gte: "2023-01-01T00:00:00.000Z" }
        })
      ).toEqual({
        expression: "#Meta.#unknown.#at >= :Metaunknownat1",
        values: { Metaunknownat1: "2023-01-01T00:00:00.000Z" }
      });
    });

    it("leaves a path naming no field unconstrained", () => {
      expect.assertions(2);

      // dyna-record cannot resolve the field, so it cannot judge the operator
      // — the same reason such a value is left unvalidated
      expect(
        queryBuilderInstance().filterParams({
          "meta.unknown": { $beginsWith: "x" }
        })
      ).toEqual({
        expression: "begins_with(#Meta.#unknown, :Metaunknown1)",
        values: { Metaunknown1: "x" }
      });
      expect(
        queryBuilderInstance().filterParams({
          "meta.unknown.at": { $beginsWith: "2023" }
        })
      ).toEqual({
        expression: "begins_with(#Meta.#unknown.#at, :Metaunknownat1)",
        values: { Metaunknownat1: "2023" }
      });
    });

    it("leaves an attribute whose kind the resolver omits unconstrained", () => {
      expect.assertions(1);

      // A context that supplies no kind gets today's behavior, so adding the
      // gate cannot break a resolver that does not know about it
      expect(
        queryBuilderInstance().filterParams({
          thumbnail: { $beginsWith: "x" }
        })
      ).toEqual({
        expression: "begins_with(#Thumbnail, :Thumbnail1)",
        values: { Thumbnail1: "x" }
      });
    });
  });

  describe("key conditions", () => {
    it("accepts an equality and a $beginsWith", () => {
      expect.assertions(1);

      expect(
        queryBuilderInstance().keyConditions({
          pk: "Customer#123",
          type: { $beginsWith: "Order" }
        })
      ).toEqual({
        expression: "#PK = :PK1 AND begins_with(#Type, :Type2)",
        values: { PK1: "Customer#123", Type2: "Order" }
      });
    });

    it("accepts each comparison operator on a sort key", () => {
      expect.assertions(4);

      // A range here narrows what DynamoDB reads, where a range in a filter
      // discards rows after reading them — which is the point of supporting it
      expect(
        queryBuilderInstance().keyConditions({ type: { $gt: "Order" } })
      ).toEqual({ expression: "#Type > :Type1", values: { Type1: "Order" } });
      expect(
        queryBuilderInstance().keyConditions({ type: { $gte: "Order" } })
      ).toEqual({ expression: "#Type >= :Type1", values: { Type1: "Order" } });
      expect(
        queryBuilderInstance().keyConditions({ type: { $lt: "Order" } })
      ).toEqual({ expression: "#Type < :Type1", values: { Type1: "Order" } });
      expect(
        queryBuilderInstance().keyConditions({ type: { $lte: "Order" } })
      ).toEqual({ expression: "#Type <= :Type1", values: { Type1: "Order" } });
    });

    it("accepts a $between on a sort key", () => {
      expect.assertions(1);

      expect(
        queryBuilderInstance().keyConditions({
          pk: "Customer#123",
          type: { $between: ["Order#1", "Order#9"] }
        })
      ).toEqual({
        expression: "#PK = :PK1 AND #Type BETWEEN :Type2 AND :Type3",
        values: { PK1: "Customer#123", Type2: "Order#1", Type3: "Order#9" }
      });
    });

    it("rejects composed comparisons, naming the remedy", () => {
      expect.assertions(1);

      // DynamoDB has room for one condition on the sort key, so the operators
      // that compose into a range in a filter cannot compose here
      expect(() =>
        queryBuilderInstance().keyConditions({
          // @ts-expect-error composed comparisons are a compile error here too; this is the JavaScript backstop
          type: { $gte: "Order", $lt: "P" }
        })
      ).toThrow(
        new FilterError(
          'Composed comparisons are not supported in key conditions. Attribute "type" has 2 comparison operands, and DynamoDB allows one condition on the sort key — use $between for a two-sided range'
        )
      );
    });

    it("rejects an IN condition", () => {
      expect.assertions(1);

      expect(() =>
        // @ts-expect-error a key condition takes no IN array
        queryBuilderInstance().keyConditions({ type: ["Order", "Invoice"] })
      ).toThrow(
        new FilterError(
          'IN conditions (array values) are not supported in key conditions. Attribute "type" has an array value'
        )
      );
    });

    it("rejects a $contains condition", () => {
      expect.assertions(1);

      expect(() =>
        // @ts-expect-error a key condition takes no $contains
        queryBuilderInstance().keyConditions({ type: { $contains: "Order" } })
      ).toThrow(
        new FilterError(
          '$contains conditions are not supported in key conditions. Attribute "type" has a $contains condition'
        )
      );
    });

    it("rejects a nested attribute path", () => {
      expect.assertions(1);

      expect(() =>
        queryBuilderInstance().keyConditions({ "meta.label": "x" })
      ).toThrow(
        new FilterError(
          'Nested attribute paths are not supported in key conditions. Received filter key "meta.label"'
        )
      );
    });

    it("compiles key conditions under the key vocabulary while filters keep their own", () => {
      expect.assertions(3);

      // One builder, two vocabularies, one counter. The capability set is a
      // property of the compilation rather than of the builder, because the
      // placeholder numbering has to stay continuous across both
      const builder = queryBuilderInstance();

      expect(builder.keyConditions({ pk: "Customer#123" })).toEqual({
        expression: "#PK = :PK1",
        values: { PK1: "Customer#123" }
      });
      expect(builder.filterParams({ price: { $gte: 10, $lt: 100 } })).toEqual({
        expression: "#Price >= :Price2 AND #Price < :Price3",
        values: { Price2: 10, Price3: 100 }
      });
      // The same composed range the key condition refused is a filter's whole
      // purpose, and the counter carried through both
      expect(() =>
        // @ts-expect-error composed comparisons are a compile error here too
        builder.keyConditions({ type: { $gte: "a", $lt: "z" } })
      ).toThrow(FilterError);
    });

    it("rejects an operator the key vocabulary has but the builder's own set does not", () => {
      expect.assertions(1);

      // A search-configured builder compiling key conditions still gets the
      // key vocabulary, since the set travels with the call
      const builder = new FilterExpressionBuilder({
        capabilities: searchFilterCapabilities,
        resolveAttribute: typedResolver
      });

      expect(builder.keyConditions({ name: { $beginsWith: "Scale" } })).toEqual(
        {
          expression: "begins_with(#Name, :Name1)",
          values: { Name1: "Scale" }
        }
      );
    });

    it("declares a vocabulary narrower than a filter in every direction but the comparators", () => {
      expect.assertions(1);

      expect(keyConditionCapabilities).toEqual({
        context: "key conditions",
        or: false,
        in: false,
        beginsWith: true,
        contains: false,
        comparison: true,
        composedComparisons: false,
        between: true,
        nestedPaths: false,
        singleConditionPerAttribute: false
      });
    });
  });

  describe("surface matrix: context by operand kind", () => {
    /**
     * What DynamoDB allows each operand kind in each context, stated from the
     * service's rules rather than read back from the capability sets — so this
     * table can disagree with them, which is the whole point of it.
     *
     * Each cell is either "compiles" or the fragment of the rejection that
     * names the reason. A cell is a claim about DynamoDB, and the two
     * assertions below check that the capability declaration and the compiled
     * behavior both match that claim.
     */
    const matrix: Array<{
      operand: string;
      condition: FilterParams;
      /** The capability each context consults, or null when none gates it */
      capability: keyof FilterCapabilities | null;
      "query filters": string;
      "key conditions": string;
      "search filters": string;
    }> = [
      {
        operand: "equality",
        condition: { name: "Scale-A" },
        capability: null,
        "query filters": "compiles",
        "key conditions": "compiles",
        "search filters": "compiles"
      },
      {
        operand: "IN array",
        condition: { name: ["Scale-A", "Scale-B"] },
        capability: "in",
        "query filters": "compiles",
        // A key condition compares one value per key; a filter is applied after
        // the read, where a set membership test is fine
        "key conditions": "IN conditions (array values) are not supported",
        "search filters": "IN conditions (array values) are not supported"
      },
      {
        operand: "single comparison",
        condition: { name: { $gt: "Scale-A" } },
        capability: "comparison",
        "query filters": "compiles",
        // The sort key takes a comparator, which is what makes a key range
        // narrow the read rather than discard rows after it
        "key conditions": "compiles",
        "search filters": "Comparison conditions are not supported"
      },
      {
        operand: "composed comparisons",
        condition: { name: { $gt: "A", $lt: "Z" } },
        capability: "composedComparisons",
        "query filters": "compiles",
        // One condition fits on the sort key, so a two-sided key range is
        // $between
        "key conditions": "Composed comparisons are not supported",
        // Rejected one step earlier, by the comparison capability
        "search filters": "Comparison conditions are not supported"
      },
      {
        operand: "$between",
        condition: { name: { $between: ["A", "Z"] } },
        capability: "between",
        "query filters": "compiles",
        "key conditions": "compiles",
        "search filters": "$between conditions are not supported"
      },
      {
        operand: "$beginsWith",
        condition: { name: { $beginsWith: "Scale" } },
        capability: "beginsWith",
        "query filters": "compiles",
        "key conditions": "compiles",
        "search filters": "$beginsWith conditions are not supported"
      },
      {
        operand: "$contains",
        condition: { name: { $contains: "cal" } },
        capability: "contains",
        "query filters": "compiles",
        // contains is not among the key condition functions
        "key conditions": "$contains conditions are not supported",
        "search filters": "$contains conditions are not supported"
      },
      {
        operand: "$or block",
        condition: { $or: [{ name: "Scale-A" }] },
        capability: "or",
        "query filters": "compiles",
        // A key condition is a single conjunction selecting what to read
        "key conditions": "$or conditions are not supported",
        "search filters": "$or conditions are not supported"
      },
      {
        operand: "nested path",
        condition: { "meta.label": "warehouse" },
        capability: "nestedPaths",
        "query filters": "compiles",
        // A document path is not a key, and not a search schema attribute
        "key conditions": "Nested attribute paths are not supported",
        "search filters": "Nested attribute paths are not supported"
      }
    ];

    const contexts = {
      "query filters": {
        capabilities: queryFilterCapabilities,
        compile: (condition: FilterParams) =>
          typedQueryBuilder().filterParams(condition)
      },
      "key conditions": {
        capabilities: keyConditionCapabilities,
        // The one assertion in the matrix. Every row is fed to all three
        // contexts, including the contexts that must reject it, so a row's
        // type has to be the loosest of the three — and KeyConditions is the
        // narrowest, by design. Asserting here keeps the rows honest about
        // what they are rather than widening keyConditions' parameter and
        // giving up the type gate U5 added
        compile: (condition: FilterParams) =>
          typedQueryBuilder().keyConditions(condition as KeyConditions)
      },
      "search filters": {
        capabilities: searchFilterCapabilities,
        compile: (condition: FilterParams) =>
          searchBuilderInstance().filterParams(condition)
      }
    } as const;

    const contextNames = Object.keys(contexts) as Array<keyof typeof contexts>;

    it.each(
      matrix.flatMap(row =>
        contextNames.map(context => ({
          label: `${row.operand} in ${context}`,
          row,
          context
        }))
      )
    )(
      "the compiled behavior matches the matrix: $label",
      ({ row, context }) => {
        expect.assertions(1);

        const expected = row[context];
        const compile = (): unknown => contexts[context].compile(row.condition);

        if (expected === "compiles") {
          expect(compile).not.toThrow();
        } else {
          expect(compile).toThrow(expected);
        }
      }
    );

    it.each(
      matrix
        .filter(row => row.capability !== null)
        .flatMap(row =>
          contextNames.map(context => ({
            label: `${row.operand} in ${context}`,
            row,
            context
          }))
        )
    )(
      "the capability declaration matches the matrix: $label",
      ({ row, context }) => {
        expect.assertions(1);

        // The capability the context declares has to agree with what the
        // matrix says DynamoDB allows. A declaration nothing enforces, or an
        // enforcement no declaration describes, shows up as a disagreement
        // between this assertion and the one above
        const capability = row.capability as keyof FilterCapabilities;
        const declared = contexts[context].capabilities[capability];

        // Composed comparisons are gated twice in a context that has no
        // comparisons at all, and the earlier gate is the one that fires
        const gatedEarlier =
          capability === "composedComparisons" &&
          !contexts[context].capabilities.comparison;

        expect(declared).toBe(
          gatedEarlier ? false : row[context] === "compiles"
        );
      }
    );

    it("covers every operand kind the condition types offer", () => {
      expect.assertions(1);

      // A new operator added to the vocabulary has to be given a row here, or
      // the matrix stops being a matrix
      expect(matrix.map(row => row.operand).sort()).toEqual(
        [
          "$beginsWith",
          "$between",
          "$contains",
          "$or block",
          "IN array",
          "composed comparisons",
          "equality",
          "nested path",
          "single comparison"
        ].sort()
      );
    });
  });

  describe("surface matrix: attribute kind by operand kind", () => {
    /**
     * Which operands apply to each attribute, by the form the table stores it
     * in. Stated from DynamoDB's rules, so the stored-form maps and the gates
     * can disagree with this table — which is what it is for.
     *
     * - `begins_with` applies to a String or a Binary attribute.
     * - `contains` applies to a String (substring) or a List or Set
     *   (membership).
     * - The comparators and `BETWEEN` require *comparable* operands, which
     *   DynamoDB defines as String, Number and Binary. A Boolean, a Map and a
     *   List are not comparable.
     *
     * `ordered: "gap"` marks a cell where dyna-record currently compiles a
     * condition DynamoDB cannot satisfy. Recorded rather than asserted as
     * correct, so the gap is visible and an absent test is a decision.
     */
    const matrix: Array<{
      attribute: string;
      /** The stored form, as the attribute's kind or field type implies */
      storedForm: string;
      /** A whole value of the attribute, for the ordered operators */
      sample: FilterValue;
      $beginsWith: "compiles" | "rejected";
      $contains: "compiles" | "rejected";
      /**
       * Whether an ordered comparison applies to the attribute's stored form.
       * Gated for the same reason the fragment operators are, and checked
       * before the operand is validated — "a comparison does not apply to a
       * Map" says more than "the value does not match the type".
       */
      ordered: "compiles" | "rejected";
    }> = [
      // Stored as Strings: comparable, with both a prefix and a substring
      {
        attribute: "name",
        storedForm: "string",
        sample: "a",
        $beginsWith: "compiles",
        $contains: "compiles",
        ordered: "compiles"
      },
      // A date is declared a Date and stored an ISO string, which is why the
      // fragment gate reads the stored form. The year-prefix query lives here
      {
        attribute: "createdAt",
        storedForm: "string",
        sample: new Date("2023-01-15T12:12:18.123Z"),
        $beginsWith: "compiles",
        $contains: "compiles",
        ordered: "compiles"
      },
      // Stored as Numbers: comparable, but with no prefix and no substring
      {
        attribute: "price",
        storedForm: "number",
        sample: 1,
        $beginsWith: "rejected",
        $contains: "rejected",
        ordered: "compiles"
      },
      {
        attribute: "serial",
        storedForm: "number",
        sample: 1n,
        $beginsWith: "rejected",
        $contains: "rejected",
        ordered: "compiles"
      },
      // A Boolean is not comparable in DynamoDB, and has no prefix either
      {
        attribute: "inStock",
        storedForm: "boolean",
        sample: true,
        $beginsWith: "rejected",
        $contains: "rejected",
        ordered: "rejected"
      },
      // A Map is not comparable, is not a string, and is not a collection
      // contains() tests
      {
        attribute: "meta",
        storedForm: "map",
        sample: "x",
        $beginsWith: "rejected",
        $contains: "rejected",
        ordered: "rejected"
      },
      // The same stored form reached by a dot path, where the field resolves
      // through its own definition
      {
        attribute: "meta.nested",
        storedForm: "map",
        sample: "x",
        $beginsWith: "rejected",
        $contains: "rejected",
        ordered: "rejected"
      },
      // Nested fields resolve to their own definition
      {
        attribute: "meta.label",
        storedForm: "string",
        sample: "a",
        $beginsWith: "compiles",
        $contains: "compiles",
        ordered: "compiles"
      },
      {
        attribute: "meta.recordedAt",
        storedForm: "string",
        sample: new Date("2023-01-15T12:12:18.123Z"),
        $beginsWith: "compiles",
        $contains: "compiles",
        ordered: "compiles"
      },
      {
        attribute: "meta.nested.count",
        storedForm: "number",
        sample: 1,
        $beginsWith: "rejected",
        $contains: "rejected",
        ordered: "compiles"
      },
      // A List has no prefix and is not comparable; contains() is how its
      // membership is tested
      {
        attribute: "meta.tags",
        storedForm: "list",
        sample: "a",
        $beginsWith: "rejected",
        $contains: "compiles",
        ordered: "rejected"
      },
      // Not a judgement dyna-record can make: it cannot resolve the field, so
      // it constrains nothing — the behavior such a path has always had
      {
        attribute: "meta.unknown",
        storedForm: "unresolved",
        sample: "x",
        $beginsWith: "compiles",
        $contains: "compiles",
        ordered: "compiles"
      },
      // An indexed path resolves to the *element's* field, so it carries that
      // field's stored form rather than the list's
      {
        attribute: "meta.history[0].at",
        storedForm: "string",
        sample: new Date("2023-01-15T12:12:18.123Z"),
        $beginsWith: "compiles",
        $contains: "compiles",
        ordered: "compiles"
      },
      // No binary attribute kind exists, so a binary value is reachable only
      // where the kind was not supplied — also unresolved
      {
        attribute: "thumbnail",
        storedForm: "unresolved",
        sample: "x",
        $beginsWith: "compiles",
        $contains: "compiles",
        ordered: "compiles"
      }
    ];

    /**
     * Compiles one condition on one attribute, under the query vocabulary.
     *
     * The second assertion in the matrix, and the same reason as the first:
     * every row is fed every operand, including the operands its attribute's
     * type refuses, so a row's condition type has to be looser than any one
     * cell's. Asserting here keeps the rows honest about what they carry
     * instead of weakening FilterTypes to accommodate the test
     */
    const compileOn =
      (attribute: string, condition: unknown): (() => unknown) =>
      () =>
        queryBuilderInstance().filterParams({
          [attribute]: condition as FilterTypes
        });

    it.each(
      matrix.flatMap(row =>
        (["$beginsWith", "$contains"] as const).map(operator => ({
          label: `${operator} on ${row.attribute} (${row.storedForm})`,
          row,
          operator
        }))
      )
    )("matches the matrix: $label", ({ row, operator }) => {
      expect.assertions(1);

      // Built explicitly rather than with a computed key, which would widen
      // to an index signature and stop being a condition type
      const compile = compileOn(
        row.attribute,
        operator === "$beginsWith" ? { $beginsWith: "x" } : { $contains: "x" }
      );

      if (row[operator] === "compiles") {
        expect(compile).not.toThrow();
      } else {
        expect(compile).toThrow(
          `${operator} does not apply to a value stored as a ${row.storedForm}`
        );
      }
    });

    it.each(matrix)(
      "the ordered operators on $attribute ($storedForm) match the matrix",
      row => {
        expect.assertions(2);

        const comparison = compileOn(row.attribute, { $gt: row.sample });
        const between = compileOn(row.attribute, {
          $between: [row.sample, row.sample]
        });

        if (row.ordered === "compiles") {
          expect(comparison).not.toThrow();
          expect(between).not.toThrow();
        } else {
          const domain = `does not apply to a value stored as a ${row.storedForm}`;
          expect(comparison).toThrow(domain);
          expect(between).toThrow(domain);
        }
      }
    );

    it("names the stored forms DynamoDB cannot order", () => {
      expect.assertions(1);

      // The set the comparators and BETWEEN are gated against. A form added to
      // ORDERED_FORMS without a reason shows up as a disagreement here
      expect([
        ...new Set(
          matrix
            .filter(row => row.ordered === "rejected")
            .map(r => r.storedForm)
        )
      ]).toEqual(["boolean", "map", "list"]);
    });

    it("covers every stored form the maps can produce", () => {
      expect.assertions(1);

      // A new stored form has to appear here, or the matrix stops covering the
      // space the maps describe
      expect([...new Set(matrix.map(row => row.storedForm))].sort()).toEqual([
        "boolean",
        "list",
        "map",
        "number",
        "string",
        "unresolved"
      ]);
    });
  });

  describe("operand and key shapes that fail loudly rather than quietly", () => {
    it("rejects an empty path segment", () => {
      expect.assertions(2);

      // What `{ [`${prefix}.${field}`]: value }` produces when either half is
      // empty. No attribute is named, and there is nothing for a token to map
      // to — the builder was emitting a name DynamoDB has no form for
      expect(() =>
        queryBuilderInstance().filterParams({ "meta.": "x" })
      ).toThrow(
        'Invalid filter key "meta.": it has an empty path segment, so one of its parts names no attribute'
      );
      expect(() =>
        queryBuilderInstance().filterParams({ "meta..label": "x" })
      ).toThrow("it has an empty path segment");
    });

    it("rejects an empty prefix or substring, which match everything", () => {
      expect.assertions(3);

      // The one case that fails by matching *everything*. `?? ""` on an
      // optional input reaches it, and in a key condition it reads the whole
      // partition while looking like a narrow
      expect(() =>
        queryBuilderInstance().filterParams({ name: { $beginsWith: "" } })
      ).toThrow(
        'Invalid filter value for attribute "name": $beginsWith was given an empty string, which every value matches. Drop the condition rather than passing an empty operand'
      );
      expect(() =>
        queryBuilderInstance().filterParams({ name: { $contains: "" } })
      ).toThrow("which every value matches");
      expect(() =>
        queryBuilderInstance().keyConditions({ name: { $beginsWith: "" } })
      ).toThrow("which every value matches");
    });

    it("names the missing operand rather than counting operands that are absent", () => {
      expect.assertions(1);

      // The composed-comparison count reads the operator keys, so a condition
      // whose operands all resolved to undefined was told it "has 2 comparison
      // operands" — a mistake the caller did not make. Definedness is a
      // precondition of every guard that reads or counts an operand
      expect(() =>
        queryBuilderInstance().keyConditions({
          // @ts-expect-error operands resolving to undefined are a plain JavaScript caller
          type: { $gt: undefined, $lt: undefined }
        })
      ).toThrow(
        'Invalid filter value for attribute "type": $gt was given no value'
      );
    });

    it("gives the attribute-side reason regardless of the operand's type", () => {
      expect.assertions(2);

      // The operand-shape check ran before the applicability check, so the
      // message depended on whether the operand happened to be a string: the
      // same attribute-level mistake told two different stories
      const reason = "does not apply to a value stored as a number";

      expect(() =>
        queryBuilderInstance().filterParams({ price: { $contains: 5 } })
      ).toThrow(reason);
      expect(() =>
        queryBuilderInstance().filterParams({ price: { $beginsWith: "5" } })
      ).toThrow(reason);
    });

    it("abstains from judging an object where the stored form is unknown", () => {
      expect.assertions(2);

      // This was the only guard that judged what it could not see. A path
      // naming no field resolves to no definition, and the field it names may
      // well be a Map — on which a whole-object equality is legitimate, as the
      // resolved case already allows
      expect(
        queryBuilderInstance().filterParams({
          // @ts-expect-error the entity-level type offers this; the builder's own FilterParams does not
          "meta.unknown.nested": { a: 1 }
        })
      ).toEqual({
        expression: "#Meta.#unknown.#nested = :Metaunknownnested1",
        values: { Metaunknownnested1: { a: 1 } }
      });

      // Where the form IS resolved and cannot hold an object, it still judges
      expect(() =>
        // @ts-expect-error a string attribute holds no object
        queryBuilderInstance().filterParams({ name: { label: "x" } })
      ).toThrow("the condition is an object naming no supported operator");
    });

    it("rejects a value its serializer cannot convert", () => {
      expect.assertions(1);

      // A serializer answers undefined for a value it cannot convert, and
      // binding that left the expression referencing a placeholder with
      // nothing bound to it
      expect(() =>
        queryBuilderInstance().filterParams({ createdAt: "2026" })
      ).toThrow(
        'Invalid filter value for attribute "createdAt": the value could not be converted to the form the table stores'
      );
    });
  });

  describe("expression attribute name tokens", () => {
    it("sanitizes a segment that cannot be a token, keeping the real name", () => {
      expect.assertions(2);

      // An attribute name can be almost anything — that is why expression
      // attribute names exist — but the `#` token standing in for it cannot.
      // Verified against DynamoDB: `#a_b` is accepted and `#a b` is rejected
      // with a ValidationException, so using the segment verbatim made a field
      // named "odd name" impossible to filter on
      // The digest itself is an implementation detail; what has to hold is that
      // the token is one DynamoDB accepts and that it round-trips to the real
      // name, so the assertions are on those rather than on the hash
      const { expression } = queryBuilderInstance().filterParams({
        "meta.odd name": "x"
      });
      const names = queryBuilderInstance().expressionAttributeNames([], {
        "meta.odd name": "x"
      });

      const [, token] = /#Meta\.#([^ ]+) =/.exec(expression) ?? [];

      expect(token).toMatch(/^[A-Za-z0-9_]+$/);
      expect(names[`#${String(token)}`]).toBe("odd name");
    });

    it("gives two names that sanitize alike distinct tokens", () => {
      expect.assertions(1);

      // "odd name" and "odd-name" both reduce to odd_name; the digest is what
      // keeps them from colliding on one token and one value placeholder
      const spaced = queryBuilderInstance().filterParams({
        "meta.odd name": "x"
      });
      const hyphen = queryBuilderInstance().filterParams({
        "meta.odd-name": "x"
      });

      expect(spaced.expression).not.toEqual(hyphen.expression);
    });

    it("leaves an ordinary segment untouched", () => {
      expect.assertions(1);

      // The condition pass and the attribute-name pass derive the token
      // independently, so it has to be a pure function of the segment — and
      // an ordinary name has to come out byte-for-byte unchanged
      expect(
        queryBuilderInstance().filterParams({ "meta.label": "warehouse" })
      ).toEqual({
        expression: "#Meta.#label = :Metalabel1",
        values: { Metalabel1: "warehouse" }
      });
    });
  });

  describe("$or combined with sibling conditions", () => {
    it("drops an $or that compiled to nothing rather than grouping it", () => {
      expect.assertions(3);

      // andOrFilter wrapped both halves in parentheses unconditionally, so an
      // emptied $or produced `() AND (#Name = :Name1)` — which DynamoDB
      // rejects, and which the empty-expression check at assembly cannot catch
      // because the string is not empty
      expect(
        queryBuilderInstance().filterParams({ $or: [], name: "Scale-A" })
      ).toEqual({
        expression: "#Name = :Name1",
        values: { Name1: "Scale-A" }
      });
      expect(
        queryBuilderInstance().filterParams({
          $or: [{ name: undefined }],
          name: "Scale-A"
        })
      ).toEqual({
        expression: "#Name = :Name1",
        values: { Name1: "Scale-A" }
      });
      // Both halves empty leaves nothing, which assembly drops
      expect(
        queryBuilderInstance().filterParams({ $or: [], name: undefined })
      ).toEqual({ expression: "", values: {} });
    });

    it("groups both halves when both carry conditions", () => {
      expect.assertions(1);

      expect(
        queryBuilderInstance().filterParams({
          $or: [{ category: "books" }],
          name: "Scale-A"
        })
      ).toEqual({
        expression: "(#Category = :Category1) AND (#Name = :Name2)",
        values: { Category1: "books", Name2: "Scale-A" }
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
