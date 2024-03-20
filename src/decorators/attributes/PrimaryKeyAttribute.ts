import type NoOrm from "../../NoOrm";
import Metadata from "../../metadata";
import { type PrimaryKey } from "../../types";
import type { AttributeOptions } from "../types";

// TODO typedoc... make sure to link AttributeOptions like I did for ForeignKeyAttribute Attribute

function PrimaryKeyAttribute<T, K extends PrimaryKey>(
  props?: AttributeOptions
) {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<T, K>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity: NoOrm = Object.getPrototypeOf(this);

        Metadata.addPrimaryKeyAttribute(entity, {
          attributeName: context.name.toString(),
          ...props
        });
      });
    }
  };
}

export default PrimaryKeyAttribute;
