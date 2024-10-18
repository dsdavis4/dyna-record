import Metadata from "../../metadata";
import { type JoinTable } from "../../relationships";
import type DynaRecord from "../../DynaRecord";
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
type ThroughFunction<J extends JoinTable<DynaRecord, DynaRecord>> = () => {
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
  T extends DynaRecord,
  K extends DynaRecord,
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

/**
 * A decorator for defining a many-to-many relationship between entities in a single-table design ORM system. This relationship is facilitated through a join table, representing the connection between the two entities. The decorator simplifies the management of such relationships by automating the setup and handling of the join table metadata, thereby enabling seamless querying and manipulation of related entities.
 *
 * @template T The source entity class the decorator is applied to.
 * @template K The target entity class that T has a many-to-many relationship with.
 * @template J The join table entity class that associates T with K.
 * @template L The join table entity class that associates K with T, allowing for bidirectional relationships.
 * @param getTarget A function that returns the constructor of the target entity class. This enables lazy evaluation and avoids circular dependency issues.
 * @param props Configuration options for the many-to-many relationship, including the key on the related entity and the details of the join table (through a "through" function) that facilitates the relationship.
 * @returns A class field decorator function that, when applied to a field, registers the many-to-many relationship in the ORM's metadata system. This registration includes information about the join table and the relationship's configuration, essential for the ORM to handle related entities correctly.
 *
 * Usage example:
 * ```typescript
 * class User extends TableClass {
 *   @HasAndBelongsToMany(() => Group, {
 *     targetKey: 'users',
 *     through: () => ({
 *       joinTable: UserGroup,
 *       foreignKey: 'userId'
 *     })
 *   })
 *   public groups: Group[];
 * }
 *
 * class Group extends TableClass {
 *   @HasAndBelongsToMany(() => User, {
 *     targetKey: 'groups',
 *     through: () => ({
 *       joinTable: UserGroup,
 *       foreignKey: 'groupId'
 *     })
 *   })
 *   public users: User[];
 * }
 *
 * class UserGroup extends JoinTable<User, Group> {
 *    public readonly userId: ForeignKey;
 *    public readonly groupId: ForeignKey;
 * }
 * ```
 * In this example, `User` entities are related to `Group` entities through a many-to-many relationship, with `UserGroup` serving as the join table. The decorator indicates this relationship, allowing for efficient querying and manipulation of related entities.
 */
function HasAndBelongsToMany<
  T extends DynaRecord,
  K extends DynaRecord,
  J extends JoinTable<T, K>,
  L extends JoinTable<K, T>
>(
  getTarget: () => EntityClass<T>,
  props: HasAndBelongsToManyProps<T, K, J, L>
) {
  return (_value: undefined, context: ClassFieldDecoratorContext<K, T[]>) => {
    if (context.kind === "field") {
      context.addInitializer(function (this: K) {
        const target = getTarget();
        const { joinTable, foreignKey } = props.through();

        Metadata.addEntityRelationship(this.constructor.name, {
          type: "HasAndBelongsToMany",
          propertyName: context.name as keyof DynaRecord,
          target,
          joinTableName: joinTable.name
        });

        Metadata.addJoinTable(joinTable.name, {
          entity: target,
          foreignKey: foreignKey as keyof JoinTable<DynaRecord, DynaRecord>
        });
      });
    }
  };
}

export default HasAndBelongsToMany;
