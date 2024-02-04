import Metadata, { type EntityClass } from "../metadata";
import { type JoinTable } from "../relationships";
import type SingleTableDesign from "../SingleTableDesign";

// TODO typedoc
type TargetKey<T, U> = {
  [K in keyof T]: T[K] extends U[] ? K : never;
}[keyof T];

// TODO can I not use any/
// TODO typedoc
type ThroughFunction<
  J extends JoinTable<SingleTableDesign, SingleTableDesign>
> = () => {
  // TODO update to reflect actual args
  joinTable: new (...args: any[]) => J;
  foreignKey: keyof J;
};

interface HasAndBelongsToManyProps<
  T extends SingleTableDesign,
  K extends SingleTableDesign,
  J extends JoinTable<T, K>,
  L extends JoinTable<K, T>
> {
  /**
   * The key of the model to add an association to.
   */
  targetKey: TargetKey<T, K>;
  // TODO tsdoc
  through: ThroughFunction<J> | ThroughFunction<L>;
}

function HasAndBelongsToMany<
  T extends SingleTableDesign,
  K extends SingleTableDesign,
  J extends JoinTable<T, K>,
  L extends JoinTable<K, T>
>(
  // Function to obtain Class to which relationship is applied
  getTarget: () => EntityClass<T>,
  props: HasAndBelongsToManyProps<T, K, J, L>
) {
  return (_value: undefined, context: ClassFieldDecoratorContext<K, T[]>) => {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity = Object.getPrototypeOf(this);

        const target = getTarget();

        Metadata.addEntityRelationship(entity.constructor.name, {
          type: "HasAndBelongsToMany",
          propertyName: context.name as keyof SingleTableDesign,
          target
        });

        Metadata.addJoinTable(props.through().joinTable.name, {
          entity: target,
          foreignKey: props.through().foreignKey as keyof JoinTable<
            SingleTableDesign,
            SingleTableDesign
          >
        });
      });
    }
  };
}

export default HasAndBelongsToMany;
