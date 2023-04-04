import { MODEL_TYPE, MODEL_ATTRIBUTES } from "../symbols";
import ModelMixin from "../mixins/Model";

// TODO can I simplify by adding a prototype method instead of using mixin
// https://javascript.plainenglish.io/ts-5-0-beta-new-decorators-are-here-5b13a383e4ad

// function Greeter(value, context) {
//   if (context.kind === "class") {
//     value.prototype.greet = function () {
//       console.log("Hello Bytefer!");
//     };
//   }
// }

type GConstructor<T = {}> = new (...args: any[]) => T;
// TODO try to make stricter
// type Modelable = GConstructor<{ name: string }>;

interface Model {
  attributes(): string[];
}

function Model(name: string) {
  return function <T extends GConstructor>(
    target: T,
    _context: ClassDecoratorContext
  ) {
    // TODO should this be changed /moved to Reflect.defineMetadata(MODEL_TYPE, name, ModelClass);
    Reflect.defineMetadata(MODEL_TYPE, name, target);

    // You can define other decorators here
    class ModelClass extends ModelMixin(target) {}

    // Apply original class descriptors to the new class
    const ownPropertyDescriptors = Object.getOwnPropertyDescriptors(target);

    const { prototype, ...descriptors } = ownPropertyDescriptors;

    Object.defineProperties(ModelClass, descriptors);

    return ModelClass as T;
  };
}

// TODO example not using mixin
// function Model(name: string) {
//   const _this = this;

//   return function <T extends GConstructor>(
//     target: T,
//     context: ClassDecoratorContext
//   ) {
//     if (context.kind === "class") {
//       Reflect.defineMetadata(MODEL_TYPE, name, target);

//       const ModelClass = class extends target {
//         constructor(...args: any[]) {
//           super(args);
//         }
//         serialize(tableItem: Record<string, any>): Record<string, any> {
//           let target = Object.getPrototypeOf(this);
//           const attrs: Record<string, string> = Reflect.getOwnMetadata(
//             MODEL_ATTRIBUTES,
//             target
//           );

//           const bla = _this;
//           debugger;

//           Object.entries(tableItem).forEach(([attr, value]) => {
//             const modelKey = attrs[attr];
//             target[`${modelKey}`] = value;
//           }, {});

//           debugger;
//           return target;
//         }
//       };
//       ModelClass.prototype = target.prototype; // (A)
//       return ModelClass;
//     }
//     debugger;
//     return target; // TODO is this needed?
//   };
// }

export default Model;
