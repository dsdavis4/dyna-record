import "reflect-metadata";
import DynamoBase from "./DynamoBase";
import Metadata, { AttributeMetadata } from "./metadata";
import { NativeAttributeValue } from "@aws-sdk/util-dynamodb";
import QueryBuilder, { FilterParams, KeyConditions } from "./QueryBuilder";

// TODO does this belong here
interface FindByIdOptions {
  // TODO can this be more type safe? Keyof has many of something?
  include?: { association: string }[];
}

interface QueryOptions extends FindByIdOptions {
  filter?: FilterParams;
}

abstract class SingleTableDesign {
  public static async findById<T extends SingleTableDesign>(
    this: { new (): T } & typeof SingleTableDesign,
    id: string,
    options: FindByIdOptions = {}
  ): Promise<T | null> {
    const entityMetadata = Metadata.entities[this.name];
    const tableMetadata = Metadata.tables[entityMetadata.tableName];

    if (options.include) {
      const result = await this.query(
        { pk: this.pk(id, tableMetadata.delimiter) },
        options
      );

      debugger;

      // TODO below is copied. Its just here to trigger the method inititlizers
      const dynamo = new DynamoBase(tableMetadata.name);
      const res = await dynamo.findById({
        [tableMetadata.primaryKey]: this.pk(id, tableMetadata.delimiter),
        [tableMetadata.sortKey]: this.name
      });

      return res ? this.serialize<T>(res, entityMetadata.attributes) : null;
      // return result[0] || null;
    } else {
      const dynamo = new DynamoBase(tableMetadata.name);
      const res = await dynamo.findById({
        [tableMetadata.primaryKey]: this.pk(id, tableMetadata.delimiter),
        [tableMetadata.sortKey]: this.name
      });

      return res ? this.serialize<T>(res, entityMetadata.attributes) : null;
    }
  }

  // TODO add return type
  public static async query<T extends SingleTableDesign>(
    this: { new (): T } & typeof SingleTableDesign,
    key: KeyConditions,
    options: QueryOptions = {}
  ) {
    if (options.include) {
      // const includedAssocs = this._includedAssociations(options.include);

      // options.filter = this._associationsFilter(includedAssocs);

      // const results = await super.query(key, options);
      // const foreignAssocs = await this._getForeignAssociations(
      //   results,
      //   includedAssocs
      // );

      // return this._setModelAssociations([...results, ...foreignAssocs]);

      // const bla =

      const a = options;
      const b = key;

      // TODO start here. I need to figure out how to track the hasMany instances... but to do so I have to instantiate the class
      // I am trying to model after TypeOrm OneToMany, ManyToMany and ManyToOne decorators..
      // TODO I get ReferenceError: Cannot access 'Brewery' before initialization
      // and the error switches if I reverse the class def. Should I call the functions later?
      // can I access to return type of the second param earlier?

      // See TODO in has manyClass

      debugger;
    } else {
      // return super.query(key, options);
      debugger;
    }
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
