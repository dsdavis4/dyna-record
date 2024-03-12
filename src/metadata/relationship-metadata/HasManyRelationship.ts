import type { ForeignKeyAttribute } from "../MetadataStorage";
import RelationshipMetadata from "./RelationshipMetadata";

class HasManyRelationship extends RelationshipMetadata {
  type: "HasMany" = "HasMany";
  foreignKey: ForeignKeyAttribute;

  constructor(item: RelationshipMetadata) {
    super();
    if (item !== undefined) {
      Object.assign(this, item);
    }
  }
}

export default HasManyRelationship;
