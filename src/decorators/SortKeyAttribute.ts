import Metadata from "../metadata";

interface SortKeyAttributeProps {
  alias: string;
}

// TODO move to shared location
type Brand<K, T> = K & { __brand: T };

export type SortKey = Brand<string, "SortKey">;

// TODO Share logic with Attribute
// TODO update so this adds the sort key to the Table metadata
//         and so that table meta data doesnt accept the sort key
function SortKeyAttribute<T, K extends SortKey>(props: SortKeyAttributeProps) {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<T, K>
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

export default SortKeyAttribute;
