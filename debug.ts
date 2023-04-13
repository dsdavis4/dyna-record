import SingleTableDesign from "./src";
import { Table, Entity, Attribute } from "./src/decorators";
// TODO get rid of all references to any

@Table({ name: "drews-brews", primaryKey: "PK", sortKey: "SK", delimiter: "#" })
class MockTableClass extends SingleTableDesign {
  // static readonly tableName = "drews-brews";
  // static readonly primaryKey = "PK";
  // static readonly sortKey = "SK";
  // static readonly delimiter = "#";
}

@Entity("Brewery")
class MockEntity extends MockTableClass {
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

(async () => {
  try {
    const bla = await MockEntity.findById(
      "103417f1-4c42-4b40-86a6-a8930be67c99"
    );
    const test = bla instanceof MockEntity;

    if (bla) {
      bla.updatedAt;
      bla.someMethod();
    }

    debugger;

    const a = await MockEntity.findById("103417f1-4c42-4b40-86a6-a8930be67c99");

    // console.log(JSON.stringify(results, null, 4));
  } catch (err) {
    console.log("error", err);
  }
})();
