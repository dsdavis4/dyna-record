import { v4 as uuidv4 } from "uuid";
import type NoOrm from "../NoOrm";

// TODO add tests that all operations work when table keys are not PK or SK
//      It might be best to solve the dynamic PK and SK problem in BelongsToLinkFirst
// TODO enforce that these match the default types in metadata types

interface BelongsToLinkProps extends NoOrm {
  foreignEntityType: string;
  foreignKey: string;
}

class BelongsToLink implements BelongsToLinkProps {
  public readonly id: string;
  public readonly type: string;
  public readonly foreignEntityType: string;
  public readonly foreignKey: string; // TODO should this be of type ForeignKey?
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(item?: BelongsToLink) {
    if (item !== undefined) {
      Object.assign(this, item);
    }
  }

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
