import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  getDefaultClient,
  normalizeClientOptions,
  resetDefaultClient,
  resolveClient,
  assertCanSend,
  type DynaRecordDocumentClient
} from "../../src/dynamo-utils/clientResolution.js";

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
        return { key: "MockDocumentClient", base, send: vi.fn() };
      })
    }
  };
});

const mockedDynamoDBClient = vi.mocked(DynamoDBClient);
const mockedFrom = vi.mocked(DynamoDBDocumentClient.from);

/**
 * A stand-in for a consumer supplied document client. Its shape is the whole
 * public contract, which is why the double needs nothing but send
 */
const stubClient = (): DynaRecordDocumentClient => ({ send: vi.fn() });

describe("clientResolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDefaultClient();
  });

  describe("default client", () => {
    it("constructs the client with an empty config so the SDK resolves region, credentials and endpoint itself", () => {
      expect.assertions(2);

      resolveClient({});

      expect(mockedDynamoDBClient.mock.calls).toEqual([[{}]]);
      expect(mockedFrom.mock.calls).toEqual([
        [{ key: "MockDynamoDBClient", config: {} }]
      ]);
    });

    it("constructs no client until one is asked for", () => {
      expect.assertions(2);

      expect(mockedDynamoDBClient).not.toHaveBeenCalled();

      getDefaultClient();

      expect(mockedDynamoDBClient).toHaveBeenCalledTimes(1);
    });

    it("constructs the default once and shares it across tables that configure none", () => {
      expect.assertions(2);

      const first = resolveClient({});
      const second = resolveClient({});

      expect(second).toBe(first);
      expect(mockedFrom).toHaveBeenCalledTimes(1);
    });
  });

  describe("clientConfig", () => {
    it("constructs a client from the given config", () => {
      expect.assertions(1);

      resolveClient({
        clientConfig: {
          region: "us-east-1",
          endpoint: "http://localhost:8000"
        }
      });

      expect(mockedDynamoDBClient.mock.calls).toEqual([
        [{ region: "us-east-1", endpoint: "http://localhost:8000" }]
      ]);
    });

    it("does not construct or reuse the default client", () => {
      expect.assertions(2);

      const configured = resolveClient({
        clientConfig: { region: "us-east-1" }
      });
      const fallback = resolveClient({});

      expect(configured).not.toBe(fallback);
      expect(mockedDynamoDBClient.mock.calls).toEqual([
        [{ region: "us-east-1" }],
        [{}]
      ]);
    });
  });

  describe("client", () => {
    it("uses a supplied client as-is and constructs nothing", () => {
      expect.assertions(2);

      const client = stubClient();

      expect(resolveClient({ client })).toBe(client);
      expect(mockedDynamoDBClient).not.toHaveBeenCalled();
    });

    it("uses a client that delegates to one bound later, the documented answer for late binding", () => {
      expect.assertions(2);

      const late = stubClient();
      const delegating = { send: late.send };

      expect(resolveClient({ client: delegating })).toBe(delegating);
      expect(mockedDynamoDBClient).not.toHaveBeenCalled();
    });
  });

  describe("normalizeClientOptions", () => {
    it("passes a usable client through", () => {
      expect.assertions(1);

      const client = stubClient();

      expect(normalizeClientOptions({ client }, "MockTable")).toEqual({
        client
      });
    });

    it("rejects declaring both client and clientConfig, naming the table class", () => {
      expect.assertions(1);

      expect(() =>
        normalizeClientOptions(
          // @ts-expect-error the option type forbids both, so only a plain
          // JavaScript caller reaches this check
          { client: stubClient(), clientConfig: { region: "us-east-1" } },
          "MockTable"
        )
      ).toThrow(
        "Table MockTable declares both client and clientConfig. Declare one: clientConfig configures the client dyna-record builds, client replaces it"
      );
    });
  });

  describe("marshalling guard", () => {
    /**
     * A client carrying the SDK's resolved config shape, which is where
     * lib-dynamodb reads translateConfig from when it marshalls a command
     */
    const clientWithTranslateConfig = (translateConfig: object) => ({
      send: vi.fn(),
      config: { translateConfig }
    });

    it("rejects a client that unmarshalls numbers as wrappers, naming the table class", () => {
      expect.assertions(1);

      const client = clientWithTranslateConfig({
        unmarshallOptions: { wrapNumbers: true }
      });

      expect(() => normalizeClientOptions({ client }, "MockTable")).toThrow(
        "Table MockTable was given a client with unmarshallOptions.wrapNumbers enabled, which dyna-record cannot read number attributes back from. Give dyna-record its own client through clientConfig, or supply one built with the SDK's default marshalling"
      );
    });

    it("accepts a client that leaves wrapNumbers off", () => {
      expect.assertions(1);

      const client = clientWithTranslateConfig({
        unmarshallOptions: { wrapNumbers: false }
      });

      expect(normalizeClientOptions({ client }, "MockTable")).toEqual({
        client
      });
    });

    it("accepts a client carrying other marshalling options", () => {
      expect.assertions(1);

      const client = clientWithTranslateConfig({
        marshallOptions: { removeUndefinedValues: true }
      });

      expect(normalizeClientOptions({ client }, "MockTable")).toEqual({
        client
      });
    });

    it("accepts a client with no config at all, which is every test double", () => {
      expect.assertions(1);

      const client = stubClient();

      expect(normalizeClientOptions({ client }, "MockTable")).toEqual({
        client
      });
    });
  });

  describe("assertCanSend", () => {
    it("rejects a value that cannot send commands, naming the table class", () => {
      expect.assertions(1);

      expect(() => assertCanSend({ send: "nope" }, "MockTable")).toThrow(
        "Table MockTable was given a client that cannot send commands. The client option takes a DynamoDBDocumentClient"
      );
    });

    it("rejects a value with no send at all, naming the table class", () => {
      expect.assertions(1);

      expect(() => assertCanSend({}, "OtherTable")).toThrow(
        "Table OtherTable was given a client that cannot send commands. The client option takes a DynamoDBDocumentClient"
      );
    });

    it("rejects a null client, naming the table class", () => {
      expect.assertions(1);

      expect(() => assertCanSend(null, "MockTable")).toThrow(
        "Table MockTable was given a client that cannot send commands. The client option takes a DynamoDBDocumentClient"
      );
    });

    it("accepts a client that can send commands", () => {
      expect.assertions(1);

      const client = stubClient();

      expect(assertCanSend(client, "MockTable")).toBe(client);
    });
  });
});
