import Metadata from "../metadata";

// TODO this is copied in multiple places
type ObjectType<T> = { new (): T };

// TODO can I do this in a way where I dont set the metadata on every instance?
//    meaning this is only run once
function BelongsTo<T>(target: (type?: any) => ObjectType<T>, alias: keyof T) {
  const association = target;
  debugger;
  // const link
  const s = alias;

  debugger;

  // TODO  HERE.... How can I get return type of inverseSide?

  debugger;
  return function (_value: undefined, context: ClassFieldDecoratorContext) {
    context.addInitializer(function () {
      const entity = Object.getPrototypeOf(this);
      const association = target;
      // const bla = inverseSide;
      debugger;
    });
  };
}

export default BelongsTo;
