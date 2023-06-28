import SingleTableDesign from "../SingleTableDesign";
import { RelationshipMetadata } from "../metadata";
// import { RelationshipTypes } from "../types";

interface BelongsToProps<T extends SingleTableDesign> {
  entityClass: { new (): T } & typeof SingleTableDesign;
  foreignKey: keyof SingleTableDesign;
  propertyName: keyof SingleTableDesign;
}

// TODO remove it not used
class BelongsTo<T extends SingleTableDesign> {
  // private relationshipMetadata: RelationshipMetadata;

  public type = "BelongsTo";

  // constructor(relationshipMetadata: RelationshipMetadata) {
  //   this.relationshipMetadata = relationshipMetadata;
  // }

  constructor(private props: BelongsToProps<T>) {}

  // public async get(foreignKeyVal: string) {
  //   this.props.entityClass.findById(foreignKeyVal)
  // }
}

export default BelongsTo;
