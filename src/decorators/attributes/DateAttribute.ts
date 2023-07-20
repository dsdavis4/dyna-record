import SingleTableDesign from "../../SingleTableDesign";
import Metadata from "../../metadata";

// const readOnlyFieldKeys = Symbol("readOnlyFieldKeys");

// type Types = "string" | "number" | "boolean"

interface AttributeProps {
  alias: string;
}

// TODO START here. This is close. IT kind of works but when console logged does not show correctly.
// Can I combine two approaches

// function DateAttribute<T>(props: AttributeProps) {
//   return function DateAttribute(
//     target: ClassAccessorDecoratorTarget<T, Date>,
//     context: ClassAccessorDecoratorContext
//   ) {
//     if (context.kind === "accessor") {
//       context.addInitializer(function () {
//         const entity = Object.getPrototypeOf(this);
//         Metadata.addEntityAttribute(entity.constructor.name, {
//           attributeName: context?.name.toString(),
//           alias: props.alias
//         });
//       });
//       return {
//         get() {
//           const value = target.get.call(this);
//           // if (value === UNINITIALIZED) {
//           //   throw new TypeError(`Accessor ${name} hasn’t been initialized yet`);
//           // }
//           return value;
//         },
//         set(newValue: any) {
//           // const oldValue = get.call(this);
//           // if (oldValue !== UNINITIALIZED) {
//           //   throw new TypeError(`Accessor ${name} can only be set once`);
//           // }
//           // set.call(this, newValue);
//           target.set.call(this, new Date(newValue));
//         }
//       };
//     }
//   };
// }

function DateAttribute<T>(props: AttributeProps) {
  return function (value: any, context: ClassFieldDecoratorContext<T, Date>) {
    if (context.kind === "field") {
      context.access.set = (a: any) => {
        debugger;
        return new Date();
      };

      context.access.get = (a: any) => {
        debugger;
        return new Date();
      };
      context.addInitializer(function () {
        const entity = Object.getPrototypeOf(this);

        // this[context.name as keyof T] =
        //   entity[context.name as keyof T].bind(this);

        Metadata.addEntityAttribute(entity.constructor.name, {
          attributeName: context?.name.toString(),
          alias: props.alias
        });

        // context.access.set = (a: any) => {
        //   debugger;
        //   return new Date();
        // };

        // context.access.get = (a: any) => {
        //   debugger;
        //   return new Date();
        // };

        // this[context.name as keyof T] = this[context.name].bind(this);

        // Object.defineProperty(this, context.name, {
        //   set: (newValue: any) => {
        //     debugger;
        //   },
        //   get: () => {
        //     debugger;
        //     return 1;
        //   }
        // });

        // if (!this[context.name as keyof T]) {
        //   Object.defineProperty(this, context.name, {
        //     // set: (newValue: any) => {
        //     //   debugger;
        //     // },
        //     get: () => {
        //       debugger;
        //       return 1;
        //     }
        //   });
        // }

        // const bla = value;

        // return new Date();
      });

      // return {
      //   get: () => {
      //     debugger;
      //   }
      // };

      context.access.set = (a: any) => {
        debugger;
        return new Date();
      };

      context.access.get = (a: any) => {
        debugger;
        return new Date();
      };

      // return { value, context };

      // return (initialValue: any) => {
      //   debugger;
      //   return new Date();
      // };

      // return function (initialValue: any) {
      //   console.log(
      //     `initializing ${context.name.toString()} with value ${initialValue}`
      //   );

      //   if (initialValue) {
      //     debugger;
      //   }
      //   return initialValue;
      // };

      // class C extends {
      //   #updatedAt = "abc";
      //   get updatedAt() {
      //     return this.#updatedAt;
      //   }
      //   set updatedAt(value) {
      //     this.#updatedAt = value;
      //   }
      // }

      // return C;

      // if (context.kind === "field") {
      //   // (A)
      //   return function () {
      //     if (!this[readOnlyFieldKeys]) {
      //       this[readOnlyFieldKeys] = [];
      //     }
      //     this[readOnlyFieldKeys].push(context.name);

      //     return new Date();
      //   };
      // }
      // if (context.kind === "class") {
      //   // (B)
      //   return function (...args: any) {
      //     const inst = new value(...args);
      //     for (const key of inst[readOnlyFieldKeys]) {
      //       Object.defineProperty(inst, key, { writable: false });
      //     }
      //     return inst;
      //   };
      // }

      // debugger;

      // context.access.set = (a: any, c: any) => {
      //   debugger;
      //   return new Date();
      // };

      // return class DateAttribute1 {
      //    public get() (
      //     a: any,
      //     c: any
      //   )  {
      //     debugger;
      //     // return new Date();
      //   };
      // };
    }
  };
}

export default DateAttribute;
