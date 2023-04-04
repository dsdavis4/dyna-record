import { MODEL_ATTRIBUTES } from "../symbols";
// import {
//   NativeAttributeValue
//   // NativeScalarAttributeValue
// } from "@aws-sdk/util-dynamodb";
// import { NativeAttributeValue } from "@aws-sdk/util-dynamodb";

// TODO is MODEL_ATTRIBUTES a good name? TABLE_ATTRIBUTES?

// TODO make stricter and make sure this isnt duplicated
type GConstructor<T = {}> = new (...args: any[]) => T;

function ModelMixin<TBase extends GConstructor>(Base: TBase) {
  return class Model extends Base {
    // TODO make private
    public serialize(tableItem: Record<string, any>): this {
      let target = Object.getPrototypeOf(this);
      const attrs: Record<string, string> = Reflect.getOwnMetadata(
        MODEL_ATTRIBUTES,
        target
      );

      Object.entries(tableItem).forEach(([attr, value]) => {
        const modelKey = attrs[attr];
        target[`${modelKey}`] = value;
      }, {});

      debugger;
      return target;
    }
  };
}

export default ModelMixin;
