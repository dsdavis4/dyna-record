import { v4 as uuidv4 } from "uuid";
import type DynaRecord from "../DynaRecord";
import type { ForeignKey } from "../types";
import type { EntityAttributesOnly } from "../operations";

// TODO is this class needed anymore?
// TODO If not - I should look at and evaluate all cases of BelongsToLink in the project

/**
 * Extends `DynaRecord` with properties specific to "BelongsTo" relationships, such as `foreignEntityType` and `foreignKey`.
 */
interface BelongsToLinkProps extends EntityAttributesOnly<DynaRecord> {
  foreignEntityType: string;
  foreignKey: string;
}

/**
 * Represents a "BelongsTo" relationship link between entities within the ORM system. Instances of this class are used to track and manage associations where one entity belongs to another, encapsulating the connection details including the type of the foreign entity and its foreign key.
 *
 * This class implements the `BelongsToLinkProps` interface, ensuring consistency in the properties used to describe the "BelongsTo" relationship.
 */
class BelongsToLink implements BelongsToLinkProps {
  /**
   * A unique identifier for the link itself, automatically generated upon creation.
   */
  public readonly id: string;
  /**
   * The type of the link, statically set to "BelongsToLink".
   */
  public readonly type: string;
  /**
   * The name of the entity type to which the link points (the "parent" entity in the relationship).
   */
  public readonly foreignEntityType: string;
  /**
   * The foreign key value identifying the specific instance of the foreign entity to which the link belongs. While it is a string, it represents the value of a `ForeignKey` attribute in the related entity.
   */
  public readonly foreignKey: ForeignKey;
  /**
   * The timestamp marking when the link was created
   */
  public readonly createdAt: Date;
  /**
   * The timestamp marking the last update to the link. Initially set to the same value as `createdAt`.
   */
  public readonly updatedAt: Date;

  constructor(item?: BelongsToLink) {
    if (item !== undefined) {
      Object.assign(this, item);
    }
  }

  /**
   * A static method to construct a `BelongsToLinkProps` object with specified properties, including auto-generated `id` and timestamp fields. This method facilitates the creation of new link instances without directly instantiating the class.
   * @param {string} foreignEntityType - The name of the entity type to which the new link will belong.
   * @param {string} foreignKey - The foreign key value identifying the specific instance of the foreign entity.
   * @returns {BelongsToLinkProps} - A new `BelongsToLinkProps` object ready for use in creating or managing a "BelongsTo" relationship.
   */
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
