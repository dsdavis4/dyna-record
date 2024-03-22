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
