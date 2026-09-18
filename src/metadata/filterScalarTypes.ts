/**
 * The attribute-kind-to-DynamoDB-scalar-type mapping for inline search
 * filters.
 *
 * Deliberately a leaf module: `VectorIndexRegistry` needs this map for its
 * per-index provisioning check and `MetadataStorage` needs it to reconcile
 * filterable marks, but `MetadataStorage` also constructs a
 * `VectorIndexRegistry` in a field initializer. Exporting the map from either
 * of those would close a value-level import cycle that leaves the
 * `MetadataStorage` class binding in its temporal dead zone under a strict
 * ESM loader — the unit suite's module transform tolerates it, a plain
 * `node`/`tsx` entry does not.
 */
import type { Optional } from "../types.js";
import type { AttributeKind } from "./types.js";

/**
 * The DynamoDB scalar type each attribute kind provisions as when it is
 * declared `@SearchFilterable`, or `undefined` when the kind cannot be an
 * inline filter at all. Exhaustive over {@link AttributeKind} — adding a new
 * kind fails compilation here until it declares a stance.
 *
 * Every vector-index inline filter must appear in the table's
 * `AttributeDefinitions`, whose `ScalarAttributeType` set is `B | N | S`. That
 * is what excludes booleans: there is no BOOL, so a boolean filterable
 * describes a table DynamoDB refuses to create. Dates and objects are
 * excluded for a different reason — no reliable equality semantics as an
 * inline filter. Binary is provisionable but this library models no binary
 * attribute kind.
 *
 * This map is the single allowlist: the type-level constraint on the
 * `SearchFilterable` brand in src/types.ts must agree with it, and the
 * per-index provisioning check reads it rather than defining its own set.
 */
const FILTER_SCALAR_TYPE_BY_KIND = {
  string: "S",
  number: "N",
  boolean: undefined,
  enum: "S",
  foreignKey: "S",
  date: undefined,
  object: undefined
} as const satisfies Record<AttributeKind, Optional<"S" | "N">>;

/**
 * The DynamoDB scalar type a filterable attribute kind provisions as.
 * `undefined` for a kind that cannot be an inline filter.
 * @param kind - The attribute kind
 * @returns The scalar type, or undefined when the kind is not filterable
 */
export const filterScalarTypeForKind = (
  kind: AttributeKind
): Optional<"S" | "N"> => FILTER_SCALAR_TYPE_BY_KIND[kind];

/**
 * The attribute kinds that may be declared `@SearchFilterable` — exactly
 * those {@link FILTER_SCALAR_TYPE_BY_KIND} gives a provisionable scalar type.
 */
export const FILTERABLE_ATTRIBUTE_KINDS = (
  Object.keys(FILTER_SCALAR_TYPE_BY_KIND) as AttributeKind[]
).filter(kind => FILTER_SCALAR_TYPE_BY_KIND[kind] !== undefined);
