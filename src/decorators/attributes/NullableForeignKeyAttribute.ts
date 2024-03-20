import type SingleTableDesign from "../../SingleTableDesign";
import Metadata from "../../metadata";
import type { NullableForeignKey } from "../../types";
import type { AttributeOptions } from "../types";

// TODO typedoc... make sure to link AttributeOptions like I did for ForeignKeyAttribute Attribute

// TODO dry up with ForeignKeyAttribute
function NullableForeignKeyAttribute<T>(props?: AttributeOptions) {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<T, NullableForeignKey>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity: SingleTableDesign = Object.getPrototypeOf(this);

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
