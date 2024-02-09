import { Customer, PaymentMethod } from "./mockModels";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { BelongsToLink } from "../../src/relationships";

const mockSend = jest.fn();
const mockQuery = jest.fn();
const mockedQueryCommand = jest.mocked(QueryCommand);

jest.mock("@aws-sdk/client-dynamodb", () => {
  return {
    DynamoDBClient: jest.fn().mockImplementation(() => {
      return { key: "MockDynamoDBClient" };
    })
  };
});

jest.mock("@aws-sdk/lib-dynamodb", () => {
  return {
    DynamoDBDocumentClient: {
      from: jest.fn().mockImplementation(() => {
        return {
          send: jest.fn().mockImplementation(async command => {
            mockSend(command);
            if (command.name === "QueryCommand") {
              return await Promise.resolve(mockQuery());
            }
          })
        };
      })
    },
    QueryCommand: jest.fn().mockImplementation(() => {
      return { name: "QueryCommand" };
    })
  };
});

describe("Query", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("queryByKeys", () => {
    it("queries by PK only", async () => {
      expect.assertions(9);

      mockQuery.mockResolvedValueOnce({
        Items: [
          {
            PK: "Customer#123",
            SK: "Customer",
            Id: "123",
            Name: "Some Customer",
            Address: "11 Some St",
            Type: "Customer",
            CreatedAt: "2021-09-15T04:26:31.148Z",
            UpdatedAt: "2022-09-15T04:26:31.148Z",
            SomeAttr: "attribute that is not modeled"
          },
          {
            PK: "Customer#123",
            SK: "Order#111",
            Id: "001",
            Type: "BelongsToLink",
            CreatedAt: "2021-10-15T09:31:15.148Z",
            UpdatedAt: "2022-10-15T09:31:15.148Z",
            SomeAttr: "attribute that is not modeled"
          },
          {
            PK: "Customer#123",
            SK: "Order#112",
            Id: "003",
            Type: "BelongsToLink",
            CreatedAt: "2021-11-01T23:31:21.148Z",
            UpdatedAt: "2022-11-01T23:31:21.148Z",
            SomeAttr: "attribute that is not modeled"
          },
          {
            PK: "Customer#123",
            SK: "Order#113",
            Id: "004",
            Type: "BelongsToLink",
            CreatedAt: "2021-09-01T23:31:21.148Z",
            UpdatedAt: "2022-09-01T23:31:21.148Z",
            SomeAttr: "attribute that is not modeled"
          },
          {
            PK: "Customer#123",
            SK: "PaymentMethod#116",
            Id: "007",
            Type: "BelongsToLink",
            CreatedAt: "2021-10-01T12:31:21.148Z",
            UpdatedAt: "2022-10-01T12:31:21.148Z",
            SomeAttr: "attribute that is not modeled"
          },
          {
            PK: "Customer#123",
            SK: "PaymentMethod#117",
            Id: "008",
            Type: "BelongsToLink",
            CreatedAt: "2021-11-21T12:31:21.148Z",
            UpdatedAt: "2022-11-21T12:31:21.148Z",
            SomeAttr: "attribute that is not modeled"
          }
        ]
      });

      const result = await Customer.query({ pk: "Customer#123" });

      expect(result).toEqual([
        {
          pk: "Customer#123",
          sk: "Customer",
          address: "11 Some St",
          id: "123",
          name: "Some Customer",
          type: "Customer",
          createdAt: new Date("2021-09-15T04:26:31.148Z"),
          updatedAt: new Date("2022-09-15T04:26:31.148Z")
        },
        {
          pk: "Customer#123",
          sk: "Order#111",
          id: "001",
          type: "BelongsToLink",
          createdAt: new Date("2021-10-15T09:31:15.148Z"),
          updatedAt: new Date("2022-10-15T09:31:15.148Z")
        },
        {
          pk: "Customer#123",
          sk: "Order#112",
          id: "003",
          type: "BelongsToLink",
          createdAt: new Date("2021-11-01T23:31:21.148Z"),
          updatedAt: new Date("2022-11-01T23:31:21.148Z")
        },
        {
          pk: "Customer#123",
          sk: "Order#113",
          id: "004",
          type: "BelongsToLink",
          createdAt: new Date("2021-09-01T23:31:21.148Z"),
          updatedAt: new Date("2022-09-01T23:31:21.148Z")
        },
        {
          pk: "Customer#123",
          sk: "PaymentMethod#116",
          id: "007",
          type: "BelongsToLink",
          createdAt: new Date("2021-10-01T12:31:21.148Z"),
          updatedAt: new Date("2022-10-01T12:31:21.148Z")
        },
        {
          pk: "Customer#123",
          sk: "PaymentMethod#117",
          id: "008",
          type: "BelongsToLink",
          createdAt: new Date("2021-11-21T12:31:21.148Z"),
          updatedAt: new Date("2022-11-21T12:31:21.148Z")
        }
      ]);
      result.forEach((res, index) => {
        if (index === 0) expect(res).toBeInstanceOf(Customer);
        else expect(res).toBeInstanceOf(BelongsToLink);
      });

      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK1",
            ExpressionAttributeNames: { "#PK": "PK" },
            ExpressionAttributeValues: { ":PK1": "Customer#123" }
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("queries by PK and SK", async () => {
      expect.assertions(4);

      mockQuery.mockResolvedValueOnce({
        Items: [
          {
            PK: "Customer#123",
            SK: "Order#111",
            Id: "001",
            Type: "BelongsToLink",
            CreatedAt: "2021-10-15T09:31:15.148Z",
            UpdatedAt: "2022-10-15T09:31:15.148Z",
            SomeAttr: "attribute that is not modeled"
          }
        ]
      });

      const result = await Customer.query({
        pk: "Customer#123",
        sk: "Order#111"
      });

      expect(result).toEqual([
        {
          pk: "Customer#123",
          sk: "Order#111",
          id: "001",
          type: "BelongsToLink",
          createdAt: new Date("2021-10-15T09:31:15.148Z"),
          updatedAt: new Date("2022-10-15T09:31:15.148Z")
        }
      ]);
      expect(result[0]).toBeInstanceOf(BelongsToLink);

      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK1 AND #SK = :SK2",
            ExpressionAttributeNames: { "#PK": "PK", "#SK": "SK" },
            ExpressionAttributeValues: {
              ":PK1": "Customer#123",
              ":SK2": "Order#111"
            }
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("queries by PK SK begins with", async () => {
      expect.assertions(6);

      mockQuery.mockResolvedValueOnce({
        Items: [
          {
            PK: "Customer#123",
            SK: "Order#111",
            Id: "001",
            Type: "BelongsToLink",
            CreatedAt: "2021-10-15T09:31:15.148Z",
            UpdatedAt: "2022-10-15T09:31:15.148Z",
            SomeAttr: "attribute that is not modeled"
          },
          {
            PK: "Customer#123",
            SK: "Order#112",
            Id: "003",
            Type: "BelongsToLink",
            CreatedAt: "2021-11-01T23:31:21.148Z",
            UpdatedAt: "2022-11-01T23:31:21.148Z",
            SomeAttr: "attribute that is not modeled"
          },
          {
            PK: "Customer#123",
            SK: "Order#113",
            Id: "004",
            Type: "BelongsToLink",
            CreatedAt: "2021-09-01T23:31:21.148Z",
            UpdatedAt: "2022-09-01T23:31:21.148Z",
            SomeAttr: "attribute that is not modeled"
          }
        ]
      });

      const result = await Customer.query({
        pk: "Customer#123",
        sk: { $beginsWith: "Order" }
      });

      expect(result).toEqual([
        {
          pk: "Customer#123",
          sk: "Order#111",
          id: "001",
          type: "BelongsToLink",
          createdAt: new Date("2021-10-15T09:31:15.148Z"),
          updatedAt: new Date("2022-10-15T09:31:15.148Z")
        },
        {
          pk: "Customer#123",
          sk: "Order#112",
          id: "003",
          type: "BelongsToLink",
          createdAt: new Date("2021-11-01T23:31:21.148Z"),
          updatedAt: new Date("2022-11-01T23:31:21.148Z")
        },
        {
          pk: "Customer#123",
          sk: "Order#113",
          id: "004",
          type: "BelongsToLink",
          createdAt: new Date("2021-09-01T23:31:21.148Z"),
          updatedAt: new Date("2022-09-01T23:31:21.148Z")
        }
      ]);
      result.forEach(res => {
        expect(res).toBeInstanceOf(BelongsToLink);
      });

      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK1 AND begins_with(#SK, :SK2)",
            ExpressionAttributeNames: { "#PK": "PK", "#SK": "SK" },
            ExpressionAttributeValues: {
              ":PK1": "Customer#123",
              ":SK2": "Order"
            }
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("queries with filter", async () => {
      expect.assertions(4);

      mockQuery.mockResolvedValueOnce({
        Items: [
          {
            PK: "Customer#123",
            SK: "PaymentMethod#117",
            Id: "008",
            Type: "BelongsToLink",
            CreatedAt: "2021-11-21T12:31:21.148Z",
            UpdatedAt: "2022-11-21T12:31:21.148Z",
            SomeAttr: "attribute that is not modeled"
          }
        ]
      });

      const result = await Customer.query(
        { pk: "Customer#123" },
        {
          filter: {
            type: "BelongsToLink",
            createdAt: "2021-11-21T12:31:21.148Z"
          }
        }
      );

      expect(result).toEqual([
        {
          pk: "Customer#123",
          sk: "PaymentMethod#117",
          id: "008",
          type: "BelongsToLink",
          createdAt: new Date("2021-11-21T12:31:21.148Z"),
          updatedAt: new Date("2022-11-21T12:31:21.148Z")
        }
      ]);

      result.forEach(res => {
        expect(res).toBeInstanceOf(BelongsToLink);
      });

      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#Type": "Type",
              "#CreatedAt": "CreatedAt"
            },
            ExpressionAttributeValues: {
              ":PK3": "Customer#123",
              ":Type1": "BelongsToLink",
              ":CreatedAt2": "2021-11-21T12:31:21.148Z"
            },
            FilterExpression: "#Type = :Type1 AND #CreatedAt = :CreatedAt2",
            KeyConditionExpression: "#PK = :PK3",
            TableName: "mock-table"
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    // TODO check this I dont think its actually passing right..
    it("and perform complex queries (arbitrary example)", async () => {
      expect.assertions(4);

      mockQuery.mockResolvedValueOnce({
        Items: [
          {
            PK: "Customer#123",
            SK: "Customer",
            Id: "123",
            Name: "Some Customer",
            Address: "11 Some St",
            Type: "Customer",
            CreatedAt: "2021-09-15T04:26:31.148Z",
            UpdatedAt: "2022-09-15T04:26:31.148Z",
            SomeAttr: "attribute that is not modeled"
          }
        ]
      });

      const result = await Customer.query(
        {
          pk: "Customer#123",
          sk: { $beginsWith: "Order" }
        },
        {
          filter: {
            type: ["BelongsToLink", "Brewery"],
            name: "Some Customer",
            $or: [
              {
                address: ["11 Some St", "22 Other St"],
                createdAt: { $beginsWith: "2021-09-15T" }
              }
            ]
          }
        }
      );

      expect(result).toEqual([
        {
          pk: "Customer#123",
          sk: "Customer",
          address: "11 Some St",
          id: "123",
          name: "Some Customer",
          type: "Customer",
          createdAt: new Date("2021-09-15T04:26:31.148Z"),
          updatedAt: new Date("2022-09-15T04:26:31.148Z")
        }
      ]);
      result.forEach((res, index) => {
        expect(res).toBeInstanceOf(Customer);
      });

      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK7 AND begins_with(#SK, :SK8)",
            ExpressionAttributeNames: {
              "#Address": "Address",
              "#Name": "Name",
              "#PK": "PK",
              "#SK": "SK",
              "#Type": "Type",
              "#CreatedAt": "CreatedAt"
            },
            ExpressionAttributeValues: {
              ":Address1": "11 Some St",
              ":Address2": "22 Other St",
              ":Name6": "Some Customer",
              ":PK7": "Customer#123",
              ":SK8": "Order",
              ":Type4": "BelongsToLink",
              ":Type5": "Brewery",
              ":CreatedAt3": "2021-09-15T"
            },
            FilterExpression:
              "((#Address IN (:Address1,:Address2) AND begins_with(#CreatedAt, :CreatedAt3))) AND (#Type IN (:Type4,:Type5) AND #Name = :Name6)"
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("can query on an index", async () => {
      expect.assertions(6);

      mockQuery.mockResolvedValueOnce({
        Items: [
          {
            PK: "Customer#123",
            SK: "Order#111",
            Id: "001",
            Type: "BelongsToLink",
            CreatedAt: "2021-10-15T09:31:15.148Z",
            UpdatedAt: "2022-10-15T09:31:15.148Z",
            SomeAttr: "attribute that is not modeled"
          },
          {
            PK: "Customer#123",
            SK: "Order#112",
            Id: "003",
            Type: "BelongsToLink",
            CreatedAt: "2021-11-01T23:31:21.148Z",
            UpdatedAt: "2022-11-01T23:31:21.148Z",
            SomeAttr: "attribute that is not modeled"
          },
          {
            PK: "Customer#123",
            SK: "Order#113",
            Id: "004",
            Type: "BelongsToLink",
            CreatedAt: "2021-09-01T23:31:21.148Z",
            UpdatedAt: "2022-09-01T23:31:21.148Z",
            SomeAttr: "attribute that is not modeled"
          }
        ]
      });

      const result = await Customer.query(
        {
          pk: "Customer#123",
          sk: { $beginsWith: "Order" }
        },
        { indexName: "myIndex" }
      );

      expect(result).toEqual([
        {
          pk: "Customer#123",
          sk: "Order#111",
          id: "001",
          type: "BelongsToLink",
          createdAt: new Date("2021-10-15T09:31:15.148Z"),
          updatedAt: new Date("2022-10-15T09:31:15.148Z")
        },
        {
          pk: "Customer#123",
          sk: "Order#112",
          id: "003",
          type: "BelongsToLink",
          createdAt: new Date("2021-11-01T23:31:21.148Z"),
          updatedAt: new Date("2022-11-01T23:31:21.148Z")
        },
        {
          pk: "Customer#123",
          sk: "Order#113",
          id: "004",
          type: "BelongsToLink",
          createdAt: new Date("2021-09-01T23:31:21.148Z"),
          updatedAt: new Date("2022-09-01T23:31:21.148Z")
        }
      ]);
      result.forEach(res => {
        expect(res).toBeInstanceOf(BelongsToLink);
      });

      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            IndexName: "myIndex",
            KeyConditionExpression: "#PK = :PK1 AND begins_with(#SK, :SK2)",
            ExpressionAttributeNames: { "#PK": "PK", "#SK": "SK" },
            ExpressionAttributeValues: {
              ":PK1": "Customer#123",
              ":SK2": "Order"
            }
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    describe("types", () => {
      it("does not serialize relationships", async () => {
        mockQuery.mockResolvedValueOnce({
          Items: []
        });

        const result = await PaymentMethod.query({
          pk: "PaymentMethod#123"
        });

        const paymentMethod = result[0];

        if (
          paymentMethod !== undefined &&
          !(paymentMethod instanceof BelongsToLink)
        ) {
          // @ts-expect-error: Query does not include HasOne or BelongsTo associations
          console.log(paymentMethod.customer);

          // @ts-expect-error: Query does not include HasMany relationship associations
          console.log(paymentMethod.orders);
        }
      });
    });
  });

  describe("queryByEntity", () => {
    it("queries by PK only", async () => {
      expect.assertions(9);

      mockQuery.mockResolvedValueOnce({
        Items: [
          {
            PK: "Customer#123",
            SK: "Customer",
            Id: "123",
            Name: "Some Customer",
            Address: "11 Some St",
            Type: "Customer",
            CreatedAt: "2021-09-15T04:26:31.148Z",
            UpdatedAt: "2022-09-15T04:26:31.148Z",
            SomeAttr: "attribute that is not modeled"
          },
          {
            PK: "Customer#123",
            SK: "Order#111",
            Id: "001",
            Type: "BelongsToLink",
            CreatedAt: "2021-10-15T09:31:15.148Z",
            UpdatedAt: "2022-10-15T09:31:15.148Z",
            SomeAttr: "attribute that is not modeled"
          },
          {
            PK: "Customer#123",
            SK: "Order#112",
            Id: "003",
            Type: "BelongsToLink",
            CreatedAt: "2021-11-01T23:31:21.148Z",
            UpdatedAt: "2022-11-01T23:31:21.148Z",
            SomeAttr: "attribute that is not modeled"
          },
          {
            PK: "Customer#123",
            SK: "Order#113",
            Id: "004",
            Type: "BelongsToLink",
            CreatedAt: "2021-09-01T23:31:21.148Z",
            UpdatedAt: "2022-09-01T23:31:21.148Z",
            SomeAttr: "attribute that is not modeled"
          },
          {
            PK: "Customer#123",
            SK: "PaymentMethod#116",
            Id: "007",
            Type: "BelongsToLink",
            CreatedAt: "2021-10-01T12:31:21.148Z",
            UpdatedAt: "2022-10-01T12:31:21.148Z",
            SomeAttr: "attribute that is not modeled"
          },
          {
            PK: "Customer#123",
            SK: "PaymentMethod#117",
            Id: "008",
            Type: "BelongsToLink",
            CreatedAt: "2021-11-21T12:31:21.148Z",
            UpdatedAt: "2022-11-21T12:31:21.148Z",
            SomeAttr: "attribute that is not modeled"
          }
        ]
      });

      const result = await Customer.query("123");

      expect(result).toEqual([
        {
          pk: "Customer#123",
          sk: "Customer",
          address: "11 Some St",
          id: "123",
          name: "Some Customer",
          type: "Customer",
          createdAt: new Date("2021-09-15T04:26:31.148Z"),
          updatedAt: new Date("2022-09-15T04:26:31.148Z")
        },
        {
          pk: "Customer#123",
          sk: "Order#111",
          id: "001",
          type: "BelongsToLink",
          createdAt: new Date("2021-10-15T09:31:15.148Z"),
          updatedAt: new Date("2022-10-15T09:31:15.148Z")
        },
        {
          pk: "Customer#123",
          sk: "Order#112",
          id: "003",
          type: "BelongsToLink",
          createdAt: new Date("2021-11-01T23:31:21.148Z"),
          updatedAt: new Date("2022-11-01T23:31:21.148Z")
        },
        {
          pk: "Customer#123",
          sk: "Order#113",
          id: "004",
          type: "BelongsToLink",
          createdAt: new Date("2021-09-01T23:31:21.148Z"),
          updatedAt: new Date("2022-09-01T23:31:21.148Z")
        },
        {
          pk: "Customer#123",
          sk: "PaymentMethod#116",
          id: "007",
          type: "BelongsToLink",
          createdAt: new Date("2021-10-01T12:31:21.148Z"),
          updatedAt: new Date("2022-10-01T12:31:21.148Z")
        },
        {
          pk: "Customer#123",
          sk: "PaymentMethod#117",
          id: "008",
          type: "BelongsToLink",
          createdAt: new Date("2021-11-21T12:31:21.148Z"),
          updatedAt: new Date("2022-11-21T12:31:21.148Z")
        }
      ]);
      result.forEach((res, index) => {
        if (index === 0) expect(res).toBeInstanceOf(Customer);
        else expect(res).toBeInstanceOf(BelongsToLink);
      });

      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK1",
            ExpressionAttributeNames: { "#PK": "PK" },
            ExpressionAttributeValues: { ":PK1": "Customer#123" }
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("queries by PK and SK", async () => {
      expect.assertions(4);

      mockQuery.mockResolvedValueOnce({
        Items: [
          {
            PK: "Customer#123",
            SK: "Order#111",
            Id: "001",
            Type: "BelongsToLink",
            CreatedAt: "2021-10-15T09:31:15.148Z",
            UpdatedAt: "2022-10-15T09:31:15.148Z",
            SomeAttr: "attribute that is not modeled"
          }
        ]
      });

      const result = await Customer.query("123", {
        skCondition: "Order#111"
      });

      expect(result).toEqual([
        {
          pk: "Customer#123",
          sk: "Order#111",
          id: "001",
          type: "BelongsToLink",
          createdAt: new Date("2021-10-15T09:31:15.148Z"),
          updatedAt: new Date("2022-10-15T09:31:15.148Z")
        }
      ]);
      expect(result[0]).toBeInstanceOf(BelongsToLink);

      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK1 AND #SK = :SK2",
            ExpressionAttributeNames: { "#PK": "PK", "#SK": "SK" },
            ExpressionAttributeValues: {
              ":PK1": "Customer#123",
              ":SK2": "Order#111"
            }
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("queries by PK SK begins with", async () => {
      expect.assertions(6);

      mockQuery.mockResolvedValueOnce({
        Items: [
          {
            PK: "Customer#123",
            SK: "Order#111",
            Id: "001",
            Type: "BelongsToLink",
            CreatedAt: "2021-10-15T09:31:15.148Z",
            UpdatedAt: "2022-10-15T09:31:15.148Z",
            SomeAttr: "attribute that is not modeled"
          },
          {
            PK: "Customer#123",
            SK: "Order#112",
            Id: "003",
            Type: "BelongsToLink",
            CreatedAt: "2021-11-01T23:31:21.148Z",
            UpdatedAt: "2022-11-01T23:31:21.148Z",
            SomeAttr: "attribute that is not modeled"
          },
          {
            PK: "Customer#123",
            SK: "Order#113",
            Id: "004",
            Type: "BelongsToLink",
            CreatedAt: "2021-09-01T23:31:21.148Z",
            UpdatedAt: "2022-09-01T23:31:21.148Z",
            SomeAttr: "attribute that is not modeled"
          }
        ]
      });

      const result = await Customer.query("123", {
        skCondition: { $beginsWith: "Order" }
      });

      expect(result).toEqual([
        {
          pk: "Customer#123",
          sk: "Order#111",
          id: "001",
          type: "BelongsToLink",
          createdAt: new Date("2021-10-15T09:31:15.148Z"),
          updatedAt: new Date("2022-10-15T09:31:15.148Z")
        },
        {
          pk: "Customer#123",
          sk: "Order#112",
          id: "003",
          type: "BelongsToLink",
          createdAt: new Date("2021-11-01T23:31:21.148Z"),
          updatedAt: new Date("2022-11-01T23:31:21.148Z")
        },
        {
          pk: "Customer#123",
          sk: "Order#113",
          id: "004",
          type: "BelongsToLink",
          createdAt: new Date("2021-09-01T23:31:21.148Z"),
          updatedAt: new Date("2022-09-01T23:31:21.148Z")
        }
      ]);
      result.forEach(res => {
        expect(res).toBeInstanceOf(BelongsToLink);
      });

      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK1 AND begins_with(#SK, :SK2)",
            ExpressionAttributeNames: { "#PK": "PK", "#SK": "SK" },
            ExpressionAttributeValues: {
              ":PK1": "Customer#123",
              ":SK2": "Order"
            }
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("queries with filter", async () => {
      expect.assertions(4);

      mockQuery.mockResolvedValueOnce({
        Items: [
          {
            PK: "Customer#123",
            SK: "PaymentMethod#117",
            Id: "008",
            Type: "BelongsToLink",
            CreatedAt: "2021-11-21T12:31:21.148Z",
            UpdatedAt: "2022-11-21T12:31:21.148Z",
            SomeAttr: "attribute that is not modeled"
          }
        ]
      });

      const result = await Customer.query("123", {
        filter: {
          type: "BelongsToLink",
          createdAt: "2021-11-21T12:31:21.148Z"
        }
      });

      expect(result).toEqual([
        {
          pk: "Customer#123",
          sk: "PaymentMethod#117",
          id: "008",
          type: "BelongsToLink",
          createdAt: new Date("2021-11-21T12:31:21.148Z"),
          updatedAt: new Date("2022-11-21T12:31:21.148Z")
        }
      ]);

      result.forEach(res => {
        expect(res).toBeInstanceOf(BelongsToLink);
      });

      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#Type": "Type",
              "#CreatedAt": "CreatedAt"
            },
            ExpressionAttributeValues: {
              ":PK3": "Customer#123",
              ":Type1": "BelongsToLink",
              ":CreatedAt2": "2021-11-21T12:31:21.148Z"
            },
            FilterExpression: "#Type = :Type1 AND #CreatedAt = :CreatedAt2",
            KeyConditionExpression: "#PK = :PK3",
            TableName: "mock-table"
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    // TODO see if this is actually working...
    it("can perform complex queries (arbitrary example)", async () => {
      expect.assertions(4);

      mockQuery.mockResolvedValueOnce({
        Items: [
          {
            PK: "Customer#123",
            SK: "Customer",
            Id: "123",
            Name: "Some Customer",
            Address: "11 Some St",
            Type: "Customer",
            CreatedAt: "2021-09-15T04:26:31.148Z",
            UpdatedAt: "2022-09-15T04:26:31.148Z",
            SomeAttr: "attribute that is not modeled"
          }
        ]
      });

      const result = await Customer.query("123", {
        skCondition: { $beginsWith: "Order" },
        filter: {
          type: ["BelongsToLink", "Brewery"],
          name: "Some Customer",
          $or: [
            {
              address: ["11 Some St", "22 Other St"],
              createdAt: { $beginsWith: "2021-09-15T" }
            }
          ]
        }
      });

      expect(result).toEqual([
        {
          pk: "Customer#123",
          sk: "Customer",
          address: "11 Some St",
          id: "123",
          name: "Some Customer",
          type: "Customer",
          createdAt: new Date("2021-09-15T04:26:31.148Z"),
          updatedAt: new Date("2022-09-15T04:26:31.148Z")
        }
      ]);
      result.forEach((res, index) => {
        expect(res).toBeInstanceOf(Customer);
      });

      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK7 AND begins_with(#SK, :SK8)",
            ExpressionAttributeNames: {
              "#Address": "Address",
              "#Name": "Name",
              "#PK": "PK",
              "#SK": "SK",
              "#Type": "Type",
              "#CreatedAt": "CreatedAt"
            },
            ExpressionAttributeValues: {
              ":Address1": "11 Some St",
              ":Address2": "22 Other St",
              ":Name6": "Some Customer",
              ":PK7": "Customer#123",
              ":SK8": "Order",
              ":Type4": "BelongsToLink",
              ":Type5": "Brewery",
              ":CreatedAt3": "2021-09-15T"
            },
            FilterExpression:
              "((#Address IN (:Address1,:Address2) AND begins_with(#CreatedAt, :CreatedAt3))) AND (#Type IN (:Type4,:Type5) AND #Name = :Name6)"
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    // TODO... if this works then make a version of this with the other group of tests...
    // TODO this is wrong.... where is the or? Is the above example even correct?
    // it("can perform complex queries (arbitrary example) with repeated keys in the filter", async () => {
    //   expect.assertions(4);

    //   mockQuery.mockResolvedValueOnce({
    //     Items: [
    //       {
    //         PK: "Customer#123",
    //         SK: "Customer",
    //         Id: "123",
    //         Name: "Some Customer",
    //         Address: "11 Some St",
    //         Type: "Customer",
    //         CreatedAt: "2021-09-15T04:26:31.148Z",
    //         UpdatedAt: "2022-09-15T04:26:31.148Z",
    //         SomeAttr: "attribute that is not modeled"
    //       }
    //     ]
    //   });

    //   const result = await Customer.query("123", {
    //     skCondition: { $beginsWith: "Order" },
    //     filter: {
    //       type: ["BelongsToLink", "Brewery"],
    //       name: "Some Customer",
    //       $or: [
    //         {
    //           type: "Brewery",
    //           address: ["11 Some St", "22 Other St"],
    //           createdAt: { $beginsWith: "2021-09-15T" }
    //         }
    //       ]
    //     }
    //   });

    //   expect(result).toEqual([
    //     {
    //       pk: "Customer#123",
    //       sk: "Customer",
    //       address: "11 Some St",
    //       id: "123",
    //       name: "Some Customer",
    //       type: "Customer",
    //       createdAt: "2021-09-15T04:26:31.148Z",
    //       updatedAt: "2022-09-15T04:26:31.148Z"
    //     }
    //   ]);
    //   result.forEach((res, index) => expect(res).toBeInstanceOf(Customer));

    //   expect(mockedQueryCommand.mock.calls).toEqual([
    //     [
    //       {
    //         TableName: "mock-table",
    //         KeyConditionExpression: "#PK = :PK8 AND begins_with(#SK, :SK9)",
    //         ExpressionAttributeNames: {
    //           "#Address": "Address",
    //           "#Name": "Name",
    //           "#PK": "PK",
    //           "#SK": "SK",
    //           "#Type": "Type",
    //           "#CreatedAt": "CreatedAt"
    //         },
    //         ExpressionAttributeValues: {
    //           ":Address2": "11 Some St",
    //           ":Address3": "22 Other St",
    //           ":CreatedAt4": "2021-09-15T",
    //           ":Name7": "Some Customer",
    //           ":PK8": "Customer#123",
    //           ":SK9": "Order",
    //           ":Type1": "Brewery",
    //           ":Type5": "BelongsToLink",
    //           ":Type6": "Brewery"
    //         },
    //         FilterExpression:
    //           "((#Type = :Type1 AND #Address IN (:Address2,:Address3) AND begins_with(#CreatedAt, :CreatedAt4))) AND (#Type IN (:Type5,:Type6) AND #Name = :Name7)"
    //       }
    //     ]
    //   ]);
    //   expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    // });

    describe("types", () => {
      it("does not serialize relationships", async () => {
        mockQuery.mockResolvedValueOnce({
          Items: []
        });

        const result = await PaymentMethod.query("123");

        const paymentMethod = result[0];

        if (
          paymentMethod !== undefined &&
          !(paymentMethod instanceof BelongsToLink)
        ) {
          // @ts-expect-error: Query does not include HasOne or BelongsTo associations
          console.log(paymentMethod.customer);

          // @ts-expect-error: Query does not include HasMany relationship associations
          console.log(paymentMethod.orders);
        }
      });

      it("does not allow to query by index", async () => {
        mockQuery.mockResolvedValueOnce({
          Items: []
        });

        // @ts-expect-error: Cannot query by index when using query by entity ID
        await PaymentMethod.query("123", {
          indexName: "123"
        });
      });
    });
  });
});
