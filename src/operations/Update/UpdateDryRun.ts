import type DynaRecord from "../../DynaRecord";
import Update from "./Update";

/**
 * Runs Update operation with out committing the transaction
 */
class UpdateDryRun<T extends DynaRecord> extends Update<T> {
  protected override async commitTransaction(): Promise<void> {
    // No-op
  }
}

export default UpdateDryRun;
