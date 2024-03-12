import RelationshipMetadata from "./RelationshipMetadata";

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
