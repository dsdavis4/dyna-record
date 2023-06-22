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

  readonly #entityMetadata: EntityMetadata;
  readonly #tableMetadata: TableMetadata;

  constructor() {
    this.#entityMetadata = Metadata.entities[this.constructor.name];
    this.#tableMetadata = Metadata.tables[this.#entityMetadata.tableName];
  }

  public static async findById<T extends SingleTableDesign>(
    this: { new (): T } & typeof SingleTableDesign,
    id: string,
    options: FindByIdOptions<T> = {}
  ): Promise<T | null> {
    const instance = this.init<T>();

    if (options.include) {
      return await instance.findByIdWithIncludes(id, options.include);
    } else {
      return await instance.findById(id);
    }
  }

  private async findById(id: string) {
    const { name: tableName, primaryKey, sortKey } = this.#tableMetadata;
    const dynamo = new DynamoBase(tableName);
    const res = await dynamo.findById({
      [primaryKey]: this.primaryKeyValue(id),
      [sortKey]: this.constructor.name
    });

    if (res) {
      this.serializeTableItemToModel(res);
      return this;
    } else {
      return null;
    }
  }

  private async findByIdWithIncludes<T>(
    id: string,
    includedAssociations: NonNullable<FindByIdOptions<T>["include"]>
  ) {
    const { name: tableName, primaryKey } = this.#tableMetadata;
    const modelPrimaryKey = this.#entityMetadata.attributes[primaryKey].name;

    const includedRelationships = includedAssociations.reduce(
      (acc, includedRel) => {
        const key = includedRel.association as string;
        const included = this.#entityMetadata.relationships[key];
        if (included) acc.push(included);
        return acc;
      },
      [] as RelationshipMetadata[]
    );

    if (includedRelationships.length !== includedAssociations.length) {
      // TODO IMPORTANT!!! I think I need to add an initialzer so I can group relationships by entity
      // Otherwise, the association lookup with property name might not always work
      // Right now its working because the proerpty name EX "breweries" is the same
      // Make a unit test for this...

      // Does this problem exist for both belongsTo and hasMany?
      debugger;

      // TODO remove
      // throw new Error("Not supposed to hit this code");
    }

    const partitionFilter = this.buildPartitionFilter(includedRelationships);

    const params = new QueryBuilder({
      entityClassName: this.constructor.name,
      key: { [modelPrimaryKey]: this.primaryKeyValue(id) },
      options: { filter: partitionFilter }
    }).build();

    const dynamo = new DynamoBase(tableName);
    const queryResults = await dynamo.query(params);

    await Promise.all(
      queryResults.map(res =>
        this.resolveQueryLinks(res, includedRelationships)
      )
    );

    return this;
  }

  private primaryKeyValue(id: string) {
    const { delimiter } = this.#tableMetadata;
    return `${this.constructor.name}${delimiter}${id}`;
  }

  private isKeyOfEntity(key: string): key is keyof SingleTableDesign {
    return key in this;
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

  // TODO rename?
  private async resolveQueryLinks(
    res: Record<string, any>,
    includedRelationships: RelationshipMetadata[]
  ) {
    const { sortKey, delimiter } = this.#tableMetadata;
    const [modelName] = res[sortKey].split(delimiter);

    // TODO this will iterate for EVERY res...
    const relationsLookup = includedRelationships.reduce(
      (lookup, rel) => ({ ...lookup, [rel.target().name]: rel }),
      {} as Record<string, RelationshipMetadata>
    );

    if (res.Type === BelongsToLink.name) {
      const [modelName, id] = res[sortKey].split(delimiter);
      const includedRel = relationsLookup[modelName];
      if (!!includedRel) {
        if (this.isKeyOfEntity(includedRel.propertyName)) {
          // TODO findById is not typed correctly here... it should know it requires a string
          const res = await includedRel.target().findById(id);

          if (includedRel.type === "HasMany") {
            if (!this[includedRel.propertyName]) {
              this[includedRel.propertyName] = [] as any;
            }
            (this[includedRel.propertyName] as unknown as any[]).push(res);
          }
        }
      }
    } else if (modelName === this.constructor.name) {
      this.serializeTableItemToModel(res);

      // TODO this will iterate for EVERY res...
      // const getBelongsTos = includedRelationships.reduce((acc, includedRel) => {
      //   const isBelongsTo = includedRel.type === "BelongsTo";
      //   // if (isBelongsTo && Metadata.entities[includedRel.target().name]) {
      //   //   debugger;
      //   // }

      //   const foreignKey = this[includedRel.targetPropertyName as keyof this];

      //   if (foreignKey) {
      //     acc.push(includedRel.target.findById(foreignKey));
      //   }

      //   return [];
      // }, []);

      const belongTos = includedRelationships.filter(
        rel => rel.type === "BelongsTo"
      );

      // TODO make async
      for await (const belongTo of belongTos) {
        const foreignKey = this[belongTo.targetPropertyName as keyof this];

        if (this.isKeyOfEntity(belongTo.propertyName) && foreignKey) {
          this[belongTo.propertyName] = await belongTo
            .target()
            .findById(foreignKey);
        }
      }
    }
  }

  private serializeTableItemToModel(
    tableItem: Record<string, NativeAttributeValue>
  ) {
    const attrs = this.#entityMetadata.attributes;
    Object.keys(tableItem).forEach(attr => {
      const entityKey = attrs[attr]?.name;
      if (this.isKeyOfEntity(entityKey)) {
        this[entityKey] = tableItem[attr];
      }
    });
  }

  // TODO is this the right place for this class? Should it be its own class?
  // TODO should I build a FilterBuilder class?
  // Build filter to include links or relationships from the parent partition
  private buildPartitionFilter(
    includedRelationships: RelationshipMetadata[]
  ): OrFilter {
    // TODO needs HasOne + scopes...

    const parentFilter = { type: this.constructor.name };
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
