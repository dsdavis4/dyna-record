import Metadata from "../metadata";

type ObjectType<T> = { new (): T };

interface HasManyProps<T> {
  foreignKey: keyof T;
}

// TODO can I do this in a way where I dont set the metadata on every instance?
//    meaning this is only run once
function HasMany<T>(
  target: (type?: any) => ObjectType<T>,
  props: HasManyProps<T>
) {
  return (_value: undefined, context: ClassFieldDecoratorContext) => {
    // TODO make function for this? since its copied in Belongsto
    context.addInitializer(function () {
      const entity = Object.getPrototypeOf(this);

      const entityMetadata = Metadata.entities[entity.constructor.name];
      const propertyName = context.name.toString();

      if (!entityMetadata.relationships[propertyName]) {
        entityMetadata.relationships[propertyName] = {
          type: "HasMany",
          propertyName: context.name.toString(),
          target,
          targetPropertyName: props.foreignKey.toString()
        };
      }
    });
  };
}

export default HasMany;
