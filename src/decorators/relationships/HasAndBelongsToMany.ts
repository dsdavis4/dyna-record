import Metadata from "../../metadata";
import { type JoinTable } from "../../relationships";
import type SingleTableDesign from "../../SingleTableDesign";
import type { EntityClass } from "../../types";

/**
 * The key on the related Entity which is associated with this Entity
 */
type TargetKey<T, U> = {
  [K in keyof T]: T[K] extends U[] ? K : never;
}[keyof T];

/**
 * Represents a function returning metadata for a join table.
 * @template J The type of the join table.
 */
type ThroughFunction<
  J extends JoinTable<SingleTableDesign, SingleTableDesign>
> = () => {
  /**
   * The constructor function for the join table.
   * @param {...any[]} args Constructor arguments for the join table.
   * @returns {J} An instance of the join table.
   */
  joinTable: new (...args: any[]) => J;
  /**
   * The key representing the foreign key property of the join table.
   */
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
  /**
   * The JoinTable properties this relationship is associated through
   */
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
        const entity: SingleTableDesign = Object.getPrototypeOf(this);
        const target = getTarget();
        const { joinTable, foreignKey } = props.through();

        Metadata.addEntityRelationship(entity.constructor.name, {
          type: "HasAndBelongsToMany",
          propertyName: context.name as keyof SingleTableDesign,
          target,
          joinTableName: joinTable.name
        });

        Metadata.addJoinTable(joinTable.name, {
          entity: target,
          foreignKey: foreignKey as keyof JoinTable<
            SingleTableDesign,
            SingleTableDesign
          >
        });
      });
    }
  };
}

export default HasAndBelongsToMany;
