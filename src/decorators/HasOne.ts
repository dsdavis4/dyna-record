import Metadata from "../metadata";
import SingleTableDesign from "../SingleTableDesign";

interface HasOneProps<T> {
  foreignKey: keyof T;
}

function HasOne<T extends SingleTableDesign>(
  // Function to obtain Class to which relationship is applied
  target: Function,
  props: HasOneProps<T>
) {
  return function (_value: undefined, context: ClassFieldDecoratorContext<T>) {
    context.addInitializer(function () {
      const entity = Object.getPrototypeOf(this);

      const entityMetadata = Metadata.entities[entity.constructor.name];
      const propertyName = context.name.toString();
      if (!entityMetadata.relationships[propertyName]) {
        entityMetadata.relationships[propertyName] = {
          type: "HasOne",
          propertyName: context.name.toString(),
          target: target(),
          foreignKey: props.foreignKey.toString()
        };
      }
    });
  };
}

export default HasOne;
