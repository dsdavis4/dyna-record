import type DynaRecord from "../../DynaRecord";
import Metadata from "../../metadata";

// TODO test this can only be appleid to strings
// TODO test they cant be nullable
function IdAttribute<T extends DynaRecord, K extends string>(
  _value: undefined,
  context: ClassFieldDecoratorContext<T, K>
) {
  return function (this: T, value: K) {
    // TODO should I update other places to not use the objet.get prototype of?
    Metadata.addEntityIdField(this.constructor.name, context.name.toString());
    return value;
  };
}

export default IdAttribute;
