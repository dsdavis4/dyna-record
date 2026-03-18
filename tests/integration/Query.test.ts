import {
  Assignment,
  ContactInformation,
  Course,
  Customer,
  DeepNestedEntity,
  MyClassWithAllAttributeTypes,
  Order,
  PaymentMethod,
  Teacher,
  Warehouse
} from "./mockModels";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  type OtherTableEntityTableItem,
  type MockTableEntityTableItem
} from "./utils";
import {
  type QueryResults,
  type EntityAttributesInstance
} from "../../src/operations";
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

      const objectTableVal = {
        name: "John",
        email: "john@example.com",
        tags: ["work", "vip"],
        status: "active",
        createdDate: "2023-10-16T03:31:35.918Z"
      };
      const addressVal = {
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
            objectAttribute: objectTableVal,
            addressAttribute: addressVal
          }
        ]
      });

      const results = await MyClassWithAllAttributeTypes.query("123");

      expect(results).toHaveLength(1);
      expect(results[0]).toBeInstanceOf(MyClassWithAllAttributeTypes);
      expect(results[0]).toEqual({
        boolAttribute: true,
        createdAt: new Date("2023-10-16T03:31:35.918Z"),
        dateAttribute: new Date("2023-10-16T03:31:35.918Z"),
        enumAttribute: "val-1",
        foreignKeyAttribute: "111",
        id: "123",
        nullableBoolAttribute: undefined,
        nullableDateAttribute: undefined,
        nullableEnumAttribute: undefined,
        nullableForeignKeyAttribute: undefined,
        nullableNumberAttribute: undefined,
        addressAttribute: {
          city: "Springfield",
          geo: { lat: 40.7128, lng: -74.006 },
          scores: [95, 87, 100],
          street: "123 Main St",
          zip: 12345
        },
        nullableStringAttribute: undefined,
        numberAttribute: 9,
        objectAttribute: {
          email: "john@example.com",
          name: "John",
          tags: ["work", "vip"],
          status: "active",
          createdDate: new Date("2023-10-16T03:31:35.918Z")
        },
        pk: "MyClassWithAllAttributeTypes#123",
        sk: "MyClassWithAllAttributeTypes",
        stringAttribute: "some-string",
        type: "MyClassWithAllAttributeTypes",
        updatedAt: new Date("2023-10-16T03:31:35.918Z")
      });
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
        tags: ["work", "vip"],
        status: "active",
        createdDate: "2023-10-16T03:31:35.918Z",
        deletedAt: null
      },
      addressAttribute: {
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
        tags: ["work", "vip"],
        status: "active",
        createdDate: new Date("2023-10-16T03:31:35.918Z")
      },
      addressAttribute: {
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
          "addressAttribute.zip": 12345
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
            FilterExpression: "#addressAttribute.#zip = :addressAttributezip1",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#addressAttribute": "addressAttribute",
              "#zip": "zip"
            },
            ExpressionAttributeValues: {
              ":addressAttributezip1": 12345,
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
          "addressAttribute.geo.lat": 40.7128
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
              "#addressAttribute.#geo.#lat = :addressAttributegeolat1",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#addressAttribute": "addressAttribute",
              "#geo": "geo",
              "#lat": "lat"
            },
            ExpressionAttributeValues: {
              ":addressAttributegeolat1": 40.7128,
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
          "addressAttribute.scores": { $contains: 95 }
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
              "contains(#addressAttribute.#scores, :addressAttributescores1)",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#addressAttribute": "addressAttribute",
              "#scores": "scores"
            },
            ExpressionAttributeValues: {
              ":addressAttributescores1": 95,
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
          "addressAttribute.city": ["Springfield", "Shelbyville"]
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
              "#addressAttribute.#city IN (:addressAttributecity1,:addressAttributecity2)",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#addressAttribute": "addressAttribute",
              "#city": "city"
            },
            ExpressionAttributeValues: {
              ":addressAttributecity1": "Springfield",
              ":addressAttributecity2": "Shelbyville",
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
          "addressAttribute.city": "Springfield"
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
              "#objectAttribute.#name = :objectAttributename1 AND #addressAttribute.#city = :addressAttributecity2",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#objectAttribute": "objectAttribute",
              "#name": "name",
              "#addressAttribute": "addressAttribute",
              "#city": "city"
            },
            ExpressionAttributeValues: {
              ":objectAttributename1": "John",
              ":addressAttributecity2": "Springfield",
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
            { "addressAttribute.scores": { $contains: 95 } }
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
              "(contains(#objectAttribute.#tags, :objectAttributetags1) OR contains(#addressAttribute.#scores, :addressAttributescores2)) AND (#stringAttribute = :stringAttribute3)",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#objectAttribute": "objectAttribute",
              "#tags": "tags",
              "#addressAttribute": "addressAttribute",
              "#scores": "scores",
              "#stringAttribute": "stringAttribute"
            },
            ExpressionAttributeValues: {
              ":objectAttributetags1": "vip",
              ":addressAttributescores2": 95,
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
          "addressAttribute.city": ["Springfield", "Shelbyville"],
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
              "(#objectAttribute.#name = :objectAttributename1 OR begins_with(#stringAttribute, :stringAttribute2)) AND (#addressAttribute.#city IN (:addressAttributecity3,:addressAttributecity4))",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#objectAttribute": "objectAttribute",
              "#name": "name",
              "#stringAttribute": "stringAttribute",
              "#addressAttribute": "addressAttribute",
              "#city": "city"
            },
            ExpressionAttributeValues: {
              ":objectAttributename1": "John",
              ":stringAttribute2": "some",
              ":addressAttributecity3": "Springfield",
              ":addressAttributecity4": "Shelbyville",
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
          "addressAttribute.city": ["Springfield", "Shelbyville"],
          "addressAttribute.geo.lat": 40,
          $or: [
            {
              "objectAttribute.tags": { $contains: "vip" },
              "objectAttribute.email": { $beginsWith: "john" }
            },
            {
              "addressAttribute.scores": { $contains: 95 },
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
              "((contains(#objectAttribute.#tags, :objectAttributetags1) AND begins_with(#objectAttribute.#email, :objectAttributeemail2)) OR (contains(#addressAttribute.#scores, :addressAttributescores3) AND #stringAttribute = :stringAttribute4)) AND (#objectAttribute.#name = :objectAttributename5 AND #addressAttribute.#city IN (:addressAttributecity6,:addressAttributecity7) AND #addressAttribute.#geo.#lat = :addressAttributegeolat8)",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#objectAttribute": "objectAttribute",
              "#tags": "tags",
              "#email": "email",
              "#addressAttribute": "addressAttribute",
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
              ":addressAttributescores3": 95,
              ":stringAttribute4": "some-string",
              ":objectAttributename5": "John",
              ":addressAttributecity6": "Springfield",
              ":addressAttributecity7": "Shelbyville",
              ":addressAttributegeolat8": 40,
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

      result.forEach((res, _index) => {
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
      result.forEach((res, _index) => {
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
              ":Type4": "Order",
              ":Type5": "PaymentMethod",
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
            type: ["Order", "PaymentMethod"],
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
          type: ["Order", "PaymentMethod"],
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

      result.forEach((res, _index) => {
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

      it("return value addressAttribute is accessible directly (non-nullable)", async () => {
        const result = await MyClassWithAllAttributeTypes.query({
          pk: "MyClassWithAllAttributeTypes#123"
        });

        const item = result[0];

        if (item !== undefined) {
          // @ts-expect-no-error: addressAttribute is non-nullable, direct access is valid
          Logger.log(item.addressAttribute.city);
        }
      });

      it("return value addressAttribute is accessible directly and has correct nested types", async () => {
        const result = await MyClassWithAllAttributeTypes.query({
          pk: "MyClassWithAllAttributeTypes#123"
        });

        const item = result[0];

        if (item !== undefined) {
          // @ts-expect-no-error: direct access on non-nullable attribute
          Logger.log(item.addressAttribute.street);

          // @ts-expect-no-error: nested string field
          Logger.log(item.addressAttribute.city);

          // @ts-expect-no-error: nested nullable field can be number or undefined
          Logger.log(item.addressAttribute.zip);

          // @ts-expect-no-error: nested object field
          Logger.log(item.addressAttribute.geo.lat);

          // @ts-expect-no-error: nested object field
          Logger.log(item.addressAttribute.geo.lng);

          // @ts-expect-no-error: nested array field
          Logger.log(item.addressAttribute.scores);

          // @ts-expect-no-error: array item is a number
          Logger.log(item.addressAttribute.scores[0]);
        }
      });

      it("return value addressAttribute nested fields have correct types (rejects wrong assignments)", async () => {
        const result = await MyClassWithAllAttributeTypes.query({
          pk: "MyClassWithAllAttributeTypes#123"
        });

        const item = result[0];

        if (item !== undefined) {
          // @ts-expect-error: city is string, not number
          const cityAsNum: number = item.addressAttribute.city;
          Logger.log(cityAsNum);

          // @ts-expect-error: geo.lat is number, not string
          const latAsStr: string = item.addressAttribute.geo.lat;
          Logger.log(latAsStr);

          // @ts-expect-error: scores is number[], not string[]
          const scoresAsStrs: string[] = item.addressAttribute.scores;
          Logger.log(scoresAsStrs);

          // @ts-expect-error: nonExistent is not in the schema
          Logger.log(item.addressAttribute.nonExistent);
        }
      });

      it("return value objectAttribute enum field is typed as union of values", async () => {
        const result = await MyClassWithAllAttributeTypes.query({
          pk: "MyClassWithAllAttributeTypes#123"
        });

        const item = result[0];

        if (item !== undefined) {
          // @ts-expect-no-error: status is "active" | "inactive"
          const status: "active" | "inactive" = item.objectAttribute.status;
          Logger.log(status);

          // @ts-expect-error: status is "active" | "inactive", not number
          const statusAsNum: number = item.objectAttribute.status;
          Logger.log(statusAsNum);
        }
      });

      it("return value nested objectAttribute enum field is typed correctly", async () => {
        const result = await MyClassWithAllAttributeTypes.query({
          pk: "MyClassWithAllAttributeTypes#123"
        });

        const item = result[0];

        if (item !== undefined) {
          // @ts-expect-no-error: accuracy is "precise" | "approximate"
          const acc: "precise" | "approximate" =
            item.addressAttribute.geo.accuracy;
          Logger.log(acc);

          // @ts-expect-error: accuracy is "precise" | "approximate", not number
          const accAsNum: number = item.addressAttribute.geo.accuracy;
          Logger.log(accAsNum);
        }
      });

      it("return value nullable enum field supports null and undefined", async () => {
        const result = await MyClassWithAllAttributeTypes.query({
          pk: "MyClassWithAllAttributeTypes#123"
        });

        const item = result[0];

        // @ts-expect-no-error: enum field via direct access
        Logger.log(item?.addressAttribute.category);

        if (item !== undefined) {
          // @ts-expect-no-error: category is "home" | "work" | "other" | undefined
          const cat: "home" | "work" | "other" | undefined =
            item.addressAttribute.category;
          Logger.log(cat);
        }
      });

      it("return value date field on objectAttribute is typed as Date", async () => {
        const result = await MyClassWithAllAttributeTypes.query({
          pk: "MyClassWithAllAttributeTypes#123"
        });

        const item = result[0];

        if (item !== undefined) {
          // @ts-expect-no-error: createdDate is Date
          const d: Date = item.objectAttribute.createdDate;
          Logger.log(d);

          // @ts-expect-error: createdDate is Date, not string
          const dStr: string = item.objectAttribute.createdDate;
          Logger.log(dStr);
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
        await Customer.query(
          // @ts-expect-error: Key condition attributes must exist on the entity
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
        // @ts-expect-no-error: Can query with sort using a valid entity name
        await Customer.query("123", {
          skCondition: "Order"
        });
      });

      it("allows query on sort key with a condition", async () => {
        // @ts-expect-no-error: Can query on sort key with a beginsWith condition
        await Customer.query("123", {
          skCondition: { $beginsWith: "Order" }
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

  describe("typed filter types", () => {
    beforeEach(() => {
      mockQuery.mockResolvedValueOnce({ Items: [] });
    });

    describe("filter attribute key validation", () => {
      it("accepts valid keys from root entity", async () => {
        // @ts-expect-no-error: name and address are Customer attributes
        await Customer.query("123", {
          filter: { name: "John", address: "123 Main" }
        });
      });

      it("accepts valid keys from relationship entities", async () => {
        // @ts-expect-no-error: lastFour is PaymentMethod, orderDate is Order, email is ContactInformation
        await Customer.query("123", {
          filter: { lastFour: "1234" }
        });
      });

      it("accepts default fields as filter keys", async () => {
        // @ts-expect-no-error: id, type, createdAt, updatedAt are valid on all entities
        await Customer.query("123", {
          filter: { id: "abc", createdAt: "2023", updatedAt: "2024" }
        });
      });

      it("rejects invalid keys", async () => {
        // @ts-expect-error: nonExistent is not a valid filter key
        await Customer.query("123", { filter: { nonExistent: "value" } }).catch(
          () => {}
        );
      });

      it("rejects relationship property names", async () => {
        // @ts-expect-error: orders is a relationship prop, not a filter key
        await Customer.query("123", { filter: { orders: "value" } }).catch(
          () => {}
        );
      });

      it("accepts ForeignKey attributes", async () => {
        // @ts-expect-no-error: customerId is a ForeignKey on Order
        await Customer.query("123", {
          filter: { customerId: "cust-1" }
        });
      });

      it("accepts NullableForeignKey attributes", async () => {
        // @ts-expect-no-error: phone is a nullable attribute on ContactInformation
        await Customer.query("123", {
          filter: { phone: "555-1234" }
        });
      });

      it("excludes PK/SK from filter keys", async () => {
        // @ts-expect-error: pk is a PartitionKey attribute, not a filter key
        await Customer.query("123", { filter: { pk: "value" } });
      });

      it("accepts dot-path keys for ObjectAttribute fields", async () => {
        // @ts-expect-no-error: location.city is a valid dot-path on Warehouse
        await Warehouse.query("123", {
          filter: { "location.city": "Denver" }
        });
      });

      it("rejects invalid dot-paths", async () => {
        // @ts-expect-error: location.nonExistent is not a valid dot-path
        await Warehouse.query("123", {
          filter: { "location.nonExistent": "value" }
        });
      });

      it("works for entities with no relationships", async () => {
        // @ts-expect-no-error: stringAttribute is a valid key on MyClassWithAllAttributeTypes
        await MyClassWithAllAttributeTypes.query("123", {
          filter: { stringAttribute: "val" }
        });
      });

      it("works for OtherTable entities", async () => {
        // @ts-expect-no-error: name is on Teacher, lastLogin is on Profile
        await Teacher.query("123", {
          filter: { name: "Smith" }
        });
      });
    });

    describe("type narrowing", () => {
      it("accepts valid entity class name strings for type", async () => {
        // @ts-expect-no-error: "Order" is a valid partition entity name for Customer
        await Customer.query("123", {
          filter: { type: "Order" }
        });
      });

      it("rejects non-entity strings for type", async () => {
        // @ts-expect-error: "NonExistent" is not a valid entity name in Customer's partition
        await Customer.query("123", { filter: { type: "NonExistent" } });
      });

      it("accepts type as array of entity names", async () => {
        // @ts-expect-no-error: array of valid entity names
        await Customer.query("123", {
          filter: { type: ["Order", "PaymentMethod"] }
        });
      });

      it("narrows attributes when type is a single entity", async () => {
        // @ts-expect-no-error: orderDate is valid when type is "Order"
        await Customer.query("123", {
          filter: { type: "Order", orderDate: "2023" }
        });
      });

      it("allows other entity attributes at top level due to union matching", async () => {
        // At the top level, TypeScript's union excess property checking allows
        // keys from other union members. Per-element narrowing works in $or.
        // @ts-expect-no-error: lastFour exists in another union variant (PaymentMethod)
        await Customer.query("123", {
          filter: { type: "Order", lastFour: "1234" }
        });
      });

      it("allows all partition attributes when type is an array", async () => {
        // @ts-expect-no-error: with array type, all partition attrs allowed
        await Customer.query("123", {
          filter: { type: ["Order", "PaymentMethod"], createdAt: "2023" }
        });
      });

      it("each $or element independently narrowed", async () => {
        // @ts-expect-no-error: each $or block narrowed by its own type
        await Customer.query("123", {
          filter: {
            $or: [
              { type: "Order", orderDate: "2023" },
              { type: "PaymentMethod", lastFour: "1234" }
            ]
          }
        });
      });

      it("rejects invalid attrs in $or elements", async () => {
        // @ts-expect-error: nonExistent is not a valid attribute on any partition entity
        await Customer.query("123", {
          filter: { $or: [{ type: "Order" as const, nonExistent: "value" }] }
        }).catch(() => {});
      });

      it("allows all partition attributes when no type is specified", async () => {
        // @ts-expect-no-error: without type, all partition attrs allowed
        await Customer.query("123", {
          filter: { name: "John", lastFour: "1234", email: "test@test.com" }
        });
      });
    });

    describe("return type narrowing", () => {
      it("default return type is the full partition union", async () => {
        const result = await Customer.query("123");

        // @ts-expect-no-error: assignable to full union (Customer + all related entities)
        const _full: QueryResults<Customer> = result;

        // @ts-expect-error: NOT assignable to just one entity — result includes the full union
        const _notNarrowed: Array<EntityAttributesInstance<Order>> = result;

        Logger.log(_full, _notNarrowed);
      });

      it("type: 'Order' narrows to only Order", async () => {
        const result = await Customer.query("123", {
          filter: { type: "Order" }
        });

        // @ts-expect-no-error: narrowed to exactly Order
        const _match: Array<EntityAttributesInstance<Order>> = result;

        // @ts-expect-error: Customer is excluded — result only contains Order
        const _excluded: Array<EntityAttributesInstance<Customer>> = result;

        Logger.log(_match, _excluded);
      });

      it("type: 'Customer' narrows to only Customer", async () => {
        const result = await Customer.query("123", {
          filter: { type: "Customer" }
        });

        // @ts-expect-no-error: narrowed to exactly Customer
        const _match: Array<EntityAttributesInstance<Customer>> = result;

        // @ts-expect-error: Order is excluded — result only contains Customer
        const _excludedOrder: Array<EntityAttributesInstance<Order>> = result;

        // @ts-expect-error: PaymentMethod is excluded — result only contains Customer
        const _excludedPM: Array<EntityAttributesInstance<PaymentMethod>> =
          result;

        Logger.log(_match, _excludedOrder, _excludedPM);
      });

      it("type: ['Order', 'PaymentMethod'] narrows to exactly that union", async () => {
        const result = await Customer.query("123", {
          filter: { type: ["Order", "PaymentMethod"] }
        });

        // @ts-expect-no-error: assignable to the exact union of the filtered types
        const _match: Array<
          | EntityAttributesInstance<Order>
          | EntityAttributesInstance<PaymentMethod>
        > = result;

        // @ts-expect-no-error: narrowed result is still assignable to the wider full union
        const _wider: QueryResults<Customer> = result;

        // @ts-expect-error: Customer is excluded — not in the type array
        const _excluded: Array<EntityAttributesInstance<Customer>> = result;

        Logger.log(_match, _wider, _excluded);
      });

      it("no type filter does not narrow — returns full union", async () => {
        const result = await Customer.query("123", {
          filter: { createdAt: "2023" }
        });

        // @ts-expect-no-error: un-narrowed result is the full union
        const _full: QueryResults<Customer> = result;

        // @ts-expect-error: NOT assignable to just one entity — not narrowed
        const _notNarrowed: Array<EntityAttributesInstance<Order>> = result;

        Logger.log(_full, _notNarrowed);
      });
    });

    describe("index query stays untyped", () => {
      it("index queries accept any filter key", async () => {
        // @ts-expect-no-error: index queries use untyped FilterParams
        await Customer.query(
          { name: "Testing" },
          { indexName: "MyIndex", filter: { name: "value" } }
        );
      });
    });

    describe("backward compatibility", () => {
      it("query with empty options still works", async () => {
        // @ts-expect-no-error: empty options
        await Customer.query("123", {});
      });

      it("query with no filter still works", async () => {
        // @ts-expect-no-error: no filter
        await Customer.query("123", { consistentRead: true });
      });

      it("query with skCondition still works", async () => {
        // @ts-expect-no-error: skCondition
        await Customer.query("123", { skCondition: "Order" });
      });

      it("query with beginsWith skCondition still works", async () => {
        // @ts-expect-no-error: beginsWith skCondition
        await Customer.query("123", {
          skCondition: { $beginsWith: "Order" }
        });
      });

      it("existing filter patterns still compile", async () => {
        // @ts-expect-no-error: existing pattern from tests
        await Course.query("123", {
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
      });

      it("query with empty filter object still works", async () => {
        // @ts-expect-no-error: empty filter
        await Customer.query("123", { filter: {} });
      });
    });

    describe("queryByKeys overload with typed filters", () => {
      it("accepts valid filter keys with object key conditions", async () => {
        // @ts-expect-no-error: typed filters work with object key form
        await Customer.query(
          { pk: "Customer#123" },
          { filter: { name: "John", lastFour: "1234" } }
        );
      });

      it("rejects invalid filter keys with object key conditions", async () => {
        // @ts-expect-error: nonExistent is not a valid filter key
        await Customer.query(
          { pk: "Customer#123" },
          { filter: { nonExistent: "value" } }
        ).catch(() => {});
      });

      it("accepts type narrowing with object key conditions", async () => {
        // @ts-expect-no-error: type narrowing works with object key form
        await Customer.query(
          { pk: "Customer#123" },
          { filter: { type: "Order", orderDate: "2023" } }
        );
      });
    });

    describe("deeply nested dot-path keys", () => {
      it("accepts deeply nested dot-paths on DeepNestedEntity", async () => {
        // @ts-expect-no-error: 3-level deep path is valid
        await DeepNestedEntity.query("123", {
          filter: { "data.level1.level2.score": 5 }
        });
      });

      it("accepts 4-level deep dot-paths", async () => {
        // @ts-expect-no-error: 4-level deep path is valid
        await DeepNestedEntity.query("123", {
          filter: { "data.level1.level2.level3.flag": true }
        });
      });

      it("rejects invalid deep dot-paths", async () => {
        // @ts-expect-error: nonExistent is not a valid nested path
        await DeepNestedEntity.query("123", {
          filter: { "data.level1.level2.nonExistent": "value" }
        }).catch(() => {});
      });
    });

    describe("filter operators with typed keys", () => {
      it("accepts $beginsWith on typed dot-path keys", async () => {
        // @ts-expect-no-error: $beginsWith works with typed keys
        await Warehouse.query("123", {
          filter: { "location.city": { $beginsWith: "Den" } }
        });
      });

      it("accepts $contains on typed keys", async () => {
        // @ts-expect-no-error: $contains works with typed keys
        await Customer.query("123", {
          filter: { name: { $contains: "john" } }
        });
      });

      it("accepts IN operator (array) on typed keys", async () => {
        // @ts-expect-no-error: array values work with typed keys
        await Customer.query("123", {
          filter: { name: ["John", "Jane"] }
        });
      });
    });

    describe("sort key condition", () => {
      describe("skCondition value validation", () => {
        it("accepts exact entity name", async () => {
          // @ts-expect-no-error: "Order" is a valid partition entity name
          await Customer.query("123", { skCondition: "Order" });
        });

        it("accepts entity name with suffix", async () => {
          // @ts-expect-no-error: "Order#123" starts with valid entity name
          await Customer.query("123", { skCondition: "Order#123" });
        });

        it("accepts $beginsWith with entity name", async () => {
          // @ts-expect-no-error: $beginsWith with valid entity name
          await Customer.query("123", {
            skCondition: { $beginsWith: "Order" }
          });
        });

        it("accepts $beginsWith with entity name prefix", async () => {
          // @ts-expect-no-error: $beginsWith with "Order#abc" starts with valid name
          await Customer.query("123", {
            skCondition: { $beginsWith: "Order#abc" }
          });
        });

        it("accepts self entity name", async () => {
          // @ts-expect-no-error: "Customer" is the queried entity itself
          await Customer.query("123", { skCondition: "Customer" });
        });

        it("rejects invalid entity name", async () => {
          // @ts-expect-error: "NonExistent" is not a valid partition entity name
          await Customer.query("123", { skCondition: "NonExistent" });
        });

        it("rejects invalid $beginsWith entity name", async () => {
          // @ts-expect-error: "Fake" is not a valid partition entity name
          await Customer.query("123", {
            skCondition: { $beginsWith: "Fake" }
          });
        });
      });

      describe("return type narrowing by skCondition", () => {
        it("exact entity name narrows return type", async () => {
          const result = await Customer.query("123", {
            skCondition: "Order"
          });

          // @ts-expect-no-error: narrowed to Order
          const _match: Array<EntityAttributesInstance<Order>> = result;

          // @ts-expect-error: Customer excluded by SK narrowing
          const _excluded: Array<EntityAttributesInstance<Customer>> = result;

          Logger.log(_match, _excluded);
        });

        it("exact self entity name narrows to self", async () => {
          const result = await Customer.query("123", {
            skCondition: "Customer"
          });

          // @ts-expect-no-error: narrowed to Customer
          const _match: Array<EntityAttributesInstance<Customer>> = result;

          // @ts-expect-error: Order excluded
          const _excluded: Array<EntityAttributesInstance<Order>> = result;

          Logger.log(_match, _excluded);
        });

        it("$beginsWith entity name narrows return type", async () => {
          const result = await Customer.query("123", {
            skCondition: { $beginsWith: "Order" }
          });

          // @ts-expect-no-error: narrowed to Order
          const _match: Array<EntityAttributesInstance<Order>> = result;

          // @ts-expect-error: Customer excluded
          const _excluded: Array<EntityAttributesInstance<Customer>> = result;

          Logger.log(_match, _excluded);
        });

        it("entity name with suffix does NOT narrow (delimiter is ambiguous)", async () => {
          const result = await Customer.query("123", {
            skCondition: "Order#some-id"
          });

          // @ts-expect-no-error: not narrowed — full union
          const _full: QueryResults<Customer> = result;

          // @ts-expect-error: NOT narrowed to just Order
          const _notNarrowed: Array<EntityAttributesInstance<Order>> = result;

          Logger.log(_full, _notNarrowed);
        });

        it("$beginsWith with suffix does NOT narrow", async () => {
          const result = await Customer.query("123", {
            skCondition: { $beginsWith: "Order#abc" }
          });

          // @ts-expect-no-error: not narrowed — full union
          const _full: QueryResults<Customer> = result;

          // @ts-expect-error: NOT narrowed
          const _notNarrowed: Array<EntityAttributesInstance<Order>> = result;

          Logger.log(_full, _notNarrowed);
        });

        it("filter type takes precedence over SK narrowing", async () => {
          const result = await Customer.query("123", {
            skCondition: { $beginsWith: "Order" },
            filter: { type: "PaymentMethod" }
          });

          // @ts-expect-no-error: filter type "PaymentMethod" takes precedence
          const _match: Array<EntityAttributesInstance<PaymentMethod>> = result;

          // @ts-expect-error: Order excluded despite SK matching
          const _excluded: Array<EntityAttributesInstance<Order>> = result;

          Logger.log(_match, _excluded);
        });

        it("no skCondition returns full union", async () => {
          const result = await Customer.query("123");

          // @ts-expect-no-error: full union
          const _full: QueryResults<Customer> = result;

          // @ts-expect-error: NOT narrowed
          const _notNarrowed: Array<EntityAttributesInstance<Order>> = result;

          Logger.log(_full, _notNarrowed);
        });
      });
    });

    describe("complex $or with type narrowing", () => {
      it("$or with mixed types narrows filter keys per block", async () => {
        // Each $or block independently validates keys based on its type
        // @ts-expect-no-error: each block uses attributes from its own entity
        await Customer.query("123", {
          filter: {
            $or: [
              { type: "Order", orderDate: "2023-01-01", customerId: "c1" },
              { type: "PaymentMethod", lastFour: "4242" },
              { type: "Customer", name: "Alice", address: "123 Main St" },
              { type: "ContactInformation", email: "alice@example.com" }
            ]
          }
        });
      });

      it("$or without type allows all partition attributes per block", async () => {
        // When $or blocks don't specify type, all partition keys are valid
        // @ts-expect-no-error: mixing attributes from different entities in untyped $or
        await Customer.query("123", {
          filter: {
            $or: [
              { name: "Alice", orderDate: "2023" },
              { lastFour: "4242", email: "test@test.com" }
            ]
          }
        });
      });

      it("top-level type + $or with different types", async () => {
        // Top-level type narrows the return type, $or blocks narrow their own keys
        const result = await Customer.query("123", {
          filter: {
            type: "Order",
            $or: [{ orderDate: "2023-01-01" }, { orderDate: "2024-01-01" }]
          }
        });

        // @ts-expect-no-error: top-level type: "Order" narrows return
        const _match: Array<EntityAttributesInstance<Order>> = result;

        // @ts-expect-error: Customer excluded by top-level type
        const _excluded: Array<EntityAttributesInstance<Customer>> = result;

        Logger.log(_match, _excluded);
      });

      it("$or-only filter does NOT narrow return type", async () => {
        // When only $or is specified (no top-level type), return type is full union
        const result = await Customer.query("123", {
          filter: {
            $or: [
              { type: "Order", orderDate: "2023" },
              { type: "PaymentMethod", lastFour: "1234" }
            ]
          }
        });

        // @ts-expect-no-error: return type is the full union — $or doesn't narrow returns
        const _full: QueryResults<Customer> = result;

        // @ts-expect-error: NOT narrowed to just Order — $or alone doesn't narrow
        const _notNarrowed: Array<EntityAttributesInstance<Order>> = result;

        Logger.log(_full, _notNarrowed);
      });

      it("top-level type array + $or with entity-specific filters", async () => {
        const result = await Customer.query("123", {
          filter: {
            type: ["Order", "ContactInformation"],
            $or: [{ orderDate: "2023" }, { email: "test@example.com" }]
          }
        });

        // @ts-expect-no-error: narrowed to Order | ContactInformation
        const _match: Array<
          | EntityAttributesInstance<Order>
          | EntityAttributesInstance<ContactInformation>
        > = result;

        // @ts-expect-error: Customer is excluded
        const _excluded: Array<EntityAttributesInstance<Customer>> = result;

        Logger.log(_match, _excluded);
      });

      it("$or rejects invalid keys even without type narrowing", async () => {
        // @ts-expect-error: nonExistent is not valid on any entity
        await Customer.query("123", {
          filter: { $or: [{ nonExistent: "x" }] }
        }).catch(() => {});
      });
    });
  });
});
