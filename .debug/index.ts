import SingleTableDesign from "../src";
import {
  Table,
  Entity,
  PrimaryKeyAttribute,
  SortKeyAttribute,
  Attribute,
  HasMany,
  BelongsTo,
  HasOne
} from "../src/decorators";

import { PrimaryKey, SortKey, ForeignKey } from "../src/types";

import Metadata from "../src/metadata";
import { BelongsToLink } from "../src/relationships";

// TODO keep an eye on this link https://stackoverflow.com/questions/76783862/typescript-5-access-class-constructor-from-a-property-decorator
//  the accepted comment has conversations about getting class name on class field decorators
//   this would make it so I dont have to have addInitializer methods
//

// TODO Can I ensure that Single table design has a (single) primary key and sort key defined?
//    https://stackoverflow.com/questions/69771786/how-to-require-a-specific-data-type-in-a-class-or-object-in-typescript
//    https://stackoverflow.com/questions/60872063/enforce-typescript-object-has-exactly-one-key-from-a-set
@Table({ name: "temp-table", delimiter: "#" })
abstract class DrewsBrewsTable extends SingleTableDesign {
  // TODO add a test that this can be whatever value the user wants: Ex: public myPrimaryKey: PrimaryKey
  @PrimaryKeyAttribute({ alias: "PK" })
  public pk: PrimaryKey;

  // TODO add a test that this can be whatever value the user wants: Ex: public mySortKey: mySortKey
  @SortKeyAttribute({ alias: "SK" })
  public sk: SortKey;

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
  @Attribute({ alias: "BreweryId" })
  public breweryId: ForeignKey;

  @Attribute({ alias: "RoomId" })
  public roomId: ForeignKey;

  @BelongsTo(() => Brewery, { foreignKey: "breweryId" })
  public brewery: Brewery;

  @BelongsTo(() => Room, { foreignKey: "roomId" })
  public room: Room;

  @HasOne(() => Process, { foreignKey: "scaleId" })
  public process?: Process;
}

@Entity
class Beer extends DrewsBrewsTable {
  @Attribute({ alias: "BreweryId" })
  public breweryId: ForeignKey;

  @Attribute({ alias: "Style" })
  public style: string;

  @Attribute({ alias: "Name" })
  public name: string;

  @Attribute({ alias: "ABV" })
  public abv: number; // TODO should serialize to number

  @BelongsTo(() => Brewery, { foreignKey: "breweryId" })
  public brewery: Brewery;
}

@Entity
class Brewery extends DrewsBrewsTable {
  @Attribute({ alias: "Name" })
  public name: string;

  @HasMany(() => Scale, { foreignKey: "breweryId" })
  public scales: Scale[];

  @HasMany(() => Beer, { foreignKey: "breweryId" })
  public beers: Beer[];

  @HasMany(() => Room, { foreignKey: "breweryId" })
  public rooms: Room[];

  public testing() {
    return "hi";
  }
}

@Entity
class Room extends DrewsBrewsTable {
  @Attribute({ alias: "Name" })
  public name: string;

  @Attribute({ alias: "BreweryId" })
  public breweryId: ForeignKey;

  @BelongsTo(() => Brewery, { foreignKey: "breweryId" })
  public brewery: Brewery;

  @HasMany(() => Scale, { foreignKey: "roomId" })
  public scales: Scale[];
}

@Entity
class Process extends DrewsBrewsTable {
  @Attribute({ alias: "Name" })
  public name: string;

  @Attribute({ alias: "CurrentState" })
  public currentState: string;

  @Attribute({ alias: "CurrentStateStatus" })
  public currentStateStatus: string;

  @Attribute({ alias: "CurrentUserInput" })
  public currentUserInput: string;

  @Attribute({ alias: "ScaleId" })
  public scaleId: ForeignKey;

  @BelongsTo(() => Scale, { foreignKey: "scaleId" })
  public scale: Scale;
}

@Entity
class WsToken extends DrewsBrewsTable {
  @Attribute({ alias: "ConnectionId" })
  public connectionId: string;

