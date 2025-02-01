import type { ForeignKeyProperty } from "../../types";
import RelationshipMetadata from "./RelationshipMetadata";

/**
 * Represents an "Owned By" relationship metadata within the ORM system. These are uni-directional relationships to the parent
 *
 * @extends {RelationshipMetadata} Inherits the base functionality and properties of `RelationshipMetadata`.
 * @property {"OwnedBy"} type - The type of the relationship, statically set to "OwnedBy" to signify a unidirectional relationship where the current entity is owned by another entity.
 * @property {ForeignKeyProperty} foreignKey - The attribute representing the foreign key in the relationship. This specifies the field in the current entity that links to the owning entity, enabling relationship queries and operations.
 *
 * @param {RelationshipMetadata} item - The initial relationship metadata to be copied into this "Owned By" relationship instance. This facilitates the creation and setup of relationship metadata based on existing configurations.
 */
class OwnedByRelationship extends RelationshipMetadata {
  type: "OwnedBy" = "OwnedBy";
  foreignKey: ForeignKeyProperty;

  constructor(item: RelationshipMetadata) {
    super();
    if (item !== undefined) {
      Object.assign(this, item);
    }
  }
}

export default OwnedByRelationship;
