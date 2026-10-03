import {
  ArrayOfObjectsEntity,
  ArrayOfUnionsEntity,
  Customer,
  DeepNestedEntity,
  DiscriminatedUnionEntity,
  MyClassWithAllAttributeTypes,
  Warehouse
} from "../integration/mockModels.js";
import type { TypedFilterParams } from "../../src/operations/Query/types.js";

/**
 * The filter key set stays closed, across every entity shape that changes how
 * it is generated.
 *
 * `DotPathKeys` walks an `@ObjectAttribute` schema to build the dot-path keys a
 * filter accepts, and the shape of the schema decides what it emits. This file
 * holds one entity per shape and asks the same three questions of each: is an
 * unknown attribute refused, is an unknown path below an object attribute
 * refused, and is a wrong-typed value on a known key refused.
 *
 * ## Why a matrix, and not one representative entity
 *
 * The 3.4.0 list-index work first wrote the index key as `` `${K}[${number}]` ``,
 * a pattern template literal. A mapped type over a key union containing one
 * becomes a **pattern index signature**, and `query` infers its filter as
 * `const F extends TypedFilterParams<T>` — a constraint an index-signatured
 * record satisfies for *any* key. Every unknown-key, unknown-path and
 * wrong-type error on such an entity went quiet at once.
 *
 * Nothing failed. `tsc` reported no error, the 1700-test suite stayed green,
 * and the damage was invisible because it was scoped to entities whose schemas
 * contain an array — a shape almost none of the existing `@ts-expect-error`
 * tests happen to use. The suite was asking the right question of the wrong
 * entities.
 *
 * ## Why there is no purely structural check
 *
 * A pattern index signature leaves `keyof` looking like an ordinary union of
 * keys, and an all-optional record accepts an extra property under plain
 * assignability whatever its keys are — excess properties are only an error
 * for a *fresh* object literal. So no type-level predicate over the record
 * reveals it. The call site is the only place the property is observable,
 * which is why every assertion here is a real `query` call under a directive.
 *
 * {@link assertNotAny} covers the other way the type can collapse: a key union
 * that overruns TypeScript's instantiation budget degrades to `any`, which
 * silences the same errors by a different route.
 *
 * ## What each group answers, measured
 *
 * Reintroducing the `${number}` key makes `npm test` exit 2 with seven unused
 * directives here, and they name the damage exactly: the three array shapes,
 * across the unknown-attribute and unknown-path groups. The four shapes with no
 * array in their schema stay green, which is correct — a pattern key is only
 * generated where an array is.
 *
 * The wrong-typed-value group does **not** fire for that bug, and is not
 * redundant for it: a key matching a declared literal still has its value type
 * checked through a pattern index signature. That group answers the `any`
 * collapse instead, where every one of the three goes quiet at once.
 */

/** True only for `any`: nothing else absorbs an intersection this way. */
type IsAny<T> = 0 extends 1 & T ? true : false;

/**
 * Compiles only when `T` is `true`.
 *
 * The unused-looking parameter is what puts `T` in a value position, the same
 * shape `assertExact` uses in `types.test.ts`. Callers never pass an argument.
 */
const assertNotAny = <T extends true>(_assertion?: T): void => {};

