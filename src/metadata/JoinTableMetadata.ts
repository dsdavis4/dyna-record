import type SingleTableDesign from "../SingleTableDesign";
import type { JoinTable } from "../relationships";
import type { EntityClass } from "../types";

// TODO can anything in here be readonly?

// TODO can I refactor to make instance vars private

// TODO add typedoc for each of the attributes

type Entity = EntityClass<SingleTableDesign>;
type ForeignKey = keyof JoinTable<SingleTableDesign, SingleTableDesign>;

class JoinTableMetadata {
  public entity: Entity;
  public foreignKey: ForeignKey;

  constructor(entity: Entity, foreignKey: ForeignKey) {
    this.entity = entity;
    this.foreignKey = foreignKey;
  }
}

export default JoinTableMetadata;
