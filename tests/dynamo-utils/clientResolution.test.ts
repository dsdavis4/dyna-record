import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  getDefaultClient,
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

      resolveClient({}, "MockTable");

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

      const first = resolveClient({}, "MockTable");
      const second = resolveClient({}, "OtherTable");

      expect(second).toBe(first);
      expect(mockedFrom).toHaveBeenCalledTimes(1);
    });
  });

  describe("clientConfig", () => {
    it("constructs a client from the given config", () => {
      expect.assertions(1);

      resolveClient(
        {
          clientConfig: {
            region: "us-east-1",
            endpoint: "http://localhost:8000"
          }
        },
        "MockTable"
      );

      expect(mockedDynamoDBClient.mock.calls).toEqual([
        [{ region: "us-east-1", endpoint: "http://localhost:8000" }]
      ]);
    });

    it("does not construct or reuse the default client", () => {
      expect.assertions(2);

      const configured = resolveClient(
        { clientConfig: { region: "us-east-1" } },
        "MockTable"
      );
      const fallback = resolveClient({}, "OtherTable");

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

      expect(resolveClient({ client }, "MockTable")).toBe(client);
      expect(mockedDynamoDBClient).not.toHaveBeenCalled();
    });

    it("uses the value a factory returns, and constructs nothing", () => {
      expect.assertions(3);

      const client = stubClient();
      const factory = vi.fn().mockReturnValue(client);

      expect(resolveClient({ client: factory }, "MockTable")).toBe(client);
      expect(factory).toHaveBeenCalledTimes(1);
      expect(mockedDynamoDBClient).not.toHaveBeenCalled();
    });

    it("propagates an error thrown by a factory unchanged", () => {
      expect.assertions(1);

      const failure = new Error("credentials are not ready");
      const factory = vi.fn().mockImplementation(() => {
        throw failure;
      });

      expect(() => resolveClient({ client: factory }, "MockTable")).toThrow(
        failure
      );
    });
  });

  describe("guard", () => {
    it("rejects a client that cannot send commands, naming the table class", () => {
      expect.assertions(1);

      expect(() =>
        // @ts-expect-error a plain JavaScript caller can reach the guard with a
        // value the option's type rejects, which is the case the guard exists for
        resolveClient({ client: { send: "nope" } }, "MockTable")
      ).toThrow(
        "Table MockTable was given a client that cannot send commands. The client option takes a DynamoDBDocumentClient, or a function returning one"
      );
    });

    it("rejects what a factory returns when it cannot send commands, naming the table class", () => {
      expect.assertions(1);

      // @ts-expect-error as above: the function's return type is checked at
      // compile time, so only an untyped caller reaches this branch
      expect(() => resolveClient({ client: () => ({}) }, "OtherTable")).toThrow(
        "Table OtherTable was given a client that cannot send commands. The client option takes a DynamoDBDocumentClient, or a function returning one"
      );
    });

    it("rejects a null client, naming the table class", () => {
      expect.assertions(1);

      expect(() => assertCanSend(null, "MockTable")).toThrow(
        "Table MockTable was given a client that cannot send commands. The client option takes a DynamoDBDocumentClient, or a function returning one"
      );
    });

    it("accepts a client that can send commands", () => {
      expect.assertions(1);

      const client = stubClient();

      expect(assertCanSend(client, "MockTable")).toBe(client);
    });
  });
});
