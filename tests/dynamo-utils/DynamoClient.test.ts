import DynamoClient from "../../src/dynamo-utils/DynamoClient.js";
import {
  QueryCommand,
  SearchVectorsCommand,
  TransactWriteCommand
} from "@aws-sdk/lib-dynamodb";
import Logger from "../../src/Logger.js";

const mockSend = vi.fn();
const mockedQueryCommand = vi.mocked(QueryCommand);
const mockedSearchVectorsCommand = vi.mocked(SearchVectorsCommand);
const mockedTransactWriteCommand = vi.mocked(TransactWriteCommand);

vi.mock("@aws-sdk/lib-dynamodb", () => {
  return {
    QueryCommand: vi.fn().mockImplementation(input => {
      return { name: "QueryCommand", input };
    }),
    SearchVectorsCommand: vi.fn().mockImplementation(input => {
      return { name: "SearchVectorsCommand", input };
    }),
    TransactWriteCommand: vi.fn().mockImplementation(input => {
      return { name: "TransactWriteCommand", input };
    })
  };
});

const dynamoClient = new DynamoClient({
  send: async command => await mockSend(command)
});

describe("DynamoClient", () => {
  it("reads send per command, so a client whose send is replaced later is honored", async () => {
    expect.assertions(2);

    const first = vi.fn().mockResolvedValue({ Items: [{ id: "1" }] });
    const second = vi.fn().mockResolvedValue({ Items: [{ id: "2" }] });
    const swappable = { send: first };
    const client = new DynamoClient(swappable);

    await client.query({ TableName: "mock-table" });

    // The shape aws-sdk-client-mock produces between tests: the method is
    // replaced on the client that was already handed to dyna-record
    swappable.send = second;

    await client.query({ TableName: "mock-table" });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

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

      const res = await dynamoClient.query({ TableName: "mock-table" });

      expect(res).toEqual([{ id: "1" }, { id: "2" }]);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it("drains every page by following LastEvaluatedKey and concatenates the items", async () => {
      expect.assertions(2);

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

      const res = await dynamoClient.query({ TableName: "mock-table" });

      expect(res).toEqual([{ id: "1" }, { id: "2" }, { id: "3" }]);
      // Every page, whole: each carries the previous page's cursor, the first
      // carries none, and nothing else drifts between them. A per-field
      // assertion would pass just as well if a later page quietly grew a Limit
      // or dropped the TableName
      expect(mockedQueryCommand.mock.calls).toEqual([
        [{ TableName: "mock-table", ExclusiveStartKey: undefined }],
        [{ TableName: "mock-table", ExclusiveStartKey: { PK: "a", SK: "b" } }],
        [{ TableName: "mock-table", ExclusiveStartKey: { PK: "c", SK: "d" } }]
      ]);
    });

    it("honours a caller-provided ExclusiveStartKey on the first page", async () => {
      expect.assertions(2);

      // Nothing covered the caller supplying their own cursor. The pagination
      // loop owns that field on every page after the first, so the first page
      // is where it could be overwritten with undefined without any test
      // noticing
      mockSend
        .mockResolvedValueOnce({
          Items: [{ id: "2" }],
          LastEvaluatedKey: { PK: "c", SK: "d" }
        })
        .mockResolvedValueOnce({ Items: [{ id: "3" }] });

      const res = await dynamoClient.query({
        TableName: "mock-table",
        ExclusiveStartKey: { PK: "a", SK: "b" }
      });

      expect(res).toEqual([{ id: "2" }, { id: "3" }]);
      expect(mockedQueryCommand.mock.calls).toEqual([
        [{ TableName: "mock-table", ExclusiveStartKey: { PK: "a", SK: "b" } }],
        [{ TableName: "mock-table", ExclusiveStartKey: { PK: "c", SK: "d" } }]
      ]);
    });

    it("stops paginating once a caller-provided Limit is reached, treating Limit as a total item cap", async () => {
      expect.assertions(2);

      // Only one page is queued: if the implementation ignores Limit and tries
      // to fetch a second page, the send mock returns undefined and the test
      // fails loudly.
      mockSend.mockResolvedValueOnce({
        Items: [{ id: "1" }, { id: "2" }],
        LastEvaluatedKey: { PK: "a", SK: "b" }
      });

      const res = await dynamoClient.query({
        TableName: "mock-table",
        Limit: 2
      });

      expect(res).toEqual([{ id: "1" }, { id: "2" }]);
      // One request, whole: it asks for exactly the Limit and no cursor
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            Limit: 2,
            ExclusiveStartKey: undefined
          }
        ]
      ]);
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

      const res = await dynamoClient.searchVectors(params);

      expect(res).toEqual(searchResults);
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockedSearchVectorsCommand).toHaveBeenCalledWith(params);
    });

    it("returns an empty array when the response has no SearchResults", async () => {
      expect.assertions(1);

      mockSend.mockResolvedValueOnce({});

      const res = await dynamoClient.searchVectors({
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
      await dynamoClient.searchVectors({
        TableName: "mock-table",
        IndexName: "mock-vector-index",
        SearchVector: searchVector,
        TopK: 5
      });

      // The whole logged payload: redaction is only proven if nothing ELSE in
      // what reaches the logger carries the vector
      expect(logSpy.mock.calls).toEqual([
        [
          "searchVectors",
          {
            params: {
              TableName: "mock-table",
              IndexName: "mock-vector-index",
              SearchVector: "[vector:4]",
              TopK: 5
            }
          }
        ]
      ]);
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

      await dynamoClient.searchVectors(params);

      expect(params.SearchVector).toEqual([0.1, 0.2, 0.3]);
      // The command itself must receive the real vector, not the placeholder,
      // and must carry the caller's other params unchanged alongside it
      expect(mockedSearchVectorsCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            IndexName: "mock-vector-index",
            SearchVector: [0.1, 0.2, 0.3],
            TopK: 2
          }
        ]
      ]);
    });
  });

  describe("transactWriteItems", () => {
    it("redacts vectors under any per-index attribute name — redaction matches the reserved prefix, not one literal", async () => {
      expect.assertions(2);

      const logSpy = vi.spyOn(Logger, "log").mockImplementation(() => {});
      mockSend.mockResolvedValueOnce({});

      const params = {
        TransactItems: [
          {
            Put: {
              TableName: "mock-table",
              Item: {
                PK: "Article#123",
                SK: "Article",
                __dyna_vector_articles: [0.1, 0.2]
              }
            }
          },
          {
            Update: {
              TableName: "mock-table",
              Key: { PK: "Faq#123", SK: "Faq" },
              UpdateExpression: "SET #__dyna_vector_faq = :__dyna_vector_faq",
              ExpressionAttributeValues: {
                ":__dyna_vector_faq": [0.1, 0.2, 0.3, 0.4]
              }
            }
          }
        ]
      };

      await dynamoClient.transactWriteItems(params);

      expect(logSpy.mock.calls).toEqual([
        [
          "transactWriteItems",
          {
            params: {
              TransactItems: [
                {
                  Put: {
                    TableName: "mock-table",
                    Item: {
                      PK: "Article#123",
                      SK: "Article",
                      __dyna_vector_articles: "[vector:2]"
                    }
                  }
                },
                {
                  Update: {
                    TableName: "mock-table",
                    Key: { PK: "Faq#123", SK: "Faq" },
                    UpdateExpression:
                      "SET #__dyna_vector_faq = :__dyna_vector_faq",
                    ExpressionAttributeValues: {
                      ":__dyna_vector_faq": "[vector:4]"
                    }
                  }
                }
              ]
            }
          }
        ]
      ]);
      // Redaction never mutates the real params the command sends
      expect(params.TransactItems[0].Put?.Item?.__dyna_vector_articles).toEqual(
        [0.1, 0.2]
      );

      logSpy.mockRestore();
    });

    it("redacts embedding vectors in Put items from log output, logging a placeholder with the dimension count instead", async () => {
      expect.assertions(3);

      const logSpy = vi.spyOn(Logger, "log").mockImplementation(() => {});
      mockSend.mockResolvedValueOnce({});

      const params = {
        TransactItems: [
          {
            Put: {
              TableName: "mock-table",
              Item: {
                PK: "Listing#123",
                SK: "Listing",
                Description: "A listing",
                __dyna_vector: [0.111, 0.222, 0.333]
              }
            }
          },
          {
            ConditionCheck: {
              TableName: "mock-table",
              Key: { PK: "Store#456", SK: "Store" },
              ConditionExpression: "attribute_exists(PK)"
            }
          }
        ]
      };

      await dynamoClient.transactWriteItems(params);

      expect(logSpy.mock.calls).toEqual([
        [
          "transactWriteItems",
          {
            params: {
              TransactItems: [
                {
                  Put: {
                    TableName: "mock-table",
                    Item: {
                      PK: "Listing#123",
                      SK: "Listing",
                      Description: "A listing",
                      __dyna_vector: "[vector:3]"
                    }
                  }
                },
                {
                  ConditionCheck: {
                    TableName: "mock-table",
                    Key: { PK: "Store#456", SK: "Store" },
                    ConditionExpression: "attribute_exists(PK)"
                  }
                }
              ]
            }
          }
        ]
      ]);
      // The float array must never reach the logger in any argument
      const loggedText = JSON.stringify(logSpy.mock.calls);
      expect(loggedText).not.toContain("0.111");
      expect(loggedText).not.toContain("0.222");
    });

    it("redacts embedding vectors in Update expression attribute values from log output", async () => {
      expect.assertions(2);

      const logSpy = vi.spyOn(Logger, "log").mockImplementation(() => {});
      mockSend.mockResolvedValueOnce({});

      await dynamoClient.transactWriteItems({
        TransactItems: [
          {
            Update: {
              TableName: "mock-table",
              Key: { PK: "Listing#123", SK: "Listing" },
              UpdateExpression:
                "SET #Description = :Description, #__dyna_vector = :__dyna_vector",
              ExpressionAttributeNames: {
                "#Description": "Description",
                "#__dyna_vector": "__dyna_vector"
              },
              ExpressionAttributeValues: {
                ":Description": "A listing",
                ":__dyna_vector": [0.111, 0.222]
              }
            }
          }
        ]
      });

      expect(logSpy.mock.calls).toEqual([
        [
          "transactWriteItems",
          {
            params: {
              TransactItems: [
                {
                  Update: {
                    TableName: "mock-table",
                    Key: { PK: "Listing#123", SK: "Listing" },
                    UpdateExpression:
                      "SET #Description = :Description, #__dyna_vector = :__dyna_vector",
                    ExpressionAttributeNames: {
                      "#Description": "Description",
                      "#__dyna_vector": "__dyna_vector"
                    },
                    // Only the vector is replaced; every other field is
                    // logged verbatim
                    ExpressionAttributeValues: {
                      ":Description": "A listing",
                      ":__dyna_vector": "[vector:2]"
                    }
                  }
                }
              ]
            }
          }
        ]
      ]);
      expect(JSON.stringify(logSpy.mock.calls)).not.toContain("0.111");
    });

    it("does not mutate the caller's params when redacting vectors for logging", async () => {
      expect.assertions(3);

      vi.spyOn(Logger, "log").mockImplementation(() => {});
      mockSend.mockResolvedValueOnce({});

      const putVector = [0.1, 0.2];
      const updateVector = [0.3, 0.4];
      const params = {
        TransactItems: [
          {
            Put: {
              TableName: "mock-table",
              Item: { PK: "Listing#123", __dyna_vector: putVector }
            }
          },
          {
            Update: {
              TableName: "mock-table",
              Key: { PK: "Listing#456", SK: "Listing" },
              UpdateExpression: "SET #__dyna_vector = :__dyna_vector",
              ExpressionAttributeValues: { ":__dyna_vector": updateVector }
            }
          }
        ]
      };

      await dynamoClient.transactWriteItems(params);

      expect(params.TransactItems[0].Put?.Item?.__dyna_vector).toEqual([
        0.1, 0.2
      ]);
      expect(
        params.TransactItems[1].Update?.ExpressionAttributeValues?.[
          ":__dyna_vector"
        ]
      ).toEqual([0.3, 0.4]);
      // The command itself must receive the real vectors, not placeholders
      expect(mockedTransactWriteCommand).toHaveBeenCalledWith(params);
    });

    it("logs params untouched when the transaction carries no vectors", async () => {
      expect.assertions(1);

      const logSpy = vi.spyOn(Logger, "log").mockImplementation(() => {});
      mockSend.mockResolvedValueOnce({});

      const params = {
        TransactItems: [
          {
            Put: {
              TableName: "mock-table",
              Item: { PK: "Customer#123", SK: "Customer", Name: "Some Name" }
            }
          }
        ]
      };

      await dynamoClient.transactWriteItems(params);

      expect(logSpy.mock.calls).toEqual([["transactWriteItems", { params }]]);
    });
  });
});
