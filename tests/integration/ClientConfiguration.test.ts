import DynaRecord from "../../index.js";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  Entity,
  PartitionKeyAttribute,
  SortKeyAttribute,
  StringAttribute,
  Table
} from "../../src/decorators/index.js";
import type { PartitionKey, SortKey } from "../../src/types.js";

const mockDefaultSend = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => {
  return {
    DynamoDBClient: vi.fn().mockImplementation(config => {
      return { key: "MockDynamoDBClient", config };
    })
  };
});

vi.mock("@aws-sdk/lib-dynamodb", () => {
  return {
    DynamoDBDocumentClient: {
      from: vi.fn().mockImplementation(base => {
        return {
          base,
          send: vi.fn().mockImplementation(async command => {
            return await mockDefaultSend(command);
          })
        };
      })
    },
    GetCommand: vi.fn().mockImplementation(input => {
      return { name: "GetCommand", input };
    })
  };
});

const mockedDynamoDBClient = vi.mocked(DynamoDBClient);

const eastSend = vi.fn();
const westSend = vi.fn();
const lateSend = vi.fn();
/**
 * A client that delegates to one bound after the table is declared — the
 * documented answer for a client that cannot exist at module load, since
 * decorators evaluate before application bootstrap runs
 */
const delegatingClient = {
  send: async (command: never) => await lateSend(command)
};

@Table({ name: "default-client-table" })
abstract class DefaultClientTable extends DynaRecord {
  @PartitionKeyAttribute({ alias: "PK" })
  public readonly pk: PartitionKey;

  @SortKeyAttribute({ alias: "SK" })
  public readonly sk: SortKey;
}

@Entity
class DefaultStore extends DefaultClientTable {
  declare readonly type: "DefaultStore";

  @StringAttribute({ alias: "Name" })
  public name: string;
}

@Table({
  name: "configured-table",
  clientConfig: { region: "us-east-1", endpoint: "http://localhost:8000" }
})
abstract class ConfiguredTable extends DynaRecord {
  @PartitionKeyAttribute({ alias: "PK" })
  public readonly pk: PartitionKey;

  @SortKeyAttribute({ alias: "SK" })
  public readonly sk: SortKey;
}

@Entity
class ConfiguredStore extends ConfiguredTable {
  declare readonly type: "ConfiguredStore";

  @StringAttribute({ alias: "Name" })
  public name: string;
}

@Table({ name: "east-table", client: { send: eastSend } })
abstract class EastTable extends DynaRecord {
  @PartitionKeyAttribute({ alias: "PK" })
  public readonly pk: PartitionKey;

  @SortKeyAttribute({ alias: "SK" })
  public readonly sk: SortKey;
}

@Entity
class EastStore extends EastTable {
  declare readonly type: "EastStore";

  @StringAttribute({ alias: "Name" })
  public name: string;
}

@Table({ name: "west-table", client: { send: westSend } })
abstract class WestTable extends DynaRecord {
  @PartitionKeyAttribute({ alias: "PK" })
  public readonly pk: PartitionKey;

  @SortKeyAttribute({ alias: "SK" })
  public readonly sk: SortKey;
}

@Entity
class WestStore extends WestTable {
  declare readonly type: "WestStore";

  @StringAttribute({ alias: "Name" })
  public name: string;
}

@Table({ name: "late-bound-table", client: delegatingClient })
abstract class LateBoundTable extends DynaRecord {
  @PartitionKeyAttribute({ alias: "PK" })
  public readonly pk: PartitionKey;

  @SortKeyAttribute({ alias: "SK" })
  public readonly sk: SortKey;
}

@Entity
class LateBoundStore extends LateBoundTable {
  declare readonly type: "LateBoundStore";

  @StringAttribute({ alias: "Name" })
  public name: string;
}

/**
 * The GetCommand a findById is expected to send, as the lib-dynamodb mock
 * shapes it. Asserting the whole command is what proves a table's operations
 * reach that table's client, rather than merely that something was sent
 */
