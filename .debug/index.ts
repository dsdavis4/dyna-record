import SingleTableDesign from "../src";
import {
  Table,
  Entity,
  Attribute,
  HasMany,
  BelongsTo
} from "../src/decorators";

import Metadata from "../src/metadata";

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

  // TODO Is this relation in the right place?
  // TODO can I make this so that it has to be defined as an intance of the given type?
  @BelongsTo(type => Brewery, { as: "scales" })
  public brewery: Brewery;
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
  @Attribute({ alias: "ABV" })
  public abv: number;

  // TODO Is this relation in the right place?
  // TODO can I make this so that it has to be defined as an intance of the given type?
  @BelongsTo(type => Brewery, { as: "scales" })
  public brewery: Brewery;
}

@Entity
class Brewery extends DrewsBrewsTable {
  // TODO do I really want this to have to be defined on all tables?
  // Virtual attribute? Defind on single table design?
  @Attribute({ alias: "Id" })
  public id: string;

  // # TODO should this be on single table design? Maybe optionally through a config?
  @Attribute({ alias: "UpdatedAt" })
  public updatedAt: Date; // TODO this should serialize to date

  // TODO maybe params for a HasMany class?
  // TODO can I make it so that this has to be an array of the given type?
  @HasMany(type => Scale, { foreignKey: "breweryId" })
  public scales: Scale[];

  @HasMany(type => Beer, { foreignKey: "breweryId" })
  public beers: Beer[];

  public testing() {
    return "hi";
  }
}

// TODO can I improve my testing with this? https://jestjs.io/docs/dynamodb

// TODO not a priority but... at some point I should add protection so that
// an attribute/association wont be serialized if that type returned from dynamo is incorrect.
// and I could log an error that there is corrupted data when it finds it

(async () => {
  try {
    const metadata = Metadata;

    const res = await Brewery.findById("103417f1-4c42-4b40-86a6-a8930be67c99", {
      include: [{ association: "scales" }, { association: "beers" }]
    });

    console.log(res);

    const test = res instanceof Brewery;
    console.log(`Type is correct: ${test}`);

    if (res) {
      res.updatedAt;
      res.scales;
      console.log(res.someMethod());
      console.log(res.testing());
    }

    console.log(res);

    debugger;

    // const bla0 = await Brewery.findById("103417f1-4c42-4b40-86a6-a8930be67c99");

    // const bla2 = await Brewery.findById("103417f1-4c42-4b40-86a6-a8930be67c99");

    // const bla3 = await Brewery.findById("103417f1-4c42-4b40-86a6-a8930be67c99");

    // const bla4 = await Brewery.findById("103417f1-4c42-4b40-86a6-a8930be67c99");

    // debugger;

    // const a = await Brewery.findById("103417f1-4c42-4b40-86a6-a8930be67c99");

    // console.log(JSON.stringify(results, null, 4));
  } catch (err) {
    console.log("error", err);
  }
})();
