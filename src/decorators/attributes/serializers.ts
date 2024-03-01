import type { NativeScalarAttributeValue } from "@aws-sdk/util-dynamodb";

export const dateSerializer = {
  toEntityAttribute: (val: NativeScalarAttributeValue) => {
    if (typeof val === "string") {
      return new Date(val);
    }
    return val;
  },
  toTableAttribute: (val: Date) => val.toISOString()
};
