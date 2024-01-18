import Metadata, { type EntityClass } from "../metadata";
import type SingleTableDesign from "../SingleTableDesign";

interface HasAndBelongsToManyProps<T extends SingleTableDesign> {
  // TODO I should do something like this to the other relationship types so that relationships are always set up correctly
  targetKey: keyof T;
}

// TODO add unit test that:
//     -   the value this is applied to put match the target
//     -    not undefined
//     -     an array

// TODO add a test that both side of the relationship is defined. EX => target key must exist on target

function HasAndBelongsToMany<
  T extends SingleTableDesign,
  K extends SingleTableDesign
>(
  // Function to obtain Class to which relationship is applied
  getTarget: () => EntityClass<T>,
  _props: HasAndBelongsToManyProps<T>
) {
  return (_value: undefined, context: ClassFieldDecoratorContext<K, T[]>) => {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity = Object.getPrototypeOf(this);

        Metadata.addEntityRelationship(entity.constructor.name, {
          type: "HasAndBelongsToMany",
          propertyName: context.name as keyof SingleTableDesign,
          target: getTarget()
          // foreignKey: props.foreignKey as keyof SingleTableDesign
        });
      });
    }
  };
}

export default HasAndBelongsToMany;
