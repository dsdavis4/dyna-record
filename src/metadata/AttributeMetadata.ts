import type { NativeScalarAttributeValue } from "@aws-sdk/util-dynamodb";

// TODO add typedoc for each of the attributes

/**
 * Function that takes a attribute from a Dynamo table item, and serialize it to a non-Dynamo native type (EX: Date)
 */
type EntitySerializer = (param: NativeScalarAttributeValue) => any;

/**
 * Function that takes a attribute from an Entity which is not a native Dynamo type and serializes it a type that is supported by Dynamo
 */
type TableSerializer = (param: any) => NativeScalarAttributeValue;

/**
 * Functions for serializing attribute types that are not native to Dynamo from table item -> entity and entity -> table item
 * EX: See '@DateAttribute'
 */
interface Serializers {
  /**
   * Function to serialize a Dynamo table item attribute to Entity attribute. Used when the type defined on the entity is not a native type to Dynamo (EX: Date)
   */
  toEntityAttribute: EntitySerializer;
  /**
   * Function to serialize an Entity attribute to an attribute type that Dynamo supports. (EX: Date->string)
   */
  toTableAttribute: TableSerializer;
}

export interface AttributeMetadataOptions {
  attributeName: string;
  alias?: string;
  nullable: boolean;
  serializers?: Serializers;
}

class AttributeMetadata {
  public readonly name: string;
  public readonly alias: string;
  public readonly nullable: boolean;
  public readonly serializers?: Serializers;

  constructor(options: AttributeMetadataOptions) {
    this.name = options.attributeName;
    this.alias = options.alias ?? options.attributeName;
    this.nullable = options.nullable;
    this.serializers = options.serializers;
  }
}

export default AttributeMetadata;
