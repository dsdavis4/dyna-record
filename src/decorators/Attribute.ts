import { ENTITY_ATTRIBUTES } from "../symbols";

interface AttributeProps {
  alias: string;
}

// TODO can I do this in a way where I dont set the metadata on every instance?
//    meaning this is only run once
function Attribute(props: AttributeProps) {
  return function (_value: undefined, context: ClassFieldDecoratorContext) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const target = Object.getPrototypeOf(this);
        target[ENTITY_ATTRIBUTES] = target[ENTITY_ATTRIBUTES] ?? {};
        target[ENTITY_ATTRIBUTES][props.alias] = context.name;
        Reflect.defineMetadata(
          ENTITY_ATTRIBUTES,
          target[ENTITY_ATTRIBUTES],
          target
        );
      });
    }
  };
}

export default Attribute;
