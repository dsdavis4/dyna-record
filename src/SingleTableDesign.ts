import "reflect-metadata";
import DynamoBase from "./DynamoBase";
import Metadata, { AttributeMetadata } from "./metadata";
import { NativeAttributeValue } from "@aws-sdk/util-dynamodb";
import QueryBuilder, { FilterParams, KeyConditions } from "./QueryBuilder";

// TODO does this belong here
interface FindByIdOptions<T> {
  // TODO can this be more type safe? Keyof has many of something?
  include?: { association: keyof T }[];
}

interface QueryOptions<T> extends FindByIdOptions<T> {
  filter?: FilterParams;
}

abstract class SingleTableDesign {
  public static async findById<T extends SingleTableDesign>(
    this: { new (): T } & typeof SingleTableDesign,
    id: string,
    options: FindByIdOptions<T> = {}
  ): Promise<T | null> {
    const entityMetadata = Metadata.entities[this.name];
    const tableMetadata = Metadata.tables[entityMetadata.tableName];

    if (options.include) {
      const result = await this.query(
        { pk: this.pk(id, tableMetadata.delimiter) },
        options
      );

      debugger;

      return null;
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
    options: QueryOptions<T> = {}
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

      const associationLookup = options.include.reduce(
        (acc, included) => ({
          ...acc,
          [included.association]: true
        }),
        {} as Record<string, boolean>
      );

      // TODO is this better then adding an initializer in the decorator?
      // const entityMetadata = Metadata.entities[this.name];
      const includedRelationships = Metadata.relationships.filter(
        rel =>
          associationLookup[rel.propertyName] &&
          Metadata.relationships.some(assocRel => assocRel.target() === this)
      );

      // TODO start here... just got this to find the correct relationships

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
