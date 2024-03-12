import Metadata, { type ForeignKeyAttribute } from "../../metadata";
import type SingleTableDesign from "../../SingleTableDesign";
import type { EntityClass, Optional } from "../../types";
import { type ForeignEntityAttribute } from "../types";

interface HasOneProps<T extends SingleTableDesign> {
  foreignKey: ForeignEntityAttribute<T> & keyof T;
}

function HasOne<T extends SingleTableDesign, K extends SingleTableDesign>(
  // Function to obtain Class to which relationship is applied
  getTarget: () => EntityClass<T>,
  props: HasOneProps<T>
) {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<K, Optional<T>>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity: SingleTableDesign = Object.getPrototypeOf(this);

        Metadata.addEntityRelationship(entity.constructor.name, {
          type: "HasOne",
          propertyName: context.name as keyof SingleTableDesign,
          target: getTarget(),
          foreignKey: props.foreignKey as ForeignKeyAttribute
        });
      });
    }
  };
}

export default HasOne;
