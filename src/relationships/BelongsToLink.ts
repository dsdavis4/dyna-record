import { Entity, Attribute } from "../decorators";

export const FOREIGN_ENTITY_TYPE_ALIAS = "ForeignEntityType";
export const FOREIGN_KEY_ALIAS = "ForeignKey";

@Entity
class BelongsToLink {
  // // TODO how to obtain the pk and sk... maybe throught the new type?
  // @Attribute({ alias: "PK" })
  // public pk: string;

  // // TODO how to obtain the pk and sk... maybe throught the new type?
  // @Attribute({ alias: "SK" })
  // public sk: string;

  // TODO how to get this dynamically? This is a default field
  @Attribute({ alias: "Id" })
  public id: string;

  // TODO does this need a refactor with the other type on single table design?
  // TODO how to ger dynamically?
  @Attribute({ alias: "Type" })
  public type: string;

  @Attribute({ alias: FOREIGN_ENTITY_TYPE_ALIAS })
  public foreignEntityType: string;

  @Attribute({ alias: FOREIGN_KEY_ALIAS })
  public foreignKey: string;

  // TODO how to get this dynamically? This is a default field
  @Attribute({ alias: "CreatedAt" })
  public createdAt: Date;

  // TODO how to get this dynamically? This is a default field
  @Attribute({ alias: "UpdatedAt" })
  public updatedAt: Date;
}

export default BelongsToLink;
