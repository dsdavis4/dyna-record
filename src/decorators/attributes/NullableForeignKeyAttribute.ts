import type NoOrm from "../../NoOrm";
import Metadata from "../../metadata";
import type { NullableForeignKey } from "../../types";
import type { AttributeOptions } from "../types";

// TODO typedoc... make sure to link AttributeOptions like I did for ForeignKeyAttribute Attribute

function NullableForeignKeyAttribute<T>(props?: AttributeOptions) {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<T, NullableForeignKey>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity: NoOrm = Object.getPrototypeOf(this);

        Metadata.addEntityAttribute(entity.constructor.name, {
          attributeName: context.name.toString(),
          nullable: true,
          ...props
        });
      });
    }
  };
}

export default NullableForeignKeyAttribute;
