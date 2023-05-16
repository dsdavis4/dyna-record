import Metadata from "../metadata";

interface AttributeProps {
  alias: string;
}

// TODO can I do this in a way where I dont set the metadata on every instance?
//    meaning this is only run once
function Attribute<T>(props: AttributeProps) {
  return function (_value: undefined, context: ClassFieldDecoratorContext<T>) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity = Object.getPrototypeOf(this);

        const entityMetadata = Metadata.entities[entity.constructor.name];

        // TODO would I benefit from storing classes?
        if (!entityMetadata.attributes[props.alias]) {
          entityMetadata.attributes[props.alias] = {
            name: context.name.toString()
          };
        }
      });
    }
  };
}

export default Attribute;
