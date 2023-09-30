import type SingleTableDesign from "../SingleTableDesign";
import Metadata, {
  type RelationshipMetadata,
  type EntityMetadata,
  type TableMetadata,
  type EntityClass
} from "../metadata";
import DynamoClient from "../DynamoClient";
import { QueryBuilder, QueryResolver } from "../query-utils";
import { includedRelationshipsFilter } from "../query-utils/Filters";
import type { EntityAttributes, RelationshipAttributeNames } from "./types";

export interface FindByIdOptions<T extends SingleTableDesign> {
  include?: Array<{ association: keyof T }>;
  deleteMe?: Partial<Record<keyof T, true>>;
  deleteMeArr?: Array<keyof T>;
}

// TODO when an association is included the type on the variable should know that key will be present
//   EX: const brewery = await Brewery.findById("bla", {includes: "scales"})
//   brewery.scales should be typed as Scale[] and not be optional
//
//  would something like this work for making fields required when the association is included?
// export type FindByIdResponse<
//   T extends SingleTableDesign,
//   Opts extends FindByIdOptions<T>
// > = Required<Pick<T, NonNullable<Opts["include"]>[number]["association"]>> & T;

// type IncludedTypes<T extends SingleTableDesign> = {
//   [K in keyof T]: K extends NonNullable<
//     FindByIdOptions<T>["include"]
//   >[number]["association"]
//     ? K
//     : never;
// }[keyof T];

type ToNonDist<Type> = [Type] extends [any] ? Type[] : never;

type UnpackedArray<T> = T extends Array<infer U> ? U : T;

type IncludedKeys<
  T extends SingleTableDesign,
  Opts extends FindByIdOptions<T>
> = keyof {
  [K in UnpackedArray<NonNullable<Opts["deleteMeArr"]>>]: K;
};

// TODO this is close maybe...I feel like I am close...
// Why wont this work? Perhaps check distributive conditional types https://www.typescriptlang.org/docs/handbook/2/conditional-types.html#distributive-conditional-types

// TODO do I need the second generic param
export type FindByIdResponse<T extends SingleTableDesign> = Pick<
  T,
  // UnpackedArray<NonNullable<FindByIdOptions<T>["deleteMeArr"]>>
  // NonNullable<FindByIdOptions<T>["deleteMe"]>[number]
  IncludedKeys<T, FindByIdOptions<T>>
> | null;

// type IncludedKeys<
//   T extends SingleTableDesign,
//   Opts extends FindByIdOptions<T>
// > = keyof {
//   [K in keyof T as T[K] extends Opts["deleteMe"] ? never : K]: K;
// };

// TODO START HERE...
// THIS IS IT: https://dev.to/zenstack/dynamic-return-type-based-on-input-parameter-in-typescript-like-prisma-1292

// type TruthyKeys<T> = keyof {
//   [K in keyof T as T[K] extends false | undefined | null ? never : K]: K;
// };

// export type FindByIdResponse<T extends SingleTableDesign> = T & {
//   [P in TruthyKeys<FindByIdOptions<T>["deleteMe"]>]: P extends "scales"
//     ? T
//     : never;
// };

// export type FindByIdResponse<T extends SingleTableDesign> = T & {
//   [P in UnpackedArray<
//     NonNullable<FindByIdOptions<T>["deleteMe"]>
//   >]: P extends keyof T ? T : never;
// };

/**
 * FindById operations
 */
class FindById<T extends SingleTableDesign> {
  private readonly EntityClass: EntityClass<T>;

  readonly #entityMetadata: EntityMetadata;
  readonly #tableMetadata: TableMetadata;

  constructor(Entity: EntityClass<T>) {
    this.EntityClass = Entity;
    this.#entityMetadata = Metadata.getEntity(Entity.name);
    this.#tableMetadata = Metadata.getTable(
      this.#entityMetadata.tableClassName
    );
  }

  /**
   * Find an entity by Id and optionally include associations
   * @param {string} id - Entity Id
   * @param {Object} options - FindById options
   * @param {Object[]=} options.include - The associations to include in the query
   * @param {string} options.include[].association - The name of the association to include. Must be defined on the model
   * @returns An entity with optional included associations serialized
   */
  public async run(
    id: string,
    options: FindByIdOptions<T> = {}
  ): Promise<FindByIdResponse<T>> {
    if (options.include !== undefined) {
      return await this.findByIdWithIncludes(id, options.include);
    } else {
      return await this.findByIdOnly(id);
    }
  }

  /**
   * Find an Entity by id without associations
   * @param {string} id - Entity Id
   * @returns An entity object or null
   */
  private async findByIdOnly(id: string): Promise<FindByIdResponse<T>> {
    const { name: tableName, primaryKey, sortKey } = this.#tableMetadata;

    const dynamo = new DynamoClient(tableName);
    const res = await dynamo.findById({
      [primaryKey]: this.EntityClass.primaryKeyValue(id),
      [sortKey]: this.EntityClass.name
    });

    if (res !== null) {
      const queryResolver = new QueryResolver<T>(this.EntityClass);
      return await queryResolver.resolve(res);
    } else {
      return null as any;
    }
  }

  /**
   * Find an entity with included associations
   * @param {string} id - Entity Id
   * @param {Object[]=} includedAssociations - The associations to include in the query
   * @param {string} includedAssociations[].association - The name of the association to include. Must be defined on the model
   * @returns An entity with included associations serialized
   */
  private async findByIdWithIncludes(
    id: string,
    includedAssociations: NonNullable<FindByIdOptions<T>["include"]>
  ): Promise<FindByIdResponse<T>> {
    const { name: tableName, primaryKey } = this.#tableMetadata;
    const modelPrimaryKey = this.#entityMetadata.attributes[primaryKey].name;

    const includedRelationships = includedAssociations.reduce<
      RelationshipMetadata[]
    >((acc, includedRel) => {
      const key = includedRel.association as string;
      const included = this.#entityMetadata.relationships[key];
      if (included !== undefined) acc.push(included);
      return acc;
    }, []);

    const partitionFilter = includedRelationshipsFilter(
      this.EntityClass.name,
      includedRelationships
    );

    const params = new QueryBuilder({
      entityClassName: this.EntityClass.name,
      key: { [modelPrimaryKey]: this.EntityClass.primaryKeyValue(id) },
      options: { filter: partitionFilter }
    }).build();

    const dynamo = new DynamoClient(tableName);
    const queryResults = await dynamo.query(params);

    const queryResolver = new QueryResolver<T>(this.EntityClass);
    return await queryResolver.resolve(queryResults, includedRelationships);
  }
}

export default FindById;
