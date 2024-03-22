import type { ForeignKeyProperty } from "../../types";
import RelationshipMetadata from "./RelationshipMetadata";

/**
 * Extends `RelationshipMetadata` to specifically handle "HasMany" relationship metadata within the ORM system.
 *
 *
 * @property {"HasMany"} type - A literal string that explicitly defines the type of relationship as "HasMany". This classification helps the ORM to apply the correct logic for relationship handling.
 * @property {ForeignKeyProperty} foreignKey - The attribute in the associated entity that serves as a foreign key, linking back to the partition key of the owning entity. This key is essential for maintaining the integrity of the "HasMany" relationship.
 *
 * @param {RelationshipMetadata} item - An existing set of relationship metadata that should be applied to the newly created `HasManyRelationship` instance. This parameter allows for the inheritance and augmentation of relationship properties.
 */
class HasManyRelationship extends RelationshipMetadata {
  type: "HasMany" = "HasMany";
  foreignKey: ForeignKeyProperty;

  constructor(item: RelationshipMetadata) {
    super();
    if (item !== undefined) {
      Object.assign(this, item);
    }
  }
}

export default HasManyRelationship;
