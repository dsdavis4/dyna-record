import type SingleTableDesign from "../SingleTableDesign";
import Metadata from "../metadata";
import type { ForeignKey, NullableForeignKey, Optional } from "../types";
import type { AttributeProps } from "./types";

/**
 * Do not allow ForeignKey or NullableForeignKey types when using the Attribute decorator
 */
type NotForeignKey<T> = T extends ForeignKey | NullableForeignKey
  ? never
  : Optional<T>;

// TODO... Since I started, typescript released metadata property of deraotrs. Can I use it?
//        https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html#decorator-metadata

function NullableAttribute<T, K>(props: AttributeProps) {
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
