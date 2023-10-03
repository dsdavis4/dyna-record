import SingleTableDesign from "../src";
import {
  Table,
  Entity,
  Attribute,
  HasMany,
  BelongsTo,
  HasOne
} from "../src/decorators";

import Metadata from "../src/metadata";
import { FindByIdOptions, FindByIdResponse } from "../src/operations";
import { BelongsToLink } from "../src/relationships";

// TODO keep an eye on this link https://stackoverflow.com/questions/76783862/typescript-5-access-class-constructor-from-a-property-decorator
//  the accepted comment has conversations about getting class name on class field decorators
//   this would make it so I dont have to have addInitializer methods
//

@Table({ name: "temp-table", primaryKey: "PK", sortKey: "SK", delimiter: "#" })
abstract class DrewsBrewsTable extends SingleTableDesign {
  @Attribute({ alias: "PK" })
  public pk: string;

  @Attribute({ alias: "SK" })
  public sk: string;

  @Attribute({ alias: "CreatedAt" })
  public createdAt: Date; // TODO this should serialize to date

  @Attribute({ alias: "UpdatedAt" })
  public updatedAt: Date; // TODO this should serialize to date

  /**
   * Query the GSI 'ByRoomIdAndConnectionId'
   * @param {string} roomId - Room Id
   * @param {string=} connectionId - Websocket connection Id
   * @returns Array of Entities
   */
  protected static async queryByRoomIdAndConnectionId<
    T extends DrewsBrewsTable & { roomId: string; connectionId: string }
  >(roomId: string, connectionId?: string) {
    const keyCondition = connectionId ? { roomId, connectionId } : { roomId };

    return await super.query<T>(keyCondition, {
      indexName: "ByRoomIdAndConnectionId"
    });
  }

  // public someMethod() {}
}

@Entity
class Scale extends DrewsBrewsTable {
  @Attribute({ alias: "Id" })
  public id: string;

  @Attribute({ alias: "BreweryId" })
  public breweryId: string;

  @Attribute({ alias: "RoomId" })
  public roomId: string;

  @Attribute({ alias: "ProcessId" })
  public processId: string;

  @BelongsTo(() => Brewery, { foreignKey: "breweryId" })
  public brewery: Brewery;

  @BelongsTo(() => Room, { foreignKey: "roomId" })
  public room: Room;

  @HasOne(() => Process, { foreignKey: "processId" })
  public process: Process;
}

@Entity
class Beer extends DrewsBrewsTable {
  @Attribute({ alias: "Id" })
  public id: string;

  @Attribute({ alias: "BreweryId" })
  public breweryId: string;

  @Attribute({ alias: "Style" })
  public style: string;

  @Attribute({ alias: "ABV" })
  public abv: number; // TODO should serialize to number

  @BelongsTo(() => Brewery, { foreignKey: "breweryId" })
  public brewery: Brewery;
}

@Entity
class Brewery extends DrewsBrewsTable {
  @Attribute({ alias: "Id" })
  public id: string;

  @Attribute({ alias: "Name" })
  public name: string;

  @HasMany(() => Scale, { targetKey: "breweryId" })
  public scales: Scale[];

  @HasMany(() => Beer, { targetKey: "breweryId" })
  public beers: Beer[];

  @HasMany(() => Room, { targetKey: "breweryId" })
  public rooms: Room[];

  public testing() {
    return "hi";
  }
}

@Entity
class Room extends DrewsBrewsTable {
  @Attribute({ alias: "Id" })
  public id: string;

  @Attribute({ alias: "Name" })
  public name: string;

  @Attribute({ alias: "BreweryId" })
  public breweryId: string;

  @BelongsTo(() => Brewery, { foreignKey: "breweryId" })
  public brewery: Brewery;

  @HasMany(() => Scale, { targetKey: "roomId" })
  public scales: Scale[];

  public testing2() {
    return "hi";
  }
}

@Entity
class Process extends DrewsBrewsTable {
  @Attribute({ alias: "Id" })
  public id: string;

  @Attribute({ alias: "Name" })
  public name: string;

