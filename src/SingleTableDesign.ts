import DynamoClient from "./DynamoClient";
import Metadata, {
  RelationshipMetadata,
  EntityMetadata,
  TableMetadata
} from "./metadata";
import { QueryBuilder, QueryResolver, Filters } from "./query-utils";
import { Attribute } from "./decorators";

interface FindByIdOptions<T> {
  include?: { association: keyof T }[];
}

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

  // TODO refactor so I dont need instance methods...?
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

  private async findById<T extends SingleTableDesign>(id: string) {
    const { name: tableName, primaryKey, sortKey } = this.#tableMetadata;
    const dynamo = new DynamoClient(tableName);
    const res = await dynamo.findById({
      [primaryKey]: this.primaryKeyValue(id),
      [sortKey]: this.constructor.name
    });

    if (res) {
      const queryResolver = new QueryResolver(this);
      return await queryResolver.resolve(res);
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

    const partitionFilter = Filters.includedRelationships(
      this.constructor.name,
      includedRelationships
    );

    const params = new QueryBuilder({
      entityClassName: this.constructor.name,
      key: { [modelPrimaryKey]: this.primaryKeyValue(id) },
      options: { filter: partitionFilter }
    }).build();

    const dynamo = new DynamoClient(tableName);
    const queryResults = await dynamo.query(params);

    const queryResolver = new QueryResolver(this);
    return await queryResolver.resolve(queryResults, includedRelationships);
  }

  private primaryKeyValue(id: string) {
    const { delimiter } = this.#tableMetadata;
    return `${this.constructor.name}${delimiter}${id}`;
  }

  private static init<Entity extends SingleTableDesign>(this: {
    new (): Entity;
  }) {
    return new this();
  }
}

export default SingleTableDesign;
