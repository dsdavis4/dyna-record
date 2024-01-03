import Metadata from "../metadata";
import type { ForeignKey } from "../types";

interface AttributeProps {
  alias: string;
}

// TODO add test for this, that attributes cant be of Type foreign key...
// TODO this should include NullableForeignKey, can I leverage exclude?
type NotForeignKey<T> = T extends ForeignKey ? never : T;

// TODO... Since I started, typescript released metadata property of deraotrs. Can I use it?
//        https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html#decorator-metadata

function Attribute<T, K>(props: AttributeProps) {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<T, NotForeignKey<K>>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity = Object.getPrototypeOf(this);

        Metadata.addEntityAttribute(entity.constructor.name, {
          attributeName: context.name.toString(),
          alias: props.alias
        });
      });
    }
  };
}

export default Attribute;
