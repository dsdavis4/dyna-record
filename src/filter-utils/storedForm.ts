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
 * The stored form of every kind of thing a condition can name — an attribute,
 * by its {@link AttributeKind}, or a nested field, by its `FieldDef` type.
 *
 * One map rather than two, because the question is the same and the two key
 * sets overlap in six of nine entries. Exhaustive over both unions, so adding
 * an attribute kind *or* a field type fails compilation here until it declares
 * a stance — which two maps could not guarantee, since they could disagree on
 * a kind they share.
 *
 * A date is the entry the whole distinction exists for: declared as a `Date`
 * and stored as an ISO 8601 string, so the operators that apply to it are the
 * ones that apply to a string. An enum and a foreign key are likewise strings
 * once stored. `array` and `discriminatedUnion` are field types only, and
 * `foreignKey` an attribute kind only; the accessors below take the narrower
 * parameter type, which is what keeps each caller to its own half.
 */
const STORED_FORM_BY_KIND: Record<
  AttributeKind | FieldDef["type"],
  StoredForm
> = {
  string: "string",
  number: "number",
  boolean: "boolean",
  date: "string",
  enum: "string",
  object: "map",
  foreignKey: "string",
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
 * {@link fragmentOperatorApplies} does: a dot path into a union variant names
 * no single field, which dyna-record cannot resolve and therefore cannot judge.
 * @param storedForm - The stored form, or undefined when it could not be resolved
 * @returns Whether the comparators and `BETWEEN` can apply
 */
export const orderedOperatorApplies = (
  storedForm: Optional<StoredForm>
): boolean =>
  storedForm === undefined || ORDERED_FORMS.some(form => form === storedForm);

/**
 * Whether a value is a whole value of an attribute rather than a condition on
 * it.
 *
 * A `Date` and a `Uint8Array` are objects to `typeof` but values a filter
 * compares against, so neither is an operator object. Stated here because two
 * callers need it — the condition-shape guard, which must not mistake one for a
 * mistyped operator, and the partition key check, which must not mistake one
 * for a non-equality condition. They had drifted apart while each spelled it
 * out.
 * @param value - The condition value
 * @returns Whether it is a whole value that happens to be an object
 */
export const isObjectValuedScalar = (value: object): boolean =>
  value instanceof Date || value instanceof Uint8Array;

/**
 * Whether DynamoDB can order a stored value.
 *
 * The value-side counterpart of {@link ORDERED_FORMS}, which answers the same
 * question from an attribute's schema. This one is needed where the schema
 * could not answer — a dot path into a union variant resolves to no field, so
 * the value is all there is to go on.
 *
 * Distinct from `isOrdered` in the expression builder, which asks the narrower
 * question of whether *JavaScript's* `>` reproduces DynamoDB's ordering.
 * Binary is the case that separates them: DynamoDB orders it as unsigned bytes,
 * so a range over it is representable, while `>` on two `Uint8Array`s is not
 * that comparison. This predicate accepts binary; that one does not.
 * @param value - A value in the form the table stores it
 * @returns Whether DynamoDB can order it
 */
export const isDynamoOrderable = (value: unknown): boolean =>
  typeof value === "string" ||
  // Finite, because DynamoDB has no Number for NaN or Infinity to be stored
  // as — so a comparison against one orders against a value no row can hold.
  // A typed attribute never reaches this, since zod's number() rejects both;
  // a dot path into a union variant has no schema and does
  (typeof value === "number" && Number.isFinite(value)) ||
  typeof value === "bigint" ||
  value instanceof Uint8Array;

/**
 * What the ordered operators apply to, for the error that rejects one.
 */
export const orderedOperatorDomain =
  "DynamoDB orders String, Number and Binary values; a Boolean, a Map and a List have no ordering, so the comparison can never hold";

/**
 * What an ordered operator's own value must be, for the error that rejects one.
 *
 * Separate from {@link orderedOperatorDomain} because it answers for a value
 * rather than an attribute, so it can name `null` — which is never a stored
 * value at all, rather than a stored form with no ordering.
 */
export const orderedOperandDomain =
  "An ordered comparison takes a String, a Number or Binary value. A Boolean, a Map and a List have no ordering, and dyna-record removes a nulled attribute rather than storing NULL, so there is nothing for the comparison to match";

/**
 * The stored form of an attribute, from its kind.
 * @param kind - The attribute's kind, as its decorator recorded it
 * @returns The form the table stores it in, or undefined when the kind is unknown
 */
export const storedFormOfAttribute = (
  kind: Optional<AttributeKind>
): Optional<StoredForm> =>
  kind === undefined ? undefined : STORED_FORM_BY_KIND[kind];

/**
 * The stored form of a nested field, from its definition.
 * @param fieldDef - The field a dot path names
 * @returns The form the table stores it in
 */
export const storedFormOfField = (fieldDef: FieldDef): StoredForm =>
  STORED_FORM_BY_KIND[fieldDef.type];

/**
 * The stored form an operand is sent as, judged from the value itself.
 *
 * For an operand sent as written — a `$contains` element — where the schema
 * says what the element must be and the value is all there is to compare it
 * with. A `Date` and a `Uint8Array` answer undefined: neither is one of the
 * forms the stored-form map knows. A `Date` element of a list of dates is
 * converted to its ISO string before it is judged here, so one that reaches
 * this is on a list whose elements it cannot be.
 * @param value - The operand as the caller supplied it
 * @returns The form it would be stored as, or undefined when it is none of them
 */
export const storedFormOfOperand = (value: unknown): Optional<StoredForm> => {
  if (typeof value === "string") return "string";
  if (typeof value === "number" || typeof value === "bigint") return "number";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) return "list";

  return typeof value === "object" &&
    value !== null &&
    !isObjectValuedScalar(value)
    ? "map"
    : undefined;
};

/**
 * Whether a fragment operator applies to a value stored in the given form.
 *
 * An unknown form answers `true`. That is the case of a dot path into a union
 * variant, which names no single field dyna-record can resolve and judge —
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
