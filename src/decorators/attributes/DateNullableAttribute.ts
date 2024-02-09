import type SingleTableDesign from "../../SingleTableDesign";
import Metadata from "../../metadata";
import type { Optional } from "../../types";
import type { AttributeProps } from "../types";

// TODO add test that only like date is not allowed
// TODO add test it can be optional
// TODO typedoc about why this is here
function DateNullableAttribute<T, K extends Date>(props: AttributeProps) {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<T, Optional<K>>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity: SingleTableDesign = Object.getPrototypeOf(this);

        Metadata.addEntityAttribute(entity.constructor.name, {
          attributeName: context.name.toString(),
          alias: props.alias,
          nullable: true
        });
      });
    }
  };
}

export default DateNullableAttribute;
