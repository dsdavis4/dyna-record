/**
 * Metadata immutability.
 *
 * `vectorIndexes()` hands consumers the library's own live metadata objects —
 * the same instances the registry holds and the search path reads. Before
 * hardening, a single assignment could repoint a live index: setting
 * `hashAlias` changed the attribute compiled into the emitted `SearchVectors`
 * condition, which is the enforced scope (tenant) boundary.
 *
 * These tests pin that the exposed surface is now immutable at runtime, not
 * merely `readonly` to TypeScript — `readonly` is erased at compile time and
 * stops a plain-JS consumer from nothing. ES modules are strict, so a write
 * to a frozen object throws a TypeError rather than failing silently.
 *
 * Every assignment below is written the way an untyped consumer would reach
 * it, so the cast is the point of the test rather than a convenience.
 */
import {
  storeSearchIndex,
  globalSearchIndex,
  SearchTable
} from "../integration/mockModels.js";
import Metadata from "../../src/metadata/index.js";

/** How an untyped (plain JS) consumer reaches these fields. */
const untyped = (value: unknown): Record<string, unknown> =>
  value as Record<string, unknown>;

describe("metadata immutability", () => {
  // Metadata initialization is lazy; every test below assumes it has run, so
  // the resolved fields are populated and the construct is frozen
  beforeAll(() => {
    SearchTable.metadata();
  });

  describe("the construct is the library's live metadata, not a copy", () => {
    it("is the same object the registry holds", () => {
      expect.assertions(1);

      // This is why immutability matters here at all: mutating the construct
      // would mutate what the search path reads
      expect(Metadata.getVectorIndexes("SearchTable")).toContain(
        storeSearchIndex
      );
    });

    it("is frozen once metadata initialization has resolved it", () => {
      expect.assertions(2);

      expect(Object.isFrozen(storeSearchIndex)).toBe(true);
      expect(Object.isFrozen(globalSearchIndex)).toBe(true);
    });
  });

  describe("declaration-time fields cannot be reassigned", () => {
    it.each([
      ["tableClassName", "Hijacked"],
      ["name", "hijacked-index"],
      ["vectorAttribute", "__dyna_vector_hijacked"],
      ["model", { name: "evil", dimensions: 1 }],
      ["provider", async (): Promise<number[]> => [0]],
      ["scopedBy", () => null],
      ["members", []]
    ])("rejects assignment to %s", (field, value) => {
      expect.assertions(2);

      const before = untyped(storeSearchIndex)[field];
      expect(() => {
        untyped(storeSearchIndex)[field] = value;
      }).toThrow(TypeError);
      expect(untyped(storeSearchIndex)[field]).toBe(before);
    });
  });

  describe("resolved search-schema fields cannot be reassigned", () => {
    // These are the fields that were plainly mutable before hardening — not
    // even `readonly` at the type level
    it.each([
      ["memberEntities", ["Hijacked"]],
      ["hashAlias", "TenantId"],
      ["inlineFilterAliases", []],
      ["fingerprint", "forged"]
    ])("rejects assignment to %s", (field, value) => {
      expect.assertions(2);

      const before = untyped(storeSearchIndex)[field];
      expect(() => {
        untyped(storeSearchIndex)[field] = value;
      }).toThrow(TypeError);
      expect(untyped(storeSearchIndex)[field]).toBe(before);
    });

    it("keeps the scope boundary intact — hashAlias still resolves the real HASH", () => {
      expect.assertions(1);

      // The specific value the isolation guarantee rests on
      expect(storeSearchIndex.hashAlias).toBe("StoreId");
    });
  });

  describe("array fields cannot be mutated in place", () => {
    // A shallow freeze would leave these writable, which is the subtle half
    // of the problem: `index.memberEntities.push(...)` needs no assignment
    it.each([["memberEntities"], ["inlineFilterAliases"], ["members"]])(
      "%s is frozen",
      field => {
        expect.assertions(2);

        const arr = untyped(storeSearchIndex)[field] as unknown[];
        expect(Object.isFrozen(arr)).toBe(true);
        expect(() => arr.push("injected")).toThrow(TypeError);
      }
    );

    it("membership is unchanged after attempted mutation", () => {
      expect.assertions(1);

      expect(storeSearchIndex.memberEntities).toEqual(["Listing", "Review"]);
    });
  });

  describe("the model descriptor is a frozen copy, not the caller's object", () => {
    it("cannot have its dimensions loosened", () => {
      expect.assertions(2);

      // `dimensions` gates vector validation on both the write and query
      // paths, so an edit here would silently widen what the index accepts
      expect(() => {
        untyped(storeSearchIndex.model).dimensions = 1;
      }).toThrow(TypeError);
      expect(storeSearchIndex.model.dimensions).toBe(1024);
    });

    it("is frozen", () => {
      expect.assertions(1);
      expect(Object.isFrozen(storeSearchIndex.model)).toBe(true);
    });
  });

  describe("serialized metadata is a fresh copy each call", () => {
    it("cannot be mutated into a later call", () => {
      expect.assertions(3);

      const first = SearchTable.metadata();
      const second = SearchTable.metadata();

      // A copy, not the live objects
      expect(first).not.toBe(second);

      untyped(first.vectorIndexes?.[0]).name = "hijacked";

      expect(SearchTable.metadata().vectorIndexes?.[0].name).toBe(
        "store-search-index"
      );
      // ...and the live construct is untouched
      expect(storeSearchIndex.name).toBe("store-search-index");
    });
  });
});
