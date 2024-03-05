import type SingleTableDesign from "../../SingleTableDesign";
import Metadata from "../../metadata";
import { type PrimaryKey } from "../../types";
import type { AttributeAliasOnlyProp } from "../types";

// TODO typedoc... make sure to link AttributeProps like I did for ForeignKeyAttribute Attribute

function PrimaryKeyAttribute<T, K extends PrimaryKey>(
  props?: AttributeAliasOnlyProp
) {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<T, K>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity: SingleTableDesign = Object.getPrototypeOf(this);

        Metadata.addPrimaryKeyAttribute(entity, {
          attributeName: context.name.toString(),
          ...props
        });
      });
    }
  };
}

export default PrimaryKeyAttribute;