describe("filter key closure", () => {
  it("offers a real filter type for every entity shape", () => {
    expect.assertions(1);

    // No object attribute, and a partition holding three entities
    assertNotAny<
      IsAny<TypedFilterParams<Customer>> extends false ? true : false
    >();
    // An object attribute of scalars
    assertNotAny<
      IsAny<TypedFilterParams<Warehouse>> extends false ? true : false
    >();
    // Object attributes containing arrays of scalars
    assertNotAny<
      IsAny<TypedFilterParams<MyClassWithAllAttributeTypes>> extends false
        ? true
        : false
    >();
    // An array of objects — the shape that generates indexed keys with paths
    // below them
    assertNotAny<
      IsAny<TypedFilterParams<ArrayOfObjectsEntity>> extends false
        ? true
        : false
    >();
    // Four levels of nesting, which is where the depth limit bites
    assertNotAny<
      IsAny<TypedFilterParams<DeepNestedEntity>> extends false ? true : false
    >();
    // An array whose elements are a discriminated union
    assertNotAny<
      IsAny<TypedFilterParams<ArrayOfUnionsEntity>> extends false ? true : false
    >();
    // Discriminated union fields at the top of the schema
    assertNotAny<
      IsAny<TypedFilterParams<DiscriminatedUnionEntity>> extends false
        ? true
        : false
    >();

    expect(assertNotAny).toBeDefined();
  });

  describe("an attribute no entity declares is refused", () => {
    it("on an entity with no object attribute", async () => {
      // @ts-expect-error: nope is not an attribute of this partition
      await Customer.query("123", { filter: { nope: 1 } }).catch(() => {});
    });

    it("on an object attribute of scalars", async () => {
      // @ts-expect-error: nope is not an attribute of this partition
      await Warehouse.query("123", { filter: { nope: 1 } }).catch(() => {});
    });

    it("on a schema containing an array of scalars", async () => {
      // @ts-expect-error: nope is not an attribute of this entity
      await MyClassWithAllAttributeTypes.query("123", {
        filter: { nope: 1 }
      }).catch(() => {});
    });

    it("on a schema containing an array of objects", async () => {
      // @ts-expect-error: nope is not an attribute of this entity
      await ArrayOfObjectsEntity.query("123", {
        filter: { nope: 1 }
      }).catch(() => {});
    });

    it("on a deeply nested schema", async () => {
      // @ts-expect-error: nope is not an attribute of this entity
      await DeepNestedEntity.query("123", {
        filter: { nope: 1 }
      }).catch(() => {});
    });

    it("on a schema containing an array of unions", async () => {
      // @ts-expect-error: nope is not an attribute of this entity
      await ArrayOfUnionsEntity.query("123", {
        filter: { nope: 1 }
      }).catch(() => {});
    });

    it("on a schema containing discriminated union fields", async () => {
      // @ts-expect-error: nope is not an attribute of this entity
      await DiscriminatedUnionEntity.query("123", {
        filter: { nope: 1 }
      }).catch(() => {});
    });
  });

  describe("a path naming no field below an object attribute is refused", () => {
    it("on an object attribute of scalars", async () => {
      // @ts-expect-error: location declares no such field
      await Warehouse.query("123", {
        filter: { "location.nope": 1 }
      }).catch(() => {});
    });

    it("on a schema containing an array of scalars", async () => {
      // @ts-expect-error: objectAttribute declares no such field
      await MyClassWithAllAttributeTypes.query("123", {
        filter: { "objectAttribute.nope": 1 }
      }).catch(() => {});
    });

    it("on a schema containing an array of objects", async () => {
      // @ts-expect-error: data declares no such field
      await ArrayOfObjectsEntity.query("123", {
        filter: { "data.nope": 1 }
      }).catch(() => {});
    });

    it("below an index, where the element's own fields are what resolve", async () => {
      // @ts-expect-error: an entries element declares sku and price, not this
      await ArrayOfObjectsEntity.query("123", {
        filter: { "data.entries[0].nope": 1 }
      }).catch(() => {});
    });

    it("on a deeply nested schema, at the deepest level", async () => {
      // @ts-expect-error: level3 declares flag and detail, not this
      await DeepNestedEntity.query("123", {
        filter: { "data.level1.level2.level3.nope": 1 }
      }).catch(() => {});
    });

    it("on a schema containing an array of unions", async () => {
      // @ts-expect-error: dashboard declares widgets and title, not this
      await ArrayOfUnionsEntity.query("123", {
        filter: { "dashboard.nope": 1 }
      }).catch(() => {});
    });
  });

  describe("a value the attribute cannot hold is refused", () => {
    it("on a top level attribute", async () => {
      // @ts-expect-error: name is a string
      await Customer.query("123", { filter: { name: 1 } }).catch(() => {});
    });

    it("on an object attribute of scalars", async () => {
      // @ts-expect-error: city is a string
      await Warehouse.query("123", {
        filter: { "location.city": 1 }
      }).catch(() => {});
    });

    it("on a schema containing an array of scalars", async () => {
      // @ts-expect-error: name is a string
      await MyClassWithAllAttributeTypes.query("123", {
        filter: { "objectAttribute.name": 1 }
      }).catch(() => {});
    });

    it("on a schema containing an array of objects", async () => {
      // @ts-expect-error: title is a string
      await ArrayOfObjectsEntity.query("123", {
        filter: { "data.title": 1 }
      }).catch(() => {});
    });

    it("below an index, narrowed to the element's own field", async () => {
      // @ts-expect-error: price is a number
      await ArrayOfObjectsEntity.query("123", {
        filter: { "data.entries[0].price": "10" }
      }).catch(() => {});
    });

    it("on a deeply nested schema", async () => {
      // @ts-expect-error: score is a number
      await DeepNestedEntity.query("123", {
        filter: { "data.level1.level2.score": "5" }
      }).catch(() => {});
    });

    it("on a schema containing an array of unions", async () => {
      // @ts-expect-error: title is a string
      await ArrayOfUnionsEntity.query("123", {
        filter: { "dashboard.title": 1 }
      }).catch(() => {});
    });
  });
});
