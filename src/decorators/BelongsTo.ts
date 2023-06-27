import Metadata from "../metadata";

interface BelongsToProps<T> {
  foreignKey: keyof T;
}

function BelongsTo<T>(
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
        entityMetadata.relationships[propertyName] = {
          type: "BelongsTo",
          propertyName: context.name.toString(),
          target, // TODO should I call target here? And make it  type extending single table design so I get better typeahead in other files?
          foreignKey: props.foreignKey.toString()
        };
      }
    });
  };
}

export default BelongsTo;
