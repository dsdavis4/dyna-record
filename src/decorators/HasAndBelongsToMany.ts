import Metadata, { type EntityClass } from "../metadata";
import type SingleTableDesign from "../SingleTableDesign";

type TargetKey<T, U> = {
  [K in keyof T]: T[K] extends U[] ? K : never;
}[keyof T];

interface HasAndBelongsToManyProps<
  T extends SingleTableDesign,
  U extends SingleTableDesign
> {
  // TODO I should do something like this to the other relationship types so that relationships are always set up correctly
  /**
   * The key of the model to add an association to.
   */
  targetKey: TargetKey<T, U>;
}

function HasAndBelongsToMany<
  T extends SingleTableDesign,
  K extends SingleTableDesign
>(
  // Function to obtain Class to which relationship is applied
  getTarget: () => EntityClass<T>,
  _props: HasAndBelongsToManyProps<T, K>
) {
  return (_value: undefined, context: ClassFieldDecoratorContext<K, T[]>) => {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity = Object.getPrototypeOf(this);

        Metadata.addEntityRelationship(entity.constructor.name, {
          type: "HasAndBelongsToMany",
          propertyName: context.name as keyof SingleTableDesign,
          target: getTarget()
        });
      });
    }
  };
}

export default HasAndBelongsToMany;
