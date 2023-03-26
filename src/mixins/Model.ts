import { MODEL_ATTRIBUTES } from "../symbols";

// TODO make stricter and make sure this isnt duplicated
type GConstructor<T = {}> = new (...args: any[]) => T;

// TODO can I simplify by adding a prototype method instead of using mixin
// https://javascript.plainenglish.io/ts-5-0-beta-new-decorators-are-here-5b13a383e4ad

// function Greeter(value, context) {
//   if (context.kind === "class") {
//     value.prototype.greet = function () {
//       console.log("Hello Bytefer!");
//     };
//   }
// }
function ModelMixin<TBase extends GConstructor>(Base: TBase) {
  return class Model extends Base {
    // TODO make private
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
