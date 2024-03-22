import type NoOrm from "../NoOrm";
import type { JoinTable } from "../relationships";
import type { EntityClass } from "../types";

type Entity = EntityClass<NoOrm>;
type ForeignKey = keyof JoinTable<NoOrm, NoOrm>;

/**
 * Represents the metadata for a join table used in many-to-many relationships within the ORM system. This metadata includes the entity class and the foreign key used in the join table.
 *
 * A join table is an intermediary table that connects two entities in a many-to-many relationship, holding foreign keys that reference the primary keys of each entity. `JoinTableMetadata` encapsulates the details of one side of such a relationship, specifically the entity involved and the foreign key within the join table that points to this entity.
 *
 * @property {Entity} entity - The entity class that is part of the many-to-many relationship. This entity corresponds to one side of the relationship.
 * @property {ForeignKey} foreignKey - The foreign key in the join table that references the primary key of the `entity`. This key is crucial for linking records between the associated entities.
 *
 * @param {Entity} entity - The entity class involved in the many-to-many relationship.
 * @param {ForeignKey} foreignKey - The foreign key within the join table that references the entity's primary key.
 */

class JoinTableMetadata {
  public readonly entity: Entity;
  public readonly foreignKey: ForeignKey;

  constructor(entity: Entity, foreignKey: ForeignKey) {
    this.entity = entity;
    this.foreignKey = foreignKey;
  }
}

export default JoinTableMetadata;
