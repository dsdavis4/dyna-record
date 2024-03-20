import type NoOrm from "../NoOrm";
import type { JoinTable } from "../relationships";
import type { EntityClass } from "../types";

// TODO add typedoc for each of the attributes

type Entity = EntityClass<NoOrm>;
type ForeignKey = keyof JoinTable<NoOrm, NoOrm>;

class JoinTableMetadata {
  public readonly entity: Entity;
  public readonly foreignKey: ForeignKey;

  constructor(entity: Entity, foreignKey: ForeignKey) {
    this.entity = entity;
    this.foreignKey = foreignKey;
  }
}

export default JoinTableMetadata;
