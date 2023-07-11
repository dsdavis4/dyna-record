import Metadata, { EntityClass } from "../metadata";
import SingleTableDesign from "../SingleTableDesign";

interface HasManyProps<T> {
  targetKey: keyof T;
}

function HasMany<T extends SingleTableDesign>(
  // Function to obtain Class to which relationship is applied
  target: () => EntityClass<T>,
  props: HasManyProps<T>
) {
  return (_value: undefined, context: ClassFieldDecoratorContext) => {
    context.addInitializer(function () {
      const entity = Object.getPrototypeOf(this);

      Metadata.addEntityRelationship(entity.constructor.name, {
        type: "HasMany",
        propertyName: context.name as keyof SingleTableDesign,
        target: target(),
        targetKey: props.targetKey as keyof SingleTableDesign
      });
    });
  };
}

export default HasMany;
