import { type NativeScalarAttributeValue } from "@aws-sdk/util-dynamodb";
import type SingleTableDesign from "../../SingleTableDesign";
import Metadata from "../../metadata";
import type { AttributeProps } from "../types";

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
          nullable: false,
          serializer: (val: NativeScalarAttributeValue) => {
            if (typeof val === "string") {
              return new Date(val);
            }
            return val;
          }
        });
      });
    }
  };
}

export default DateAttribute;
