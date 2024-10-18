import type DynaRecord from "../../DynaRecord";
import Metadata from "../../metadata";

// TODO typedoc
function IdAttribute<T extends DynaRecord, K extends string>(
  _value: undefined,
  context: ClassFieldDecoratorContext<T, K>
) {
  return function (this: T, value: K) {
    Metadata.addEntityIdField(this.constructor.name, context.name.toString());
    return value;
  };
}

export default IdAttribute;
