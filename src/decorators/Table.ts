import { TABLE_NAME, PRIMARY_KEY, SORT_KEY, DELIMITER } from "../symbols";
import Metadata from "../metadata";

interface TableProps {
  name: string;
  primaryKey: string;
  sortKey: string;
  delimiter: string;
}

export interface TableConstructor {
  readonly tableName: string;
  readonly primaryKey: string;
  readonly sortKey: string;
  readonly delimiter: string;
  new (...args: any[]): any; // TODO is this needed? Dont use any...
}

// function Table(target: TableConstructor, _context: ClassDecoratorContext) {
//   // TODO make stricter
//   // TODO set the type correctly
//   // return function (target: Function, _context: ClassDecoratorContext) {
//   //   // TODO find better way to init
//   //   Metadata.tables[target.name] = { ...props };
//   // };
//   // debugger;
//   // target.tableName;
//   debugger;
//   return this; // TODO is this needed?
// }

function Table(props: TableProps) {
  // TODO make stricter
  // TODO set the type correctly
  return function (target: Function, _context: ClassDecoratorContext) {
    // TODO find better way to init
    Metadata.tables[target.name] = { ...props };
    return this;
  };
}

// class BaseTable {
//   static tableName: string;
//   static primaryKey: string;
//   static soryKey: string;
//   static delimiter: string;
// }

// type GConstructor<T = {}> = new (...args: any[]) => T;

// function Table(props: TableProps) {
//   // const _this = this;
//   // The wrapper must be new-callable

//   return function (target: Function, context: ClassDecoratorContext) {
//     debugger;
//     // return class extends target {
//     //   // (A)
//     //   // constructor(...args) {
//     //   //   super(...args);
//     //   //   instanceCount++;
//     //   //   // Change the instance
//     //   //   this.count = instanceCount;
//     //   // }
//     // };
//   };
// }

export default Table;
