import "reflect-metadata";
import DynamoBase from "./DynamoBase";
import ModelMixin from "./mixins/Model";
import {
  TABLE_NAME,
  PRIMARY_KEY,
  SORT_KEY,
  DELIMITER,
  MODEL_TYPE
} from "./symbols";

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
    const Model = ModelMixin(this);
    const table = new Model();
    const abc = table.attributes();

    // TODO should this be in constructor?
    const dynamo = new DynamoBase(table.tableName);
    const res = await dynamo.findById({
      [table.primaryKey]: table.pk(id),
      [table.sortKey]: table.modelType
    });

    debugger;
  }

  private pk(id: string) {
    return `${this.modelType}${this.delimiter}${id}`;
  }

  // TODO I could do this instead of using the mixing
  // private getAttributes() {
  //   let attributes = [];
  //   let target = Object.getPrototypeOf(this);
  //   while (target != Object.prototype) {
  //     let childAttributes = Reflect.getOwnMetadata(ATTRIBUTES, target) || [];
  //     attributes.push(...childAttributes);
  //     target = Object.getPrototypeOf(target);
  //   }
  //   debugger;
  //   return attributes;
  // }
}

export default SingleTableDesign;
