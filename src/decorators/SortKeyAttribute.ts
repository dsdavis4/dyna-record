import Metadata from "../metadata";
import { type SortKey } from "../types";

interface SortKeyAttributeProps {
  alias: string;
}

// TODO Share logic with Attribute
// TODO dry up with primary key
function SortKeyAttribute<T, K extends SortKey>(props: SortKeyAttributeProps) {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<T, K>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity = Object.getPrototypeOf(this);

        Metadata.addSortKeyAttribute(entity, {
          attributeName: context.name.toString(),
          alias: props.alias
        });
      });
    }
  };
}

export default SortKeyAttribute;
