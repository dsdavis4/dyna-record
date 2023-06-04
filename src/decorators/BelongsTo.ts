import Metadata from "../metadata";

// TODO this is copied in multiple places
type ObjectType<T> = { new (): T };

interface BelongsToProps<T> {
  as: keyof T; // TODO Does this name make sense?
}

// TODO can I do this in a way where I dont set the metadata on every instance?
//    meaning this is only run once
function BelongsTo<T>(
  target: (type?: any) => ObjectType<T>,
  props: BelongsToProps<T>
) {
  return function (_value: undefined, context: ClassFieldDecoratorContext) {
    Metadata.relationships.push({
      type: "BelongsTo",
      propertyName: context.name.toString(),
      target
      // targetPropertyName: props.as.toString()
    });
  };
}

export default BelongsTo;