  @Attribute({ alias: "CurrentState" })
  public currentState: string;

  @Attribute({ alias: "CurrentStateStatus" })
  public currentStateStatus: string;

  @Attribute({ alias: "CurrentUserInput" })
  public currentUserInput: string;
}

@Entity
class WsToken extends DrewsBrewsTable {
  @Attribute({ alias: "Id" })
  public id: string;

  @Attribute({ alias: "ConnectionId" })
  public connectionId: string;

  @Attribute({ alias: "RoomId" })
  public roomId: string;

  /**
   * Queries index 'ByRoomIdAndConnectionId' and returns all items for a roomId
   * @param {string} roomId - Room Id
   * @returns Array of WsToken
   */
  static async getAllByRoomId(roomId: string): Promise<WsToken[]> {
    // The method will only return WsToken, the filter makes typescript happy for the return type
    const wsTokens = await super.queryByRoomIdAndConnectionId<WsToken>(roomId);
    return wsTokens.filter(
      (wsToken): wsToken is WsToken => wsToken instanceof WsToken
    );
  }
}

// TODO delete seed-table scripts in package.json and ts file

/* TODO post mvp
- add protection so that an attribute/association wont be serialized if that type returned from dynamo is incorrect. 
  and I could log an error that there is corrupted data when it finds it

- can I improve my testing with this? https://jestjs.io/docs/dynamodb
- v3 docs https://www.npmjs.com/package/@shelf/jest-dynamodb

- When doing a findById with includes, every belongs to link is serilzied even if its not part of the includes
  See branch/Pr "start_fixing_query_returning_all_links" for a potential solution
  Note I reflected this in my test mocks so I can clean those up

- Support projected associations

- eslint
*/

// TODO PRE MVP
// Add comments to each decorator/class etc so that on hover there is a description. See projen for example
// Should be able to access params with optional chaining or not as appropriate
// Need to support HasOne where the HasOne is its own parent entity
//      I will do this after the create methods

// TODO START HERE.... on to create

// TODO add eslint workflow

// TODO add tsconfig for dev... that includes test files and debug file

// class Bla {
//   public one: string;
//   public two: string;
//   public three: string;
// }

// type RemoveSome<T> = Pick<T, "one">;

// type Params<T>

// const someFunction = (params: string[]): RemoveSome<Bla> => {
//   return new Bla();
// };

// const duh = someFunction(["two"]);

// duh.one;
// duh.two;
// duh.three;

type GroupByResult<
  ObjectType,
  KeyType extends keyof ObjectType
> = ObjectType[KeyType] extends PropertyKey
  ? Record<ObjectType[KeyType], Omit<ObjectType, KeyType>[]>
  : never;

const groupBy = <ObjectType, KeyType extends keyof ObjectType>(
  arr: ObjectType[],
  key: KeyType
): GroupByResult<ObjectType, KeyType> => {
  return [] as unknown as GroupByResult<ObjectType, KeyType>;
};

type MyType = {
  city: number;
  name: string;
};

const L: MyType[] = [
  {
    city: 1,
    name: "name1"
  },
  {
    city: 1,
    name: "name2"
  },
  {
    city: 2,
    name: "name3"
  },
  {
    city: 2,
    name: "name4"
  }
];

// ...
const grouped = groupBy(L, "city");

const duh = grouped[0];

if (duh) {
  duh[0].city;
  duh[0].name;
}

// type UnpackedArray<T> = T extends Array<infer U> ? U : T;

// type Bla = UnpackedArray<NonNullable<FindByIdOptions<Room>["deleteMe"]>>;

// type Abc<T extends SingleTableDesign> = T & {
//   [P in UnpackedArray<
//     NonNullable<FindByIdOptions<T>["deleteMe"]>
//   >]: P extends keyof T ? T : never;
// };

// type Res<T extends SingleTableDesign> = T & {
//   [P in UnpackedArray<
//     NonNullable<FindByIdOptions<T>["deleteMe"]>
//   >]: P extends keyof T ? T : never;
// };

