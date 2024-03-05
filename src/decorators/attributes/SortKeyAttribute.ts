import type SingleTableDesign from "../../SingleTableDesign";
import Metadata from "../../metadata";
import { type SortKey } from "../../types";

// TODO extend attribute props and Pick alias
interface SortKeyAttributeProps {
  alias?: string;
}

function SortKeyAttribute<T, K extends SortKey>(props?: SortKeyAttributeProps) {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<T, K>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity: SingleTableDesign = Object.getPrototypeOf(this);

        Metadata.addSortKeyAttribute(entity, {
          attributeName: context.name.toString(),
          ...props
        });
      });
    }
  };
}

export default SortKeyAttribute;
