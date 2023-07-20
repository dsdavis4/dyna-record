import SingleTableDesign from "../src";
import {
  Table,
  Entity,
  Attribute,
  HasMany,
  BelongsTo,
  HasOne,
  DateAttribute,
  TestAccessor
} from "../src/decorators";

// import { TestAccessor } from "../src/decorators/TestAccessor";

import Metadata from "../src/metadata";

@Table({ name: "temp-table", primaryKey: "PK", sortKey: "SK", delimiter: "#" })
abstract class DrewsBrewsTable extends SingleTableDesign {
  @Attribute({ alias: "PK", type: "bool" as const } as const)
  public pk: string;

  @Attribute({ alias: "SK" })
  public sk: string;

  @TestAccessor({ alias: "CreatedAt" })
  public accessor createdAt: Date;

  // @DateAttribute({ alias: "UpdatedAt" })
  // public accessor updatedAt: Date;

  // @DateAttribute({ alias: "CreatedAt" })
  // public createdAt: Date;

  @DateAttribute({ alias: "UpdatedAt" })
  public updatedAt: Date;

  // @TestAccessor
  // public accessor testingBla: string;
}

@Entity
class Scale extends DrewsBrewsTable {
  // constructor() {
  //   super();
  //   this.id = "BLAAA";
  //   debugger;
  //   this.updatedAt = new Date();
  //   debugger;
  // }

  @Attribute({ alias: "Id" })
  public id: string;

  @Attribute({ alias: "BreweryId" })
  public breweryId: string;

  @Attribute({ alias: "RoomId" })
  public roomId: string;

  @Attribute({ alias: "ProcessId" })
  public processId: string;

  @Attribute({ alias: "Position" })
  public position: number;

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
*/

// TODO PRE MVP
// Add comments to each decorator/class etc so that on hover there is a description. See projen for example
// Should be able to access params with optional chaining or not as appropriate
// Need to support HasOne where the HasOne is its own parent entity
//      I will do this after the create methods

(async () => {
  try {
    const metadata = Metadata;

    // debugger;

    // const bla = new Scale();

    console.time("bla");

    // HasManyAndBelongsTo
    const room = await Room.findById("1a97a62b-6c30-42bd-a2e7-05f2090e87ce", {
      include: [{ association: "brewery" }, { association: "scales" }]
    });
    console.log(room?.createdAt);
    debugger;
    // room?.createdAt = new Date();
    // room?.updatedAt = new Date();

    if (room) {
      const bla = room.createdAt;
      console.log(JSON.stringify(room, null, 4));
      // debugger;
      // room.testingBla = "ok";
      // const abc = room.testingBla;
      debugger;
    }

    // room.d;

    console.log(room?.createdAt);

    debugger;

    console.log(room?.createdAt);

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