// type Res<T extends SingleTableDesign> = T & {
//   [P in UnpackedArray<
//     NonNullable<FindByIdOptions<T>["deleteMe"]>
//   >]: P extends "scales" ? T : never;
// };

// export type Res<T extends SingleTableDesign> = Pick<
//   T,
//   UnpackedArray<NonNullable<FindByIdOptions<T>["deleteMe"]>>
//   // NonNullable<FindByIdOptions<T>["deleteMe"]>[number]
// >;

// function keys<T extends SingleTableDesign>(
//   _options: FindByIdOptions<T> = {}
// ): Res<T> {
//   return "bla" as any;
// }

// const ddd = keys<Room>({ deleteMe: ["scales"] });

// console.log(ddd.id);
// console.log(ddd.scales);

// type TruthyKeys<T> = keyof {
//   [K in keyof T as T[K] extends false | undefined | null ? never : K]: K;
// };

// type Args<T> = Partial<Record<keyof T, true>>;

// type PostGetPayload<S extends Args<Room>> = S extends {
//   include: any;
// }
//   ? Room & {
//       [P in TruthyKeys<S["include"]>]: P extends "scales" ? Scale : never;
//     }
//   : Room;

// declare function findMany<T extends Args<Room>>(args: T): PostGetPayload<T>;

// const rrrr = findMany({ scales: true });

// rrrr.scales;

// rrrr.scales;

type TruthyKeys<T> = keyof {
  [K in keyof T as T[K] extends false | undefined | null ? never : K]: K;
};

type TestType = TruthyKeys<{ a: true; b: false; c: null; d: "d" }>;

type Args = { include: Record<string, true> };

type PostGetPayload<S extends Args> = S extends {
  include: any;
}
  ? Room & {
      [P in TruthyKeys<S["include"]>]: P extends "scales" ? Scale[] : never;
    }
  : Room;

type Testing2 = PostGetPayload<{ include: { scales: true } }>;

const bla: Testing2 = {} as any;
bla.scales;

type TestingGenericTruthy<
  T extends SingleTableDesign,
  Opts extends FindByIdOptions<T>
> = T & {
  [P in TruthyKeys<Opts["deleteMe"]>]: P extends keyof T ? T[P] : never;
};

type Testing3 = TestingGenericTruthy<Room, { deleteMe: { scales: true } }>;

const www: Testing3 = {} as any;
www.scales;

//---------- Pick working with truthy..

type TestingPick = Pick<Room, TruthyKeys<{ scales: true }>>;

const mmm: TestingPick = {} as any;
mmm.scales;
mmm.id;

//^^^^^^ Pick working with truthy..

//-------START HERE.... Why dont the functions return right? but it works in example...

type UnpackedArray<T> = T extends Array<infer U> ? U : T;

type IncludedKeys<
  T extends SingleTableDesign,
  Opts extends FindByIdOptions<T>
> = keyof {
  [K in UnpackedArray<NonNullable<Opts["deleteMeArr"]>>]: K;
};

type TestingPickArr = Pick<
  Room,
  IncludedKeys<Room, { deleteMeArr: ["scales"] }>
>;

const jjjj: TestingPickArr = {} as any;
jjjj.scales;
jjjj.id;

type TestingPickArrGeneric<
  T extends SingleTableDesign,
  Opts extends FindByIdOptions<T>
> = Pick<T, IncludedKeys<T, Opts>>;

const pppp: TestingPickArrGeneric<
  Room,
  { deleteMeArr: ["scales", "brewery"] }
> = {} as any;
pppp.scales;
pppp.id;
pppp.brewery;

// type ExtractFindByIdOptions<T> = T extends FindByIdOptions<infer T> ? T : never;

// type ExtractFindByIdOptions<T extends SingleTableDesign> =
//   T extends FindByIdOptions<infer T, any> ? T : never;

// type ExtractIncluded<T> = T extends NonNullable<
//   FindByIdOptions<infer T>["deleteMeArr"]
// >
//   ? T
//   : never;

type ExtractOptions<P> = P extends FindByIdOptions<infer T> ? T : never;

