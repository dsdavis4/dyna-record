import type { ForeignKeyProperty } from "../../types";
import RelationshipMetadata from "./RelationshipMetadata";

/**
 * Represents a "Belongs To" relationship metadata within the ORM system.
 *
 * @extends {RelationshipMetadata} Inherits the base functionality and properties of `RelationshipMetadata`.
 * @property {"BelongsTo"} type - The type of the relationship, statically set to "BelongsTo" to signify the nature of the relationship.
 * @property {ForeignKeyProperty} foreignKey - The attribute representing the foreign key in the relationship. This specifies the field in the entity that links to another entity, serving as the cornerstone for relationship queries and operations.
 *
 * @param {RelationshipMetadata} item - The initial relationship metadata to be copied into this "Belongs To" relationship instance. This allows for easy creation and setup of relationship metadata based on existing configurations.
 */
class BelongsToRelationship extends RelationshipMetadata {
  type: "BelongsTo" = "BelongsTo";
  foreignKey: ForeignKeyProperty;

  constructor(item: RelationshipMetadata) {
    super();
    if (item !== undefined) {
      Object.assign(this, item);
    }
  }
}

export default BelongsToRelationship;
