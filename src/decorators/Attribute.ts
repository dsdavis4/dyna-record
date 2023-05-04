import { ENTITY_ATTRIBUTES } from "../symbols";
import Metadata from "../metadata";

interface AttributeProps {
  alias: string;
}

// TODO can I do this in a way where I dont set the metadata on every instance?
//    meaning this is only run once
// At least check if its not already initialized
function Attribute(props: AttributeProps) {
  return (_value: undefined, context: ClassFieldDecoratorContext) => {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity = Object.getPrototypeOf(this);

        const entityMetadata = Metadata.entities[entity.constructor.name];
        entityMetadata.attributes[props.alias] = {
          name: context.name.toString()
        };
      });
    }
  };
}

export default Attribute;
