/* eslint-disable @typescript-eslint/no-unused-vars */
import SingleTableDesign from "../../src";
import { Table } from "../../src/decorators";

describe("Table metadata", () => {
  describe("types", () => {
    it("requires the name of the table and delimiter to be set", () => {
      // @ts-expect-no-error: name and delimiter are required
      @Table({ name: "other-table", delimiter: "|" })
      abstract class SomeTable extends SingleTableDesign {}
    });

    it("has a type error if name is missing", () => {
      // @ts-expect-error: name field is required
      @Table({ delimiter: "|" })
      abstract class SomeTable extends SingleTableDesign {}
    });

    it("requires the name of the table and delimiter to be set", () => {
      // @ts-expect-error: delimiter field is required
      @Table({ name: "other-table" })
      abstract class SomeTable extends SingleTableDesign {}
    });

    it("optionally allows consumers to set their own defaultField attributes", () => {
      // @ts-expect-no-error: defaultFields is optional
      @Table({
        name: "other-table",
        delimiter: "|",
        defaultFields: {
          id: "Id",
          type: "Type",
          createdAt: "CreatedAt",
          updatedAt: "UpdatedAt",
          foreignKey: "ForeignKey",
          foreignEntityType: "ForeignEntityType"
        }
      })
      abstract class SomeTable extends SingleTableDesign {}
    });

    it("does not require all defaultFields to be set", () => {
      // @ts-expect-no-error: defaultFields is optional
      @Table({
        name: "other-table",
        delimiter: "|",
        defaultFields: {
          id: "Id"
        }
      })
      abstract class SomeTable extends SingleTableDesign {}
    });
  });
});
