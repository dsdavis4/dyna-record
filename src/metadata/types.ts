import type { NativeScalarAttributeValue } from "@aws-sdk/util-dynamodb";
import type {
  AttributeMetadata,
  EntityMetadata,
  JoinTableMetadata,
  RelationshipMetadata,
  TableMetadata
} from ".";
import type DynaRecord from "../DynaRecord";
import type { BelongsToLink } from "../relationships";
import type { MakeOptional } from "../types";
import type { ZodType } from "zod";

/**
 * Represents relationship metadata that includes a foreign key reference to another entity.
 */
export type RelationshipMetadataWithForeignKey = Extract<
  RelationshipMetadata,
  { foreignKey: keyof DynaRecord }
>;

/**
 * A record mapping string keys to `AttributeMetadata`, used for storing metadata about entity attributes and looking up by entity attribute name.
 */
export type AttributeMetadataStorage = Record<string, AttributeMetadata>;

/**
 * A record mapping string keys to `RelationshipMetadata`, used for storing metadata about entity relationships and looking up by entity attribute name.
 */
export type RelationshipMetadataStorage = Record<string, RelationshipMetadata>;

/**
 * A record mapping string keys to `TableMetadata`, used for storing metadata about tables associated with entities and looking up table class name.
 */
export type TableMetadataStorage = Record<string, TableMetadata>;

/**
 * A record mapping string keys to `EntityMetadata`, used for storing metadata about entities and looking up by entity class name.
 */
export type EntityMetadataStorage = Record<string, EntityMetadata>;

/**
 * A record mapping string keys to an array of `JoinTableMetadata`, used for storing metadata about join tables in relationships and looking up by join table class name.
 */
export type JoinTableMetadataStorage = Record<string, JoinTableMetadata[]>;

/**
 * Specifies the default date fields commonly used in entities: `createdAt` and `updatedAt`.
 */
export type DefaultDateFields = "createdAt" | "updatedAt";

// TODO add unit test that instance method keys are not allowed whereever this isused
// TODO use the exclude on Functionfields
/**
 * Specifies the default fields used in entities, including fields from `DynaRecord` or `BelongsToLink`. Instance methods are excluded
 */
export type DefaultFields =
  | {
      [K in keyof DynaRecord]: DynaRecord[K] extends (...args: any[]) => any
        ? never
        : K;
    }[keyof DynaRecord]
  | keyof BelongsToLink;

/**
 * Defines the structure for default fields within a table, mapping field names to their `AttributeMetadata` aliases.
 */
export type TableDefaultFields = Record<
  DefaultFields,
  Pick<AttributeMetadata, "alias">
>;

/**
 * Options for configuring table metadata, including the table name, delimiter, and default fields.
 */
export type TableMetadataOptions = Pick<TableMetadata, "name" | "delimiter"> & {
  defaultFields?: Partial<TableDefaultFields>;
};

/**
 * Options for configuring keys in attribute metadata, making all properties except `nullable` optional, including `alias`.
 */
export type KeysAttributeMetadataOptions = MakeOptional<
  Omit<AttributeMetadataOptions, "nullable">,
  "alias"
>;

/**
 * Function that takes a attribute from a Dynamo table item, and serialize it to a non-Dynamo native type (EX: Date)
 */
export type EntitySerializer = (param: NativeScalarAttributeValue) => any;

/**
 * Function that takes a attribute from an Entity which is not a native Dynamo type and serializes it a type that is supported by Dynamo
 */
export type TableSerializer = (param: any) => NativeScalarAttributeValue;

/**
 * Functions for serializing attribute types that are not native to Dynamo from table item -> entity and entity -> table item
 * EX: See DateAttribute decorator
 */
export interface Serializers {
  /**
   * Function to serialize a Dynamo table item attribute to Entity attribute. Used when the type defined on the entity is not a native type to Dynamo (EX: Date)
   */
  toEntityAttribute: EntitySerializer;
  /**
   * Function to serialize an Entity attribute to an attribute type that Dynamo supports. (EX: Date->string)
   */
  toTableAttribute: TableSerializer;
}

/**
 * Defines the options for configuring attribute metadata within the ORM system. This interface specifies the settings used to describe and manage an attribute's representation and behavior in both the entity model and the underlying database schema, particularly focusing on attributes' names, aliases, nullability, and serialization strategies.
 *
 * @property {string} attributeName - The name of the attribute as defined in the entity. This is the primary identifier for the attribute within the ORM and is used in entity operations.
 * @property {string} [alias] - An optional alias for the attribute that represents its name within the database. This is used for mapping the attribute to its corresponding column in the database table. If not specified, the `attributeName` is used as the column name.
 * @property {boolean} nullable - Indicates whether the attribute is allowed to have null values. This property is crucial for enforcing data integrity and validation rules at the database level.
 * @property {Serializers} [serializers] - Optional custom serialization strategies for the attribute. These strategies define how to convert the attribute's value between its representation in the entity and its representation in the database. This is particularly useful for handling complex data types or custom transformations.
 */
export interface AttributeMetadataOptions {
  attributeName: string;
  type: ZodType;
  alias?: string;
  nullable?: boolean;
  serializers?: Serializers;
}
