import Metadata, { EntityClass } from "../../metadata";
import SingleTableDesign from "../../SingleTableDesign";

interface HasManyProps<T> {
  targetKey: keyof T;
}

function HasMany<T extends SingleTableDesign, K extends SingleTableDesign>(
  // Function to obtain Class to which relationship is applied
  getTarget: () => EntityClass<T>,
  props: HasManyProps<T>
) {
  return (_value: undefined, context: ClassFieldDecoratorContext<K, T[]>) => {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity = Object.getPrototypeOf(this);

        Metadata.addEntityRelationship(entity.constructor.name, {
          type: "HasMany",
          propertyName: context.name as keyof SingleTableDesign,
          target: getTarget(),
          targetKey: props.targetKey as keyof SingleTableDesign
        });
      });
    }
  };
}

export default HasMany;
