import type SingleTableDesign from "../../SingleTableDesign";
import Metadata from "../../metadata";
import type { ForeignKey, NullableForeignKey, Optional } from "../../types";
import type { AttributeProps } from "../types";
import { type NativeScalarAttributeValue } from "@aws-sdk/util-dynamodb";

/**
 * Do not allow ForeignKey or NullableForeignKey types when using the Attribute decorator
 */
type NotForeignKey<T> = T extends ForeignKey | NullableForeignKey
  ? never
  : Optional<T>;

// TODO add test that stuff like date is not allowed
// TODO typedoc about supported properties
function NullableAttribute<T, K extends NativeScalarAttributeValue>(
  props: AttributeProps
) {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<T, NotForeignKey<K>>
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

export default NullableAttribute;
