import RelationshipMetadata from "./RelationshipMetadata";

/**
 * Represents an "Owned By" relationship metadata within the ORM system.
 *
 * @extends {RelationshipMetadata} Inherits the base functionality and properties of `RelationshipMetadata`.
 * @property {"OwnedBy"} type - The type of the relationship, statically set to "OwnedBy" to signify a one-directional relationship where the current entity is owned by another entity.
 *
 * @param {RelationshipMetadata} item - The initial relationship metadata to be copied into this "Owned By" relationship instance. This facilitates the creation and setup of relationship metadata based on existing configurations.
 */
class OwnedByRelationship extends RelationshipMetadata {
  type: "OwnedBy" = "OwnedBy";

  constructor(item: RelationshipMetadata) {
    super();
    if (item !== undefined) {
      Object.assign(this, item);
    }
  }
}

export default OwnedByRelationship;
