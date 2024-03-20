import Metadata from "../../metadata";
import type NoOrm from "../../NoOrm";
import type { EntityClass, ForeignKeyAttribute } from "../../types";
import { type ForeignEntityAttribute } from "../types";

interface HasManyProps<T extends NoOrm> {
  foreignKey: ForeignEntityAttribute<T>;
}

function HasMany<T extends NoOrm, K extends NoOrm>(
  // Function to obtain Class to which relationship is applied
  getTarget: () => EntityClass<T>,
  props: HasManyProps<T>
) {
  return (_value: undefined, context: ClassFieldDecoratorContext<K, T[]>) => {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity: NoOrm = Object.getPrototypeOf(this);

        Metadata.addEntityRelationship(entity.constructor.name, {
          type: "HasMany",
          propertyName: context.name as keyof NoOrm,
          target: getTarget(),
          foreignKey: props.foreignKey as ForeignKeyAttribute
        });
      });
    }
  };
}

export default HasMany;
