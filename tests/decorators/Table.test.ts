/* eslint-disable @typescript-eslint/no-unused-vars */
import DynaRecord from "../../index.js";
import { Table } from "../../src/decorators/index.js";

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

    it("optionally allows a client to be set", () => {
      // @ts-expect-no-error: client is optional
      @Table({
        name: "other-table",
        client: { send: async () => await Promise.resolve({}) }
      })
      abstract class SomeTable extends DynaRecord {}
    });

    it("rejects a function returning a client, which is not a client", () => {
      expect.assertions(1);

      expect(() => {
        @Table({
          name: "other-table",
          // @ts-expect-error: the client option takes a client, not a function returning one
          client: () => ({ send: async () => await Promise.resolve({}) })
        })
        abstract class FunctionClientTable extends DynaRecord {}
      }).toThrow(
        "Table FunctionClientTable was given a client that cannot send commands. The client option takes a DynamoDBDocumentClient"
      );
    });

    it("optionally allows clientConfig to be set", () => {
      // @ts-expect-no-error: clientConfig is optional
      @Table({ name: "other-table", clientConfig: { region: "us-east-1" } })
      abstract class SomeTable extends DynaRecord {}
    });

    it("rejects declaring both client and clientConfig, at compile time and again for plain JavaScript callers", () => {
      expect.assertions(1);

      expect(() => {
        // @ts-expect-error: client and clientConfig are mutually exclusive
        @Table({
          name: "other-table",
          client: { send: async () => await Promise.resolve({}) },
          clientConfig: { region: "us-east-1" }
        })
        abstract class BothOptionsTable extends DynaRecord {}
      }).toThrow(
        "Table BothOptionsTable declares both client and clientConfig. Declare one: clientConfig configures the client dyna-record builds, client replaces it"
      );
    });

    it("rejects a client that cannot send commands, at compile time and again where the table is declared", () => {
      expect.assertions(1);

      expect(() => {
        // @ts-expect-error: a client must be able to send commands
        @Table({ name: "other-table", client: { send: "not a function" } })
        abstract class BadClientTable extends DynaRecord {}
      }).toThrow(
        "Table BadClientTable was given a client that cannot send commands. The client option takes a DynamoDBDocumentClient"
      );
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
