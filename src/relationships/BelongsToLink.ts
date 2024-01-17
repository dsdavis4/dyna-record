import { Entity, Attribute } from "../decorators";
import { v4 as uuidv4 } from "uuid";

export const FOREIGN_ENTITY_TYPE_ALIAS = "ForeignEntityType";
export const FOREIGN_KEY_ALIAS = "ForeignKey";

interface BelongsToLinkProps {
  id: string;
  type: string;
  foreignEntityType: string;
  foreignKey: string;
  createdAt: Date;
  updatedAt: Date;
}

@Entity
class BelongsToLink implements BelongsToLinkProps {
  constructor(item?: BelongsToLink) {
    if (item !== undefined) {
      Object.assign(this, item);
    }
  }

  // TODO how to obtain the pk and sk... maybe throught the new type?
  //    IE - > need the alias dynamically
  @Attribute({ alias: "PK" })
  public pk: string;

  // TODO how to obtain the pk and sk... maybe throught the new type?
  @Attribute({ alias: "SK" })
  public sk: string;

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
  public foreignKey: string; // TODO should this be of type ForeignKey?

  // TODO how to get this dynamically? This is a default field
  @Attribute({ alias: "CreatedAt" })
  public createdAt: Date;

  // TODO how to get this dynamically? This is a default field
  @Attribute({ alias: "UpdatedAt" })
  public updatedAt: Date;

  public static build(
    foreignEntityType: string,
    foreignKey: string
  ): BelongsToLinkProps {
    const createdAt = new Date();

    return {
      id: uuidv4(),
      type: BelongsToLink.name,
      foreignKey,
      foreignEntityType,
      createdAt,
      updatedAt: createdAt
    };
  }
}

export default BelongsToLink;
