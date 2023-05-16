import SingleTableDesign from "./src";
import { Table, Entity, Attribute, HasMany, BelongsTo } from "./src/decorators";

import Metadata from "./src/metadata";

@Table({ name: "drews-brews", primaryKey: "PK", sortKey: "SK", delimiter: "#" })
abstract class DrewsBrewsTable extends SingleTableDesign {
  // https://stackoverflow.com/questions/66681411/how-to-implement-an-abstract-class-with-static-properties-in-typescript
  // static readonly tableName = "drews-brews";
  // static readonly primaryKey = "PK";
  // static readonly sortKey = "SK";
  // static readonly delimiter = "#";
}

@Entity
class Scale extends DrewsBrewsTable {
  @Attribute({ alias: "Id" })
  public id!: string;

  // TODO should this be {as: "scales"} WITH type safety?
  // @BelongsTo(type => Brewery, brewery => brewery.scales)
  @BelongsTo(type => Brewery, "scales")
  // TODO is there a uuid type
  public breweryId!: string;
}

@Entity
class Brewery extends DrewsBrewsTable {
  // TODO how to avoid the !
  @Attribute({ alias: "Id" })
  public id!: string;

  @Attribute({ alias: "UpdatedAt" })
  public updatedAt!: Date;

  // TODO should this be an object : {foreignKey: "breweryId"} WITH type safety?
  @HasMany(type => Scale, "breweryId")
  public scales!: Scale[];

  public testing() {
    return "hi";
  }
}

// TODO start here. I am working on findByIncludes
// First get queryFilter working then get data, then map...
// 1. Get QueryParams class to compile
// 2. Remember... I dont need all the doc (toModel, toDoc etc) stuff if I pull if tableName is a class then I can get all the metadata
//     And I can make an attribute class if needed...
//     In fact.... I could make classes for the stuff stored in MetaData...

(async () => {
  try {
    const metadata = Metadata;

    debugger;

    const bla = await Brewery.findById("103417f1-4c42-4b40-86a6-a8930be67c99", {
      include: [{ association: "scales" }]
    });

    debugger;
    const test = bla instanceof Brewery;
    console.log(`Type is correct: ${test}`);

    if (bla) {
      bla.updatedAt;
      bla.scales;
      console.log(bla.someMethod());
      console.log(bla.testing());
    }

    console.log(bla);

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
