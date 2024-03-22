import RelationshipMetadata from "./RelationshipMetadata";

/**
 * Represents the metadata for a "HasAndBelongsToMany" relationship metadata within the ORM system.
 *
 * @property {"HasAndBelongsToMany"} type - A literal string indicating the type of the relationship as "HasAndBelongsToMany". This helps in distinguishing between different types of relationships within the ORM.
 * @property {string} joinTableName - The name of the join table used to facilitate the many-to-many relationship between entities. This table contains the foreign keys that link the related entities together.
 *
 * @param {RelationshipMetadata} item - An instance of `RelationshipMetadata` containing the initial settings for the relationship. This can include properties like `joinTableName`, which are specific to many-to-many relationships.
 */
class HasAndBelongsToManyRelationship extends RelationshipMetadata {
  type: "HasAndBelongsToMany" = "HasAndBelongsToMany";
  joinTableName: string;

  constructor(item: RelationshipMetadata) {
    super();
    if (item !== undefined) {
      Object.assign(this, item);
    }
  }
}

export default HasAndBelongsToManyRelationship;
