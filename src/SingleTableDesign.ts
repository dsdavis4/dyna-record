import "reflect-metadata";
import DynamoBase from "./DynamoBase";
import Metadata, {
  AttributeMetadata,
  RelationshipMetadata,
  EntityMetadata,
  TableMetadata
} from "./metadata";
import { NativeAttributeValue } from "@aws-sdk/util-dynamodb";
import QueryBuilder, {
  FilterParams,
  KeyConditions,
  OrFilter
} from "./QueryBuilder";
import { BelongsToLink } from "./relationships";
import { Attribute } from "./decorators";

// type Entity<T> = T extends SingleTableDesign;

// TODO does this belong here
interface FindByIdOptions<T> {
  // TODO can this be more type safe? Keyof has many of something?
  include?: { association: keyof T }[];
}

// TODO find a way to not fe-fetch meta data in multiple functions
// Maybe make instances in the static methods?

interface QueryOptions<T> extends FindByIdOptions<T> {
  filter?: FilterParams;
}

// TODO should this be abstract?
abstract class SingleTableDesign {
  // TODO this is too generic. Consuming models would want to use this
  // Maybe EntityType? Would require data migration....
  @Attribute({ alias: "Type" })
  public type: string;

  private readonly entityMetadata: EntityMetadata;
  private readonly tableMetadata: TableMetadata;

  // constructor() {
  //   this.entityMetadata = Metadata.entities[this.constructor.name];
  //   this.tableMetadata = Metadata.tables[this.entityMetadata.tableName];
  // }

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
      // const result = await this.query(
      //   {
      //     [modelPrimaryKey]: this.primaryKeyValue(id, tableMetadata.delimiter)
      //   },
      //   options
      // );

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

      const partitionFilter = this.buildPartitionFilter(includedRelationships);

      // TODO make sure this is not called more then it needs too... right now it would be in this case...

      const params = new QueryBuilder({
        entityClassName: this.name,
        key: {
          [modelPrimaryKey]: this.primaryKeyValue(id, tableMetadata.delimiter)
        },
        options: { filter: partitionFilter }
      }).build();

      const dynamo = new DynamoBase(tableMetadata.name);
      // TODO this is returning a lot of results for BelongsToLinks...
      // See branch/Pr "start_fixing_query_returning_all_links" for a potential solution
      const queryResults = await dynamo.query(params);

      const relationsLookup = includedRelationships.reduce(
        (lookup, rel) => ({ ...lookup, [rel.target().name]: rel }),
        {} as Record<string, RelationshipMetadata>
      );

      await Promise.all(
        queryResults.map(res =>
          instance.resolveQuery(
            res,
            tableMetadata,
            entityMetadata,
            relationsLookup
          )
        )
      );

      return instance;
    } else {
      const dynamo = new DynamoBase(tableMetadata.name);
      const res = await dynamo.findById({
        [tableMetadata.primaryKey]: this.primaryKeyValue(
          id,
          tableMetadata.delimiter
        ),
        [tableMetadata.sortKey]: this.name
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
  // TODO clean up and make function shorter
  // public static async query<T extends SingleTableDesign>(
  //   this: { new (): T } & typeof SingleTableDesign,
  //   key: KeyConditions,
  //   options: QueryOptions<T> = {}
  // ) {
  //   if (options.include) {
  //     const entityMetadata = Metadata.entities[this.name];
  //     const tableMetadata = Metadata.tables[entityMetadata.tableName];

  //     const associationLookup = options.include.reduce(
  //       (acc, included) => ({
  //         ...acc,
  //         [included.association]: true
  //       }),
  //       {} as Record<string, boolean>
  //     );

  //     // TODO is this better then adding an initializer in the decorator?
  //     // const entityMetadata = Metadata.entities[this.name];
  //     const includedRelationships = Metadata.relationships.filter(
  //       rel =>
  //         associationLookup[rel.propertyName] &&
  //         Metadata.relationships.some(assocRel => assocRel.target() === this)
  //     );

  //     const partitionFilter = this.buildPartitionFilter(includedRelationships);

  //     // TODO make sure this is not called more then it needs too... right now it would be in this case...
  //     const instance = this.init<T>();

  //     const params = new QueryBuilder({
  //       entityClassName: this.name,
  //       key,
  //       options: { filter: partitionFilter }
  //     }).build();

  //     const dynamo = new DynamoBase(tableMetadata.name);
  //     // TODO this is returning a lot of results for BelongsToLinks...
  //     // See branch/Pr "start_fixing_query_returning_all_links" for a potential solution
  //     const queryResults = await dynamo.query(params);

  //     const relationsLookup = includedRelationships.reduce(
  //       (lookup, rel) => ({ ...lookup, [rel.target().name]: rel }),
  //       {} as Record<string, RelationshipMetadata>
  //     );

  //     const abc = await Promise.all(
  //       queryResults.map(res =>
  //         instance.resolveQuery(res, tableMetadata, relationsLookup)
  //       )
  //     );

  //   } else {
  //     // return super.query(key, options);

  //   }
  // }

  private static primaryKeyValue(id: string, delimiter: string) {
    return `${this.name}${delimiter}${id}`;
  }

  private isKeyOfEntity(key: string): key is keyof SingleTableDesign {
    // TODO should I do "in" or this[key] ?
    if (key in this) {
      return true;
    }
    return false;
  }

  // TODO trying to dynamically check that the value being set is correct...
  // https://stackoverflow.com/questions/69705488/typescript-property-type-guards-on-unknown
  // private isValueCorrectType<T extends SingleTableDesign>(
  //   key: keyof T,
  //   val: unknown
  // ): val is T[key] {
  //   return true;
  // }

  // TODO make sure this doesnt get called more then the number of instances returned...
  // TODO do I need to extend here?
  private static init<Entity extends SingleTableDesign>(this: {
    new (): Entity;
  }) {
    return new this();
  }

  // TODO rename
  private async resolveQuery(
    res: Record<string, any>,
    tableMetadata: TableMetadata,
    entityMetadata: EntityMetadata,
    relationsLookup: Record<string, RelationshipMetadata>
  ) {
    const [modelName] = res[tableMetadata.sortKey].split(
      tableMetadata.delimiter
    );

    if (res.Type === BelongsToLink.name) {
      const [modelName, id] = res[tableMetadata.sortKey].split(
        tableMetadata.delimiter
      );
      const includedRel = relationsLookup[modelName];
      if (!!includedRel) {
        if (this.isKeyOfEntity(includedRel.propertyName)) {
          // TODO findById is not typed correctly here... it should know it requires a string
          const res = await includedRel.target().findById(id);

          // TODO dont use any...
          if (includedRel.type === "HasMany") {
            if (!this[includedRel.propertyName]) {
              this[includedRel.propertyName] = [] as any;
            } // TODO dont use any
            this[includedRel.propertyName] = [
              ...(this[includedRel.propertyName] as any),
              res
            ] as any;
          }
          // TODO handle BelongsTo
        }
      }
    } else if (modelName === this.constructor.name) {
      this.serializeTableItemToModel(res, entityMetadata.attributes);
    }
  }

  private serializeTableItemToModel(
    tableItem: Record<string, NativeAttributeValue>,
    attrs: Record<string, AttributeMetadata>
  ) {
    Object.keys(tableItem).forEach(attr => {
      // TODO use type guard isKeyOfEntity
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
