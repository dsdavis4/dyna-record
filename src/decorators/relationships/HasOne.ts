import Metadata from "../../metadata";
import type NoOrm from "../../NoOrm";
import type { EntityClass, ForeignKeyAttribute, Optional } from "../../types";
import { type ForeignEntityAttribute } from "../types";

interface HasOneProps<T extends NoOrm> {
  foreignKey: ForeignEntityAttribute<T> & keyof T;
}

function HasOne<T extends NoOrm, K extends NoOrm>(
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
        const entity: NoOrm = Object.getPrototypeOf(this);

        Metadata.addEntityRelationship(entity.constructor.name, {
          type: "HasOne",
          propertyName: context.name as keyof NoOrm,
          target: getTarget(),
          foreignKey: props.foreignKey as ForeignKeyAttribute
        });
      });
    }
  };
}

export default HasOne;