type ExtractStuff<T> = T extends {
  deleteMeArr: infer V;
}
  ? V
  : never;

// type FetcherParamsInfer<F extends FindByIdOptions<any>> =
//   F extends FindByIdOptions<infer Params> ? Params : never;

type FindByIdResponseBla<
  T extends SingleTableDesign
  // Opts extends FindByIdOptions<T>
> = Pick<
  T,
  // ExtractFindByIdOptions<NonNullable<FindByIdOptions<T>["deleteMeArr"]>>
  // NonNullable<FindByIdOptions<T>["deleteMe"]>[number]
  // IncludedKeys<T, ExtractFindByIdOptions<T>>
  // IncludedKeys<T, ExtractIncluded<Opts["deleteMeArr"]>>
  IncludedKeys<T, FindByIdOptions<T>>
  // IncludedKeys<T, ExtractOptions<FindByIdOptions<T>>>
> | null;

// TODO THIS https://stackoverflow.com/questions/70646538/typescript-dynamic-object-return-type-based-on-array-parameter
// https://stackoverflow.com/questions/74233353/typescript-generic-function-return-type-from-paramaters

// type FindByIdResponseBla<
//   T extends SingleTableDesign,
//   Opts extends FindByIdOptions<T>
// > = Opts extends { deleteMeArr: Array<keyof T> }
//   ? Pick<T, IncludedKeys<T, Opts>>
//   : T;

// type FindByIdResponseBla2<
//   T extends SingleTableDesign,
//   Opts extends FindByIdOptions<T>
// > = Pick<
//   T,
//   // UnpackedArray<NonNullable<FindByIdOptions<T>["deleteMeArr"]>>
//   // NonNullable<FindByIdOptions<T>["deleteMe"]>[number]
//   IncludedKeys<T, Opts>
// > | null;

function myFuncBla<
  T extends SingleTableDesign
  // Opts extends FindByIdOptions<T>
>(
  id: string,
  options: FindByIdOptions<T>
): FindByIdResponseBla<T, FindByIdOptions<T>> {
  return {} as any;
}

// class MyClass extends SingleTableDesign {
//   public id: string;

//   @HasMany(() => Scale, { targetKey: "roomId" })
//   public scales: Scale[];

//   static findById(
//     id: string,
//     options: FindByIdOptions<MyClass>
//   ): FindByIdResponseBla<MyClass> {
//     return {} as any;
//   }
// }

// class FindById<T extends SingleTableDesign, Opts extends FindByIdOptions<T>> {
//   static run(
//     id: string,
//     options: FindByIdOptions<MyClass>
//   ): FindByIdResponseBla<MyClass> {
//     return {} as any;
//   }
// }

const eeee = myFuncBla<Room>("123", {
  deleteMeArr: ["scales"]
});

if (eeee) {
  eeee.scales;
  eeee.id;
  eeee.brewery;
}

// const uuuu = MyClass.myFuncBla("123", { deleteMeArr: ["scales"] });

// if (uuuu) {
//   uuuu.scales;
//   uuuu.id;
// }

//-------

type KeysMatching<T, V> = {
  [K in keyof T]-?: T[K] extends V ? K : never;
}[keyof T];

interface FuncOpts<T extends Entity> {
  // include: Array<keyof T>;
  include?: Array<{ association: RelationshipAttributeNames<T> }>;
  // include: [
  //   {
  //     [P in keyof T]: T[P] extends Entity ? never : { association: T[P] };
  //   }
  // ];
}

type EntityClass<T> = (new () => T) & typeof Entity;

// interface Data<Id> {
//   id: Id
// }

// const getFirstId = <
//   Id extends string | number,
//   Tuple extends Array<Data<Id>>
// >(data: [...Tuple]): [...Tuple][number]['id'] => {
//   return data[0].id
// }

// type MyKeys<T extends Entity, Opts extends FuncOpts<T>> = keyof {
//   [K in UnpackedArray<Opts["include"]>]: K;
// };

