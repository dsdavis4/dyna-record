import { MODEL_ATTRIBUTES } from "../symbols";

// TODO make stricter and make sure this isnt duplicated
type GConstructor<T = {}> = new (...args: any[]) => T;

function ModelMixin<TBase extends GConstructor>(Base: TBase) {
  return class Model extends Base {
    // TODO make private
    // TODO change return type to reflect what the attribute initializer returns
    // can the logic be shared?
    attributes(): string[] {
      let attributes = [];
      let target = Object.getPrototypeOf(this);
      while (target != Object.prototype) {
        let childAttributes =
          Reflect.getOwnMetadata(MODEL_ATTRIBUTES, target) || [];
        attributes.push(...childAttributes);
        target = Object.getPrototypeOf(target);
      }
      debugger;
      return attributes;
    }
  };
}

export default ModelMixin;
