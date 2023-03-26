import { TABLE_NAME, PRIMARY_KEY, SORT_KEY, DELIMITER } from "../symbols";

interface TableProps {
  name: string;
  primaryKey: string;
  sortKey: string;
  delimiter: string;
}

// TODO could I make is so anything with this reflects single table design?
// That way I only export Table and Model and Attribute decorators?
// And all logic is encapsualted here?
// low priority

// TODO should I follow a pattern of extending and returning a class like here
// https://javascript.plainenglish.io/ts-5-0-beta-new-decorators-are-here-5b13a383e4ad

// function Greeter(value, context) {
//   if (context.kind === "class") {
//     return class extends value {
//       constructor(...args) {
//         super(args);
//       }
//       greet(): void {
//         console.log("Hello Bytefer!");
//       }
//     };
//   }
// }

function Table(props: TableProps) {
  // TODO make stricter
  // TODO set the type correctly
  return function (target: any, _context: ClassDecoratorContext) {
    Reflect.defineMetadata(TABLE_NAME, props.name, target);
    Reflect.defineMetadata(PRIMARY_KEY, props.primaryKey, target);
    Reflect.defineMetadata(SORT_KEY, props.sortKey, target);
    Reflect.defineMetadata(DELIMITER, props.delimiter, target);

    // return target; // Is this how it should be?
  };
}

export default Table;
