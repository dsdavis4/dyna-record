/**
 * The form the table stores an attribute or a nested field in, and which
 * fragment operators apply to each.
 *
 * A leaf module for the same reason `metadata/filterScalarTypes.ts` is one: the
 * maps are a property of the attribute kinds themselves, and importing them
 * from the expression builder or the metadata storage would tie two modules
 * together that have no other business with each other.
 */
import type { FieldDef } from "../decorators/attributes/types.js";
import type { AttributeKind } from "../metadata/types.js";
import type { Optional } from "../types.js";

/**
 * The DynamoDB form an attribute's value is stored as.
 *
 * Coarser than DynamoDB's own type set, because only the distinctions that
 * decide operator applicability matter here. `Uint8Array` has no entry: every
 * attribute kind this library models stores as one of these, and binary is
 * reachable only through a value whose type is unresolved, which is left
 * unconstrained.
 */
export type StoredForm = "string" | "number" | "boolean" | "map" | "list";

/**
 * The stored form of each attribute kind. Exhaustive over
 * {@link AttributeKind}, so adding a kind fails compilation here until it
 * declares a stance.
 *
 * A date is the entry the whole distinction exists for: declared as a `Date`
 * and stored as an ISO 8601 string, so the operators that apply to it are the
 * ones that apply to a string. An enum and a foreign key are likewise strings
 * once stored.
 */
const STORED_FORM_BY_ATTRIBUTE_KIND: Record<AttributeKind, StoredForm> = {
  string: "string",
  number: "number",
  boolean: "boolean",
  date: "string",
  enum: "string",
  object: "map",
  foreignKey: "string"
};

/**
 * The stored form of each nested field type. Exhaustive over `FieldDef`, so
 * adding a field type fails compilation here until it declares a stance.
 *
 * An array stores as a List and a discriminated union as a Map, neither of
 * which an attribute kind can be — which is why this is a separate map rather
 * than the same one.
 */
const STORED_FORM_BY_FIELD_TYPE: Record<FieldDef["type"], StoredForm> = {
  string: "string",
  number: "number",
  boolean: "boolean",
  date: "string",
  enum: "string",
  object: "map",
  array: "list",
  discriminatedUnion: "map"
};

/**
 * The stored forms each fragment operator applies to.
 *
 * `begins_with` tests a prefix, which DynamoDB applies to String and Binary
 * attributes — and this library models no binary attribute kind, so a prefix
 * means a string here. `contains` tests either a substring of a String or
 * membership of a List or a Set.
 *
 * Applied against a form resolved from metadata, never guessed: an operator is
 * rejected only where dyna-record knows the attribute cannot carry it.
 */
const FORMS_BY_FRAGMENT_OPERATOR = {
  $beginsWith: ["string"],
  $contains: ["string", "list"]
} as const satisfies Record<string, readonly StoredForm[]>;

/**
 * A fragment operator whose applicability depends on the stored form.
 */
export type FragmentOperator = keyof typeof FORMS_BY_FRAGMENT_OPERATOR;

/**
 * The stored forms DynamoDB can order.
 *
 * `<`, `<=`, `>`, `>=` and `BETWEEN` require *comparable* operands, which
 * DynamoDB defines as String, Number and Binary. A Boolean, a Map, a List and a
 * Set are not comparable: there is no ordering between two of them, so a
 * condition asking for one can never hold.
 *
 * A date belongs here through its stored form, not its declared one — an ISO
 * 8601 string orders lexicographically exactly as the `Date` orders
 * chronologically, which is what makes a date range work at all.
 */
const ORDERED_FORMS: readonly StoredForm[] = ["string", "number"];

/**
 * Whether an ordered comparison applies to a value stored in the given form.
 *
 * An unknown form answers `true`, for the same reason
 * {@link fragmentOperatorApplies} does: a dot path naming no single field is
 * something dyna-record cannot resolve and therefore cannot judge.
 * @param storedForm - The stored form, or undefined when it could not be resolved
 * @returns Whether the comparators and `BETWEEN` can apply
 */
export const orderedOperatorApplies = (
  storedForm: Optional<StoredForm>
): boolean =>
  storedForm === undefined || ORDERED_FORMS.some(form => form === storedForm);

/**
 * What the ordered operators apply to, for the error that rejects one.
 */
export const orderedOperatorDomain =
  "DynamoDB orders String, Number and Binary values; a Boolean, a Map and a List have no ordering, so the comparison can never hold";

/**
 * The stored form of an attribute, from its kind.
 * @param kind - The attribute's kind, as its decorator recorded it
 * @returns The form the table stores it in, or undefined when the kind is unknown
 */
export const storedFormOfAttribute = (
  kind: Optional<AttributeKind>
): Optional<StoredForm> =>
  kind === undefined ? undefined : STORED_FORM_BY_ATTRIBUTE_KIND[kind];

/**
 * The stored form of a nested field, from its definition.
 * @param fieldDef - The field a dot path names
 * @returns The form the table stores it in
 */
export const storedFormOfField = (fieldDef: FieldDef): StoredForm =>
  STORED_FORM_BY_FIELD_TYPE[fieldDef.type];

/**
 * Whether a fragment operator applies to a value stored in the given form.
 *
 * An unknown form answers `true`. That is the case of a dot path naming no
 * single field, which dyna-record cannot resolve and therefore cannot judge —
 * the same reason such a path's value is left unvalidated.
 * @param operator - The fragment operator
 * @param storedForm - The stored form, or undefined when it could not be resolved
 * @returns Whether the operator can apply
 */
export const fragmentOperatorApplies = (
  operator: FragmentOperator,
  storedForm: Optional<StoredForm>
): boolean =>
  storedForm === undefined ||
  FORMS_BY_FRAGMENT_OPERATOR[operator].some(form => form === storedForm);

/**
 * What each fragment operator applies to, for the error that rejects it.
 */
export const fragmentOperatorDomain: Record<FragmentOperator, string> = {
  $beginsWith:
    "begins_with tests a prefix, which DynamoDB applies to String attributes",
  $contains:
    "contains tests a substring of a String or membership of a List or Set"
};
