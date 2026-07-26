import DynamoClient from "../../src/dynamo-utils/DynamoClient.js";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";

const mockSend = vi.fn();
const mockedQueryCommand = vi.mocked(QueryCommand);

vi.mock("@aws-sdk/client-dynamodb", () => {
  return {
    DynamoDBClient: vi.fn().mockImplementation(() => {
      return { key: "MockDynamoDBClient" };
    })
  };
});

vi.mock("@aws-sdk/lib-dynamodb", () => {
  return {
    DynamoDBDocumentClient: {
      from: vi.fn().mockImplementation(() => {
        return {
          send: vi.fn().mockImplementation(async command => {
            return await mockSend(command);
          })
        };
      })
    },
    QueryCommand: vi.fn().mockImplementation(input => {
      return { name: "QueryCommand", input };
    })
  };
});

describe("DynamoClient", () => {
  afterEach(() => {
    vi.clearAllMocks();
    // clearAllMocks does not drain the `...Once` queue; reset it so queued
    // responses never bleed into the next test.
    mockSend.mockReset();
  });

  describe("query", () => {
    it("returns all items from a single page when there is no LastEvaluatedKey", async () => {
      expect.assertions(2);

      mockSend.mockResolvedValueOnce({ Items: [{ id: "1" }, { id: "2" }] });

      const res = await DynamoClient.query({ TableName: "mock-table" });

      expect(res).toEqual([{ id: "1" }, { id: "2" }]);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it("drains every page by following LastEvaluatedKey and concatenates the items", async () => {
      expect.assertions(4);

      mockSend
        .mockResolvedValueOnce({
          Items: [{ id: "1" }],
          LastEvaluatedKey: { PK: "a", SK: "b" }
        })
        .mockResolvedValueOnce({
          Items: [{ id: "2" }],
          LastEvaluatedKey: { PK: "c", SK: "d" }
        })
        .mockResolvedValueOnce({ Items: [{ id: "3" }] });

      const res = await DynamoClient.query({ TableName: "mock-table" });

      expect(res).toEqual([{ id: "1" }, { id: "2" }, { id: "3" }]);
      expect(mockSend).toHaveBeenCalledTimes(3);
      // Each subsequent page is requested with the previous page's cursor
      expect(mockedQueryCommand).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ ExclusiveStartKey: { PK: "a", SK: "b" } })
      );
      expect(mockedQueryCommand).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ ExclusiveStartKey: { PK: "c", SK: "d" } })
      );
    });

    it("stops paginating once a caller-provided Limit is reached, treating Limit as a total item cap", async () => {
      expect.assertions(3);

      // Only one page is queued: if the implementation ignores Limit and tries
      // to fetch a second page, the send mock returns undefined and the test
      // fails loudly.
      mockSend.mockResolvedValueOnce({
        Items: [{ id: "1" }, { id: "2" }],
        LastEvaluatedKey: { PK: "a", SK: "b" }
      });

      const res = await DynamoClient.query({
        TableName: "mock-table",
        Limit: 2
      });

      expect(res).toEqual([{ id: "1" }, { id: "2" }]);
      expect(mockSend).toHaveBeenCalledTimes(1);
      // The single request asks for exactly the Limit
      expect(mockedQueryCommand).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ Limit: 2 })
      );
    });
  });
});