const getCommandFor = (
  tableName: string,
  entityName: string,
  id: string
): object => ({
  name: "GetCommand",
  input: {
    TableName: tableName,
    Key: { PK: `${entityName}#${id}`, SK: entityName },
    ConsistentRead: false
  }
});

describe("client configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDefaultSend.mockResolvedValue({});
    eastSend.mockResolvedValue({});
    westSend.mockResolvedValue({});
    lateSend.mockResolvedValue({});
  });

  describe("no client options", () => {
    it("sends every operation through the default client", async () => {
      expect.assertions(2);

      await DefaultStore.findById("123");
      await DefaultStore.findById("456");
      await DefaultStore.findById("789");

      // Any client built here was built from an empty config, which is what
      // leaves region, credentials and endpoint to the SDK. How many were
      // built belongs to the resolution unit tests, which own the memo and can
      // reset it — asserting a count here would depend on this test running
      // before anything else touches DefaultStore
      expect(
        mockedDynamoDBClient.mock.calls.every(
          ([config]) => Object.keys(config ?? {}).length === 0
        )
      ).toBe(true);
      expect(mockDefaultSend.mock.calls).toEqual([
        [getCommandFor("default-client-table", "DefaultStore", "123")],
        [getCommandFor("default-client-table", "DefaultStore", "456")],
        [getCommandFor("default-client-table", "DefaultStore", "789")]
      ]);
    });
  });

  describe("clientConfig", () => {
    it("builds one client from the declared config and reuses it", async () => {
      expect.assertions(3);

      await ConfiguredStore.findById("123");

      expect(mockedDynamoDBClient.mock.calls).toEqual([
        [{ region: "us-east-1", endpoint: "http://localhost:8000" }]
      ]);
      expect(mockDefaultSend.mock.calls).toEqual([
        [getCommandFor("configured-table", "ConfiguredStore", "123")]
      ]);

      vi.clearAllMocks();

      await ConfiguredStore.findById("456");

      expect(mockedDynamoDBClient).not.toHaveBeenCalled();
    });
  });

  describe("client", () => {
    it("sends through the declared client, building none", async () => {
      expect.assertions(2);

      await EastStore.findById("123");

      expect(eastSend.mock.calls).toEqual([
        [getCommandFor("east-table", "EastStore", "123")]
      ]);
      expect(mockedDynamoDBClient.mock.calls).toEqual([]);
    });

    it("keeps each table on its own client", async () => {
      expect.assertions(4);

      await EastStore.findById("123");
      await WestStore.findById("456");

      expect(eastSend.mock.calls).toEqual([
        [getCommandFor("east-table", "EastStore", "123")]
      ]);
      expect(westSend.mock.calls).toEqual([
        [getCommandFor("west-table", "WestStore", "456")]
      ]);
      expect(mockDefaultSend.mock.calls).toEqual([]);
      expect(mockedDynamoDBClient.mock.calls).toEqual([]);
    });

    it("sends through a client that delegates to one bound later", async () => {
      expect.assertions(2);

      await LateBoundStore.findById("123");
      await LateBoundStore.findById("456");

      expect(lateSend.mock.calls).toEqual([
        [getCommandFor("late-bound-table", "LateBoundStore", "123")],
        [getCommandFor("late-bound-table", "LateBoundStore", "456")]
      ]);
      expect(mockedDynamoDBClient.mock.calls).toEqual([]);
    });
  });

  describe("metadata serialization", () => {
    it("never serializes the client or its config", () => {
      expect.assertions(3);

      const serialized = JSON.stringify(ConfiguredTable.metadata());

      expect(serialized).not.toContain("clientConfig");
      expect(serialized).not.toContain("us-east-1");
      expect(JSON.stringify(EastTable.metadata())).not.toContain("client");
    });
  });
});
