import {
  Assignment,
  Course,
  Customer,
  MyClassWithAllAttributeTypes,
  Order,
  PaymentMethod
} from "./mockModels";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  type OtherTableEntityTableItem,
  type MockTableEntityTableItem
} from "./utils";
import { type QueryResults } from "../../src/operations";
import Logger from "../../src/Logger";

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

  describe("deserializes object attributes from JSON strings", () => {
    it("will deserialize serialized attributes in query results", async () => {
      expect.assertions(4);

      const objectVal = {
        name: "John",
        email: "john@example.com",
        tags: ["work", "vip"]
      };
      const nullableObjectVal = {
        street: "123 Main St",
        city: "Springfield",
        zip: 12345,
        geo: { lat: 40.7128, lng: -74.006 },
        scores: [95, 87, 100]
      };

      mockQuery.mockResolvedValueOnce({
        Items: [
          {
            PK: "MyClassWithAllAttributeTypes#123",
            SK: "MyClassWithAllAttributeTypes",
            Id: "123",
            Type: "MyClassWithAllAttributeTypes",
            CreatedAt: "2023-10-16T03:31:35.918Z",
            UpdatedAt: "2023-10-16T03:31:35.918Z",
            stringAttribute: "some-string",
            dateAttribute: "2023-10-16T03:31:35.918Z",
            boolAttribute: true,
            numberAttribute: 9,
            foreignKeyAttribute: "111",
            enumAttribute: "val-1",
            objectAttribute: objectVal,
            nullableObjectAttribute: nullableObjectVal
          }
        ]
      });

      const results = await MyClassWithAllAttributeTypes.query("123");

      expect(results).toHaveLength(1);
      expect(results[0]).toBeInstanceOf(MyClassWithAllAttributeTypes);
      expect(results[0]).toEqual(
        // TODO do strict equal
        expect.objectContaining({
          objectAttribute: objectVal,
          nullableObjectAttribute: nullableObjectVal,
          dateAttribute: new Date("2023-10-16T03:31:35.918Z")
        })
      );
      // Verify objects are stored/returned as native maps, not JSON strings
      expect(typeof results[0].objectAttribute).not.toBe("string");
    });
  });

  describe("filters on nested Map and List attributes", () => {
    const mockItem = {
      PK: "MyClassWithAllAttributeTypes#123",
      SK: "MyClassWithAllAttributeTypes",
      Id: "123",
      Type: "MyClassWithAllAttributeTypes",
      CreatedAt: "2023-10-16T03:31:35.918Z",
      UpdatedAt: "2023-10-16T03:31:35.918Z",
      stringAttribute: "some-string",
      dateAttribute: "2023-10-16T03:31:35.918Z",
      boolAttribute: true,
      numberAttribute: 9,
      foreignKeyAttribute: "111",
      enumAttribute: "val-1",
      objectAttribute: {
        name: "John",
        email: "john@example.com",
        tags: ["work", "vip"]
      },
      nullableObjectAttribute: {
        street: "123 Main St",
        city: "Springfield",
        zip: 12345,
        geo: { lat: 40.7128, lng: -74.006 },
        scores: [95, 87, 100]
      }
    };

    const expectedEntity = {
      pk: "MyClassWithAllAttributeTypes#123",
      sk: "MyClassWithAllAttributeTypes",
      id: "123",
      type: "MyClassWithAllAttributeTypes",
      createdAt: new Date("2023-10-16T03:31:35.918Z"),
      updatedAt: new Date("2023-10-16T03:31:35.918Z"),
      stringAttribute: "some-string",
      dateAttribute: new Date("2023-10-16T03:31:35.918Z"),
      boolAttribute: true,
      numberAttribute: 9,
      foreignKeyAttribute: "111",
      enumAttribute: "val-1",
      objectAttribute: {
        name: "John",
        email: "john@example.com",
        tags: ["work", "vip"]
      },
      nullableObjectAttribute: {
        street: "123 Main St",
        city: "Springfield",
        zip: 12345,
        geo: { lat: 40.7128, lng: -74.006 },
        scores: [95, 87, 100]
      }
    };

    beforeEach(() => {
      mockQuery.mockResolvedValueOnce({
        Items: [mockItem]
      });
    });

    it("can filter on a nested Map string field using dot-path equality", async () => {
      expect.assertions(5);

      const results = await MyClassWithAllAttributeTypes.query("123", {
        filter: {
          "objectAttribute.name": "John"
        }
      });

      expect(results).toEqual([expectedEntity]);
      expect(results).toHaveLength(1);
      expect(results[0]).toBeInstanceOf(MyClassWithAllAttributeTypes);
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK2",
            FilterExpression: "#objectAttribute.#name = :objectAttributename1",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#objectAttribute": "objectAttribute",
              "#name": "name"
            },
            ExpressionAttributeValues: {
              ":objectAttributename1": "John",
              ":PK2": "MyClassWithAllAttributeTypes#123"
            },
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("can filter on a nested Map number field using dot-path equality", async () => {
      expect.assertions(5);

      const results = await MyClassWithAllAttributeTypes.query("123", {
        filter: {
          "nullableObjectAttribute.zip": 12345
        }
      });

      expect(results).toEqual([expectedEntity]);
      expect(results).toHaveLength(1);
      expect(results[0]).toBeInstanceOf(MyClassWithAllAttributeTypes);
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK2",
            FilterExpression:
              "#nullableObjectAttribute.#zip = :nullableObjectAttributezip1",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#nullableObjectAttribute": "nullableObjectAttribute",
              "#zip": "zip"
            },
            ExpressionAttributeValues: {
              ":nullableObjectAttributezip1": 12345,
              ":PK2": "MyClassWithAllAttributeTypes#123"
            },
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("can filter on a deeply nested Map field using dot-path equality", async () => {
      expect.assertions(5);

      const results = await MyClassWithAllAttributeTypes.query("123", {
        filter: {
          "nullableObjectAttribute.geo.lat": 40.7128
        }
      });

      expect(results).toEqual([expectedEntity]);
      expect(results).toHaveLength(1);
      expect(results[0]).toBeInstanceOf(MyClassWithAllAttributeTypes);
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK2",
            FilterExpression:
              "#nullableObjectAttribute.#geo.#lat = :nullableObjectAttributegeolat1",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#nullableObjectAttribute": "nullableObjectAttribute",
              "#geo": "geo",
              "#lat": "lat"
            },
            ExpressionAttributeValues: {
              ":nullableObjectAttributegeolat1": 40.7128,
              ":PK2": "MyClassWithAllAttributeTypes#123"
            },
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("can filter using $contains on a nested List attribute", async () => {
      expect.assertions(5);

      const results = await MyClassWithAllAttributeTypes.query("123", {
        filter: {
          "objectAttribute.tags": { $contains: "vip" }
        }
      });

      expect(results).toEqual([expectedEntity]);
      expect(results).toHaveLength(1);
      expect(results[0]).toBeInstanceOf(MyClassWithAllAttributeTypes);
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK2",
            FilterExpression:
              "contains(#objectAttribute.#tags, :objectAttributetags1)",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#objectAttribute": "objectAttribute",
              "#tags": "tags"
            },
            ExpressionAttributeValues: {
              ":objectAttributetags1": "vip",
              ":PK2": "MyClassWithAllAttributeTypes#123"
            },
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("can filter using $contains on a nested number List attribute", async () => {
      expect.assertions(5);

      const results = await MyClassWithAllAttributeTypes.query("123", {
        filter: {
          "nullableObjectAttribute.scores": { $contains: 95 }
        }
      });

      expect(results).toEqual([expectedEntity]);
      expect(results).toHaveLength(1);
      expect(results[0]).toBeInstanceOf(MyClassWithAllAttributeTypes);
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK2",
            FilterExpression:
              "contains(#nullableObjectAttribute.#scores, :nullableObjectAttributescores1)",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#nullableObjectAttribute": "nullableObjectAttribute",
              "#scores": "scores"
            },
            ExpressionAttributeValues: {
              ":nullableObjectAttributescores1": 95,
              ":PK2": "MyClassWithAllAttributeTypes#123"
            },
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("can filter using $contains on a top-level string attribute", async () => {
      expect.assertions(5);

      const results = await MyClassWithAllAttributeTypes.query("123", {
        filter: {
          stringAttribute: { $contains: "some" }
        }
      });

      expect(results).toEqual([expectedEntity]);
      expect(results).toHaveLength(1);
      expect(results[0]).toBeInstanceOf(MyClassWithAllAttributeTypes);
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK2",
            FilterExpression: "contains(#stringAttribute, :stringAttribute1)",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#stringAttribute": "stringAttribute"
            },
            ExpressionAttributeValues: {
              ":stringAttribute1": "some",
              ":PK2": "MyClassWithAllAttributeTypes#123"
            },
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("can filter using $beginsWith on a nested Map string field", async () => {
      expect.assertions(5);

      const results = await MyClassWithAllAttributeTypes.query("123", {
        filter: {
          "objectAttribute.email": { $beginsWith: "john" }
        }
      });

      expect(results).toEqual([expectedEntity]);
      expect(results).toHaveLength(1);
      expect(results[0]).toBeInstanceOf(MyClassWithAllAttributeTypes);
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK2",
            FilterExpression:
              "begins_with(#objectAttribute.#email, :objectAttributeemail1)",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#objectAttribute": "objectAttribute",
              "#email": "email"
            },
            ExpressionAttributeValues: {
              ":objectAttributeemail1": "john",
              ":PK2": "MyClassWithAllAttributeTypes#123"
            },
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("can filter using IN on a nested Map field", async () => {
      expect.assertions(5);

      const results = await MyClassWithAllAttributeTypes.query("123", {
        filter: {
          "nullableObjectAttribute.city": ["Springfield", "Shelbyville"]
        }
      });

      expect(results).toEqual([expectedEntity]);
      expect(results).toHaveLength(1);
      expect(results[0]).toBeInstanceOf(MyClassWithAllAttributeTypes);
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK3",
            FilterExpression:
              "#nullableObjectAttribute.#city IN (:nullableObjectAttributecity1,:nullableObjectAttributecity2)",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#nullableObjectAttribute": "nullableObjectAttribute",
              "#city": "city"
            },
            ExpressionAttributeValues: {
              ":nullableObjectAttributecity1": "Springfield",
              ":nullableObjectAttributecity2": "Shelbyville",
              ":PK3": "MyClassWithAllAttributeTypes#123"
            },
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("can combine multiple dot-path filters with AND", async () => {
      expect.assertions(5);

      const results = await MyClassWithAllAttributeTypes.query("123", {
        filter: {
          "objectAttribute.name": "John",
          "nullableObjectAttribute.city": "Springfield"
        }
      });

      expect(results).toEqual([expectedEntity]);
      expect(results).toHaveLength(1);
      expect(results[0]).toBeInstanceOf(MyClassWithAllAttributeTypes);
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK3",
            FilterExpression:
              "#objectAttribute.#name = :objectAttributename1 AND #nullableObjectAttribute.#city = :nullableObjectAttributecity2",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#objectAttribute": "objectAttribute",
              "#name": "name",
              "#nullableObjectAttribute": "nullableObjectAttribute",
              "#city": "city"
            },
            ExpressionAttributeValues: {
              ":objectAttributename1": "John",
              ":nullableObjectAttributecity2": "Springfield",
              ":PK3": "MyClassWithAllAttributeTypes#123"
            },
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("can combine dot-path, $contains, and $beginsWith filters with AND/OR", async () => {
      expect.assertions(5);

      const results = await MyClassWithAllAttributeTypes.query("123", {
        filter: {
          "objectAttribute.name": "John",
          $or: [
            { "objectAttribute.tags": { $contains: "work" } },
            { "objectAttribute.email": { $beginsWith: "john" } }
          ]
        }
      });

      expect(results).toEqual([expectedEntity]);
      expect(results).toHaveLength(1);
      expect(results[0]).toBeInstanceOf(MyClassWithAllAttributeTypes);
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK4",
            FilterExpression:
              "(contains(#objectAttribute.#tags, :objectAttributetags1) OR begins_with(#objectAttribute.#email, :objectAttributeemail2)) AND (#objectAttribute.#name = :objectAttributename3)",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#objectAttribute": "objectAttribute",
              "#tags": "tags",
              "#email": "email",
              "#name": "name"
            },
            ExpressionAttributeValues: {
              ":objectAttributetags1": "work",
              ":objectAttributeemail2": "john",
              ":objectAttributename3": "John",
              ":PK4": "MyClassWithAllAttributeTypes#123"
            },
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("can use $contains inside $or with top-level AND filters", async () => {
      expect.assertions(5);

      const results = await MyClassWithAllAttributeTypes.query("123", {
        filter: {
          stringAttribute: "some-string",
          $or: [
            { "objectAttribute.tags": { $contains: "vip" } },
            { "nullableObjectAttribute.scores": { $contains: 95 } }
          ]
        }
      });

      expect(results).toEqual([expectedEntity]);
      expect(results).toHaveLength(1);
      expect(results[0]).toBeInstanceOf(MyClassWithAllAttributeTypes);
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK4",
            FilterExpression:
              "(contains(#objectAttribute.#tags, :objectAttributetags1) OR contains(#nullableObjectAttribute.#scores, :nullableObjectAttributescores2)) AND (#stringAttribute = :stringAttribute3)",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#objectAttribute": "objectAttribute",
              "#tags": "tags",
              "#nullableObjectAttribute": "nullableObjectAttribute",
              "#scores": "scores",
              "#stringAttribute": "stringAttribute"
            },
            ExpressionAttributeValues: {
              ":objectAttributetags1": "vip",
              ":nullableObjectAttributescores2": 95,
              ":stringAttribute3": "some-string",
              ":PK4": "MyClassWithAllAttributeTypes#123"
            },
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("can mix dot-path IN with top-level equality in AND/OR", async () => {
      expect.assertions(5);

      const results = await MyClassWithAllAttributeTypes.query("123", {
        filter: {
          "nullableObjectAttribute.city": ["Springfield", "Shelbyville"],
          $or: [
            { "objectAttribute.name": "John" },
            { stringAttribute: { $beginsWith: "some" } }
          ]
        }
      });

      expect(results).toEqual([expectedEntity]);
      expect(results).toHaveLength(1);
      expect(results[0]).toBeInstanceOf(MyClassWithAllAttributeTypes);
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK5",
            FilterExpression:
              "(#objectAttribute.#name = :objectAttributename1 OR begins_with(#stringAttribute, :stringAttribute2)) AND (#nullableObjectAttribute.#city IN (:nullableObjectAttributecity3,:nullableObjectAttributecity4))",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#objectAttribute": "objectAttribute",
              "#name": "name",
              "#stringAttribute": "stringAttribute",
              "#nullableObjectAttribute": "nullableObjectAttribute",
              "#city": "city"
            },
            ExpressionAttributeValues: {
              ":objectAttributename1": "John",
              ":stringAttribute2": "some",
              ":nullableObjectAttributecity3": "Springfield",
              ":nullableObjectAttributecity4": "Shelbyville",
              ":PK5": "MyClassWithAllAttributeTypes#123"
            },
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("can combine all filter operations in a single complex query: dot-path equality, $contains, $beginsWith, IN, deeply nested path, and AND/OR", async () => {
      expect.assertions(5);

      const results = await MyClassWithAllAttributeTypes.query("123", {
        filter: {
          "objectAttribute.name": "John",
          "nullableObjectAttribute.city": ["Springfield", "Shelbyville"],
          "nullableObjectAttribute.geo.lat": 40,
          $or: [
            {
              "objectAttribute.tags": { $contains: "vip" },
              "objectAttribute.email": { $beginsWith: "john" }
            },
            {
              "nullableObjectAttribute.scores": { $contains: 95 },
              stringAttribute: "some-string"
            }
          ]
        }
      });

      expect(results).toEqual([expectedEntity]);
      expect(results).toHaveLength(1);
      expect(results[0]).toBeInstanceOf(MyClassWithAllAttributeTypes);
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK9",
            FilterExpression:
              "((contains(#objectAttribute.#tags, :objectAttributetags1) AND begins_with(#objectAttribute.#email, :objectAttributeemail2)) OR (contains(#nullableObjectAttribute.#scores, :nullableObjectAttributescores3) AND #stringAttribute = :stringAttribute4)) AND (#objectAttribute.#name = :objectAttributename5 AND #nullableObjectAttribute.#city IN (:nullableObjectAttributecity6,:nullableObjectAttributecity7) AND #nullableObjectAttribute.#geo.#lat = :nullableObjectAttributegeolat8)",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#objectAttribute": "objectAttribute",
              "#tags": "tags",
              "#email": "email",
              "#nullableObjectAttribute": "nullableObjectAttribute",
              "#scores": "scores",
              "#stringAttribute": "stringAttribute",
              "#name": "name",
              "#city": "city",
              "#geo": "geo",
              "#lat": "lat"
            },
            ExpressionAttributeValues: {
              ":objectAttributetags1": "vip",
              ":objectAttributeemail2": "john",
              ":nullableObjectAttributescores3": 95,
              ":stringAttribute4": "some-string",
              ":objectAttributename5": "John",
              ":nullableObjectAttributecity6": "Springfield",
              ":nullableObjectAttributecity7": "Shelbyville",
              ":nullableObjectAttributegeolat8": 40,
              ":PK9": "MyClassWithAllAttributeTypes#123"
            },
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });
  });

  describe("queries by PK only", () => {
    const operationSharedAssertions = (
      result: QueryResults<Customer>
    ): void => {
      expect(result).toEqual([
        {
          pk: "Customer#123",
          sk: "Customer",
          id: "123",
          type: "Customer",
          address: "11 Some St",
          name: "Some Customer",
          createdAt: new Date("2021-09-15T04:26:31.148Z"),
          updatedAt: new Date("2022-09-15T04:26:31.148Z")
        },
        {
          pk: "Customer#123",
          sk: "Order#001",
          id: "001",
          type: "Order",
          customerId: "123",
          orderDate: new Date("2022-10-17T09:31:15.148Z"),
          paymentMethodId: "987",
          createdAt: new Date("2021-10-15T09:31:15.148Z"),
          updatedAt: new Date("2022-10-16T09:31:15.148Z")
        },
        {
          pk: "Customer#123",
          sk: "Order#002",
          id: "002",
          type: "Order",
          customerId: "123",
          orderDate: new Date("2022-10-30T09:31:15.148Z"),
          paymentMethodId: "654",
          createdAt: new Date("2021-10-21T09:31:15.148Z"),
          updatedAt: new Date("2022-10-22T09:31:15.148Z")
        },
        {
          pk: "Customer#123",
          sk: "Order#003",
          id: "003",
          type: "Order",
          customerId: "123",
          orderDate: new Date("2022-11-30T09:31:15.148Z"),
          paymentMethodId: "321",
          createdAt: new Date("2021-11-21T09:31:15.148Z"),
          updatedAt: new Date("2022-11-22T09:31:15.148Z")
        },
        {
          pk: "Customer#123",
          sk: "PaymentMethod#004",
          id: "004",
          type: "PaymentMethod",
          customerId: "123",
          lastFour: "9876",
          createdAt: new Date("2021-10-01T12:31:21.148Z"),
          updatedAt: new Date("2022-10-02T12:31:21.148Z")
        },
        {
          pk: "Customer#123",
          sk: "PaymentMethod#005",
          id: "005",
          type: "PaymentMethod",
          customerId: "123",
          lastFour: "6543",
          createdAt: new Date("2021-10-04T12:31:21.148Z"),
          updatedAt: new Date("2022-10-05T12:31:21.148Z")
        }
      ]);

      result.forEach((res, index) => {
        if (res.type === "Customer") expect(res).toBeInstanceOf(Customer);
        else if (res.type === "Order") expect(res).toBeInstanceOf(Order);
        else if (res.type === "PaymentMethod")
          expect(res).toBeInstanceOf(PaymentMethod);
        else throw new Error("Unexpected test type");
      });

      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK1",
            ExpressionAttributeNames: { "#PK": "PK" },
            ExpressionAttributeValues: { ":PK1": "Customer#123" },
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    };

    beforeEach(() => {
      const customer: MockTableEntityTableItem<Customer> = {
        PK: "Customer#123",
        SK: "Customer",
        Id: "123",
        Name: "Some Customer",
        Address: "11 Some St",
        Type: "Customer",
        CreatedAt: "2021-09-15T04:26:31.148Z",
        UpdatedAt: "2022-09-15T04:26:31.148Z"
      };

      // Denormalized Order in Customer Partition
      const order1: MockTableEntityTableItem<Order> = {
        PK: "Customer#123",
        SK: "Order#001",
        Id: "001",
        Type: "Order",
        CustomerId: customer.Id,
        PaymentMethodId: "987",
        OrderDate: "2022-10-17T09:31:15.148Z",
        CreatedAt: "2021-10-15T09:31:15.148Z",
        UpdatedAt: "2022-10-16T09:31:15.148Z"
      };

      // Denormalized Order in Customer Partition
      const order2: MockTableEntityTableItem<Order> = {
        PK: "Customer#123",
        SK: "Order#002",
        Id: "002",
        Type: "Order",
        CustomerId: customer.Id,
        PaymentMethodId: "654",
        OrderDate: "2022-10-30T09:31:15.148Z",
        CreatedAt: "2021-10-21T09:31:15.148Z",
        UpdatedAt: "2022-10-22T09:31:15.148Z"
      };

      // Denormalized Order in Customer Partition
      const order3: MockTableEntityTableItem<Order> = {
        PK: "Customer#123",
        SK: "Order#003",
        Id: "003",
        Type: "Order",
        CustomerId: customer.Id,
        PaymentMethodId: "321",
        OrderDate: "2022-11-30T09:31:15.148Z",
        CreatedAt: "2021-11-21T09:31:15.148Z",
        UpdatedAt: "2022-11-22T09:31:15.148Z"
      };

      // Denormalized PaymentMethod in Customer Partition
      const paymentMethod1: MockTableEntityTableItem<PaymentMethod> = {
        PK: "Customer#123",
        SK: "PaymentMethod#004",
        Id: "004",
        Type: "PaymentMethod",
        LastFour: "9876",
        CustomerId: customer.Id,
        CreatedAt: "2021-10-01T12:31:21.148Z",
        UpdatedAt: "2022-10-02T12:31:21.148Z"
      };

      // Denormalized PaymentMethod in Customer Partition
      const paymentMethod2: MockTableEntityTableItem<PaymentMethod> = {
        PK: "Customer#123",
        SK: "PaymentMethod#005",
        Id: "005",
        Type: "PaymentMethod",
        LastFour: "6543",
        CustomerId: customer.Id,
        CreatedAt: "2021-10-04T12:31:21.148Z",
        UpdatedAt: "2022-10-05T12:31:21.148Z"
      };

      mockQuery.mockResolvedValueOnce({
        Items: [
          customer,
          order1,
          order2,
          order3,
          paymentMethod1,
          paymentMethod2
        ]
      });
    });

    it("queryByKeys", async () => {
      expect.assertions(9);

      const result = await Customer.query({ pk: "Customer#123" });

      operationSharedAssertions(result);
    });

    it("queryByEntity", async () => {
      expect.assertions(9);

      const result = await Customer.query("123");

      operationSharedAssertions(result);
    });
  });

  describe("queries by PK and SK", () => {
    const operationSharedAssertions = (
      result: QueryResults<Customer>
    ): void => {
      expect(result).toEqual([
        {
          pk: "Customer#123",
          sk: "Order#001",
          id: "001",
          type: "Order",
          customerId: "123",
          orderDate: new Date("2022-10-17T09:31:15.148Z"),
          paymentMethodId: "987",
          createdAt: new Date("2021-10-15T09:31:15.148Z"),
          updatedAt: new Date("2022-10-16T09:31:15.148Z")
        }
      ]);
      expect(result[0]).toBeInstanceOf(Order);

      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK1 AND #SK = :SK2",
            ExpressionAttributeNames: { "#PK": "PK", "#SK": "SK" },
            ExpressionAttributeValues: {
              ":PK1": "Customer#123",
              ":SK2": "Order#001"
            },
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    };

    beforeEach(() => {
      // Denormalized Order in Customer Partition
      const order: MockTableEntityTableItem<Order> = {
        PK: "Customer#123",
        SK: "Order#001",
        Id: "001",
        Type: "Order",
        CustomerId: "123",
        PaymentMethodId: "987",
        OrderDate: "2022-10-17T09:31:15.148Z",
        CreatedAt: "2021-10-15T09:31:15.148Z",
        UpdatedAt: "2022-10-16T09:31:15.148Z"
      };

      mockQuery.mockResolvedValueOnce({
        Items: [order]
      });
    });

    it("queryByKeys", async () => {
      expect.assertions(4);

      const result = await Customer.query({
        pk: "Customer#123",
        sk: "Order#001"
      });

      operationSharedAssertions(result);
    });

    it("queryByEntity", async () => {
      expect.assertions(4);

      const result = await Customer.query("123", {
        skCondition: "Order#001"
      });

      operationSharedAssertions(result);
    });
  });

  describe("queries by PK SK begins with", () => {
    const operationSharedAssertions = (
      result: QueryResults<Customer>
    ): void => {
      expect(result).toEqual([
        {
          pk: "Customer#123",
          sk: "Order#001",
          id: "001",
          type: "Order",
          customerId: "123",
          orderDate: new Date("2022-10-17T09:31:15.148Z"),
          paymentMethodId: "987",
          createdAt: new Date("2021-10-15T09:31:15.148Z"),
          updatedAt: new Date("2022-10-16T09:31:15.148Z")
        },
        {
          pk: "Customer#123",
          sk: "Order#002",
          id: "002",
          type: "Order",
          customerId: "123",
          orderDate: new Date("2022-10-30T09:31:15.148Z"),
          paymentMethodId: "654",
          createdAt: new Date("2021-10-21T09:31:15.148Z"),
          updatedAt: new Date("2022-10-22T09:31:15.148Z")
        },
        {
          pk: "Customer#123",
          sk: "Order#003",
          id: "003",
          type: "Order",
          customerId: "123",
          orderDate: new Date("2022-11-30T09:31:15.148Z"),
          paymentMethodId: "321",
          createdAt: new Date("2021-11-21T09:31:15.148Z"),
          updatedAt: new Date("2022-11-22T09:31:15.148Z")
        }
      ]);
      result.forEach(res => {
        expect(res).toBeInstanceOf(Order);
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
            },
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    };

    beforeEach(() => {
      // Denormalized Order in Customer Partition
      const order1: MockTableEntityTableItem<Order> = {
        PK: "Customer#123",
        SK: "Order#001",
        Id: "001",
        Type: "Order",
        CustomerId: "123",
        PaymentMethodId: "987",
        OrderDate: "2022-10-17T09:31:15.148Z",
        CreatedAt: "2021-10-15T09:31:15.148Z",
        UpdatedAt: "2022-10-16T09:31:15.148Z"
      };

      // Denormalized Order in Customer Partition
      const order2: MockTableEntityTableItem<Order> = {
        PK: "Customer#123",
        SK: "Order#002",
        Id: "002",
        Type: "Order",
        CustomerId: "123",
        PaymentMethodId: "654",
        OrderDate: "2022-10-30T09:31:15.148Z",
        CreatedAt: "2021-10-21T09:31:15.148Z",
        UpdatedAt: "2022-10-22T09:31:15.148Z"
      };

      // Denormalized Order in Customer Partition
      const order3: MockTableEntityTableItem<Order> = {
        PK: "Customer#123",
        SK: "Order#003",
        Id: "003",
        Type: "Order",
        CustomerId: "123",
        PaymentMethodId: "321",
        OrderDate: "2022-11-30T09:31:15.148Z",
        CreatedAt: "2021-11-21T09:31:15.148Z",
        UpdatedAt: "2022-11-22T09:31:15.148Z"
      };

      mockQuery.mockResolvedValueOnce({
        Items: [order1, order2, order3]
      });
    });

    it("queryByKeys", async () => {
      expect.assertions(6);

      const result = await Customer.query({
        pk: "Customer#123",
        sk: { $beginsWith: "Order" }
      });

      operationSharedAssertions(result);
    });

    it("queryByEntity", async () => {
      expect.assertions(6);

      const result = await Customer.query("123", {
        skCondition: { $beginsWith: "Order" }
      });

      operationSharedAssertions(result);
    });
  });

  describe("queries with filter on attributes that are part of included entities", () => {
    const operationSharedAssertions = (
      result: QueryResults<Customer>
    ): void => {
      expect(result).toEqual([
        {
          pk: "Customer#123",
          sk: "PaymentMethod#004",
          id: "004",
          type: "PaymentMethod",
          customerId: "123",
          lastFour: "9876",
          createdAt: new Date("2021-10-01T12:31:21.148Z"),
          updatedAt: new Date("2022-10-02T12:31:21.148Z")
        }
      ]);

      result.forEach(res => {
        expect(res).toBeInstanceOf(PaymentMethod);
      });

      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#Type": "Type",
              "#LastFour": "LastFour"
            },
            ExpressionAttributeValues: {
              ":PK3": "Customer#123",
              ":Type1": "PaymentMethod",
              ":LastFour2": "9876"
            },
            FilterExpression: "#Type = :Type1 AND #LastFour = :LastFour2",
            KeyConditionExpression: "#PK = :PK3",
            TableName: "mock-table",
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    };

    beforeEach(() => {
      // Denormalized PaymentMethod in Customer Partition
      const paymentMethod: MockTableEntityTableItem<PaymentMethod> = {
        PK: "Customer#123",
        SK: "PaymentMethod#004",
        Id: "004",
        Type: "PaymentMethod",
        LastFour: "9876",
        CustomerId: "123",
        CreatedAt: "2021-10-01T12:31:21.148Z",
        UpdatedAt: "2022-10-02T12:31:21.148Z"
      };

      mockQuery.mockResolvedValueOnce({
        Items: [paymentMethod]
      });
    });

    it("queryByKeys", async () => {
      expect.assertions(4);

      const result = await Customer.query(
        { pk: "Customer#123" },
        {
          filter: {
            type: "PaymentMethod",
            lastFour: "9876"
          }
        }
      );

      operationSharedAssertions(result);
    });

    it("queryByEntity", async () => {
      expect.assertions(4);

      const result = await Customer.query("123", {
        filter: {
          type: "PaymentMethod",
          lastFour: "9876"
        }
      });

      operationSharedAssertions(result);
    });
  });

  describe("can perform complex queries (arbitrary example)", () => {
    const operationSharedAssertions = (
      result: QueryResults<Customer>
    ): void => {
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
              ":Type4": "Beer",
              ":Type5": "Brewery",
              ":CreatedAt3": "2021-09-15T"
            },
            FilterExpression:
              "((#Address IN (:Address1,:Address2) AND begins_with(#CreatedAt, :CreatedAt3))) AND (#Type IN (:Type4,:Type5) AND #Name = :Name6)",
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    };

    beforeEach(() => {
      const customer: MockTableEntityTableItem<Customer> = {
        PK: "Customer#123",
        SK: "Customer",
        Id: "123",
        Name: "Some Customer",
        Address: "11 Some St",
        Type: "Customer",
        CreatedAt: "2021-09-15T04:26:31.148Z",
        UpdatedAt: "2022-09-15T04:26:31.148Z"
      };

      mockQuery.mockResolvedValueOnce({
        Items: [customer]
      });
    });

    it("queryByKeys", async () => {
      expect.assertions(4);

      const result = await Customer.query(
        {
          pk: "Customer#123",
          sk: { $beginsWith: "Order" }
        },
        {
          filter: {
            type: ["Beer", "Brewery"],
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

      operationSharedAssertions(result);
    });

    it("queryByEntity", async () => {
      expect.assertions(4);

      const result = await Customer.query("123", {
        skCondition: { $beginsWith: "Order" },
        filter: {
          type: ["Beer", "Brewery"],
          name: "Some Customer",
          $or: [
            {
              address: ["11 Some St", "22 Other St"],
              createdAt: { $beginsWith: "2021-09-15T" }
            }
          ]
        }
      });

      operationSharedAssertions(result);
    });
  });

  describe("can perform complete queries with 'OR' (arbitrary example)", () => {
    const operationSharedAssertions = (result: QueryResults<Course>): void => {
      expect(result).toEqual([
        {
          myPk: "Course|123",
          mySk: "Course",
          id: "123",
          type: "Course",
          name: "Potions",
          createdAt: new Date("2021-09-15T04:26:31.148Z"),
          updatedAt: new Date("2022-09-15T04:26:31.148Z")
        },
        {
          myPk: "Course|123",
          mySk: "Assignment|003",
          id: "003",
          type: "Assignment",
          title: "Assignment-1",
          courseId: "123",
          createdAt: new Date("2023-01-15T12:12:18.123Z"),
          updatedAt: new Date("2023-02-15T08:31:15.148Z")
        }
      ]);
      expect(result[0]).toBeInstanceOf(Course);
      expect(result[1]).toBeInstanceOf(Assignment);
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "other-table",
            KeyConditionExpression: "#myPk = :myPk11",
            ExpressionAttributeNames: {
              "#createdAt": "createdAt",
              "#id": "id",
              "#myPk": "myPk",
              "#name": "name",
              "#title": "title",
              "#type": "type",
              "#updatedAt": "updatedAt"
            },
            ExpressionAttributeValues: {
              ":createdAt10": "202",
              ":createdAt5": "2023",
              ":id7": "123",
              ":myPk11": "Course|123",
              ":name1": "Defense Against The Dark Arts",
              ":title3": "Assignment-1",
              ":title4": "Assignment-2",
              ":type6": "Assignment",
              ":type8": "Course",
              ":type9": "Assignment",
              ":updatedAt2": "2023-02-15"
            },
            FilterExpression:
              "((#name = :name1 AND begins_with(#updatedAt, :updatedAt2)) OR (#title IN (:title3,:title4) AND begins_with(#createdAt, :createdAt5) AND #type = :type6) OR #id = :id7) AND (#type IN (:type8,:type9) AND begins_with(#createdAt, :createdAt10))",
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    };

    beforeEach(() => {
      // Entity representing the partition being queried on
      const course: OtherTableEntityTableItem<Course> = {
        myPk: "Course|123",
        mySk: "Course",
        id: "123",
        type: "Course",
        name: "Potions",
        createdAt: "2021-09-15T04:26:31.148Z",
        updatedAt: "2022-09-15T04:26:31.148Z"
      };

      // Assignment record denormalized to Course partition
      const assignment: OtherTableEntityTableItem<Assignment> = {
        myPk: "Course|123",
        mySk: "Assignment|003",
        id: "003",
        title: "Assignment-1",
        type: "Assignment",
        courseId: course.id,
        createdAt: "2023-01-15T12:12:18.123Z",
        updatedAt: "2023-02-15T08:31:15.148Z"
      };

      mockQuery.mockResolvedValueOnce({
        Items: [course, assignment]
      });
    });

    it("queryByKeys", async () => {
      expect.assertions(5);

      const result = await Course.query(
        {
          myPk: "Course|123"
        },
        {
          filter: {
            type: ["Course", "Assignment"],
            createdAt: { $beginsWith: "202" },
            $or: [
              {
                name: "Defense Against The Dark Arts",
                updatedAt: { $beginsWith: "2023-02-15" }
              },
              {
                title: ["Assignment-1", "Assignment-2"],
                createdAt: { $beginsWith: "2023" },
                type: "Assignment"
              },
              {
                id: "123"
              }
            ]
          }
        }
      );

      operationSharedAssertions(result);
    });

    it("queryByEntity", async () => {
      expect.assertions(5);

      const result = await Course.query("123", {
        filter: {
          type: ["Course", "Assignment"],
          createdAt: { $beginsWith: "202" },
          $or: [
            {
              name: "Defense Against The Dark Arts",
              updatedAt: { $beginsWith: "2023-02-15" }
            },
            {
              title: ["Assignment-1", "Assignment-2"],
              createdAt: { $beginsWith: "2023" },
              type: "Assignment"
            },
            {
              id: "123"
            }
          ]
        }
      });

      operationSharedAssertions(result);
    });
  });

  describe("can query with consistent reads", () => {
    const operationSharedAssertions = (
      result: QueryResults<Customer>
    ): void => {
      expect(result).toEqual([
        {
          pk: "Customer#123",
          sk: "Customer",
          id: "123",
          type: "Customer",
          address: "11 Some St",
          name: "Some Customer",
          createdAt: new Date("2021-09-15T04:26:31.148Z"),
          updatedAt: new Date("2022-09-15T04:26:31.148Z")
        },
        {
          pk: "Customer#123",
          sk: "Order#001",
          id: "001",
          type: "Order",
          customerId: "123",
          orderDate: new Date("2022-10-17T09:31:15.148Z"),
          paymentMethodId: "987",
          createdAt: new Date("2021-10-15T09:31:15.148Z"),
          updatedAt: new Date("2022-10-16T09:31:15.148Z")
        },
        {
          pk: "Customer#123",
          sk: "Order#002",
          id: "002",
          type: "Order",
          customerId: "123",
          orderDate: new Date("2022-10-30T09:31:15.148Z"),
          paymentMethodId: "654",
          createdAt: new Date("2021-10-21T09:31:15.148Z"),
          updatedAt: new Date("2022-10-22T09:31:15.148Z")
        },
        {
          pk: "Customer#123",
          sk: "Order#003",
          id: "003",
          type: "Order",
          customerId: "123",
          orderDate: new Date("2022-11-30T09:31:15.148Z"),
          paymentMethodId: "321",
          createdAt: new Date("2021-11-21T09:31:15.148Z"),
          updatedAt: new Date("2022-11-22T09:31:15.148Z")
        },
        {
          pk: "Customer#123",
          sk: "PaymentMethod#004",
          id: "004",
          type: "PaymentMethod",
          customerId: "123",
          lastFour: "9876",
          createdAt: new Date("2021-10-01T12:31:21.148Z"),
          updatedAt: new Date("2022-10-02T12:31:21.148Z")
        },
        {
          pk: "Customer#123",
          sk: "PaymentMethod#005",
          id: "005",
          type: "PaymentMethod",
          customerId: "123",
          lastFour: "6543",
          createdAt: new Date("2021-10-04T12:31:21.148Z"),
          updatedAt: new Date("2022-10-05T12:31:21.148Z")
        }
      ]);

      result.forEach((res, index) => {
        if (res.type === "Customer") expect(res).toBeInstanceOf(Customer);
        else if (res.type === "Order") expect(res).toBeInstanceOf(Order);
        else if (res.type === "PaymentMethod")
          expect(res).toBeInstanceOf(PaymentMethod);
        else throw new Error("Unexpected test type");
      });

      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK1",
            ExpressionAttributeNames: { "#PK": "PK" },
            ExpressionAttributeValues: { ":PK1": "Customer#123" },
            ConsistentRead: true
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    };

    beforeEach(() => {
      const customer: MockTableEntityTableItem<Customer> = {
        PK: "Customer#123",
        SK: "Customer",
        Id: "123",
        Name: "Some Customer",
        Address: "11 Some St",
        Type: "Customer",
        CreatedAt: "2021-09-15T04:26:31.148Z",
        UpdatedAt: "2022-09-15T04:26:31.148Z"
      };

      // Denormalized Order in Customer Partition
      const order1: MockTableEntityTableItem<Order> = {
        PK: "Customer#123",
        SK: "Order#001",
        Id: "001",
        Type: "Order",
        CustomerId: customer.Id,
        PaymentMethodId: "987",
        OrderDate: "2022-10-17T09:31:15.148Z",
        CreatedAt: "2021-10-15T09:31:15.148Z",
        UpdatedAt: "2022-10-16T09:31:15.148Z"
      };

      // Denormalized Order in Customer Partition
      const order2: MockTableEntityTableItem<Order> = {
        PK: "Customer#123",
        SK: "Order#002",
        Id: "002",
        Type: "Order",
        CustomerId: customer.Id,
        PaymentMethodId: "654",
        OrderDate: "2022-10-30T09:31:15.148Z",
        CreatedAt: "2021-10-21T09:31:15.148Z",
        UpdatedAt: "2022-10-22T09:31:15.148Z"
      };

      // Denormalized Order in Customer Partition
      const order3: MockTableEntityTableItem<Order> = {
        PK: "Customer#123",
        SK: "Order#003",
        Id: "003",
        Type: "Order",
        CustomerId: customer.Id,
        PaymentMethodId: "321",
        OrderDate: "2022-11-30T09:31:15.148Z",
        CreatedAt: "2021-11-21T09:31:15.148Z",
        UpdatedAt: "2022-11-22T09:31:15.148Z"
      };

      // Denormalized PaymentMethod in Customer Partition
      const paymentMethod1: MockTableEntityTableItem<PaymentMethod> = {
        PK: "Customer#123",
        SK: "PaymentMethod#004",
        Id: "004",
        Type: "PaymentMethod",
        LastFour: "9876",
        CustomerId: customer.Id,
        CreatedAt: "2021-10-01T12:31:21.148Z",
        UpdatedAt: "2022-10-02T12:31:21.148Z"
      };

      // Denormalized PaymentMethod in Customer Partition
      const paymentMethod2: MockTableEntityTableItem<PaymentMethod> = {
        PK: "Customer#123",
        SK: "PaymentMethod#005",
        Id: "005",
        Type: "PaymentMethod",
        LastFour: "6543",
        CustomerId: customer.Id,
        CreatedAt: "2021-10-04T12:31:21.148Z",
        UpdatedAt: "2022-10-05T12:31:21.148Z"
      };

      mockQuery.mockResolvedValueOnce({
        Items: [
          customer,
          order1,
          order2,
          order3,
          paymentMethod1,
          paymentMethod2
        ]
      });
    });

    it("queryByKeys", async () => {
      expect.assertions(9);

      const result = await Customer.query(
        { pk: "Customer#123" },
        { consistentRead: true }
      );

      operationSharedAssertions(result);
    });

    it("queryByEntity", async () => {
      expect.assertions(9);

      const result = await Customer.query("123", { consistentRead: true });

      operationSharedAssertions(result);
    });
  });

  describe("queryByKeys specific test", () => {
    it("can query on an index", async () => {
      expect.assertions(6);

      // Denormalized Order in Customer Partition
      const order1: MockTableEntityTableItem<Order> = {
        PK: "Customer#123",
        SK: "Order#001",
        Id: "001",
        Type: "Order",
        CustomerId: "123",
        PaymentMethodId: "987",
        OrderDate: "2022-10-17T09:31:15.148Z",
        CreatedAt: "2021-10-15T09:31:15.148Z",
        UpdatedAt: "2022-10-16T09:31:15.148Z"
      };

      // Denormalized Order in Customer Partition
      const order2: MockTableEntityTableItem<Order> = {
        PK: "Customer#123",
        SK: "Order#002",
        Id: "002",
        Type: "Order",
        CustomerId: "123",
        PaymentMethodId: "654",
        OrderDate: "2022-10-30T09:31:15.148Z",
        CreatedAt: "2021-10-21T09:31:15.148Z",
        UpdatedAt: "2022-10-22T09:31:15.148Z"
      };

      // Denormalized Order in Customer Partition
      const order3: MockTableEntityTableItem<Order> = {
        PK: "Customer#123",
        SK: "Order#003",
        Id: "003",
        Type: "Order",
        CustomerId: "123",
        PaymentMethodId: "321",
        OrderDate: "2022-11-30T09:31:15.148Z",
        CreatedAt: "2021-11-21T09:31:15.148Z",
        UpdatedAt: "2022-11-22T09:31:15.148Z"
      };

      mockQuery.mockResolvedValueOnce({
        Items: [order1, order2, order3]
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
          sk: "Order#001",
          id: "001",
          type: "Order",
          customerId: "123",
          orderDate: new Date("2022-10-17T09:31:15.148Z"),
          paymentMethodId: "987",
          createdAt: new Date("2021-10-15T09:31:15.148Z"),
          updatedAt: new Date("2022-10-16T09:31:15.148Z")
        },
        {
          pk: "Customer#123",
          sk: "Order#002",
          id: "002",
          type: "Order",
          customerId: "123",
          orderDate: new Date("2022-10-30T09:31:15.148Z"),
          paymentMethodId: "654",
          createdAt: new Date("2021-10-21T09:31:15.148Z"),
          updatedAt: new Date("2022-10-22T09:31:15.148Z")
        },
        {
          pk: "Customer#123",
          sk: "Order#003",
          id: "003",
          type: "Order",
          customerId: "123",
          orderDate: new Date("2022-11-30T09:31:15.148Z"),
          paymentMethodId: "321",
          createdAt: new Date("2021-11-21T09:31:15.148Z"),
          updatedAt: new Date("2022-11-22T09:31:15.148Z")
        }
      ]);
      result.forEach(res => {
        expect(res).toBeInstanceOf(Order);
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
            },
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    describe("types", () => {
      beforeEach(() => {
        mockQuery.mockResolvedValueOnce({
          Items: []
        });
      });

      it("does not serialize relationships", async () => {
        const result = await PaymentMethod.query({
          pk: "PaymentMethod#123"
        });

        const paymentMethod = result[0];

        if (paymentMethod !== undefined) {
          // @ts-expect-error: Query does not include HasOne or BelongsTo associations
          Logger.log(paymentMethod.customer);

          // @ts-expect-error: Query does not include HasMany relationship associations
          Logger.log(paymentMethod.orders);
        }
      });

      it("return value includes objectAttribute with correct nested types", async () => {
        const result = await MyClassWithAllAttributeTypes.query({
          pk: "MyClassWithAllAttributeTypes#123"
        });

        const item = result[0];

        if (item !== undefined) {
          // @ts-expect-no-error: objectAttribute is accessible on return value
          Logger.log(item.objectAttribute);

          // @ts-expect-no-error: nested string field is accessible
          Logger.log(item.objectAttribute.name);

          // @ts-expect-no-error: nested string field is accessible
          Logger.log(item.objectAttribute.email);

          // @ts-expect-no-error: nested array field is accessible
          Logger.log(item.objectAttribute.tags);

          // @ts-expect-no-error: array item is a string
          Logger.log(item.objectAttribute.tags[0]);
        }
      });

      it("return value objectAttribute fields have correct types (rejects wrong type assignments)", async () => {
        const result = await MyClassWithAllAttributeTypes.query({
          pk: "MyClassWithAllAttributeTypes#123"
        });

        const item = result[0];

        if (item !== undefined) {
          // @ts-expect-error: name is string, not number
          const nameAsNum: number = item.objectAttribute.name;
          Logger.log(nameAsNum);

          // @ts-expect-error: tags is string[], not number[]
          const tagsAsNums: number[] = item.objectAttribute.tags;
          Logger.log(tagsAsNums);

          // @ts-expect-error: nonExistent is not in the schema
          Logger.log(item.objectAttribute.nonExistent);
        }
      });

      it("return value nullableObjectAttribute requires optional chaining", async () => {
        const result = await MyClassWithAllAttributeTypes.query({
          pk: "MyClassWithAllAttributeTypes#123"
        });

        const item = result[0];

        if (item !== undefined) {
          // @ts-expect-error: nullableObjectAttribute might be undefined, requires optional chaining
          Logger.log(item.nullableObjectAttribute.city);
        }
      });

      it("return value nullableObjectAttribute is accessible with optional chaining and has correct nested types", async () => {
        const result = await MyClassWithAllAttributeTypes.query({
          pk: "MyClassWithAllAttributeTypes#123"
        });

        const item = result[0];

        if (item !== undefined) {
          // @ts-expect-no-error: optional chaining allows safe access
          Logger.log(item.nullableObjectAttribute?.street);

          // @ts-expect-no-error: nested string field
          Logger.log(item.nullableObjectAttribute?.city);

          // @ts-expect-no-error: nested nullable field can be number, null, or undefined
          Logger.log(item.nullableObjectAttribute?.zip);

          // @ts-expect-no-error: nested object field
          Logger.log(item.nullableObjectAttribute?.geo.lat);

          // @ts-expect-no-error: nested object field
          Logger.log(item.nullableObjectAttribute?.geo.lng);

          // @ts-expect-no-error: nested array field
          Logger.log(item.nullableObjectAttribute?.scores);

          // @ts-expect-no-error: array item is a number
          Logger.log(item.nullableObjectAttribute?.scores[0]);
        }
      });

      it("return value nullableObjectAttribute nested fields have correct types (rejects wrong assignments)", async () => {
        const result = await MyClassWithAllAttributeTypes.query({
          pk: "MyClassWithAllAttributeTypes#123"
        });

        const item = result[0];

        if (item !== undefined && item.nullableObjectAttribute !== undefined) {
          // @ts-expect-error: city is string, not number
          const cityAsNum: number = item.nullableObjectAttribute.city;
          Logger.log(cityAsNum);

          // @ts-expect-error: geo.lat is number, not string
          const latAsStr: string = item.nullableObjectAttribute.geo.lat;
          Logger.log(latAsStr);

          // @ts-expect-error: scores is number[], not string[]
          const scoresAsStrs: string[] = item.nullableObjectAttribute.scores;
          Logger.log(scoresAsStrs);

          // @ts-expect-error: nonExistent is not in the schema
          Logger.log(item.nullableObjectAttribute.nonExistent);
        }
      });

      it("allows query to be on both partition key and sort key", async () => {
        // @ts-expect-no-error: Can query on both partition key and sort key
        await Customer.query({ pk: "123", sk: "SomeVal" });
      });

      it("allows query to be on both partition key and sort key with a beginsWithCondition", async () => {
        // @ts-expect-no-error: Can query on both partition key and sort key
        await Customer.query({ pk: "123", sk: { $beginsWith: "Order" } });
      });

      it("does not allow the partition key value if its the wrong type", async () => {
        // @ts-expect-error: PartitionKey value must be a string
        await Customer.query({ pk: 123, sk: "SomeVal" });
      });

      it("does not allow the sort key value if its the wrong type", async () => {
        // @ts-expect-error: PartitionKey value must be a string
        await Customer.query({ pk: "123", sk: 456 });
      });

      it("sort key is optional", async () => {
        // @ts-expect-no-error: SortKey is optional
        await Customer.query({ pk: "123" });
      });

      it("PartitionKey is required (Can't query on sort key only)", async () => {
        // @ts-expect-error: SortKey is optional
        await Customer.query({ sk: "123" });
      });

      it("key condition can only include key values", async () => {
        // @ts-expect-error: Can only query on keys for key condition
        await Customer.query({ pk: "123", name: "Testing" });
      });

      it("key condition can include non-key values if querying on an index", async () => {
        // @ts-expect-no-error: Key condition can include non key values if querying on an index
        await Customer.query({ name: "Testing" }, { indexName: "MyIndex" });
      });

      it("when querying on an index the attribute must exist on the entity", async () => {
        // @ts-expect-error: Key condition attributes must exist on the entity
        await Customer.query(
          { someVal: "Testing" },
          { indexName: "MyIndex" }
        ).catch(_e => {
          // Swallow error
        });
      });

      describe("consistentRead", () => {
        it("consistentRead can be true", async () => {
          // @ts-expect-no-error: Can set consistentRead to true
          await Customer.query({ pk: "123" }, { consistentRead: true });
        });

        it("consistentRead can be false", async () => {
          // @ts-expect-no-error: Can set consistentRead to false
          await Customer.query({ pk: "123" }, { consistentRead: false });
        });

        it("consistentRead can be undefined", async () => {
          // @ts-expect-no-error: Can set consistentRead to undefined
          await Customer.query({ pk: "123" }, { consistentRead: undefined });
        });

        it("consistentRead cannot be true when indexName is present", async () => {
          // @ts-expect-error: consistentRead cannot be true when indexName is present
          await Customer.query(
            { pk: "123" },
            { consistentRead: true, indexName: "MyIndex" }
          );
        });

        it("consistentRead cannot be false when indexName is present", async () => {
          // @ts-expect-error: consistentRead cannot be false when indexName is present
          await Customer.query(
            { pk: "123" },
            { consistentRead: false, indexName: "MyIndex" }
          );
        });

        it("consistentRead can be undefined when indexName is present", async () => {
          // @ts-expect-no-error: consistentRead can be undefined when indexName is present
          await Customer.query(
            { pk: "123" },
            { consistentRead: undefined, indexName: "MyIndex" }
          );
        });
      });
    });
  });

  describe("queryByEntity specific test", () => {
    beforeEach(() => {
      mockQuery.mockResolvedValueOnce({
        Items: []
      });
    });

    describe("types", () => {
      it("does not serialize relationships", async () => {
        const result = await PaymentMethod.query("123");

        const paymentMethod = result[0];

        if (paymentMethod !== undefined) {
          // @ts-expect-error: Query does not include HasOne or BelongsTo associations
          Logger.log(paymentMethod.customer);

          // @ts-expect-error: Query does not include HasMany relationship associations
          Logger.log(paymentMethod.orders);
        }
      });

      it("does not allow to query by index", async () => {
        // @ts-expect-error: Cannot query by index when using query by entity ID
        await PaymentMethod.query("123", {
          indexName: "123"
        });
      });

      it("allows query with sort", async () => {
        // @ts-expect-no-error: Can query with sort
        await Customer.query("123", {
          skCondition: "SomeVal"
        });
      });

      it("allows query on sort key with a condition", async () => {
        // @ts-expect-no-error: Can query on sort key with a condition
        await Customer.query("123", {
          skCondition: { $beginsWith: "SomeVal" }
        });
      });

      it("can query with no options", async () => {
        // @ts-expect-no-error: can query with no options
        await PaymentMethod.query("123");
      });

      it("id must be a string", async () => {
        // @ts-expect-error: id must be a string
        await PaymentMethod.query(123);
      });

      describe("consistentRead", () => {
        it("consistentRead can be true", async () => {
          // @ts-expect-no-error: Can set consistentRead to true
          await Customer.query("123", { consistentRead: true });
        });

        it("consistentRead can be false", async () => {
          // @ts-expect-no-error: Can set consistentRead to false
          await Customer.query("123", { consistentRead: false });
        });

        it("consistentRead can be undefined", async () => {
          // @ts-expect-no-error: Can set consistentRead to undefined
          await Customer.query("123", { consistentRead: undefined });
        });
      });
    });
  });
});
