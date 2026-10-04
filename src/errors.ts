/**
 * Represents an error indicating a violation of a null constraint within the ORM system. This error is typically thrown when an operation attempts to set a non-nullable attribute to `null`, which would violate the data integrity rules of the database schema.
 */
export class NullConstraintViolationError extends Error {
  public readonly code = "NullConstraintViolationError";
}

/**
 * Represents an error indicating that a requested entity or item could not be found within the database. This error is thrown during operations that expect to find and return a specific item, but the item does not exist in the database.
 */
export class NotFoundError extends Error {
  public readonly code = "NotFoundError";
}

/**
 * Represents an error indicating that a filter is not valid for the context in which it is used. This error is thrown when a filter uses a condition outside the context's capability set (EX: a `$beginsWith` condition in a vector search filter), references an attribute that is not filterable in the context, declares more than one condition for the same attribute where only one is allowed, or provides a value that does not match the attribute's schema.
 *
 * @remarks
 * Most of these conditions are ones DynamoDB itself **accepts**. It applies them, matches no item, and reports nothing — so a mistake is indistinguishable from a query that legitimately found nothing. `begins_with` on a Number, `contains` with a Number operand, a comparison against a Map, an equality between a List and a scalar, a composed range whose bounds cross, and an equality against `null` all behave that way; `begins_with(attr, "")` is the inverse, matching every item while reading like a narrow. Each was confirmed against the service rather than inferred from the documentation. Rejecting them is the only way the mistake becomes visible.
 *
 * Two are rejected even though DynamoDB does report them, and for one reason: its message does not say which attribute. An inverted `$between` comes back as `The BETWEEN operator requires upper bound to be greater than or equal to lower bound; lower bound operand: AttributeValue: {N:200}, upper bound operand: AttributeValue: {N:100}` — the bounds, never the name. Send three `BETWEEN` conditions with only the second inverted and the message is identical, leaving the caller to work out which one it meant. A `FilterError` names the attribute.
 *
 * What this error deliberately does **not** cover is DynamoDB's quotas, such as the expression size limit. A quota is a number AWS can raise, and a library that encoded it would have to be republished to catch up; semantics are the library's to check, limits are the service's to enforce.
 */
export class FilterError extends Error {
  public readonly code = "FilterError";
}

/**
 * Represents an error indicating that an entities attributes are not valid
 */
export class ValidationError extends Error {
  public readonly code = "ValidationError";
}

/**
 * Represents an error indicating that generating a vector embedding for a searchable attribute failed. This error is thrown when the embedding provider configured on the vector index rejects or errors during a create/update of a searchable entity, or when the provider returns a vector whose dimensions do not match the index's model descriptor. The originating provider error, when one exists, is carried on `cause`. The whole write fails — no item is written searchable-but-not-embedded.
 */
export class EmbeddingError extends Error {
  public readonly code = "EmbeddingError";
}
