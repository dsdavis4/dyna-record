import type NoOrm from "../../NoOrm";
import type { EntityClass } from "../../types";

type RelationshipType =
  | "HasMany"
  | "BelongsTo"
  | "HasOne"
  | "HasAndBelongsToMany";

abstract class RelationshipMetadata {
  public abstract type: RelationshipType;
  public target: EntityClass<NoOrm>;
  public propertyName: keyof NoOrm;
}

export default RelationshipMetadata;
