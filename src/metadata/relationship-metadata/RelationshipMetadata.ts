import type SingleTableDesign from "../../SingleTableDesign";
import type { EntityClass } from "../../types";

type RelationshipType =
  | "HasMany"
  | "BelongsTo"
  | "HasOne"
  | "HasAndBelongsToMany";

abstract class RelationshipMetadata {
  public abstract type: RelationshipType;
  public target: EntityClass<SingleTableDesign>;
  public propertyName: keyof SingleTableDesign;
}

export default RelationshipMetadata;
