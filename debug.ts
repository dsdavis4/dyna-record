import SingleTableDesign from "./src";
import { Table, Model, Attribute } from "./src/decorators";
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
  // TODO START here. How do I do aliases?
  // TODO I could make a TableAlias class/file?
  // Or as an attribute on MockTableClass?
  // and in a decorator validate that the alias exists?
  // I could call if TableSchema?
  // Or make it an attribute on the table...
  @Attribute
  public id!: string;

  @Attribute
  public updatedAt!: Date;
}

(async () => {
  try {
    console.log("bla");
    const bla = await MockModel.findById(
      "103417f1-4c42-4b40-86a6-a8930be67c99"
    );

    const a = new MockModel();

    debugger;

    // bla.attributes()

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
