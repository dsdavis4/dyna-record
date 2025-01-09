import {
  Assignment,
  Course,
  Customer,
  Order,
  PaymentMethod
} from "./mockModels";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { BelongsToLink } from "../../src/relationships";
import {
  type OtherTableEntityTableItem,
  type MockTableEntityTableItem
} from "./utils";
import { QueryResults } from "../../src/operations";

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
            ExpressionAttributeValues: { ":PK1": "Customer#123" }
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

  describe("queryByKeys", () => {
    it("queries by PK and SK", async () => {
      expect.assertions(4);

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

      const result = await Customer.query({
        pk: "Customer#123",
        sk: "Order#001"
      });

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
            }
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("queries by PK SK begins with", async () => {
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

      const result = await Customer.query({
        pk: "Customer#123",
        sk: { $beginsWith: "Order" }
      });

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
            }
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("queries with filter on attributes that are part of included entities", async () => {
      expect.assertions(4);

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

      const result = await Customer.query(
        { pk: "Customer#123" },
        {
          filter: {
            type: "PaymentMethod",
            lastFour: "9876"
          }
        }
      );

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
            TableName: "mock-table"
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("can perform complex queries (arbitrary example)", async () => {
      expect.assertions(4);

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

    it("can perform complete queries with 'OR' (arbitrary example)", async () => {
      expect.assertions(5);

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
              "((#name = :name1 AND begins_with(#updatedAt, :updatedAt2)) OR (#title IN (:title3,:title4) AND begins_with(#createdAt, :createdAt5) AND #type = :type6) OR #id = :id7) AND (#type IN (:type8,:type9) AND begins_with(#createdAt, :createdAt10))"
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

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
          // TODO make sure there are no console logs in tests and use this instead..
          // @ts-expect-error: Query does not include HasOne or BelongsTo associations
          Logger.log(paymentMethod.customer);

          // @ts-expect-error: Query does not include HasMany relationship associations
          Logger.log(paymentMethod.orders);
        }
      });
    });
  });

  describe("queryByEntity", () => {
    it("queries by PK and SK", async () => {
      expect.assertions(4);

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

      const result = await Customer.query("123", {
        skCondition: "Order#001"
      });

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
            }
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("queries by PK SK begins with", async () => {
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

      const result = await Customer.query("123", {
        skCondition: { $beginsWith: "Order" }
      });

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
            }
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("queries with filter on attributes that are part of included entities", async () => {
      expect.assertions(4);

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

      const result = await Customer.query("123", {
        filter: {
          type: "PaymentMethod",
          lastFour: "9876"
        }
      });

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
            TableName: "mock-table"
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

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
            UpdatedAt: "2022-09-15T04:26:31.148Z"
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
          Logger.log(paymentMethod.customer);

          // @ts-expect-error: Query does not include HasMany relationship associations
          Logger.log(paymentMethod.orders);
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
