import "reflect-metadata";
import DynamoBase from "./DynamoBase";
import Metadata, { AttributeMetadata } from "./metadata";
import { NativeAttributeValue } from "@aws-sdk/util-dynamodb";

// TODO does this belong here
interface FindByIdOptions {
  // TODO can this be more type safe? Keyof has many of something?
  include?: { association: string }[];
}

abstract class SingleTableDesign {
  public static async findById<T extends SingleTableDesign>(
    this: { new (): T } & typeof SingleTableDesign,
    id: string,
    options: FindByIdOptions = {}
  ): Promise<T | null> {
    const entityMetadata = Metadata.entities[this.name];
    const tableMetadata = Metadata.tables[entityMetadata.tableName];

    const dynamo = new DynamoBase(tableMetadata.name);
    const res = await dynamo.findById({
      [tableMetadata.primaryKey]: this.pk(id, tableMetadata.delimiter),
      [tableMetadata.sortKey]: this.name
    });

    const bla = options;

    debugger;

    return res ? this.serialize<T>(res, entityMetadata.attributes) : null;
  }

  private static pk(id: string, delimiter: string) {
    return `${this.name}${delimiter}${id}`;
  }

  private static serialize<Entity extends SingleTableDesign>(
    this: { new (): Entity },
    tableItem: Record<string, NativeAttributeValue>,
    attrs: Record<string, AttributeMetadata>
  ) {
    const instance = new this();

    Object.keys(tableItem).forEach(attr => {
      if (attrs[attr]) {
        const entityKey = attrs[attr].name;
        instance[entityKey as keyof Entity] = tableItem[attr];
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
