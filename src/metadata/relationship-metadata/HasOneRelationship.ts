import type { ForeignKeyProperty } from "../../types";
import RelationshipMetadata from "./RelationshipMetadata";

/**
 * Represents the metadata for a "HasOne" relationship metadata in the ORM system,
 *
 * @property {"HasOne"} type - A literal string identifying the type of relationship as "HasOne". This classification enables the ORM to apply appropriate handling logic specific to "HasOne" relationships.
 * @property {ForeignKeyProperty} foreignKey - The attribute in the associated entity that functions as a foreign key, establishing a link back to the partition key of the owning entity. This key is vital for maintaining the relationship's integrity and navigability.
 *
 * @param {RelationshipMetadata} item - An instance of `RelationshipMetadata` containing the initial settings for the relationship. This can include the `foreignKey` and other properties relevant to establishing a "HasOne" relationship.
 */
class HasOneRelationship extends RelationshipMetadata {
  type: "HasOne" = "HasOne";
  foreignKey: ForeignKeyProperty;

  constructor(item: RelationshipMetadata) {
    super();
    if (item !== undefined) {
      Object.assign(this, item);
    }
  }
}

export default HasOneRelationship;
