import Metadata from "../metadata";

interface AttributeProps {
  alias: string;
}

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
          Metadata.tables[entityMetadata.tableName];
        }
      });
    }
  };
}

export default Attribute;
