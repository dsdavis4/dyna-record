import DynamoBase from "./DynamoBase";

// https://stackoverflow.com/questions/66681411/how-to-implement-an-abstract-class-with-static-properties-in-typescript
// interface SingleTableDesignConstructor {
//   // cron: string; // A member of the uninstantiated class/constructor is static.
//   readonly tableName: string;
//   readonly primaryKey: string;
//   readonly sortKey: string;
//   // new (...args: any[]): any;
// }

// TODO move to own file
interface ModelProps {
  readonly type: string; // A member of the uninstantiated class/constructor is static.
  new (...args: any[]): any; // TODO is this used?
}

export function Model(constructor: ModelProps) {
  // decorator logic
}

// TODO move to own file
interface TableProps {
  readonly tableName: string;
  readonly primaryKey: string;
  readonly sortKey: string;
  readonly delimiter: string;
  new (...args: any[]): any; // TODO is this used?
}

export function Table(constructor: TableProps) {
  // debugger;
  constructor.prototype.pk = (id: string) => {
    debugger;
  };
}

class SingleTableDesign {
  protected static readonly tableName: string;
  protected static readonly primaryKey: string;
  protected static readonly sortKey: string;

  // TODO add options
  public static async findById(id: string) {
    const dynamo = new DynamoBase(this.tableName);

    // const bla = await dynamo.findById(this.p);
    const bla = this;
    debugger;
  }
}

export default SingleTableDesign;
