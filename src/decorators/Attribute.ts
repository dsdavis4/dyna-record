import Metadata from "../metadata";

interface AttributeProps {
  alias: string;
}

function Attribute<T>(props: AttributeProps) {
  return function (_value: undefined, context: ClassFieldDecoratorContext<T>) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity = Object.getPrototypeOf(this);

        Metadata.addEntityAttribute(entity.constructor.name, {
          attributeName: context.name.toString(),
          alias: props.alias
        });
      });
    }
  };
}

export default Attribute;
