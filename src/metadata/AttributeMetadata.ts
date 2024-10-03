import { type ZodType } from "zod";
import type { AttributeMetadataOptions, Serializers } from "./types";

/**
 * Represents the metadata for an attribute of an entity, including its name, alias (if any), nullability, and serialization strategies.
 *
 * Serialization strategies are essential for attributes whose types do not natively exist in DynamoDB, such as `Date` objects, enabling custom conversion between the entity representation and the database representation. These strategies ensure that the ORM can seamlessly handle a wide range of attribute types beyond those natively supported by DynamoDB.
 *
 * @property {string} name - The name of the attribute as defined on the entity. This serves as the primary identifier for the attribute within the ORM.
 * @property {string} alias - The name of the attribute as defined in the database table. If not provided, it defaults to the name of the attribute. This alias is used for database operations to map the attribute to its corresponding database column.
 * @property {boolean} nullable - Indicates whether the attribute can be `null`, defining the attribute's nullability constraint within the database.
 * @property {Serializers | undefined} serializers - Optional serialization strategies for converting the attribute between its database representation and its entity representation. This is particularly useful for custom data types not natively supported by DynamoDB.
 * @property {ZodType} type - Zod validator to run on the attribute
 *
 * @param {AttributeMetadataOptions} options - Configuration options for the attribute metadata, including the attribute's name, optional alias, nullability, and serialization strategies.
 */
class AttributeMetadata {
  public readonly name: string;
  public readonly alias: string;
  public readonly nullable: boolean;
  public readonly serializers?: Serializers;
  public readonly type: ZodType;

  constructor(options: AttributeMetadataOptions) {
    this.name = options.attributeName;
    this.alias = options.alias ?? options.attributeName;
    this.nullable = options.nullable ?? false;
    this.serializers = options.serializers;

    // // TODO perhaps this should change to required?
    if (options.nullable === true) {
      this.type = options.type.optional().nullable();
    } else {
      this.type = options.type;
    }
  }
}

export default AttributeMetadata;
