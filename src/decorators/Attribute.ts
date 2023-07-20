import Metadata from "../metadata";

type DataType = "date" | "string" | "number" | "bool";

interface AttributeProps {
  alias: string;
  type?: DataType;
}

// type InferType<num extends DataType = DataType> = {};

// const asInferType = <N extends DataType>(m: InferType<N>) => m;

// const first = asMyType("bool");

// type BlaType<T> = T extends "date"
//   ? Date
//   : T extends "string"
//   ? string
//   : T extends "number"
//   ? number
//   : T extends "bool"
//   ? boolean
//   : never;

// type InferType<T> = T extends { type: infer I } ? BlaType<I> : never;

// type InferType<T> = T extends infer I ? I : never;

// type InferType<T> = T extends infer I ? I : never;

function Attribute<T, K>(props: AttributeProps) {
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

export default Attribute;
