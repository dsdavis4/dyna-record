type DataType = "date" | "string" | "number" | "bool";

interface AttributeProps {
  alias: string;
  type?: DataType;
}

// TODO delete me
// export default function TestAccessor<T, K>(
//   target: ClassAccessorDecoratorTarget<T, K>,
//   context: ClassAccessorDecoratorContext
// ) {
//   if (context.kind === "accessor") {
//     return {
//       get() {
//         const value = target.get.call(this);
//         // if (value === UNINITIALIZED) {
//         //   throw new TypeError(`Accessor ${name} hasn’t been initialized yet`);
//         // }
//         return value;
//       },
//       set(newValue: any) {
//         // const oldValue = get.call(this);
//         // if (oldValue !== UNINITIALIZED) {
//         //   throw new TypeError(`Accessor ${name} can only be set once`);
//         // }
//         // set.call(this, newValue);
//         target.set.call(this, newValue);
//       }
//     };
//   }
// }

export default function TestAccessor<T, K>(props: AttributeProps) {
  return function (
    target: ClassAccessorDecoratorTarget<T, K>,
    context: ClassAccessorDecoratorContext
  ) {
    if (context.kind === "accessor") {
      return {
        get() {
          const value = target.get.call(this);
          // if (value === UNINITIALIZED) {
          //   throw new TypeError(`Accessor ${name} hasn’t been initialized yet`);
          // }
          return value;
        },
        set(newValue: any) {
          // const oldValue = get.call(this);
          // if (oldValue !== UNINITIALIZED) {
          //   throw new TypeError(`Accessor ${name} can only be set once`);
          // }
          // set.call(this, newValue);
          target.set.call(this, newValue);
        }
      };
    }
  };
}
