import "reflect-metadata";
import DynamoBase from "./DynamoBase";
import Metadata, { AttributeMetadata, RelationshipMetadata } from "./metadata";
import { NativeAttributeValue } from "@aws-sdk/util-dynamodb";
import QueryBuilder, {
  FilterParams,
  KeyConditions,
  OrFilter
} from "./QueryBuilder";
import { BelongsToLink } from "./relationships";
import { Attribute } from "./decorators";

// TODO does this belong here
interface FindByIdOptions<T> {
  // TODO can this be more type safe? Keyof has many of something?
  include?: { association: keyof T }[];
}

interface QueryOptions<T> extends FindByIdOptions<T> {
  filter?: FilterParams;
}

abstract class SingleTableDesign {
  @Attribute({ alias: "Type" })
  public type: string;

  public static async findById<T extends SingleTableDesign>(
    this: { new (): T } & typeof SingleTableDesign,
    id: string,
    options: FindByIdOptions<T> = {}
  ): Promise<T | null> {
    const instance = this.init<T>();

    const entityMetadata = Metadata.entities[this.name];
    const tableMetadata = Metadata.tables[entityMetadata.tableName];

    const modelPrimaryKey =
      entityMetadata.attributes[tableMetadata.primaryKey].name;
    const modelSortKey = entityMetadata.attributes[tableMetadata.sortKey].name;

    if (options.include) {
      const result = await this.query(
        {
          [modelPrimaryKey]: this.primaryKeyValue(id, tableMetadata.delimiter)
        },
        options
      );

      debugger;

      return null;
      // return result[0] || null;
    } else {
      const dynamo = new DynamoBase(tableMetadata.name);
      const res = await dynamo.findById({
        [modelPrimaryKey]: this.primaryKeyValue(id, tableMetadata.delimiter),
        [modelSortKey]: this.name
      });

      if (res) {
        instance.serializeTableItemToModel(res, entityMetadata.attributes);
        return instance;
      } else {
        return null;
      }
    }
  }

  // TODO add return type
  public static async query<T extends SingleTableDesign>(
    this: { new (): T } & typeof SingleTableDesign,
    key: KeyConditions,
    options: QueryOptions<T> = {}
  ) {
    if (options.include) {
      // const entityMetadata = Metadata.entities[this.name];
      // const tableMetadata = Metadata.tables[entityMetadata.tableName];

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

      // TODO In JS version I query for local partitions here

      const partitionFilter = this.buildPartitionFilter(includedRelationships);

      const instance = this.init();

      const params = new QueryBuilder({
        entityClassName: this.name,
        key,
        options: { filter: partitionFilter }
      }).build();

      debugger;
    } else {
      // return super.query(key, options);
      debugger;
    }
  }

  private static primaryKeyValue(id: string, delimiter: string) {
    return `${this.name}${delimiter}${id}`;
  }

  // TODO do I need to extend here?
  // private static serialize<Entity extends SingleTableDesign>(
  //   this: { new (): Entity },
  //   tableItem: Record<string, NativeAttributeValue>,
  //   attrs: Record<string, AttributeMetadata>
  // ) {
  //   const instance = new this();

  //   Object.keys(tableItem).forEach(attr => {
  //     if (attrs[attr]) {
  //       const entityKey = attrs[attr].name;
  //       instance[entityKey as keyof Entity] = tableItem[attr];
  //     }
  //   });

  //   return instance;
  // }

  // TODO make sure this doesnt get called more then the number of instances returned...
  // TODO do I need to extend here?
  private static init<Entity extends SingleTableDesign>(this: {
    new (): Entity;
  }) {
    return new this();
  }

  private serializeTableItemToModel(
    tableItem: Record<string, NativeAttributeValue>,
    attrs: Record<string, AttributeMetadata>
  ) {
    Object.keys(tableItem).forEach(attr => {
      if (attrs[attr]) {
        const entityKey = attrs[attr].name;
        this[entityKey as keyof this] = tableItem[attr];
      }
    });
  }

  // TODO is this the right place for this class? Should it be its own class?
  // TODO should I build a FilterBuilder class?
  // Build filter to include links or relationships from the parent partition
  private static buildPartitionFilter(
    includedRelationships: RelationshipMetadata[]
  ): OrFilter {
    // TODO needs HasOne + scopes...

    const parentFilter = { type: this.name };
    const filters = [parentFilter];

    const includeBelongsToLinks = includedRelationships.some(
      rel => rel.type === "HasMany"
    );
    includeBelongsToLinks && filters.push({ type: BelongsToLink.name });

    return { $or: filters };
  }

  // TODO delete me. this is not
  public someMethod() {
    return "bla";
  }
}

export default SingleTableDesign;
