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
  const association = target;

  const s = props.foreignKey;

  // TODO  HERE.... How can I get return type of inverseSide?

  debugger;
  return function (_value: undefined, context: ClassFieldDecoratorContext) {
    context.addInitializer(function () {
      const entity = Object.getPrototypeOf(this);

      const association = target;
      // const bla = inverseSide;

      const entityMetadata = Metadata.entities[entity.constructor.name];

      debugger;

      // if (!entityMetadata.hasManies[association.name]) {
      //   debugger;
      // }

      // const s = inverseSide(target());
      // debugger;
      // // const entityMetadata = Metadata.entities[entity.constructor.name];
      // // debugger;

      // var classConstructor = entity.constructor;
      // console.log("property target: ", classConstructor);
      // const metadata =
      //   Reflect.getMetadata("MY_PROPERTY_DECORATOR_KEY", classConstructor) ||
      //   {};
      // // metadata[property] = options;
      // debugger;
      // Reflect.defineMetadata(
      //   "MY_PROPERTY_DECORATOR_KEY",
      //   metadata,
      //   classConstructor
      // );
    });
  };
}

export default HasMany;

// function HasMany<T>(target: undefined, context: ClassFieldDecoratorContext<T>) {
//   debugger;
//   return function (this: T, value: any) {
//     console.log("addOne: ", value); // 3
//     debugger;
//     // return value + 1;
//     return value;
//   };
// }

// export default HasMany;

// // TODO if this works (meaning I can set meta data before class init) then apply to Attribute...
// // https://medium.com/@islizeqiang/a-quick-guide-to-typescript-5-0-decorators-d06cabe09e8c
// const HasMany = <This, Return>(
//   target: ClassAccessorDecoratorTarget<This, Return>,
//   context: ClassAccessorDecoratorContext<This, Return>
// ) => {
//   debugger;
//   const result: ClassAccessorDecoratorResult<This, Return> = {
//     get(this: This) {
//       debugger;
//       return target.get.call(this);
//     },
//     set() {
//       debugger;
//       throw new Error(
//         `Cannot assign to read-only property '${String(context.name)}'.`
//       );
//     }
//   };

//   debugger;

//   return result;
// };

// export default HasMany;
