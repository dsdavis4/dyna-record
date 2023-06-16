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
    Metadata.relationships.push({
      type: "HasMany",
      // propertyName: context.name as keyof ObjectType<T>,
      propertyName: context.name.toString(),
      target
      // targetPropertyName: props.foreignKey.toString()
      // props
    });

    // context.addInitializer(function () {
    //   debugger;
    // });
  };
}

export default HasMany;
