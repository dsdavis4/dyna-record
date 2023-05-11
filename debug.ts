import SingleTableDesign from "./src";
import { Table, Entity, Attribute } from "./src/decorators";

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
class Brewery extends DrewsBrewsTable {
  @Attribute({ alias: "Id" })
  public id!: string;

  @Attribute({ alias: "UpdatedAt" })
  public updatedAt!: Date;

  public testing() {
    return "hi";
  }
}

(async () => {
  try {
    const metadata = Metadata;

    debugger;

    const bla = await Brewery.findById("103417f1-4c42-4b40-86a6-a8930be67c99");
    const test = bla instanceof Brewery;
    console.log(`Type is correct: ${test}`);

    if (bla) {
      bla.updatedAt;
      console.log(bla.someMethod());
      console.log(bla.testing());
    }

    console.log(bla);

    debugger;

    const bla0 = await Brewery.findById("103417f1-4c42-4b40-86a6-a8930be67c99");

    const bla2 = await Brewery.findById("103417f1-4c42-4b40-86a6-a8930be67c99");

    const bla3 = await Brewery.findById("103417f1-4c42-4b40-86a6-a8930be67c99");

    const bla4 = await Brewery.findById("103417f1-4c42-4b40-86a6-a8930be67c99");

    debugger;

    // const a = await Brewery.findById("103417f1-4c42-4b40-86a6-a8930be67c99");

    // console.log(JSON.stringify(results, null, 4));
  } catch (err) {
    console.log("error", err);
  }
})();
