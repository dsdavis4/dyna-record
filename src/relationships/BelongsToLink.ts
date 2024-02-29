import { Entity, Attribute, DateAttribute } from "../decorators";
import { v4 as uuidv4 } from "uuid";
import Metadata, { TableMetadata } from "../metadata";

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
  // TODO delete this and getter/setter if not used
  // TODO do I really need these?
  // public pk: string;
  // public sk: string;
  public id: string;
  public type: string;
  public foreignEntityType: string;
  public foreignKey: string; // TODO should this be of type ForeignKey?
  public createdAt: Date;
  public updatedAt: Date;

  constructor(tableClassName: string, item?: BelongsToLink) {
    if (item !== undefined) {
      Object.assign(this, item);
    }
  }

  // TODO are the changes in here needed?

  // TODO wait.... Why is this even in the Entity metadata section? Can I refactor so that its at top of the metadata structure the same way JoinTables are
  //             I think this is the right move...
  // TODO how to obtain the pk and sk... maybe throught the new type?
  //    IE - > need the alias dynamically
  //   @Attribute({ alias: Metadata.getEntityTable("BelongsToLink").primaryKey })
  //  Something like that ^^ might work... Right now metadata for BelongsToLink tableclassName is undefined...
  // @Attribute({ alias: "PK" })

  // public get pk(): string {
  //   return this.#pk;
  // }

  // public set pk(value: string) {
  //   this.#pk = value;
  // }

  // public get sk(): string {
  //   return this.#sk;
  // }

  // public set sk(value: string) {
  //   this.#sk = value;
  // }

  // public get id(): string {
  //   return this.#id;
  // }

  // public set id(value: string) {
  //   this.#id = value;
  // }

  // public get type(): string {
  //   return this.#type;
  // }

  // public set type(value: string) {
  //   this.#type = value;
  // }

  // public get foreignEntityType(): string {
  //   return this.#foreignEntityType;
  // }

  // public set foreignEntityType(value: string) {
  //   this.#foreignEntityType = value;
  // }

  // public get foreignKey(): string {
  //   return this.#foreignKey;
  // }

  // public set foreignKey(value: string) {
  //   this.#foreignKey = value;
  // }

  // public get createdAt(): Date {
  //   return this.#createdAt;
  // }

  // public set createdAt(value: Date) {
  //   this.#createdAt = value;
  // }

  // public get updatedAt(): Date {
  //   return this.#updatedAt;
  // }

  // public set updatedAt(value: Date) {
  //   this.#updatedAt = value;
  // }

  public bla(): any {}

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
