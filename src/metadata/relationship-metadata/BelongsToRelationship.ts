import type { ForeignKeyAttribute } from "../MetadataStorage";
import RelationshipMetadata from "./RelationshipMetadata";

class BelongsToRelationship extends RelationshipMetadata {
  type: "BelongsTo" = "BelongsTo";
  foreignKey: ForeignKeyAttribute;

  constructor(item: RelationshipMetadata) {
    super();
    if (item !== undefined) {
      Object.assign(this, item);
    }
  }
}

export default BelongsToRelationship;
