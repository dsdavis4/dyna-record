import { MODEL_ATTRIBUTES } from "../symbols";

interface AttributeProps {
  alias: string;
}

// TODO remove this link: https://2ality.com/2022/10/javascript-decorators.html#read-only-fields
// TODO can I do this without metadata? Setting values on the class instead?
function Attribute(props: AttributeProps) {
  return function (_value: undefined, context: ClassFieldDecoratorContext) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const target = Object.getPrototypeOf(this);
        target[MODEL_ATTRIBUTES] = target[MODEL_ATTRIBUTES] ?? [];
        // TODO should I build an object instead? {id: {alias: ...etc}}
        target[MODEL_ATTRIBUTES].push({
          name: context.name,
          alias: props.alias
        });
        Reflect.defineMetadata(
          MODEL_ATTRIBUTES,
          target[MODEL_ATTRIBUTES],
          target
        );
      });
    }
  };
}

export default Attribute;
