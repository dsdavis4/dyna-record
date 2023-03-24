import DynamoBase from "./DynamoBase";
import "reflect-metadata";

const MODEL_TYPE = Symbol();
const ATTRIBUTES = Symbol();
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

// TODO below works
// https://2ality.com/2022/10/javascript-decorators.html#read-only-fields
export function Attribute(value: any, context: ClassFieldDecoratorContext) {
  if (context.kind === "field") {
    return function () {
      const target = Object.getPrototypeOf(this);
      this[ATTRIBUTES] = this[ATTRIBUTES] ?? [];
      this[ATTRIBUTES].push(context.name);
      Reflect.defineMetadata(ATTRIBUTES, this[ATTRIBUTES], target);
    };
  }
  return value;
}

// TODO can I make this abstract?
class SingleTableDesign {
  private readonly tableName: string;
  private readonly primaryKey: string;
  private readonly sortKey: string;
  private readonly delimiter: string;
  private readonly modelType: string;

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
    const bla = await dynamo.findById({
      [table.primaryKey]: table.pk(id),
      [table.sortKey]: table.modelType
    });

    debugger;

    const attributes = table.getAttributes();

    console.log(bla);
    console.log(attributes);

    // const test =
    debugger;
  }

  private pk(id: string) {
    return `${this.modelType}${this.delimiter}${id}`;
  }

  // TODO could this be in the model decorator?
  private getAttributes() {
    let attributes = [];
    let target = Object.getPrototypeOf(this);
    while (target != Object.prototype) {
      let childAttributes = Reflect.getOwnMetadata(ATTRIBUTES, target) || [];
      attributes.push(...childAttributes);
      target = Object.getPrototypeOf(target);
    }
    debugger;
    return attributes;
  }
}

export default SingleTableDesign;
