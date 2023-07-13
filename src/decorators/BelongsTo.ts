import Metadata, { EntityClass } from "../metadata";
import SingleTableDesign from "../SingleTableDesign";

interface BelongsToProps<T> {
  foreignKey: keyof T;
}

function BelongsTo<T extends SingleTableDesign, K extends SingleTableDesign>(
  // Function to obtain Class to which relationship is applied
  getTarget: () => EntityClass<K>,
  props: BelongsToProps<T>
) {
  return function (_value: undefined, context: ClassFieldDecoratorContext<T>) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity = Object.getPrototypeOf(this);

        Metadata.addEntityRelationship(entity.constructor.name, {
          type: "BelongsTo",
          propertyName: context.name as keyof SingleTableDesign,
          target: getTarget(),
          foreignKey: props.foreignKey as keyof SingleTableDesign
        });
      });
    }
  };
}

export default BelongsTo;
