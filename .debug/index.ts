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

// TODO can I make it so the attribute decorator target functions must return a class that extends SingleTableDesign?
// Then I could use keyOf instead of toString on propertyName fields etc

// TODO does it make sense for the tahle decorator to do a mixin which extends single table design?
// That way it doesnt have to be extended
@Table({ name: "temp-table", primaryKey: "PK", sortKey: "SK", delimiter: "#" })
abstract class DrewsBrewsTable extends SingleTableDesign {
  // TODO should I make a decorator for primary key and sort key8?
  // At the very least find out how to not repeate myself here and in the decorator for table
  @Attribute({ alias: "PK" })
  public pk: string;

  @Attribute({ alias: "SK" })
  public sk: string;
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

  // TODO Is this relation in the right place?
  // TODO can I make this so that it has to be defined as an intance of the given type?
  // TODO IMPORTANT!! THIS NEEDS TO MAKE SURE BREWERY ID IS ON THIS MODEL..
  // @BelongsTo(type => Brewery, { as: "scales" })
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

  // TODO can I make this return an actual number.. its returning a string
  // maybe by doing a parseInt in the initializer?
  // If I cant get it dynamically I could make a NumberAttribute class...
  // Might be able to use the answer here to assure that values are typed correctly for the attribute type https://stackoverflow.com/questions/60590613/typescript-property-decorator-that-takes-a-parameter-of-the-decorated-property-t
  @Attribute({ alias: "ABV" })
  public abv: number;

  // TODO Is this relation in the right place?
  // TODO can I make this so that it has to be defined as an intance of the given type?
  @BelongsTo(() => Brewery, { foreignKey: "breweryId" })
  public brewery: Brewery;
}

@Entity
class Brewery extends DrewsBrewsTable {
  // TODO do I really want this to have to be defined on all tables?
  // Virtual attribute? Defind on single table design?
  @Attribute({ alias: "Id" })
  public id: string;

  @Attribute({ alias: "Name" })
  public name: string;

  // # TODO should this be on single table design? Maybe optionally through a config?
  @Attribute({ alias: "UpdatedAt" })
  public updatedAt: Date; // TODO this should serialize to date

  // TODO maybe params for a HasMany class?
  // TODO can I make it so that this has to be an array of the given type?
  @HasMany(type => Scale, { targetKey: "breweryId" })
  public scales: Scale[];

  @HasMany(type => Beer, { targetKey: "breweryId" })
  public beers: Beer[];

  @HasMany(type => Room, { targetKey: "breweryId" })
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

  @Attribute({ alias: "CreatedAt" })
  public createdAt: Date;

  @Attribute({ alias: "UpdatedAt" })
  public updatedAt: Date;
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

// TODO HasOne and BelongsTo are essentially the same. Do I keep them?
// Keeping for now in case they are different by the end

// TODO PRE MVP
// Get HasOne Process to work where process is a top level entity
// Add comments to each decorator/class etc so that on hover there is a description. See projen for example
// Should be able to access params with optional chaining or not as appropriate
// Need to support HasOne where the HasOne is its own parent entity
//      I will do this after the create methods

// TODO Implement HasOne. Its probably very similiar to belongsTo...
// Maybe the difference is that the other relationship doesnt have to have the foreign key?
// Or would I want that?
(async () => {
  try {
    const metadata = Metadata;

    console.time("bla");

    // HasManyAndBelongsTo
    // const room = await Room.findById("1a97a62b-6c30-42bd-a2e7-05f2090e87ce", {
    //   include: [{ association: "brewery" }, { association: "scales" }]
    // });

    // console.timeEnd("bla");

    // debugger;

    // BelongsTo only
    // const beer = await Beer.findById("0c381942-30b5-4082-af98-e2ff8a841d81", {
    //   include: [{ association: "brewery" }]
    // });

    // HasMany only
    const brewery = await Brewery.findById(
      "103417f1-4c42-4b40-86a6-a8930be67c99",
      {
        include: [{ association: "scales" }, { association: "beers" }]
      }
    );

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
