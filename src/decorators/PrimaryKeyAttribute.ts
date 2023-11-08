import Metadata from "../metadata";
import { type PrimaryKey } from "../types";

interface PrimaryKeyAttributeProps {
  alias: string;
}

// TODO Share logic with Attribute
// TODO Share logic with Attribute
// TODO dry up with sort key
function PrimaryKeyAttribute<T, K extends PrimaryKey>(
  props: PrimaryKeyAttributeProps
) {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<T, K>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity = Object.getPrototypeOf(this);

        Metadata.addPrimaryKeyAttribute(entity, {
          attributeName: context.name.toString(),
          alias: props.alias
        });
      });
    }
  };
}

export default PrimaryKeyAttribute;
