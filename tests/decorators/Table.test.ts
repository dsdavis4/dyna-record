/* eslint-disable @typescript-eslint/no-unused-vars */
import DynaRecord from "../../index";
import { Table } from "../../src/decorators";

describe("Table metadata", () => {
  describe("types", () => {
    it("requires the name of the table to be set", () => {
      // @ts-expect-no-error: name is required
      @Table({ name: "other-table" })
      abstract class SomeTable extends DynaRecord {}
    });

    it("has a type error if name is missing", () => {
      // @ts-expect-error: name field is required
      @Table({})
      abstract class SomeTable extends DynaRecord {}
    });

    it("optionally allows delimiter to be set", () => {
      // @ts-expect-no-error: delimiter field is required
      @Table({ name: "other-table", delimiter: "|" })
      abstract class SomeTable extends DynaRecord {}
    });

    it("optionally allows consumers to set their own defaultField attributes", () => {
      // @ts-expect-no-error: defaultFields is optional
      @Table({
        name: "other-table",
        defaultFields: {
          id: { alias: "Id" },
          type: { alias: "Type" },
          createdAt: { alias: "CreatedAt" },
          updatedAt: { alias: "UpdatedAt" }
        }
      })
      abstract class SomeTable extends DynaRecord {}
    });

    it("only accepts valid default fields", () => {
      @Table({
        name: "other-table",
        defaultFields: {
          id: { alias: "Id" },
          // @ts-expect-error: 'someField' is not a default field
          someField: { alias: "SomeField" }
        }
      })
      abstract class SomeTable extends DynaRecord {}
    });

    it("does not require all defaultFields to be set", () => {
      // @ts-expect-no-error: each defaultField is optional
      @Table({
        name: "other-table",
        defaultFields: {
          id: { alias: "Id" }
        }
      })
      abstract class SomeTable extends DynaRecord {}
    });
  });
});
