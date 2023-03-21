import DynamoBase from "./DynamoBase";
import "reflect-metadata";

// https://stackoverflow.com/questions/66681411/how-to-implement-an-abstract-class-with-static-properties-in-typescript
// interface SingleTableDesignConstructor {
//   // cron: string; // A member of the uninstantiated class/constructor is static.
//   readonly tableName: string;
//   readonly primaryKey: string;
//   readonly sortKey: string;
//   // new (...args: any[]): any;
// }

// TODO move to own file
// interface ModelProps {
//   // readonly type: string; // A member of the uninstantiated class/constructor is static.
//   // new (...args: any[]): any; // TODO is this used?
// }

// export function Model(constructor: ModelProps) {
//   // decorator logic
// }

// // TODO move to own file
// interface TableProps {
//   readonly tableName: string;
//   readonly primaryKey: string;
//   readonly sortKey: string;
//   readonly delimiter: string;
//   // pk(id: string): string;
//   // new (...args: any[]): any; // TODO is this used?
// }

// export function Table(constructor: TableProps) {
//   // debugger;
//   // constructor.pk = (id: string) => {
//   //   // const bla = Rel
//   //   return "bla";
//   //   // return `${constructor.name}${constructor.delimiter}${id}`;
//   // };
// }

const MODEL_TYPE = Symbol();
export function Model(name: string) {
  // TODO make stricter
  return function (target: any, _context: ClassDecoratorContext) {
    Reflect.defineMetadata(MODEL_TYPE, name, target);
  };
}

const TABLE_NAME = Symbol();
const PRIMARY_KEY = Symbol();
const SORT_KEY = Symbol();
const DELIMITER = Symbol();

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
// TODO are decorators and reflection the best thing to do? Or should I use static properties and reflection?
export function Table(props: TableProps) {
  // TODO make stricter
  return function (target: any, _context: ClassDecoratorContext) {
    Reflect.defineMetadata(TABLE_NAME, props.name, target);
    Reflect.defineMetadata(PRIMARY_KEY, props.primaryKey, target);
    Reflect.defineMetadata(SORT_KEY, props.sortKey, target);
    Reflect.defineMetadata(DELIMITER, props.delimiter, target);
  };
}

class SingleTableDesign {
  private readonly tableName: string;
  private readonly primaryKey: string;
  private readonly sortKey: string;
  private readonly delimiter: string;
  private readonly modelType: string;
  // @second()
  // protected static readonly tableName: string;
  // protected static readonly primaryKey: string;
  // protected static readonly sortKey: string;

  // TODO change to this.table and this.model?
  constructor() {
    this.tableName = Reflect.getMetadata(TABLE_NAME, this.constructor);
    this.primaryKey = Reflect.getMetadata(PRIMARY_KEY, this.constructor);
    this.sortKey = Reflect.getMetadata(SORT_KEY, this.constructor);
    this.delimiter = Reflect.getMetadata(DELIMITER, this.constructor);
    this.modelType = Reflect.getMetadata(MODEL_TYPE, this.constructor);
  }

  // TODO add options
  public static async findById(id: string) {
    const table = new this();
    // TODO should this be in constructor?
    const dynamo = new DynamoBase(table.tableName);
    // const a = { [table.primaryKey]: table.pk(id) };
    // debugger;
    // const key = {
    //   [table.primaryKey]: table.pk(id),
    //   [table.sortKey]: table.modelType
    // };
    const bla = await dynamo.findById({
      [table.primaryKey]: table.pk(id),
      [table.sortKey]: table.modelType
    });

    console.log(bla);

    // TODO start here. Just got this to work with reflection
    // TODO first upgrade to typescript 5 https://devblogs.microsoft.com/typescript/announcing-typescript-5-0/
    // and change tsconfig to use new decroator pattern
    // read extensivly and follow bet practices
    // TODO replace experimental decorators in tsconfig with new field
    // TODO there is an npm package @tsconfig/strictist I could use... look into that
    // TODO work on serializing to model using attributes and decorators for attributes
    // TODO return new model.
    // TODO this could be helpful for attributes decorator:  https://stackoverflow.com/questions/55117125/typescript-decorators-reflect-metadata
    // this wash helpful https://stackoverflow.com/questions/59578083/javascript-access-metadata-of-child-class-inside-constructor-of-parent

    // const test =
    debugger;
  }

  private pk(id: string) {
    return `${this.modelType}${this.delimiter}${id}`;
  }
}

export default SingleTableDesign;
