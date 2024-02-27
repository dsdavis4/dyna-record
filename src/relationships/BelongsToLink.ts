import SingleTableDesign from "../SingleTableDesign";
import { Entity, Attribute, DateAttribute } from "../decorators";
import { v4 as uuidv4 } from "uuid";

export const FOREIGN_ENTITY_TYPE_ALIAS = "ForeignEntityType";
export const FOREIGN_KEY_ALIAS = "ForeignKey";

// TODO add tests that all operations work when table keys are not PK or SK
//      It might be best to solve the dynamic PK and SK problem in BelongsToLinkFirst

interface BelongsToLinkProps {
  id: string;
  type: string;
  foreignEntityType: string;
  foreignKey: string;
  createdAt: Date;
  updatedAt: Date;
}

// @Entity
class BelongsToLink implements BelongsToLinkProps {
  constructor(tableClass: SingleTableDesign, item?: BelongsToLink) {
    if (item !== undefined) {
      Object.assign(this, item);
    }
  }

  // TODO wait.... Why is this even in the Entity metadata section? Can I refactor so that its at top of the metadata structure the same way JoinTables are
  //             I think this is the right move...
  // TODO how to obtain the pk and sk... maybe throught the new type?
  //    IE - > need the alias dynamically
  //   @Attribute({ alias: Metadata.getEntityTable("BelongsToLink").primaryKey })
  //  Something like that ^^ might work... Right now metadata for BelongsToLink tableclassName is undefined...
  // @Attribute({ alias: "PK" })
  public pk: string;

  // // TODO how to obtain the pk and sk... maybe throught the new type?
  // @Attribute({ alias: "SK" })
  public sk: string;

  // TODO how to get this dynamically? This is a default field
  // @Attribute({ alias: "Id" })
  public id: string;

  // TODO does this need a refactor with the other type on single table design?
  // TODO how to ger dynamically?
  // @Attribute({ alias: "Type" })
  public type: string;

  // @Attribute({ alias: FOREIGN_ENTITY_TYPE_ALIAS })
  public foreignEntityType: string;

  // @Attribute({ alias: FOREIGN_KEY_ALIAS })
  public foreignKey: string; // TODO should this be of type ForeignKey?

  // TODO how to get this dynamically? This is a default field
  // @DateAttribute({ alias: "CreatedAt" })
  public createdAt: Date;

  // TODO how to get this dynamically? This is a default field
  // @DateAttribute({ alias: "UpdatedAt" })
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
