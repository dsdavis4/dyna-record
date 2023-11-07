import Metadata, { type EntityClass } from "../metadata";
import type SingleTableDesign from "../SingleTableDesign";

interface HasOneProps<T> {
  foreignKey: keyof T; // TODO for all relationships forgeinKeys this should be updated to be a speciifc type... Just not allot relationship attributes...
}

function HasOne<T extends SingleTableDesign, K extends SingleTableDesign>(
  // Function to obtain Class to which relationship is applied
  getTarget: () => EntityClass<T>,
  props: HasOneProps<T>
) {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<K, T | undefined>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity = Object.getPrototypeOf(this);

        Metadata.addEntityRelationship(entity.constructor.name, {
          type: "HasOne",
          propertyName: context.name as keyof SingleTableDesign,
          target: getTarget(),
          foreignKey: props.foreignKey as keyof SingleTableDesign
        });
      });
    }
  };
}

export default HasOne;
