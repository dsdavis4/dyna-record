import SingleTableDesign from "../SingleTableDesign";
import { Entity, Attribute } from "../decorators";

// TODO is belongs to link accurate? Or EntityLink?
// TODO delete if not used
// TODO should I use the decorators???
@Entity
class BelongsToLink {
  // // TODO how to obtain the pk and sk...
  // @Attribute({ alias: "PK" })
  // public pk: string;

  // // TODO how to obtain the pk and sk...
  // @Attribute({ alias: "SK" })
  // public sk: string;

  @Attribute({ alias: "Id" })
  public id: string;

  // TODO does this need a refactor with the other type on single table design?
  @Attribute({ alias: "Type" })
  public type: string;

  @Attribute({ alias: "CreatedAt" })
  public createdAt: Date;

  @Attribute({ alias: "UpdatedAt" })
  public updatedAt: Date;
}

export default BelongsToLink;
