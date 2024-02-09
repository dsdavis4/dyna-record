import type SingleTableDesign from "../../SingleTableDesign";
import Metadata from "../../metadata";
import type { ForeignKey, NullableForeignKey } from "../../types";
import type { AttributeProps } from "../types";
// TODO I might want to use this everywhere insteaof of NativeAttributeValue
import { type NativeScalarAttributeValue } from "@aws-sdk/util-dynamodb";

/**
 * Do not allow ForeignKey or NullableForeignKey types when using the Attribute decorator
 */
type NotForeignKey<T> = T extends ForeignKey | NullableForeignKey ? never : T;

// TODO add test that stuff like date is not allowed
// TODO typedoc about supported properties
// TODO should this be named NativeAttribute ?
function Attribute<T, K extends NativeScalarAttributeValue>(
  props: AttributeProps
) {
  return function (
    _value: undefined,
    // TODO START HERE... make sure this is only allowing NativeAttributeValue
    // Then make DateAttribute and NullableDateAttribute with comments that they need special care since dynamo doesnt support them
    context: ClassFieldDecoratorContext<T, NotForeignKey<K>>
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

export default Attribute;
