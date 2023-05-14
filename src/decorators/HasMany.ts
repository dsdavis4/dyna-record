import Metadata from "../metadata";

// TODO can I do this in a way where I dont set the metadata on every instance?
//    meaning this is only run once
function HasMany<T>(_value: undefined, context: ClassFieldDecoratorContext) {
  // const bla = T;
  debugger;

  context.addInitializer(function () {
    const bla = context;
    debugger;
  });
}

export default HasMany;
