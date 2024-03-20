import type SingleTableDesign from "../../SingleTableDesign";
import Metadata from "../../metadata";
import type { ForeignKey } from "../../types";
import type { AttributeOptions } from "../types";

// TODO typedoc... make sure to link AttributeOptions like I did for Date Attribute

// TODO... Since I started, typescript released metadata property of deraotrs. Can I use it?
//        https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html#decorator-metadata

// TODO dry up with Attribute
function ForeignKeyAttribute<T>(props?: AttributeOptions) {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<T, ForeignKey>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity: SingleTableDesign = Object.getPrototypeOf(this);

        Metadata.addEntityAttribute(entity.constructor.name, {
          attributeName: context.name.toString(),
          nullable: false,
          ...props
        });
      });
    }
  };
}

export default ForeignKeyAttribute;
