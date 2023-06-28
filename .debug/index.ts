import SingleTableDesign from "../src";
import {
  Table,
  Entity,
  Attribute,
  HasMany,
  BelongsTo
} from "../src/decorators";

import Metadata from "../src/metadata";

// TODO I need to standadridze on relationship + association terminology

// TODO can I make it so the attribute decorator target functions must return a class that extends SingleTableDesign?
// Then I could use keyOf instead of toString on propertyName fields etc

// TODO does it make sense for the tahle decorator to do a mixin which extends single table design?
// That way it doesnt have to be extended
@Table({ name: "drews-brews", primaryKey: "PK", sortKey: "SK", delimiter: "#" })
abstract class DrewsBrewsTable extends SingleTableDesign {
  // https://stackoverflow.com/questions/66681411/how-to-implement-an-abstract-class-with-static-properties-in-typescript
  // static readonly tableName = "drews-brews";
  // static readonly primaryKey = "PK";
  // static readonly sortKey = "SK";
  // static readonly delimiter = "#";

  // TODO should I make a decorator for primate key and sort key8?
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

  // TODO Is this relation in the right place?
  // TODO can I make this so that it has to be defined as an intance of the given type?
  // TODO IMPORTANT!! THIS NEEDS TO MAKE SURE BREWERY ID IS ON THIS MODEL..
  // @BelongsTo(type => Brewery, { as: "scales" })
  @BelongsTo((type: any) => Brewery, { foreignKey: "breweryId" })
  public brewery: Brewery;

  @BelongsTo((type: any) => Room, { foreignKey: "roomId" })
  public room: Room;
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
  @BelongsTo((type: any) => Brewery, { foreignKey: "breweryId" })
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

/* TODO most mvp
- add protection so that an attribute/association wont be serialized if that type returned from dynamo is incorrect. 
  and I could log an error that there is corrupted data when it finds it

- can I improve my testing with this? https://jestjs.io/docs/dynamodb
- v3 docs https://www.npmjs.com/package/@shelf/jest-dynamodb

- When doing a findById with includes, every belongs to link is serilzied even if its not part of the includes
  See branch/Pr "start_fixing_query_returning_all_links" for a potential solution
  Note I reflected this in my test mocks so I can clean those up
*/

// TODO START HERE
// I just got findById to work with includes

// 1. In the code for serizlaiing Belongsto I need to make fetching the relationships in a promise.all

(async () => {
  try {
    const metadata = Metadata;

    // HasManyAndBelongsTo
    const room = await Room.findById("1a97a62b-6c30-42bd-a2e7-05f2090e87ce", {
      include: [{ association: "brewery" }, { association: "scales" }]
    });

    debugger;

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

    // console.log(JSON.stringify(results, null, 4));
  } catch (err) {
    console.log("error", err);
  }
})();
