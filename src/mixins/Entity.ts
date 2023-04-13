import { ENTITY_ATTRIBUTES } from "../symbols";
// import {
//   NativeAttributeValue
//   // NativeScalarAttributeValue
// } from "@aws-sdk/util-dynamodb";
// import { NativeAttributeValue } from "@aws-sdk/util-dynamodb";

// TODO is ENTITY_ATTRIBUTES a good name? TABLE_ATTRIBUTES?

// TODO make stricter and make sure this isnt duplicated
type GConstructor<T = {}> = new (...args: any[]) => T;

function EntityMixin<TBase extends GConstructor>(Base: TBase) {
  return class Entity extends Base {
    // TODO make private
    // TODO should this even be here or should it be on the SingleTableDesign base class?
    public serialize(tableItem: Record<string, any>): this {
      let target = Object.getPrototypeOf(this);
      const attrs: Record<string, string> = Reflect.getOwnMetadata(
        ENTITY_ATTRIBUTES,
        target
      );

      Object.entries(tableItem).forEach(([attr, value]) => {
        const entityKey = attrs[attr];
        target[`${entityKey}`] = value;
      }, {});

      debugger;
      return target;
    }
  };
}

export default EntityMixin;
