import Metadata from "../metadata";
import BelongsToModel from "../relationships/BelongsTo";
import SingleTableDesign from "../SingleTableDesign";

interface BelongsToProps<T> {
  foreignKey: keyof T;
}

function BelongsTo<T extends SingleTableDesign>(
  // TODO can I get better typeing on this so it knows it extends single table design?
  target: Function,
  props: BelongsToProps<T>
) {
  return function (_value: undefined, context: ClassFieldDecoratorContext<T>) {
    context.addInitializer(function () {
      const entity = Object.getPrototypeOf(this);

      const entityMetadata = Metadata.entities[entity.constructor.name];
      const propertyName = context.name.toString();
      if (!entityMetadata.relationships[propertyName]) {
        // TODO can I do keyof? like on belngs to model..
        entityMetadata.relationships[propertyName] = {
          type: "BelongsTo",
          propertyName: context.name.toString(),
          target: target(),
          foreignKey: props.foreignKey.toString()
        };

        const bla = new BelongsToModel({
          entityClass: target(),
          propertyName: context.name as keyof SingleTableDesign,
          foreignKey: props.foreignKey as keyof SingleTableDesign
        });
      }
    });
  };
}

export default BelongsTo;
