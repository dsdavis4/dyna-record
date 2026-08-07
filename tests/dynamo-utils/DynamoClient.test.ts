import DynamoClient from "../../src/dynamo-utils/DynamoClient.js";
import { QueryCommand, SearchVectorsCommand } from "@aws-sdk/lib-dynamodb";
import Logger from "../../src/Logger.js";

const mockSend = vi.fn();
const mockedQueryCommand = vi.mocked(QueryCommand);
const mockedSearchVectorsCommand = vi.mocked(SearchVectorsCommand);

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
    }),
    SearchVectorsCommand: vi.fn().mockImplementation(input => {
      return { name: "SearchVectorsCommand", input };
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

  describe("searchVectors", () => {
    it("sends SearchVectorsCommand with the params passed through verbatim and returns the SearchResults array", async () => {
      expect.assertions(3);

      const searchResults = [
        { Item: { id: "1" }, Distance: 0.12 },
        { Item: { id: "2" }, Distance: 0.34 }
      ];
      mockSend.mockResolvedValueOnce({ SearchResults: searchResults });

      const params = {
        TableName: "mock-table",
        IndexName: "mock-vector-index",
        SearchVector: [0.1, 0.2, 0.3],
        TopK: 2
      };

      const res = await DynamoClient.searchVectors(params);

      expect(res).toEqual(searchResults);
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockedSearchVectorsCommand).toHaveBeenCalledWith(params);
    });

    it("returns an empty array when the response has no SearchResults", async () => {
      expect.assertions(1);

      mockSend.mockResolvedValueOnce({});

      const res = await DynamoClient.searchVectors({
        TableName: "mock-table",
        IndexName: "mock-vector-index",
        SearchVector: [0.1, 0.2],
        TopK: 1
      });

      expect(res).toEqual([]);
    });

    it("redacts the query vector from log output, logging a placeholder with the dimension count instead", async () => {
      expect.assertions(3);

      const logSpy = vi.spyOn(Logger, "log").mockImplementation(() => {});
      mockSend.mockResolvedValueOnce({ SearchResults: [] });

      const searchVector = [0.111, 0.222, 0.333, 0.444];
      await DynamoClient.searchVectors({
        TableName: "mock-table",
        IndexName: "mock-vector-index",
        SearchVector: searchVector,
        TopK: 5
      });

      expect(logSpy).toHaveBeenCalledWith("searchVectors", {
        params: expect.objectContaining({
          TableName: "mock-table",
          IndexName: "mock-vector-index",
          SearchVector: "[vector:4]",
          TopK: 5
        })
      });
      // The float array must never reach the logger in any argument
      const loggedText = JSON.stringify(logSpy.mock.calls);
      expect(loggedText).not.toContain("0.111");
      expect(loggedText).not.toContain("0.222");
    });

    it("does not mutate the caller's params when redacting the vector for logging", async () => {
      expect.assertions(2);

      vi.spyOn(Logger, "log").mockImplementation(() => {});
      mockSend.mockResolvedValueOnce({ SearchResults: [] });

      const params = {
        TableName: "mock-table",
        IndexName: "mock-vector-index",
        SearchVector: [0.1, 0.2, 0.3],
        TopK: 2
      };

      await DynamoClient.searchVectors(params);

      expect(params.SearchVector).toEqual([0.1, 0.2, 0.3]);
      // The command itself must receive the real vector, not the placeholder
      expect(mockedSearchVectorsCommand).toHaveBeenCalledWith(
        expect.objectContaining({ SearchVector: [0.1, 0.2, 0.3] })
      );
    });
  });
});