  @Attribute({ alias: "RoomId" })
  public roomId: ForeignKey;

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

- Support projected associations

- eslint
*/

// TODO PRE MVP
// Add comments to each decorator/class etc so that on hover there is a description. See projen for example
// Should be able to access params with optional chaining or not as appropriate
// Need to support HasOne where the HasOne is its own parent entity
//      I will do this after the create methods

// TODO add eslint workflow

// TODO add tsconfig for dev... that includes test files and debug file

// TODO make a logger class to optionally log. Structured logs..

// TODO check that find byId with includes returns null if the parent is not found... I think I saw this happen...

(async () => {
  try {
    const metadata = Metadata;

    // const beer2 = await Beer.findById("ceb34f08-3472-45e8-b78c-9fa503b70637", {
    //   include: [{ association: "brewery" }]
    // });

    await Beer.update(
      "ceb34f08-3472-45e8-b78c-9fa503b70637",
      // "bad",
      { name: "Serrano Pale Ale 5" }
    );

    debugger;

    // const beer = await Beer.create({
    //   style: "lager",
    //   // breweryId: "157cc981-1be2-4ecc-a257-07d9a6037559",
    //   breweryId: "bad",
    //   abv: 1,
    //   name: "Test 11"
    // });

    // const newProcess = await Process.create({
    //   name: "somename",
    //   currentState: "state",
    //   currentStateStatus: "status",
    //   currentUserInput: "input",
    //   scaleId: "035188db-de1f-4452-b76b-77849445a4dd"
    // });

    // const bla = await Scale.findById("40f17163-f444-4afc-8b22-eebb82aa51a8", {
    //   include: [{ association: "process" }, { association: "room" }]
    // });

    // debugger;

    // if (bla) {
    //   bla.process?.id;

    //   bla.room;

    //   debugger;
    // }

    // debugger;

    // const newScale = await Scale.create({
    //   breweryId: "157cc981-1be2-4ecc-a257-07d9a6037559",
    //   roomId: "87f5e280-a9b0-4dbd-9017-c285256ffd1e"
    // });

    // const scale2 = await Scale.findById(
    //   "035188db-de1f-4452-b76b-77849445a4dd",
    //   { include: [{ association: "process" }] }
    // );

    // scale2?.process;

    // debugger;

    // const process = await Process.findById(scale2?.process?.id ?? "", {
    //   include: [{ association: "scale" }]
    // });

    // process?.scale;

    // debugger;

    const test = await Brewery.findById(
      "157cc981-1be2-4ecc-a257-07d9a6037559",
      { include: [{ association: "beers" }] }
    );

    debugger;

    // const beerTest = await Beer.findById(beer.id, {
    //   include: [{ association: "brewery" }]
    // });

    // debugger;

    // const newRoom = await Room.create({
    //   name: "name",
    //   breweryId: "123"
    // });

    console.time("bla");

    // HasManyAndBelongsTo
    const room = await Room.findById("1a97a62b-6c30-42bd-a2e7-05f2090e87ce", {
      include: [
        { association: "scales" },
        { association: "brewery" }
        // { association: "id" },
        // { association: "bla" },
      ]
      // deleteMe: { scales: true }
      // deleteMeArr: ["scales"]
    });

    debugger;

    // const scale1 = await Scale.findById(
    //   "f32254e6-36ea-4d27-a7a7-f2705cfcff8b",
    //   { include: [{ association: "process" }] }
    // );
    // const scale2 = await Scale.findById(
    //   "035188db-de1f-4452-b76b-77849445a4dd",
    //   { include: [{ association: "process" }] }
    // );
    // const scale3 = await Scale.findById(
    //   "d7cc77b5-dfdf-4f27-9dcd-53d9bd49c0ab",
    //   { include: [{ association: "process" }] }
    // );

    debugger;

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
      // room.brewery.beers;
      room.brewery.id;

      room.scales;
      // room.scales[0].process;
      room.scales[0].id;

      room.someMethod();

      debugger;
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
    } else {
      results[0].foreignEntityType;
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
    debugger;
  }
})();
