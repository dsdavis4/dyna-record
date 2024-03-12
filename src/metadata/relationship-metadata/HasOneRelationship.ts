import type { ForeignKeyAttribute } from "../../types";
import RelationshipMetadata from "./RelationshipMetadata";

class HasOneRelationship extends RelationshipMetadata {
  type: "HasOne" = "HasOne";
  foreignKey: ForeignKeyAttribute;

  constructor(item: RelationshipMetadata) {
    super();
    if (item !== undefined) {
      Object.assign(this, item);
    }
  }
}

export default HasOneRelationship;
