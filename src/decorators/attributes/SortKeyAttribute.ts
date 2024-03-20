import type SingleTableDesign from "../../SingleTableDesign";
import Metadata from "../../metadata";
import { type SortKey } from "../../types";
import type { AttributeOptions } from "../types";

// TODO typedoc... make sure to link AttributeOptions like I did for ForeignKeyAttribute Attribute

function SortKeyAttribute<T, K extends SortKey>(props?: AttributeOptions) {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<T, K>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity: SingleTableDesign = Object.getPrototypeOf(this);

        Metadata.addSortKeyAttribute(entity, {
          attributeName: context.name.toString(),
          ...props
        });
      });
    }
  };
}

export default SortKeyAttribute;
