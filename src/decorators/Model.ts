import { MODEL_TYPE } from "../symbols";
import ModelMixin from "../mixins/Model";

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

export default Model;
