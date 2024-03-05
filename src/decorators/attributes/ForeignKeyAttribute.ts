import type SingleTableDesign from "../../SingleTableDesign";
import Metadata from "../../metadata";
import type { ForeignKey } from "../../types";
import type { AttributeAliasOnlyProp } from "../types";

// TODO... Since I started, typescript released metadata property of deraotrs. Can I use it?
//        https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html#decorator-metadata

// TODO dry up with Attribute
function ForeignKeyAttribute<T>(props?: AttributeAliasOnlyProp) {
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
