import Metadata, { type ForeignKeyAttribute } from "../../metadata";
import type SingleTableDesign from "../../SingleTableDesign";
import type { EntityClass } from "../../types";
import { type ForeignEntityAttribute } from "../types";

interface HasManyProps<T extends SingleTableDesign> {
  foreignKey: ForeignEntityAttribute<T>;
}

function HasMany<T extends SingleTableDesign, K extends SingleTableDesign>(
  // Function to obtain Class to which relationship is applied
  getTarget: () => EntityClass<T>,
  props: HasManyProps<T>
) {
  return (_value: undefined, context: ClassFieldDecoratorContext<K, T[]>) => {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity: SingleTableDesign = Object.getPrototypeOf(this);

        Metadata.addEntityRelationship(entity.constructor.name, {
          type: "HasMany",
          propertyName: context.name as keyof SingleTableDesign,
          target: getTarget(),
          foreignKey: props.foreignKey as ForeignKeyAttribute
        });
      });
    }
  };
}

export default HasMany;
