import "reflect-metadata";
import DynamoBase from "./DynamoBase";
import EntityMixin from "./mixins/Entity";
import {
  TABLE_NAME,
  PRIMARY_KEY,
  SORT_KEY,
  DELIMITER,
  ENTITY_TYPE
} from "./symbols";
import Metadata, { TableMetadata, EntityMetadata } from "./metadata";

import { TableConstructor } from "./decorators/Table";

type GConstructor<T = {}> = new (...args: any[]) => T;

interface ObjectLiteral {
  [key: string]: any;
}

type ObjectType<T> = { new (): T } | Function;

type EntityTarget<Entity> = ObjectType<Entity> | SingleTableDesign;
// | { type: Entity; name: string };

// TODO can I make this abstract?
abstract class SingleTableDesign {
  // TODO are these instance methods needed?
  // private tableMetadata: TableMetadata;
  // private entityMetadata: EntityMetadata;
  // private readonly entityType: string;

  // constructor() {
  //   this.entityType = this.constructor.name;
  //   this.entityMetadata = Metadata.entities[this.entityType];
  //   this.tableMetadata = Metadata.tables[this.entityMetadata.tableName];

  //   debugger;
  // }

  // TODO add options
  public static async findById<T extends SingleTableDesign>(
    this: { new (): T } & typeof SingleTableDesign,
    id: string
  ): Promise<T | null> {
    const entityMetadata = Metadata.entities[this.name];
    const tableMetadata = Metadata.tables[entityMetadata.tableName];

    const dynamo = new DynamoBase(tableMetadata.name);
    const res = await dynamo.findById({
      [tableMetadata.primaryKey]: this.pk(id, tableMetadata.delimiter),
      [tableMetadata.sortKey]: this.name
    });

    return res ? this.serialize<T>(res, entityMetadata.attributes) : null;
  }

  private static pk(id: string, delimiter: string) {
    return `${this.name}${delimiter}${id}`;
  }

  private static serialize<Entity extends SingleTableDesign>(
    this: { new (): Entity },
    tableItem: Record<string, any>,
    attrs: Record<string, any>
  ) {
    const instance = new this();

    Object.keys(tableItem).forEach(attr => {
      if (attrs[attr]) {
        const entityKey: keyof Entity = attrs[attr].name;
        instance[entityKey] = tableItem[attr];
      }
    });

    return instance;
  }

  // TODO delete me. this is not
  public someMethod() {
    return "bla";
  }
}

export default SingleTableDesign;
