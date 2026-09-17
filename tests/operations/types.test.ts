import type {
  Brand,
  ForeignKey,
  LibraryBrandToValue,
  NullableForeignKey,
  Optional,
  Searchable,
  SearchFilterable
} from "../../src/types.js";
import type { ForeignKeyToValue } from "../../src/operations/types.js";
import type DynaRecord from "../../src/DynaRecord.js";

/**
 * Exact type equality. The two-function-signature trick distinguishes types
 * that are mutually assignable but not identical (EX: `string` vs a branded
 * `string`), which plain `extends` checks would let through.
 */
type Exact<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

/**
 * Compiles only when `T` is `true`. The unused-looking parameter is what puts
 * `T` in a value position — without it the type parameter reads as unused to
 * an editor running `noUnusedParameters`, even though the project typecheck
 * does not enable it. Callers never pass an argument.
 */
const assertExact = <T extends true>(_assertion?: T): void => {};

/**
 * Every attribute shape the library can declare. `ForeignKeyToValue` maps a
 * whole entity, so the parity assertions below wrap each shape in this record
 * and compare the mapped property against {@link LibraryBrandToValue} applied
 * to the same shape.
 */
type Sku = Brand<string, "Sku">;

interface AllAttributeShapes {
  fk: ForeignKey<DynaRecord>;
  nullableFk?: NullableForeignKey<DynaRecord>;
  searchable: Searchable;
  optionalSearchable?: Searchable;
  filterableString: SearchFilterable;
  filterableNumber: SearchFilterable<number>;
  optionalFilterable?: SearchFilterable<Optional<string>>;
  filterableFk: SearchFilterable<ForeignKey<DynaRecord>>;
  filterableConsumerBrand: SearchFilterable<Sku>;
  consumerBrand: Sku;
  plainString: string;
  plainNumber: number;
}

type ViaForeignKeyToValue = ForeignKeyToValue<AllAttributeShapes>;
type ViaLibraryBrandToValue = {
  [K in keyof AllAttributeShapes]: LibraryBrandToValue<AllAttributeShapes[K]>;
};

describe("library brand stripping", () => {
  /**
   * `LibraryBrandToValue` and `ForeignKeyToValue` answer the same question —
   * what may a caller pass for this attribute — from two definitions. They
   * agree today and the consolidation is deferred, so these assertions are
   * what keep them from drifting apart silently: a library brand added to one
   * and not the other fails the typecheck instead of shipping.
   */
  describe("agrees with ForeignKeyToValue on every attribute shape", () => {
    it("strips dyna-record's own brands", () => {
      assertExact<
        Exact<ViaForeignKeyToValue["fk"], ViaLibraryBrandToValue["fk"]>
      >();
      assertExact<
        Exact<
          ViaForeignKeyToValue["nullableFk"],
          ViaLibraryBrandToValue["nullableFk"]
        >
      >();
      assertExact<
        Exact<
          ViaForeignKeyToValue["searchable"],
          ViaLibraryBrandToValue["searchable"]
        >
      >();
      assertExact<
        Exact<
          ViaForeignKeyToValue["optionalSearchable"],
          ViaLibraryBrandToValue["optionalSearchable"]
        >
      >();
      expect(true).toBe(true);
    });

    it("recovers the payload of filterable attributes", () => {
      assertExact<
        Exact<
          ViaForeignKeyToValue["filterableString"],
          ViaLibraryBrandToValue["filterableString"]
        >
      >();
      assertExact<
        Exact<
          ViaForeignKeyToValue["filterableNumber"],
          ViaLibraryBrandToValue["filterableNumber"]
        >
      >();
      assertExact<
        Exact<
          ViaForeignKeyToValue["optionalFilterable"],
          ViaLibraryBrandToValue["optionalFilterable"]
        >
      >();
      assertExact<
        Exact<
          ViaForeignKeyToValue["filterableFk"],
          ViaLibraryBrandToValue["filterableFk"]
        >
      >();
      expect(true).toBe(true);
    });

    it("leaves consumer brands and unbranded attributes alone", () => {
      assertExact<
        Exact<
          ViaForeignKeyToValue["filterableConsumerBrand"],
          ViaLibraryBrandToValue["filterableConsumerBrand"]
        >
      >();
      assertExact<
        Exact<
          ViaForeignKeyToValue["consumerBrand"],
          ViaLibraryBrandToValue["consumerBrand"]
        >
      >();
      assertExact<
        Exact<
          ViaForeignKeyToValue["plainString"],
          ViaLibraryBrandToValue["plainString"]
        >
      >();
      assertExact<
        Exact<
          ViaForeignKeyToValue["plainNumber"],
          ViaLibraryBrandToValue["plainNumber"]
        >
      >();
      expect(true).toBe(true);
    });
  });

  /**
   * The assertions above prove the two definitions agree; these pin what they
   * agree *on*, so a change that breaks both in the same direction still fails.
   */
  describe("resolves each shape to the value a caller may pass", () => {
    it("reduces library brands to their underlying scalar", () => {
      assertExact<Exact<ViaLibraryBrandToValue["fk"], string>>();
      assertExact<
        Exact<ViaLibraryBrandToValue["nullableFk"], Optional<string>>
      >();
      assertExact<Exact<ViaLibraryBrandToValue["searchable"], string>>();
      assertExact<
        Exact<ViaLibraryBrandToValue["optionalSearchable"], Optional<string>>
      >();
      assertExact<Exact<ViaLibraryBrandToValue["filterableFk"], string>>();
      expect(true).toBe(true);
    });

    it("reduces a plain filterable to its declared scalar", () => {
      // The shapes that regress if the filterable-payload branch is dropped:
      // neither matches the ForeignKey or Searchable branch, so both would
      // fall through to pass-through and keep their brand.
      assertExact<Exact<ViaLibraryBrandToValue["filterableString"], string>>();
      assertExact<Exact<ViaLibraryBrandToValue["filterableNumber"], number>>();
      expect(true).toBe(true);
    });

    it("preserves a consumer-defined brand", () => {
      assertExact<Exact<ViaLibraryBrandToValue["consumerBrand"], Sku>>();
      assertExact<
        Exact<ViaLibraryBrandToValue["filterableConsumerBrand"], Sku>
      >();
      expect(true).toBe(true);
    });

    it("passes unbranded attributes through unchanged", () => {
      assertExact<Exact<ViaLibraryBrandToValue["plainString"], string>>();
      assertExact<Exact<ViaLibraryBrandToValue["plainNumber"], number>>();
      expect(true).toBe(true);
    });
  });
});
