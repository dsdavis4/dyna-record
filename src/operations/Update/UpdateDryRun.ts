import type DynaRecord from "../../DynaRecord.js";
import Update from "./Update.js";

/**
 * Runs Update operation with out committing the transaction
 */
class UpdateDryRun<T extends DynaRecord> extends Update<T> {
  protected override async commitTransaction(): Promise<void> {
    // No-op
  }
}

export default UpdateDryRun;
