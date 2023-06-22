import Metadata from "../metadata";
import SingleTableDesign from "../SingleTableDesign";

// TODO this is copied in multiple places
type ObjectType<T> = { new (): T };

interface BelongsToProps<T> {
  as: keyof T; // TODO Is this needed? Does this name make sense?
  // IDEA.... instead or foreign key being here... I make a decorator @ForeignKey that enforces it...
  foreignKey: string; // TODO how do I make it so that typescript requires this to be defined on owning model?
}

// TODO can I do this in a way where I dont set the metadata on every instance?
//    meaning this is only run once
function BelongsTo<T>(
  // TODO can I get better typeing on this so it knows it extends single table design?
  target: (type?: any) => ObjectType<T>,
  props: BelongsToProps<T>
) {
  return function (_value: undefined, context: ClassFieldDecoratorContext) {
    context.addInitializer(function () {
      const entity = Object.getPrototypeOf(this);

      const entityMetadata = Metadata.entities[entity.constructor.name];
      const propertyName = context.name.toString();
      if (!entityMetadata.relationships[propertyName]) {
        entityMetadata.relationships[propertyName] = {
          type: "BelongsTo",
          propertyName: context.name.toString(),
          target,
          targetPropertyName: props.foreignKey.toString()
        };
      }
    });
  };
}

export default BelongsTo;
