import { Entity, Attribute } from "../decorators";

// TODO is belongs to link accurate? Or EntityLink? Its used by HasOne...

@Entity
class BelongsToLink {
  // // TODO how to obtain the pk and sk... maybe throught the new type?
  // @Attribute({ alias: "PK" })
  // public pk: string;

  // // TODO how to obtain the pk and sk... maybe throught the new type?
  // @Attribute({ alias: "SK" })
  // public sk: string;

  // TODO how to get this dynamically?
  @Attribute({ alias: "Id" })
  public id: string;

  // TODO does this need a refactor with the other type on single table design?
  // TODO how to ger dynamically?
  @Attribute({ alias: "Type" })
  public type: string;

  @Attribute({ alias: "ForeignEntityType" })
  public foreignEntityType: string;

  // TODO how to make it use the fields from the table class
  @Attribute({ alias: "CreatedAt" })
  public createdAt: Date;

  // TODO how to make it use the fields from the table class
  @Attribute({ alias: "UpdatedAt" })
  public updatedAt: Date;
}

export default BelongsToLink;
