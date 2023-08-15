import DynamoClient from "./DynamoClient";
import Metadata, {
  RelationshipMetadata,
  EntityMetadata,
  TableMetadata
} from "./metadata";
import {
  QueryBuilder,
  QueryResolver,
  Filters,
  // TODO check if unused props need to be exported at all
  KeyConditions,
  QueryCommandProps,
  QueryOptions as QueryBuilderOptions,
  SortKeyCondition
  // QueryFilter
} from "./query-utils";
import { Attribute } from "./decorators";
import { BelongsToLink } from "./relationships";

interface FindByIdOptions<T> {
  include?: { association: keyof T }[];
}

interface QueryOptions extends QueryBuilderOptions {
  skCondition?: SortKeyCondition;
}

abstract class SingleTableDesign {
  // TODO this is too generic. Consuming models would want to use this
  // Maybe EntityType? Would require data migration....
  @Attribute({ alias: "Type" })
  public type: string;

  // TODO should I refactor so I dont need instance methods...?
  public static async findById<T extends SingleTableDesign>(
    this: { new (): T } & typeof SingleTableDesign,
    id: string,
    options: FindByIdOptions<T> = {}
  ): Promise<T | null> {
    this.init();

    if (options.include) {
      return await this.findByIdWithIncludes(id, options.include);
    } else {
      return await this.findByIdOnly<T>(id);
    }
  }

  // /**
  //  * Query entities partition given the Entity Id
  //  * @param this
  //  * @param id
  //  * @param options
  //  */
  // public static async query<T extends SingleTableDesign>(
  //   this: { new (): T } & typeof SingleTableDesign,
  //   id: string,
  //   options?: QueryOptions
  // ): Promise<T | BelongsToLink | []>;

  // public static async query<T extends SingleTableDesign>(
  //   this: { new (): T } & typeof SingleTableDesign,
  //   key: KeyConditions,
  //   options?: Omit<QueryOptions, "skCondition">
  // ): Promise<T | BelongsToLink | []>;

  // TODO add jsdoc
  // TODO this should know that the PK and sk are keys on the object
  public static async query<T extends SingleTableDesign>(
    this: { new (): T } & typeof SingleTableDesign,
    key: KeyConditions,
    options?: QueryBuilderOptions
  ): Promise<(T | BelongsToLink)[]> {
    this.init();

    const entityMetadata = Metadata.entities[this.name];
    const tableMetadata = Metadata.tables[entityMetadata.tableName];

    const params = new QueryBuilder({
      entityClassName: this.name,
      key,
      options
    }).build();

    const dynamo = new DynamoClient(tableMetadata.name);
    const queryResults = await dynamo.query(params);

    const queryResolver = new QueryResolver<T>(this);
    return await queryResolver.resolve(queryResults);
  }

  // TODO add tests for
  //   - query by PK only
  //   - query by PK and SK value
  //   - query by PK and SK begins with
  //   - query by PK and filter only
  //   - query by PK and SK with filter
  //   - query by index with and without SK and filter
  //   - Test that when a method overrides a method that it will return instances of correct class type
  //       EX: "await WsToken.getAllByRoomId" should be array of WsToken not SingleTableDesign

  // TODO do I want something like this?
  // public static async queryEntity<T extends SingleTableDesign>(
  //   this: { new (): T } & typeof SingleTableDesign,
  //   id: string,
  //   options?: QueryOptions
  // ): Promise<T | BelongsToLink | []> {
  //   const entityMetadata = Metadata.entities[this.name];
  //   const tableMetadata = Metadata.tables[entityMetadata.tableName];

  // TODO Query resolver should do this

  //   const modelPk = entityMetadata.attributes[tableMetadata.primaryKey].name;
  //   const modelSk = entityMetadata.attributes[tableMetadata.sortKey].name;

  //   const keyCondition = {
  //     [modelPk]: this.primaryKeyValue(id),
  //     ...(options?.skCondition && { [modelSk]: options?.skCondition })
  //   };

  //   const params = new QueryBuilder({
  //     entityClassName: this.name,
  //     key: keyCondition,
  //     options
  //   }).build();

  //   const dynamo = new DynamoClient(tableMetadata.name);
  //   const queryResults = await dynamo.query(params);

  //   const queryResolver = new QueryResolver(instance);
  //   return await queryResolver.resolve(queryResults);
  // }

  private static async findByIdOnly<T extends SingleTableDesign>(
    this: { new (): T } & typeof SingleTableDesign,
    id: string
  ) {
    const entityMetadata = Metadata.entities[this.name];
    const tableMetadata = Metadata.tables[entityMetadata.tableName];
    const { name: tableName, primaryKey, sortKey } = tableMetadata;

    const dynamo = new DynamoClient(tableName);
    const res = await dynamo.findById({
      [primaryKey]: this.primaryKeyValue(id),
      [sortKey]: this.name
    });

    if (res) {
      const queryResolver = new QueryResolver<T>(this);
      return await queryResolver.resolve(res);
    } else {
      return null;
    }
  }

  // public someMethod() {
  //   // TODO delete me
  // }
  // TODO when an association is included the type on the variable should know that key will be present
  //   EX: const brewery = awaot Brewwery.findById("bla", {includes: "scales"})
  //   brewery.scales should be typed as Scale[] and not be optional

  private static async findByIdWithIncludes<T extends SingleTableDesign>(
    this: { new (): T } & typeof SingleTableDesign,
    id: string,
    includedAssociations: NonNullable<FindByIdOptions<T>["include"]>
  ) {
    const entityMetadata = Metadata.entities[this.name];
    const tableMetadata = Metadata.tables[entityMetadata.tableName];
    const { name: tableName, primaryKey } = tableMetadata;
    const modelPrimaryKey = entityMetadata.attributes[primaryKey].name;

    const includedRelationships = includedAssociations.reduce(
      (acc, includedRel) => {
        const key = includedRel.association as string;
        const included = entityMetadata.relationships[key];
        if (included) acc.push(included);
        return acc;
      },
      [] as RelationshipMetadata[]
    );

    const partitionFilter = Filters.includedRelationships(
      this.name,
      includedRelationships
    );

    const params = new QueryBuilder({
      entityClassName: this.name,
      key: { [modelPrimaryKey]: this.primaryKeyValue(id) },
      options: { filter: partitionFilter }
    }).build();

    const dynamo = new DynamoClient(tableName);
    const queryResults = await dynamo.query(params);

    const queryResolver = new QueryResolver<T>(this);
    return await queryResolver.resolve(queryResults, includedRelationships);
  }

  public static primaryKeyValue(id: string) {
    const entityMetadata = Metadata.entities[this.name];
    const { delimiter } = Metadata.tables[entityMetadata.tableName];
    return `${this.name}${delimiter}${id}`;
  }

  private static init() {
    Metadata.init();
  }
}

export default SingleTableDesign;
