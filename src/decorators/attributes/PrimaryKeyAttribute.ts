import type SingleTableDesign from "../../SingleTableDesign";
import Metadata from "../../metadata";
import { type PrimaryKey } from "../../types";

// TODO extend attribute props and Pick alias
interface PrimaryKeyAttributeProps {
  alias?: string;
}

function PrimaryKeyAttribute<T, K extends PrimaryKey>(
  props?: PrimaryKeyAttributeProps
) {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<T, K>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity: SingleTableDesign = Object.getPrototypeOf(this);

        Metadata.addPrimaryKeyAttribute(entity, {
          attributeName: context.name.toString(),
          ...props
        });
      });
    }
  };
}

export default PrimaryKeyAttribute;
