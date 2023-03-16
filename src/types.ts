import { NativeScalarAttributeValue } from "@aws-sdk/util-dynamodb";

// # TODO is this used?
export interface Attribute {
  fieldName: string;
  type: NativeScalarAttributeValue;
}
