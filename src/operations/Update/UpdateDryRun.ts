import type DynaRecord from "../../DynaRecord.js";
import Update from "./Update.js";

/**
 * Runs Update operation with out committing the transaction
 */
class UpdateDryRun<T extends DynaRecord> extends Update<T> {
  protected override async commitTransaction(): Promise<void> {
    // No-op
  }

  /**
   * Dry runs are used for foreign-key nullification during deletes — their
   * payloads can never contain a searchable attribute, so the embedding
   * branch is unreachable by construction. Returning false makes that a
   * guarantee rather than a coincidence (deleting a parent with many
   * searchable children must never call the embedding provider)
   */
  protected override supportsSearchableEmbedding(): boolean {
    return false;
  }
}

export default UpdateDryRun;
