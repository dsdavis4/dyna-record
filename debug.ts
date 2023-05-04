import SingleTableDesign from "./src";
import { Table, Entity, Attribute } from "./src/decorators";
// TODO get rid of all references to any

import Metadata from "./src/metadata";

@Table({ name: "drews-brews", primaryKey: "PK", sortKey: "SK", delimiter: "#" })
// @Table
// TODO can this be abstract?
abstract class DrewsBrewsTable extends SingleTableDesign {
  // static readonly tableName = "drews-brews";
  // static readonly primaryKey = "PK";
  // static readonly sortKey = "SK";
  // static readonly delimiter = "#";
}

// TODO I dont think I need the param for entity...
@Entity
class Brewery extends DrewsBrewsTable {
  // TODO START here. How do I do aliases?
  // TODO I could make a TableAlias class/file?
  // Or as an attribute on MockTableClass?
  // and in a decorator validate that the alias exists?
  // I could call if TableSchema?
  // Or make it an attribute on the table...
  @Attribute({ alias: "Id" })
  public id!: string;

  @Attribute({ alias: "UpdatedAt" })
  public updatedAt!: Date;
}

// TODO START HERE
// I was working on making my own meta data class. IS this what I want to do?
// TODO is this a better way of using a mixin?
// TODO IT works the same as before comitted chanes now... I think

(async () => {
  try {
    const metadata = Metadata;

    debugger;
    const bla = await Brewery.findById("103417f1-4c42-4b40-86a6-a8930be67c99");
    const test = bla instanceof Brewery;
    console.log(`Type is correct: ${test}`);

    if (bla) {
      bla.updatedAt;
      // TODO how to get this to work?
      // bla.someMethod();
    }

    debugger;

    const a = await Brewery.findById("103417f1-4c42-4b40-86a6-a8930be67c99");

    // console.log(JSON.stringify(results, null, 4));
  } catch (err) {
    console.log("error", err);
  }
})();
