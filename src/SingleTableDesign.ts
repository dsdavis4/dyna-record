import DynamoBase from "./DynamoBase";
import Metadata, {
  RelationshipMetadata,
  BelongsToRelationship,
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
import QueryResolver from "./QueryResolver";

// type Entity<T> = T extends SingleTableDesign;

// type BelongsToRelationship = RelationshipMetadata & { type: "BelongsTo" };

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

  private async findById<T extends SingleTableDesign>(id: string) {
    const { name: tableName, primaryKey, sortKey } = this.#tableMetadata;
    const dynamo = new DynamoBase(tableName);
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

  // TODO clean up this method...
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

    // TODO remove this block of code, its to show me if we reach this block unintentionally
    if (includedRelationships.length !== includedAssociations.length) {
      throw new Error("Not supposed to hit this code");
    }

    const partitionFilter = this.buildPartitionFilter(includedRelationships);

    const params = new QueryBuilder({
      entityClassName: this.constructor.name,
      key: { [modelPrimaryKey]: this.primaryKeyValue(id) },
      options: { filter: partitionFilter }
    }).build();

    const dynamo = new DynamoBase(tableName);
    const queryResults = await dynamo.query(params);

    const queryResolver = new QueryResolver(this);
    return await queryResolver.resolve(queryResults, includedRelationships);
  }

  private primaryKeyValue(id: string) {
    const { delimiter } = this.#tableMetadata;
    return `${this.constructor.name}${delimiter}${id}`;
  }

  // TODO make sure this doesnt get called more then the number of instances returned...
  // TODO do I need to extend here?
  private static init<Entity extends SingleTableDesign>(this: {
    new (): Entity;
  }) {
    return new this();
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
