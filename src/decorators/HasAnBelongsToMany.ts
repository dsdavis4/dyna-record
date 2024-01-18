import Metadata, { type EntityClass } from "../metadata";
import type SingleTableDesign from "../SingleTableDesign";
import { type ForeignEntityAttribute } from "./types";

interface HasAndBelongsToManyProps<T extends SingleTableDesign> {
  TODO: ForeignEntityAttribute<T>;
}

function HasAndBelongsToMany<
  T extends SingleTableDesign,
  K extends SingleTableDesign
>(
  // Function to obtain Class to which relationship is applied
  getTarget: () => EntityClass<T>,
  props: HasAndBelongsToManyProps<T>
) {
  return (_value: undefined, context: ClassFieldDecoratorContext<K, T[]>) => {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity = Object.getPrototypeOf(this);

        Metadata.addEntityRelationship(entity.constructor.name, {
          type: "HasAndBelongsToMany",
          propertyName: context.name as keyof SingleTableDesign,
          target: getTarget()
          // foreignKey: props.foreignKey as keyof SingleTableDesign
        });
      });
    }
  };
}

export default HasAndBelongsToMany;
