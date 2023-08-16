import Metadata, { EntityClass } from "./metadata";
import { QueryOptions as QueryBuilderOptions } from "./query-utils";
import { Attribute } from "./decorators";
import { BelongsToLink } from "./relationships";
import {
  FindById,
  FindByIdOptions,
  Query,
  QueryOptions,
  EntityKeyConditions
} from "./operations";

abstract class SingleTableDesign {
  // TODO this is too generic. Consuming models would want to use this
  // Maybe EntityType? Would require data migration....
  @Attribute({ alias: "Type" })
  public type: string;

  // TODO add jsdoc
  public static async findById<T extends SingleTableDesign>(
    this: EntityClass<T>,
    id: string,
    options: FindByIdOptions<T> = {}
  ): Promise<T | null> {
    this.init();

    const op = new FindById<T>(this);
    return await op.run(id, options);
  }

  // TODO add jsdoc
  public static async query<T extends SingleTableDesign>(
    this: EntityClass<T>,
    key: EntityKeyConditions<T>,
    options?: QueryBuilderOptions
  ): Promise<(T | BelongsToLink)[]>;

  // TODO add jsdoc
  public static async query<T extends SingleTableDesign>(
    this: EntityClass<T>,
    id: string,
    options?: Omit<QueryOptions, "indexName">
  ): Promise<(T | BelongsToLink)[]>;

  public static async query<T extends SingleTableDesign>(
    this: EntityClass<T>,
    key: string | EntityKeyConditions<T>,
    options?: QueryBuilderOptions | Omit<QueryOptions, "indexName">
  ): Promise<(T | BelongsToLink)[]> {
    this.init();

    const op = new Query<T>(this);
    return await op.run(key, options);
  }

  // public someMethod() {
  //   // TODO delete me
  // }

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
