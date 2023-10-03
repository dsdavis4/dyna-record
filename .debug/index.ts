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

  public someMethod() {}
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
      // room.brewery;

      room.scales;

      room.someMethod();
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
