import { MODEL_ATTRIBUTES } from "../symbols";

// TODO fix this so that type for value is undefined per link below
// TODO remove this link: https://2ality.com/2022/10/javascript-decorators.html#read-only-fields
function Attribute(value: any, context: ClassFieldDecoratorContext) {
  if (context.kind === "field") {
    return function () {
      const target = Object.getPrototypeOf(this);
      this[MODEL_ATTRIBUTES] = this[MODEL_ATTRIBUTES] ?? [];
      this[MODEL_ATTRIBUTES].push(context.name);
      Reflect.defineMetadata(MODEL_ATTRIBUTES, this[MODEL_ATTRIBUTES], target);
    };
  }
  return value;
}

export default Attribute;
