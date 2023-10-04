import Metadata from "../metadata";

interface PrimaryKeyAttributeProps {
  alias: string;
}

// TODO move to shared location
type Brand<K, T> = K & { __brand: T };

export type PrimaryKey = Brand<string, "PrimaryKey">;

// TODO Share logic with Attribute
// TODO update so this adds the primary key to the Table metadata
//         and so that table meta data doesnt accept the primary key
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

        Metadata.addEntityAttribute(entity.constructor.name, {
          attributeName: context.name.toString(),
          alias: props.alias
        });
      });
    }
  };
}

export default PrimaryKeyAttribute;
