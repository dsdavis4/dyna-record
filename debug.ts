import SingleTableDesign from "./src";
import { Model, Table, Attribute } from "./src/SingleTableDesign";

// See example.js for other functions

// TODO get rid of all references to any

@Table({ name: "drews-brews", primaryKey: "PK", sortKey: "SK", delimiter: "#" })
class MockTableClass extends SingleTableDesign {
  // static readonly tableName = "drews-brews";
  // static readonly primaryKey = "PK";
  // static readonly sortKey = "SK";
  // static readonly delimiter = "#";
}

// TODO could I add a decorator @Model to provide methods for serializing object to a table
// and using DI to pass to table?
@Model("Brewery")
class MockModel extends MockTableClass {
  // TODO why do I have to call it?
  @Attribute
  public id!: string;

  @Attribute
  public updatedAt!: Date;
  // TODO could I do something like below to annotate attributes so I know the table value name?
  // TODO coul also usethe decorator to indicate required...
  //    https://stackoverflow.com/questions/55117125/typescript-decorators-reflect-metadata
  // https://2ality.com/2022/10/javascript-decorators.html#example%3A-collecting-instances
  // @Attribute("SomeAttr")
  // public string someAttr;
  // static bla() {
  //   this.tableName = "123";
  // }
}

(async () => {
  try {
    console.log("bla");
    const bla = await MockModel.findById(
      "103417f1-4c42-4b40-86a6-a8930be67c99"
    );

    // MockModel.errors

    // bla.errors;

    debugger;

    // bla.attributes;
    console.log(bla);

    debugger;
    // console.log(JSON.stringify(results, null, 4));
  } catch (err) {
    console.log("error", err);
  }
})();