export type RelationshipAttributeNames<T> = {
  [K in keyof T]: T[K] extends Entity ? K : T[K] extends Entity[] ? K : never;
}[keyof T];

/**
 * Entity attributes excluding relationship attributes
 */
export type EntityAttributes<T extends Entity> = Omit<
  T,
  RelationshipAttributeNames<T>
>;

// TODO do I have to repat the include here..?
type MyKeys<T extends Entity, Opts extends FuncOpts<T>> = Opts extends Required<
  FuncOpts<T>
>
  ? [...NonNullable<Opts>["include"]][number]["association"]
  : never;

abstract class Entity {
  abstract id: string;

  public static async findById<T extends Entity, Opts extends FuncOpts<T>>(
    this: EntityClass<T>,
    id: string,
    opts: Opts
  ): Promise<Pick<T, keyof EntityAttributes<T> | MyKeys<T, Opts>>> {
    return {} as any;
  }
}

class User extends Entity {
  id: string;
  name: string;
  age: number;

  myEntity1: Entity[];

  myEntity2: Entity;
}

const useSyncFields = <T extends Entity, U extends keyof T>(
  type: { new (obj: T): T },
  id: string,
  fields: U[]
): Pick<T, U> => {
  return {} as any; // implementation
};

const res = useSyncFields(User, "1234", ["id", "name"]);

res.id;
res.name;
res.age;

const user = await User.findById("123", {
  include: [
    // { association: "id" }, // TODO this should not be valid
    { association: "myEntity1" }
    // { association: "myEntity2" }
  ]
});

if (user) {
  user.id;
  user.name;
  user.age;
  user.myEntity1;
  user.myEntity2;
}

(async () => {
  try {
    const metadata = Metadata;

    console.time("bla");

    // HasManyAndBelongsTo
    const room = await Room.findById("1a97a62b-6c30-42bd-a2e7-05f2090e87ce", {
      include: [
        { association: "scales" }
        // { association: "brewery" },
        // { association: "id" },
        // { association: "bla" },
      ]
      // deleteMe: { scales: true }
      // deleteMeArr: ["scales"]
    });

    if (room) {
      room.type;
      room.pk;
      room.sk;
      room.updatedAt;
      room.createdAt;
      room.id;
      room.name;
      room.breweryId;
      room.brewery;

      room.scales;

      room.testing2();
    }

    // debugger;

    // Example filtering on sort key. Gets all belongs to links for a brewery that link to a scale
    const res = await Brewery.query("157cc981-1be2-4ecc-a257-07d9a6037559", {
      skCondition: { $beginsWith: "Scale" },
      filter: { type: ["BelongsToLink", "Brewery"] }
      // indexName: "Bla"
    });

    const results = await Brewery.query(
      {
        pk: Brewery.primaryKeyValue("157cc981-1be2-4ecc-a257-07d9a6037559"),
        sk: { $beginsWith: "Scale" }
      },
      {
        filter: { type: ["BelongsToLink", "Brewery"] }
      }
    );

    if (results[0] && !(results[0] instanceof BelongsToLink)) {
      const bla = results[0];
      // @ts-expect-error
      bla.scales;
    }

    const wsTokens = await WsToken.getAllByRoomId(
      "1a97a62b-6c30-42bd-a2e7-05f2090e87ce"
    );

    // debugger;

    // console.timeEnd("bla");

    // debugger;

    // BelongsTo only
    // const beer = await Beer.findById("0c381942-30b5-4082-af98-e2ff8a841d81", {
    //   include: [{ association: "brewery" }]
    // });

    // HasMany only
    // const brewery = await Brewery.findById(
    //   "103417f1-4c42-4b40-86a6-a8930be67c99",
    //   {
    //     include: [{ association: "scales" }, { association: "beers" }]
    //   }
    // );

    // const scale = await Scale.findById("035188db-de1f-4452-b76b-77849445a4dd", {
    //   include: [{ association: "process" }]
    // });

    console.timeEnd("bla");

    debugger;

    // console.log(JSON.stringify(results, null, 4));
  } catch (err) {
    console.log("error", err);
  }
})();
