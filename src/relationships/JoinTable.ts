import type SingleTableDesign from "../SingleTableDesign";
import { type EntityClass } from "../metadata";
import type { ForeignKey } from "../types";

type ExcludeKeys = "type1" | "type2";

type ForeignKeyProperties<T> = {
  [P in Exclude<keyof T, ExcludeKeys>]: T[P] extends ForeignKey
    ? string
    : never;
};

// TODO is example still valid? Check at end of this..
/**
 * Abstract class representing a join table for HasAndBelongsToMany relationships.
 * This class should be extended for specific join table implementations.
 * It is virtual and not persisted to the database but manages the BelongsToLinks
 * in each related entity's partition.
 *
 * Example:
 * ```
 * class ExampleJoinTable extends JoinTable {
 *   public exampleId1: ForeignKey;
 *   public exampleId2: ForeignKey;
 * }
 * ```
 */
abstract class JoinTable<
  T extends SingleTableDesign,
  K extends SingleTableDesign
> {
  // TODO make this so that it only allows ForeignKey types
  // TODO If I keep this add a test that only ForeignKey types are allowed
  // [key: string]: ForeignKey;

  constructor(
    public type1: EntityClass<T>,
    public type2: EntityClass<K>
  ) {}

  // TODO typedoc
  public static async add<
    ThisClass extends JoinTable<T, K>,
    T extends SingleTableDesign,
    K extends SingleTableDesign
  >(
    this: new (type1: EntityClass<T>, type2: EntityClass<K>) => ThisClass,
    entity: ThisClass extends JoinTable<infer A, infer B>
      ? EntityClass<A | B>
      : never,
    keys: ForeignKeyProperties<ThisClass>
  ): Promise<void> {
    debugger;
    // Implementation logic
  }
}

export default JoinTable;
