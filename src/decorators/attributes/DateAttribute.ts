import type SingleTableDesign from "../../SingleTableDesign";
import Metadata from "../../metadata";
import type { AttributeProps } from "../types";
// TODO I might want to use this everywhere insteaof of NativeAttributeValue

// TODO add test that only like date is not allowed
// TODO add test it cant be optional
// TODO typedoc about why this is here
function DateAttribute<T, K extends Date>(props: AttributeProps) {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<T, K>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity: SingleTableDesign = Object.getPrototypeOf(this);

        Metadata.addEntityAttribute(entity.constructor.name, {
          attributeName: context.name.toString(),
          alias: props.alias,
          nullable: false
        });
      });
    }
  };
}

export default DateAttribute;
