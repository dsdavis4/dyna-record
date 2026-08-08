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
