import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  Customer,
  PaymentMethod,
  Order,
  PaymentMethodProvider,
  Book,
  Author,
  Course,
  Teacher,
  Assignment,
  Student,
  ContactInformation,
  Pet,
  Address,
  PhoneBook
} from "./mockModels";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactGetCommand
} from "@aws-sdk/lib-dynamodb";
import Logger from "../../src/Logger";
import { MockTableEntityTableItem } from "./utils";

const mockGet = jest.fn();
const mockSend = jest.fn();
const mockQuery = jest.fn();
const mockTransactGetItems = jest.fn();
const mockedDynamoDBClient = jest.mocked(DynamoDBClient);
const mockedDynamoDBDocumentClient = jest.mocked(DynamoDBDocumentClient);
const mockedGetCommand = jest.mocked(GetCommand);
const mockedQueryCommand = jest.mocked(QueryCommand);
const mockTransactGetCommand = jest.mocked(TransactGetCommand);

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
            if (command.name === "GetCommand") {
              return await Promise.resolve(mockGet());
            }
            if (command.name === "QueryCommand") {
              return await Promise.resolve(mockQuery());
            }
            if (command.name === "TransactGetCommand") {
              return await Promise.resolve(mockTransactGetItems());
            }
          })
        };
      })
    },
    GetCommand: jest.fn().mockImplementation(() => {
      return { name: "GetCommand" };
    }),
    QueryCommand: jest.fn().mockImplementation(() => {
      return { name: "QueryCommand" };
    }),
    TransactGetCommand: jest.fn().mockImplementation(() => {
      return { name: "TransactGetCommand" };
    })
  };
});

describe("FindById", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("will initialize a Dynamo client", async () => {
    expect.assertions(3);

    mockGet.mockResolvedValueOnce({});

    await Customer.findById("123");

    expect(mockedDynamoDBClient).toHaveBeenCalledWith({ region: "us-west-2" });
    expect(mockedDynamoDBClient).toHaveBeenCalledTimes(1);
    expect(mockedDynamoDBDocumentClient.from.mock.calls).toEqual([
      [{ key: "MockDynamoDBClient" }]
    ]);
  });

  it("will find an Entity by id and serialize it to the model", async () => {
    expect.assertions(5);

    mockGet.mockResolvedValueOnce({
      Item: {
        PK: "Customer#123",
        SK: "Customer",
        Id: "123",
        Name: "Some Customer",
        Address: "11 Some St",
        Type: "Customer",
        UpdatedAt: "2023-09-15T04:26:31.148Z"
      }
    });

    const result = await Customer.findById("123");

    expect(result).toBeInstanceOf(Customer);
    expect(result).toEqual({
      type: "Customer",
      pk: "Customer#123",
      sk: "Customer",
      id: "123",
      name: "Some Customer",
      address: "11 Some St",
      updatedAt: new Date("2023-09-15T04:26:31.148Z")
    });
    expect(result?.mockCustomInstanceMethod()).toEqual("Some Customer-123");
    expect(mockedGetCommand.mock.calls).toEqual([
      [
        {
          TableName: "mock-table",
          Key: { PK: "Customer#123", SK: "Customer" },
          ConsistentRead: true
        }
      ]
    ]);
    expect(mockSend.mock.calls).toEqual([[{ name: "GetCommand" }]]);
  });

  it("the returned model will have a instance method for update", async () => {
    expect.assertions(1);

    mockGet.mockResolvedValueOnce({
      Item: {
        PK: "Customer#123",
        SK: "Customer",
        Id: "123",
        Name: "Some Customer",
        Address: "11 Some St",
        Type: "Customer",
        UpdatedAt: "2023-09-15T04:26:31.148Z"
      }
    });

    const result = await Customer.findById("123");

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(result?.update).toBeInstanceOf(Function);
  });

  it("will serialize an entity with a nullable date attribute", async () => {
    expect.assertions(4);

    mockGet.mockResolvedValueOnce({
      Item: {
        PK: "Pet#123",
        SK: "Pet",
        Id: "123",
        Name: "Fido",
        Type: "Pet",
        CreatedAt: "2023-03-15T04:26:31.148Z",
        UpdatedAt: "2023-09-15T04:26:31.148Z",
        AdoptedDate: "2023-09-15T04:26:31.148Z"
      }
    });

    const result = await Pet.findById("123");

    expect(result).toBeInstanceOf(Pet);
    expect(result).toEqual({
      type: "Pet",
      pk: "Pet#123",
      sk: "Pet",
      id: "123",
      name: "Fido",
      createdAt: new Date("2023-03-15T04:26:31.148Z"),
      updatedAt: new Date("2023-09-15T04:26:31.148Z"),
      adoptedDate: new Date("2023-09-15T04:26:31.148Z")
    });
    expect(mockedGetCommand.mock.calls).toEqual([
      [
        {
          TableName: "mock-table",
          Key: { PK: "Pet#123", SK: "Pet" },
          ConsistentRead: true
        }
      ]
    ]);
    expect(mockSend.mock.calls).toEqual([[{ name: "GetCommand" }]]);
  });

  it("findByIdOnly - will return undefined if it doesn't find the record", async () => {
    expect.assertions(4);

    mockGet.mockResolvedValueOnce({});

    const result = await Customer.findById("123");

    expect(result).toEqual(undefined);
    expect(mockedGetCommand.mock.calls).toEqual([
      [
        {
          TableName: "mock-table",
          Key: { PK: "Customer#123", SK: "Customer" },
          ConsistentRead: true
        }
      ]
    ]);
    expect(mockGet.mock.calls).toEqual([[]]);
    expect(mockSend.mock.calls).toEqual([[{ name: "GetCommand" }]]);
  });

  it("findByIdWithIncludes - will return undefined if it doesn't find the record", async () => {
    expect.assertions(4);

    mockQuery.mockResolvedValueOnce({ Items: [] });

    const result = await Customer.findById("123", {
      include: [{ association: "orders" }]
    });

    expect(result).toEqual(undefined);
    expect(mockedQueryCommand.mock.calls).toEqual([
      [
        {
          ExpressionAttributeNames: { "#PK": "PK", "#Type": "Type" },
          ExpressionAttributeValues: {
            ":PK3": "Customer#123",
            ":Type1": "Customer",
            ":Type2": "Order"
          },
          FilterExpression: "(#Type IN (:Type1,:Type2))",
          KeyConditionExpression: "#PK = :PK3",
          TableName: "mock-table"
        }
      ]
    ]);
    expect(mockQuery.mock.calls).toEqual([[]]);
    expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
  });

  it("will find an entity with included HasMany associations", async () => {
    expect.assertions(6);

    // Denormalized Order records of associated orders in the Customer partition
    const orders: Array<MockTableEntityTableItem<Order>> = [
      {
        PK: "Customer#123",
        SK: "Order#001",
        Id: "001",
        Type: "Order",
        CustomerId: "123",
        PaymentMethodId: "008",
        OrderDate: "2022-10-14T09:31:15.148Z",
        CreatedAt: "2022-10-15T09:31:15.148Z",
        UpdatedAt: "2022-10-16T09:31:15.148Z"
      },
      {
        PK: "Customer#123",
        SK: "Order#003",
        Id: "003",
        Type: "Order",
        CustomerId: "123",
        PaymentMethodId: "008",
        OrderDate: "2022-11-01T23:31:21.148Z",
        CreatedAt: "2022-11-02T23:31:21.148Z",
        UpdatedAt: "2022-11-03T23:31:21.148Z"
      },
      {
        PK: "Customer#123",
        SK: "Order#004",
        Id: "004",
        Type: "Order",
        CustomerId: "123",
        PaymentMethodId: "008",
        OrderDate: "2022-09-01T23:31:21.148Z",
        CreatedAt: "2022-09-02T23:31:21.148Z",
        UpdatedAt: "2022-09-03T23:31:21.148Z"
      }
    ];

    // Denormalized PaymentMethod records of associated orders in the Customer partition
    const paymentMethods: Array<MockTableEntityTableItem<PaymentMethod>> = [
      {
        PK: "Customer#123",
        SK: "PaymentMethod#007",
        Id: "007",
        Type: "PaymentMethod",
        CustomerId: "123",
        LastFour: "1234",
        CreatedAt: "2022-10-01T12:31:21.148Z",
        UpdatedAt: "2022-10-02T12:31:21.148Z"
      },
      {
        PK: "Customer#123",
        SK: "PaymentMethod#008",
        Id: "008",
        Type: "PaymentMethod",
        CustomerId: "123",
        LastFour: "5678",
        CreatedAt: "2022-11-20T12:31:21.148Z",
        UpdatedAt: "2022-11-21T12:31:21.148Z"
      }
    ];

    const customer: MockTableEntityTableItem<Customer> = {
      PK: "Customer#123",
      SK: "Customer",
      Id: "123",
      Name: "Some Customer",
      Address: "11 Some St",
      Type: "Customer",
      CreatedAt: "2022-09-14T04:26:31.148Z",
      UpdatedAt: "2022-09-15T04:26:31.148Z"
    };

    mockQuery.mockResolvedValueOnce({
      Items: [customer, ...orders, ...paymentMethods]
    });

    const result = await Customer.findById("123", {
      include: [{ association: "orders" }, { association: "paymentMethods" }]
    });

    expect(result).toEqual({
      pk: "Customer#123",
      sk: "Customer",
      id: "123",
      type: "Customer",
      address: "11 Some St",
      contactInformation: undefined,
      name: "Some Customer",
      createdAt: new Date("2022-09-14T04:26:31.148Z"),
      updatedAt: new Date("2022-09-15T04:26:31.148Z"),
      orders: [
        {
          pk: "Customer#123",
          sk: "Order#001",
          id: "001",
          type: "Order",
          customer: undefined,
          customerId: "123",
          orderDate: new Date("2022-10-14T09:31:15.148Z"),
          paymentMethod: undefined,
          paymentMethodId: "008",
          createdAt: new Date("2022-10-15T09:31:15.148Z"),
          updatedAt: new Date("2022-10-16T09:31:15.148Z")
        },
        {
          pk: "Customer#123",
          sk: "Order#003",
          id: "003",
          type: "Order",
          customer: undefined,
          customerId: "123",
          orderDate: new Date("2022-11-01T23:31:21.148Z"),
          paymentMethod: undefined,
          paymentMethodId: "008",
          createdAt: new Date("2022-11-02T23:31:21.148Z"),
          updatedAt: new Date("2022-11-03T23:31:21.148Z")
        },
        {
          pk: "Customer#123",
          sk: "Order#004",
          id: "004",
          type: "Order",
          customer: undefined,
          customerId: "123",
          orderDate: new Date("2022-09-01T23:31:21.148Z"),
          paymentMethod: undefined,
          paymentMethodId: "008",
          createdAt: new Date("2022-09-02T23:31:21.148Z"),
          updatedAt: new Date("2022-09-03T23:31:21.148Z")
        }
      ],
      paymentMethods: [
        {
          pk: "Customer#123",
          sk: "PaymentMethod#007",
          id: "007",
          type: "PaymentMethod",
          customer: undefined,
          customerId: "123",
          lastFour: "1234",
          orders: undefined,
          paymentMethodProvider: undefined,
          createdAt: new Date("2022-10-01T12:31:21.148Z"),
          updatedAt: new Date("2022-10-02T12:31:21.148Z")
        },
        {
          pk: "Customer#123",
          sk: "PaymentMethod#008",
          id: "008",
          type: "PaymentMethod",
          customer: undefined,
          customerId: "123",
          lastFour: "5678",
          orders: undefined,
          paymentMethodProvider: undefined,
          createdAt: new Date("2022-11-20T12:31:21.148Z"),
          updatedAt: new Date("2022-11-21T12:31:21.148Z")
        }
      ]
    });
    expect(result).toBeInstanceOf(Customer);
    expect(result?.orders.every(order => order instanceof Order)).toEqual(true);
    expect(
      result?.paymentMethods.every(
        paymentMethod => paymentMethod instanceof PaymentMethod
      )
    ).toEqual(true);
    expect(mockedQueryCommand.mock.calls).toEqual([
      [
        {
          TableName: "mock-table",
          KeyConditionExpression: "#PK = :PK4",
          ExpressionAttributeNames: {
            "#PK": "PK",
            "#Type": "Type"
          },
          ExpressionAttributeValues: {
            ":PK4": "Customer#123",
            ":Type1": "Customer",
            ":Type2": "Order",
            ":Type3": "PaymentMethod"
          },
          FilterExpression: "(#Type IN (:Type1,:Type2,:Type3))"
        }
      ]
    ]);
    expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
  });

  it("findByIdWithIncludes - will set included HasMany associations to an empty array if it doesn't find any", async () => {
    expect.assertions(3);

    const customer: MockTableEntityTableItem<Customer> = {
      PK: "Customer#123",
      SK: "Customer",
      Id: "123",
      Name: "Some Customer",
      Address: "11 Some St",
      Type: "Customer",
      CreatedAt: "2022-09-14T04:26:31.148Z",
      UpdatedAt: "2022-09-15T04:26:31.148Z"
    };

    mockQuery.mockResolvedValueOnce({
      Items: [customer]
    });

    const result = await Customer.findById("123", {
      include: [{ association: "orders" }, { association: "paymentMethods" }]
    });

    expect(result).toEqual({
      pk: "Customer#123",
      sk: "Customer",
      id: "123",
      type: "Customer",
      address: "11 Some St",
      contactInformation: undefined,
      name: "Some Customer",
      createdAt: new Date("2022-09-14T04:26:31.148Z"),
      updatedAt: new Date("2022-09-15T04:26:31.148Z"),
      orders: [],
      paymentMethods: []
    });
    expect(mockedQueryCommand.mock.calls).toEqual([
      [
        {
          TableName: "mock-table",
          KeyConditionExpression: "#PK = :PK4",
          ExpressionAttributeNames: {
            "#PK": "PK",
            "#Type": "Type"
          },
          ExpressionAttributeValues: {
            ":PK4": "Customer#123",
            ":Type1": "Customer",
            ":Type2": "Order",
            ":Type3": "PaymentMethod"
          },
          FilterExpression: "(#Type IN (:Type1,:Type2,:Type3))"
        }
      ]
    ]);
    expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
  });

  it("findByIdWithIncludes - will set included HasAndBelongsToMany associations to an empty array if it doesn't find any", async () => {
    expect.assertions(4);

    mockQuery.mockResolvedValueOnce({
      Items: [
        {
          PK: "Book#789",
          SK: "Book",
          Id: "789",
          Type: "Book",
          Name: "BookAbc",
          NumPages: 589,
          CreatedAt: "2023-01-15T12:12:18.123Z",
          UpdatedAt: "2023-02-15T08:31:15.148Z"
        }
      ]
    });

    const result = await Book.findById("789", {
      include: [{ association: "authors" }]
    });

    expect(result).toEqual({
      pk: "Book#789",
      sk: "Book",
      id: "789",
      type: "Book",
      name: "BookAbc",
      numPages: 589,
      createdAt: new Date("2023-01-15T12:12:18.123Z"),
      updatedAt: new Date("2023-02-15T08:31:15.148Z"),
      authors: []
    });
    expect(mockedQueryCommand.mock.calls).toEqual([
      [
        {
          TableName: "mock-table",
          KeyConditionExpression: "#PK = :PK4",
          FilterExpression:
            "#Type = :Type1 OR (#Type = :Type2 AND #ForeignEntityType IN (:ForeignEntityType3))",
          ConsistentRead: true,
          ExpressionAttributeNames: {
            "#ForeignEntityType": "ForeignEntityType",
            "#PK": "PK",
            "#Type": "Type"
          },
          ExpressionAttributeValues: {
            ":ForeignEntityType3": "Author",
            ":PK4": "Book#789",
            ":Type1": "Book",
            ":Type2": "BelongsToLink"
          }
        }
      ]
    ]);
    expect(mockTransactGetCommand.mock.calls).toEqual([]);
    expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
  });

  it("findByIdWithIncludes - will set included HasOne associations to undefined if it doesn't find any", async () => {
    expect.assertions(4);

    mockQuery.mockResolvedValueOnce({
      Items: [
        {
          PK: "PaymentMethod#789",
          SK: "PaymentMethod",
          Id: "789",
          Type: "PaymentMethod",
          LastFour: "0000",
          CustomerId: "123",
          UpdatedAt: "2023-02-15T08:31:15.148Z"
        }
      ]
    });

    const result = await PaymentMethod.findById("789", {
      include: [{ association: "paymentMethodProvider" }]
    });

    expect(result).toEqual({
      pk: "PaymentMethod#789",
      sk: "PaymentMethod",
      id: "789",
      type: "PaymentMethod",
      lastFour: "0000",
      customerId: "123",
      updatedAt: new Date("2023-02-15T08:31:15.148Z"),
      paymentMethodProvider: undefined
    });
    expect(mockedQueryCommand.mock.calls).toEqual([
      [
        {
          TableName: "mock-table",
          FilterExpression:
            "#Type = :Type1 OR (#Type = :Type2 AND #ForeignEntityType IN (:ForeignEntityType3))",
          KeyConditionExpression: "#PK = :PK4",
          ExpressionAttributeNames: {
            "#PK": "PK",
            "#Type": "Type",
            "#ForeignEntityType": "ForeignEntityType"
          },
          ExpressionAttributeValues: {
            ":PK4": "PaymentMethod#789",
            ":Type1": "PaymentMethod",
            ":Type2": "BelongsToLink",
            ":ForeignEntityType3": "PaymentMethodProvider"
          },
          ConsistentRead: true
        }
      ]
    ]);

    expect(mockTransactGetCommand.mock.calls).toEqual([]);
    expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
  });

  it("findByIdWithIncludes - will set included BelongsTo associations to undefined if it doesn't find any", async () => {
    expect.assertions(4);

    mockQuery.mockResolvedValueOnce({
      Items: [
        {
          PK: "ContactInformation#123",
          SK: "ContactInformation",
          Id: "123",
          Type: "ContactInformation",
          CustomerId: undefined,
          Email: "test@example.com",
          Phone: "555-555-5555",
          CreatedAt: "2023-09-15T04:26:31.148Z",
          UpdatedAt: "2023-09-15T04:26:31.148Z"
        }
      ]
    });

    const result = await ContactInformation.findById("123", {
      include: [{ association: "customer" }]
    });

    expect(result).toEqual({
      pk: "ContactInformation#123",
      sk: "ContactInformation",
      id: "123",
      type: "ContactInformation",
      customerId: undefined,
      email: "test@example.com",
      phone: "555-555-5555",
      createdAt: new Date("2023-09-15T04:26:31.148Z"),
      updatedAt: new Date("2023-09-15T04:26:31.148Z"),
      customer: undefined
    });
    expect(mockedQueryCommand.mock.calls).toEqual([
      [
        {
          TableName: "mock-table",
          FilterExpression: "#Type = :Type1",
          KeyConditionExpression: "#PK = :PK2",
          ExpressionAttributeNames: { "#Type": "Type", "#PK": "PK" },
          ExpressionAttributeValues: {
            ":PK2": "ContactInformation#123",
            ":Type1": "ContactInformation"
          },
          ConsistentRead: true
        }
      ]
    ]);
    expect(mockTransactGetCommand.mock.calls).toEqual([]);
    expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
  });

  it("defaults not found entities to undefined", async () => {
    expect.assertions(6);

    const courseRes = {
      myPk: "Course|123",
      mySk: "Course",
      id: "123",
      type: "Course",
      name: "Math",
      teacherId: undefined,
      createdAt: "2023-01-15T12:12:18.123Z",
      updatedAt: "2023-02-15T08:31:15.148Z"
    };

    const assignmentBelongsToLinkTableItems = [
      {
        myPk: "Course|123",
        mySk: "Assignment|003",
        id: "003",
        foreignEntityType: "Assignment",
        foreignKey: "111",
        type: "BelongsToLink",
        createdAt: "2023-01-15T12:12:18.123Z",
        updatedAt: "2023-02-15T08:31:15.148Z"
      }
    ];

    mockQuery.mockResolvedValueOnce({
      Items: [courseRes, ...assignmentBelongsToLinkTableItems]
    });

    const assignmentTableItems = assignmentBelongsToLinkTableItems.map(
      (link, idx) => ({
        Item: {
          myPk: `${link.foreignEntityType}|${link.foreignKey}`,
          mySk: link.foreignEntityType,
          id: link.foreignKey,
          type: link.foreignEntityType,
          title: `SomeTitle-${idx}`,
          courseId: "123",
          createdAt: "2023-02-15T08:31:15.148Z",
          updatedAt: "2023-02-15T08:31:15.148Z"
        }
      })
    );

    mockTransactGetItems.mockResolvedValueOnce({
      Responses: [...assignmentTableItems]
    });

    const result = await Course.findById("123", {
      include: [
        { association: "teacher" },
        { association: "assignments" },
        { association: "students" }
      ]
    });

    expect(result).toEqual({
      myPk: "Course|123",
      mySk: "Course",
      id: "123",
      type: "Course",
      name: "Math",
      teacherId: undefined,
      createdAt: new Date("2023-01-15T12:12:18.123Z"),
      updatedAt: new Date("2023-02-15T08:31:15.148Z"),
      teacher: undefined,
      assignments: [
        {
          myPk: "Assignment|111",
          mySk: "Assignment",
          id: "111",
          type: "Assignment",
          title: "SomeTitle-0",
          courseId: "123",
          createdAt: new Date("2023-02-15T08:31:15.148Z"),
          updatedAt: new Date("2023-02-15T08:31:15.148Z"),
          course: undefined
        }
      ],
      students: []
    });
    expect(result).toBeInstanceOf(Course);
    expect(
      result?.assignments.every(assignment => assignment instanceof Assignment)
    ).toEqual(true);
    expect(mockedQueryCommand.mock.calls).toEqual([
      [
        {
          ConsistentRead: true,
          ExpressionAttributeNames: {
            "#foreignEntityType": "foreignEntityType",
            "#myPk": "myPk",
            "#type": "type"
          },
          ExpressionAttributeValues: {
            ":foreignEntityType3": "Teacher",
            ":foreignEntityType4": "Assignment",
            ":foreignEntityType5": "Student",
            ":myPk6": "Course|123",
            ":type1": "Course",
            ":type2": "BelongsToLink"
          },
          FilterExpression:
            "#type = :type1 OR (#type = :type2 AND #foreignEntityType IN (:foreignEntityType3,:foreignEntityType4,:foreignEntityType5))",
          KeyConditionExpression: "#myPk = :myPk6",
          TableName: "other-table"
        }
      ]
    ]);
    expect(mockTransactGetCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Get: {
                TableName: "other-table",
                Key: { myPk: "Assignment|111", mySk: "Assignment" }
              }
            }
          ]
        }
      ]
    ]);
    expect(mockSend.mock.calls).toEqual([
      [{ name: "QueryCommand" }],
      [{ name: "TransactGetCommand" }]
    ]);
  });

  it("will find an entity with included BelongsTo HasMany associations", async () => {
    expect.assertions(7);

    const orderRes = {
      PK: "Order#123",
      SK: "Order",
      Id: "123",
      Type: "Order",
      CustomerId: "456",
      PaymentMethodId: "789",
      OrderDate: "2023-09-15T04:26:31.148Z"
    };

    const customerRes = {
      PK: "Customer#456",
      SK: "Customer",
      Id: "456",
      Name: "Some Customer",
      Address: "11 Some St",
      Type: "Customer",
      UpdatedAt: "2022-09-15T04:26:31.148Z"
    };

    const paymentMethodRes = {
      PK: "PaymentMethod#789",
      SK: "PaymentMethod",
      Id: "789",
      Type: "PaymentMethod",
      LastFour: "0000",
      CustomerId: "123",
      UpdatedAt: "2023-02-15T08:31:15.148Z"
    };

    mockQuery.mockResolvedValueOnce({ Items: [orderRes] });
    mockTransactGetItems.mockResolvedValueOnce({
      Responses: [{ Item: customerRes }, { Item: paymentMethodRes }]
    });

    const result = await Order.findById("123", {
      include: [{ association: "customer" }, { association: "paymentMethod" }]
    });

    expect(result).toEqual({
      pk: "Order#123",
      sk: "Order",
      id: "123",
      type: "Order",
      customerId: "456",
      paymentMethodId: "789",
      orderDate: new Date("2023-09-15T04:26:31.148Z"),
      customer: {
        pk: "Customer#456",
        sk: "Customer",
        id: "456",
        type: "Customer",
        name: "Some Customer",
        address: "11 Some St",
        updatedAt: new Date("2022-09-15T04:26:31.148Z")
      },
      paymentMethod: {
        pk: "PaymentMethod#789",
        sk: "PaymentMethod",
        id: "789",
        type: "PaymentMethod",
        lastFour: "0000",
        customerId: "123",
        updatedAt: new Date("2023-02-15T08:31:15.148Z")
      }
    });
    expect(result).toBeInstanceOf(Order);
    expect(result?.customer).toBeInstanceOf(Customer);
    expect(result?.paymentMethod).toBeInstanceOf(PaymentMethod);
    expect(mockedQueryCommand.mock.calls).toEqual([
      [
        {
          TableName: "mock-table",
          FilterExpression: "#Type = :Type1",
          KeyConditionExpression: "#PK = :PK2",
          ExpressionAttributeNames: { "#Type": "Type", "#PK": "PK" },
          ExpressionAttributeValues: {
            ":PK2": "Order#123",
            ":Type1": "Order"
          },
          ConsistentRead: true
        }
      ]
    ]);
    expect(mockTransactGetCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Get: {
                TableName: "mock-table",
                Key: { PK: "Customer#456", SK: "Customer" }
              }
            },
            {
              Get: {
                TableName: "mock-table",
                Key: { PK: "PaymentMethod#789", SK: "PaymentMethod" }
              }
            }
          ]
        }
      ]
    ]);
    expect(mockSend.mock.calls).toEqual([
      [{ name: "QueryCommand" }],
      [{ name: "TransactGetCommand" }]
    ]);
  });

  it("will find an entity with included BelongsTo HasOne associations", async () => {
    expect.assertions(6);

    const paymentMethodProviderRes = {
      PK: "PaymentMethodProvider#123",
      SK: "PaymentMethodProvider",
      Id: "123",
      Type: "PaymentMethodProvider",
      Name: "Visa",
      PaymentMethodId: "789"
    };

    const paymentMethodRes = {
      PK: "PaymentMethod#789",
      SK: "PaymentMethod",
      Id: "789",
      Type: "PaymentMethod",
      LastFour: "0000",
      CustomerId: "123",
      UpdatedAt: "2023-02-15T08:31:15.148Z"
    };

    mockQuery.mockResolvedValueOnce({ Items: [paymentMethodProviderRes] });
    mockTransactGetItems.mockResolvedValueOnce({
      Responses: [{ Item: paymentMethodRes }]
    });

    const result = await PaymentMethodProvider.findById("123", {
      include: [{ association: "paymentMethod" }]
    });

    expect(result).toEqual({
      pk: "PaymentMethodProvider#123",
      sk: "PaymentMethodProvider",
      id: "123",
      type: "PaymentMethodProvider",
      name: "Visa",
      paymentMethodId: "789",
      paymentMethod: {
        pk: "PaymentMethod#789",
        sk: "PaymentMethod",
        id: "789",
        type: "PaymentMethod",
        lastFour: "0000",
        customerId: "123",
        updatedAt: new Date("2023-02-15T08:31:15.148Z")
      }
    });
    expect(result).toBeInstanceOf(PaymentMethodProvider);
    expect(result?.paymentMethod).toBeInstanceOf(PaymentMethod);
    expect(mockedQueryCommand.mock.calls).toEqual([
      [
        {
          TableName: "mock-table",
          FilterExpression: "#Type = :Type1",
          KeyConditionExpression: "#PK = :PK2",
          ExpressionAttributeNames: { "#PK": "PK", "#Type": "Type" },
          ExpressionAttributeValues: {
            ":PK2": "PaymentMethodProvider#123",
            ":Type1": "PaymentMethodProvider"
          },
          ConsistentRead: true
        }
      ]
    ]);
    expect(mockTransactGetCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Get: {
                TableName: "mock-table",
                Key: { PK: "PaymentMethod#789", SK: "PaymentMethod" }
              }
            }
          ]
        }
      ]
    ]);
    expect(mockSend.mock.calls).toEqual([
      [{ name: "QueryCommand" }],
      [{ name: "TransactGetCommand" }]
    ]);
  });

  it("will find an entity with included HasOne associations", async () => {
    expect.assertions(6);

    const paymentMethodRes = {
      PK: "PaymentMethod#789",
      SK: "PaymentMethod",
      Id: "789",
      Type: "PaymentMethod",
      LastFour: "0000",
      CustomerId: "123",
      UpdatedAt: "2023-02-15T08:31:15.148Z"
    };

    const paymentMethodProviderLink = {
      PK: "PaymentMethod#789",
      SK: "PaymentMethodProvider",
      Id: "001",
      Type: "BelongsToLink",
      ForeignKey: "123",
      ForeignEntityType: "PaymentMethodProvider",
      CreatedAt: "2022-10-15T09:31:15.148Z",
      UpdatedAt: "2022-10-15T09:31:15.148Z"
    };

    const paymentMethodProviderRes = {
      PK: "PaymentMethodProvider#123",
      SK: "PaymentMethodProvider",
      Id: "123",
      Type: "PaymentMethodProvider",
      Name: "Visa",
      PaymentMethodId: "789"
    };

    mockQuery.mockResolvedValueOnce({
      Items: [paymentMethodRes, paymentMethodProviderLink]
    });
    mockTransactGetItems.mockResolvedValueOnce({
      Responses: [{ Item: paymentMethodProviderRes }]
    });

    const result = await PaymentMethod.findById("789", {
      include: [{ association: "paymentMethodProvider" }]
    });

    expect(result).toEqual({
      pk: "PaymentMethod#789",
      sk: "PaymentMethod",
      id: "789",
      type: "PaymentMethod",
      lastFour: "0000",
      customerId: "123",
      updatedAt: new Date("2023-02-15T08:31:15.148Z"),
      paymentMethodProvider: {
        pk: "PaymentMethodProvider#123",
        sk: "PaymentMethodProvider",
        id: "123",
        type: "PaymentMethodProvider",
        name: "Visa",
        paymentMethodId: "789"
      }
    });
    expect(result).toBeInstanceOf(PaymentMethod);
    expect(result?.paymentMethodProvider).toBeInstanceOf(PaymentMethodProvider);
    expect(mockedQueryCommand.mock.calls).toEqual([
      [
        {
          TableName: "mock-table",
          FilterExpression:
            "#Type = :Type1 OR (#Type = :Type2 AND #ForeignEntityType IN (:ForeignEntityType3))",
          KeyConditionExpression: "#PK = :PK4",
          ExpressionAttributeNames: {
            "#PK": "PK",
            "#Type": "Type",
            "#ForeignEntityType": "ForeignEntityType"
          },
          ExpressionAttributeValues: {
            ":PK4": "PaymentMethod#789",
            ":Type1": "PaymentMethod",
            ":Type2": "BelongsToLink",
            ":ForeignEntityType3": "PaymentMethodProvider"
          },
          ConsistentRead: true
        }
      ]
    ]);
    expect(mockTransactGetCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Get: {
                TableName: "mock-table",
                Key: {
                  PK: "PaymentMethodProvider#123",
                  SK: "PaymentMethodProvider"
                }
              }
            }
          ]
        }
      ]
    ]);
    expect(mockSend.mock.calls).toEqual([
      [{ name: "QueryCommand" }],
      [{ name: "TransactGetCommand" }]
    ]);
  });

  it("will find an entity with HasMany and BelongsTo associations", async () => {
    expect.assertions(7);

    const paymentMethodRes = {
      PK: "PaymentMethod#789",
      SK: "PaymentMethod",
      Id: "789",
      Type: "PaymentMethod",
      LastFour: "0000",
      CustomerId: "123",
      UpdatedAt: "2023-02-15T08:31:15.148Z"
    };

    const orderLinks = [
      {
        PK: "PaymentMethod#789",
        SK: "Order#001",
        Id: "001",
        ForeignEntityType: "Order",
        ForeignKey: "111",
        Type: "BelongsToLink",
        UpdatedAt: "2022-10-15T09:31:15.148Z"
      },
      {
        PK: "PaymentMethod#789",
        SK: "Order#003",
        Id: "003",
        ForeignEntityType: "Order",
        ForeignKey: "112",
        Type: "BelongsToLink",
        UpdatedAt: "2022-11-01T23:31:21.148Z"
      },
      {
        PK: "PaymentMethod#789",
        SK: "Order#004",
        Id: "004",
        ForeignEntityType: "Order",
        ForeignKey: "113",
        Type: "BelongsToLink",
        UpdatedAt: "2022-09-01T23:31:21.148Z"
      }
    ];

    const customerRes = {
      PK: "Customer#123",
      SK: "Customer",
      Id: "123",
      Name: "Some Customer",
      Address: "11 Some St",
      Type: "Customer",
      UpdatedAt: "2023-09-15T04:26:31.148Z"
    };

    mockQuery.mockResolvedValueOnce({
      Items: [paymentMethodRes, ...orderLinks]
    });

    const orders = orderLinks.map(link => ({
      Item: {
        PK: `${link.ForeignEntityType}#${link.ForeignKey}`,
        SK: link.ForeignEntityType,
        Id: link.ForeignKey,
        Type: link.ForeignEntityType,
        PaymentMethodId: link.PK.split("#")[1],
        CustomerId: "123",
        OrderDate: "2022-12-15T09:31:15.148Z",
        UpdatedAt: "2023-02-15T08:31:15.148Z"
      }
    }));

    mockTransactGetItems.mockResolvedValueOnce({
      Responses: [{ Item: customerRes }, ...orders]
    });

    const result = await PaymentMethod.findById("789", {
      include: [{ association: "orders" }, { association: "customer" }]
    });

    expect(result).toEqual({
      pk: "PaymentMethod#789",
      sk: "PaymentMethod",
      id: "789",
      type: "PaymentMethod",
      lastFour: "0000",
      customerId: "123",
      updatedAt: new Date("2023-02-15T08:31:15.148Z"),
      customer: {
        pk: "Customer#123",
        sk: "Customer",
        id: "123",
        type: "Customer",
        name: "Some Customer",
        address: "11 Some St",
        updatedAt: new Date("2023-09-15T04:26:31.148Z")
      },
      orders: [
        {
          pk: "Order#111",
          sk: "Order",
          id: "111",
          type: "Order",
          customerId: "123",
          paymentMethodId: "789",
          orderDate: new Date("2022-12-15T09:31:15.148Z"),
          updatedAt: new Date("2023-02-15T08:31:15.148Z")
        },
        {
          pk: "Order#112",
          sk: "Order",
          id: "112",
          type: "Order",
          customerId: "123",
          paymentMethodId: "789",
          orderDate: new Date("2022-12-15T09:31:15.148Z"),
          updatedAt: new Date("2023-02-15T08:31:15.148Z")
        },
        {
          pk: "Order#113",
          sk: "Order",
          id: "113",
          type: "Order",
          customerId: "123",
          paymentMethodId: "789",
          orderDate: new Date("2022-12-15T09:31:15.148Z"),
          updatedAt: new Date("2023-02-15T08:31:15.148Z")
        }
      ]
    });
    expect(result).toBeInstanceOf(PaymentMethod);
    expect(result?.orders.every(order => order instanceof Order)).toEqual(true);
    expect(result?.customer).toBeInstanceOf(Customer);
    expect(mockedQueryCommand.mock.calls).toEqual([
      [
        {
          TableName: "mock-table",
          FilterExpression:
            "#Type = :Type1 OR (#Type = :Type2 AND #ForeignEntityType IN (:ForeignEntityType3,:ForeignEntityType4))",
          KeyConditionExpression: "#PK = :PK5",
          ExpressionAttributeNames: {
            "#PK": "PK",
            "#Type": "Type",
            "#ForeignEntityType": "ForeignEntityType"
          },
          ExpressionAttributeValues: {
            ":PK5": "PaymentMethod#789",
            ":Type1": "PaymentMethod",
            ":Type2": "BelongsToLink",
            ":ForeignEntityType3": "Order",
            ":ForeignEntityType4": "Customer"
          },
          ConsistentRead: true
        }
      ]
    ]);
    expect(mockTransactGetCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Get: {
                TableName: "mock-table",
                Key: { PK: "Order#111", SK: "Order" }
              }
            },
            {
              Get: {
                TableName: "mock-table",
                Key: { PK: "Order#112", SK: "Order" }
              }
            },
            {
              Get: {
                TableName: "mock-table",
                Key: { PK: "Order#113", SK: "Order" }
              }
            },
            {
              Get: {
                TableName: "mock-table",
                Key: { PK: "Customer#123", SK: "Customer" }
              }
            }
          ]
        }
      ]
    ]);
    expect(mockSend.mock.calls).toEqual([
      [{ name: "QueryCommand" }],
      [{ name: "TransactGetCommand" }]
    ]);
  });

  it("will find an entity included HasAndBelongsToMany associations", async () => {
    expect.assertions(6);

    const bookRes = {
      PK: "Book#789",
      SK: "Book",
      Id: "789",
      Type: "Book",
      Name: "BookAbc",
      NumPages: 589,
      CreatedAt: "2023-01-15T12:12:18.123Z",
      UpdatedAt: "2023-02-15T08:31:15.148Z"
    };

    const authorLinks = [
      {
        PK: "Book#789",
        SK: "Author#001",
        Id: "001",
        ForeignEntityType: "Author",
        ForeignKey: "111",
        Type: "BelongsToLink",
        UpdatedAt: "2022-10-15T09:31:15.148Z"
      },
      {
        PK: "Book#789",
        SK: "Author#003",
        Id: "003",
        ForeignEntityType: "Author",
        ForeignKey: "112",
        Type: "BelongsToLink",
        UpdatedAt: "2022-11-01T23:31:21.148Z"
      },
      {
        PK: "Book#789",
        SK: "Author#004",
        Id: "004",
        ForeignEntityType: "Author",
        ForeignKey: "113",
        Type: "BelongsToLink",
        UpdatedAt: "2022-09-01T23:31:21.148Z"
      }
    ];

    mockQuery.mockResolvedValueOnce({
      Items: [bookRes, ...authorLinks]
    });

    const authorItems = authorLinks.map((link, idx) => ({
      Item: {
        PK: `${link.ForeignEntityType}#${link.ForeignKey}`,
        SK: link.ForeignEntityType,
        Id: link.ForeignKey,
        Type: link.ForeignEntityType,
        Name: `SomeName-${idx}`,
        CreatedAt: "2023-02-15T08:31:15.148Z",
        UpdatedAt: "2023-02-15T08:31:15.148Z"
      }
    }));

    mockTransactGetItems.mockResolvedValueOnce({
      Responses: authorItems
    });

    const result = await Book.findById("789", {
      include: [{ association: "authors" }]
    });

    expect(result).toEqual({
      pk: "Book#789",
      sk: "Book",
      id: "789",
      type: "Book",
      name: "BookAbc",
      numPages: 589,
      createdAt: new Date("2023-01-15T12:12:18.123Z"),
      updatedAt: new Date("2023-02-15T08:31:15.148Z"),
      authors: [
        {
          pk: "Author#111",
          sk: "Author",
          id: "111",
          type: "Author",
          name: "SomeName-0",
          books: undefined,
          createdAt: new Date("2023-02-15T08:31:15.148Z"),
          updatedAt: new Date("2023-02-15T08:31:15.148Z")
        },
        {
          pk: "Author#112",
          sk: "Author",
          id: "112",
          type: "Author",
          name: "SomeName-1",
          books: undefined,
          createdAt: new Date("2023-02-15T08:31:15.148Z"),
          updatedAt: new Date("2023-02-15T08:31:15.148Z")
        },
        {
          pk: "Author#113",
          sk: "Author",
          id: "113",
          type: "Author",
          name: "SomeName-2",
          books: undefined,
          createdAt: new Date("2023-02-15T08:31:15.148Z"),
          updatedAt: new Date("2023-02-15T08:31:15.148Z")
        }
      ]
    });
    expect(result).toBeInstanceOf(Book);
    expect(result?.authors.every(order => order instanceof Author)).toEqual(
      true
    );
    expect(mockedQueryCommand.mock.calls).toEqual([
      [
        {
          TableName: "mock-table",
          KeyConditionExpression: "#PK = :PK4",
          FilterExpression:
            "#Type = :Type1 OR (#Type = :Type2 AND #ForeignEntityType IN (:ForeignEntityType3))",
          ConsistentRead: true,
          ExpressionAttributeNames: {
            "#ForeignEntityType": "ForeignEntityType",
            "#PK": "PK",
            "#Type": "Type"
          },
          ExpressionAttributeValues: {
            ":ForeignEntityType3": "Author",
            ":PK4": "Book#789",
            ":Type1": "Book",
            ":Type2": "BelongsToLink"
          }
        }
      ]
    ]);
    expect(mockTransactGetCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Get: {
                TableName: "mock-table",
                Key: { PK: "Author#111", SK: "Author" }
              }
            },
            {
              Get: {
                TableName: "mock-table",
                Key: { PK: "Author#112", SK: "Author" }
              }
            },
            {
              Get: {
                TableName: "mock-table",
                Key: { PK: "Author#113", SK: "Author" }
              }
            }
          ]
        }
      ]
    ]);
    expect(mockSend.mock.calls).toEqual([
      [{ name: "QueryCommand" }],
      [{ name: "TransactGetCommand" }]
    ]);
  });

  it("will find a model with HasMany, HasAndBelongsMany and BelongsTo relationships", async () => {
    expect.assertions(8);

    const courseRes = {
      myPk: "Course|123",
      mySk: "Course",
      id: "123",
      type: "Course",
      name: "Math",
      teacherId: "555",
      createdAt: "2023-01-15T12:12:18.123Z",
      updatedAt: "2023-02-15T08:31:15.148Z"
    };

    const studentCourseJoinTableItems = [
      {
        myPk: "Course|123",
        mySk: "Student|001",
        id: "001",
        foreignEntityType: "Student",
        foreignKey: "456",
        type: "BelongsToLink",
        createdAt: "2023-01-15T12:12:18.123Z",
        updatedAt: "2023-02-15T08:31:15.148Z"
      },
      {
        myPk: "Course|123",
        mySk: "Student|002",
        foreignEntityType: "Student",
        foreignKey: "789",
        id: "002",
        type: "BelongsToLink",
        createdAt: "2023-01-15T12:12:18.123Z",
        updatedAt: "2023-02-15T08:31:15.148Z"
      }
    ];

    const assignmentBelongsToLinkTableItems = [
      {
        myPk: "Course|123",
        mySk: "Assignment|003",
        id: "003",
        foreignEntityType: "Assignment",
        foreignKey: "111",
        type: "BelongsToLink",
        createdAt: "2023-01-15T12:12:18.123Z",
        updatedAt: "2023-02-15T08:31:15.148Z"
      }
    ];

    mockQuery.mockResolvedValueOnce({
      Items: [
        courseRes,
        ...studentCourseJoinTableItems,
        ...assignmentBelongsToLinkTableItems
      ]
    });

    const studentTableItems = studentCourseJoinTableItems.map((link, idx) => ({
      Item: {
        myPk: `${link.foreignEntityType}|${link.foreignKey}`,
        mySk: link.foreignEntityType,
        id: link.foreignKey,
        type: link.foreignEntityType,
        name: `SomeName-${idx}`,
        createdAt: "2023-02-15T08:31:15.148Z",
        updatedAt: "2023-02-15T08:31:15.148Z"
      }
    }));

    const assignmentTableItems = assignmentBelongsToLinkTableItems.map(
      (link, idx) => ({
        Item: {
          myPk: `${link.foreignEntityType}|${link.foreignKey}`,
          mySk: link.foreignEntityType,
          id: link.foreignKey,
          type: link.foreignEntityType,
          title: `SomeTitle-${idx}`,
          courseId: "123",
          createdAt: "2023-02-15T08:31:15.148Z",
          updatedAt: "2023-02-15T08:31:15.148Z"
        }
      })
    );

    const teacherTableItem = {
      Item: {
        myPk: "Teacher|555",
        mySk: "Teacher",
        id: "555",
        name: "TeacherName",
        createdAt: "2023-02-15T08:31:15.148Z",
        updatedAt: "2023-02-15T08:31:15.148Z",
        type: "Teacher"
      }
    };

    mockTransactGetItems.mockResolvedValueOnce({
      Responses: [
        ...studentTableItems,
        ...assignmentTableItems,
        teacherTableItem
      ]
    });

    const result = await Course.findById("123", {
      include: [
        { association: "teacher" },
        { association: "assignments" },
        { association: "students" }
      ]
    });

    expect(result).toEqual({
      myPk: "Course|123",
      mySk: "Course",
      id: "123",
      type: "Course",
      name: "Math",
      teacherId: "555",
      createdAt: new Date("2023-01-15T12:12:18.123Z"),
      updatedAt: new Date("2023-02-15T08:31:15.148Z"),
      teacher: {
        myPk: "Teacher|555",
        mySk: "Teacher",
        id: "555",
        type: "Teacher",
        name: "TeacherName",
        createdAt: new Date("2023-02-15T08:31:15.148Z"),
        updatedAt: new Date("2023-02-15T08:31:15.148Z"),
        courses: undefined,
        profile: undefined
      },
      assignments: [
        {
          myPk: "Assignment|111",
          mySk: "Assignment",
          id: "111",
          type: "Assignment",
          title: "SomeTitle-0",
          courseId: "123",
          createdAt: new Date("2023-02-15T08:31:15.148Z"),
          updatedAt: new Date("2023-02-15T08:31:15.148Z"),
          course: undefined
        }
      ],
      students: [
        {
          myPk: "Student|456",
          mySk: "Student",
          id: "456",
          type: "Student",
          name: "SomeName-0",
          createdAt: new Date("2023-02-15T08:31:15.148Z"),
          updatedAt: new Date("2023-02-15T08:31:15.148Z"),
          courses: undefined,
          profile: undefined
        },
        {
          myPk: "Student|789",
          mySk: "Student",
          id: "789",
          type: "Student",
          name: "SomeName-1",
          createdAt: new Date("2023-02-15T08:31:15.148Z"),
          updatedAt: new Date("2023-02-15T08:31:15.148Z"),
          courses: undefined,
          profile: undefined
        }
      ]
    });
    expect(result).toBeInstanceOf(Course);
    expect(result?.teacher).toBeInstanceOf(Teacher);
    expect(
      result?.assignments.every(assignment => assignment instanceof Assignment)
    ).toEqual(true);
    expect(
      result?.students.every(student => student instanceof Student)
    ).toEqual(true);
    expect(mockedQueryCommand.mock.calls).toEqual([
      [
        {
          ConsistentRead: true,
          ExpressionAttributeNames: {
            "#foreignEntityType": "foreignEntityType",
            "#myPk": "myPk",
            "#type": "type"
          },
          ExpressionAttributeValues: {
            ":foreignEntityType3": "Teacher",
            ":foreignEntityType4": "Assignment",
            ":foreignEntityType5": "Student",
            ":myPk6": "Course|123",
            ":type1": "Course",
            ":type2": "BelongsToLink"
          },
          FilterExpression:
            "#type = :type1 OR (#type = :type2 AND #foreignEntityType IN (:foreignEntityType3,:foreignEntityType4,:foreignEntityType5))",
          KeyConditionExpression: "#myPk = :myPk6",
          TableName: "other-table"
        }
      ]
    ]);
    expect(mockTransactGetCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Get: {
                TableName: "other-table",
                Key: { myPk: "Student|456", mySk: "Student" }
              }
            },
            {
              Get: {
                TableName: "other-table",
                Key: { myPk: "Student|789", mySk: "Student" }
              }
            },
            {
              Get: {
                TableName: "other-table",
                Key: { myPk: "Assignment|111", mySk: "Assignment" }
              }
            },
            {
              Get: {
                TableName: "other-table",
                Key: { myPk: "Teacher|555", mySk: "Teacher" }
              }
            }
          ]
        }
      ]
    ]);
    expect(mockSend.mock.calls).toEqual([
      [{ name: "QueryCommand" }],
      [{ name: "TransactGetCommand" }]
    ]);
  });

  describe("types", () => {
    describe("operation results", () => {
      it("HasOne - when including an optional property, the returned type is optional", async () => {
        expect.assertions(1);

        mockQuery.mockResolvedValueOnce({ Items: [] });
        mockTransactGetItems.mockResolvedValueOnce({});

        const result = await Customer.findById("123", {
          include: [{ association: "contactInformation" }]
        });

        try {
          // @ts-expect-error ContactInformation could be undefined
          // eslint-disable-next-line @typescript-eslint/no-unused-expressions
          result.contactInformation.id;
        } catch (_e) {
          expect(true).toEqual(true);
        }
      });
    });

    it("will allow options with include options that are associations/relationships defined on the model", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });
      mockTransactGetItems.mockResolvedValueOnce({});

      await PaymentMethod.findById("789", {
        include: [
          // @ts-expect-no-error: Can include BelongsTo relationships which are defined on the model
          { association: "customer" },
          // @ts-expect-no-error: Can include HasOne relationships which are defined on the model
          { association: "paymentMethodProvider" },
          // @ts-expect-no-error: Can include HasMAny relationships which are defined on the model
          { association: "orders" }
        ]
      });
    });

    it("will not allow include options with attributes that do not exist on the entity", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });
      mockTransactGetItems.mockResolvedValueOnce({});

      // @ts-expect-error: Cannot include association using a key not defined on the model
      await PaymentMethod.findById("789", {
        include: [{ association: "nonExistent" }]
      });
    });

    it("(BelongsTo HasMany) - results of a findById with include will not allow any types which were not included in the query", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });
      mockTransactGetItems.mockResolvedValueOnce({});

      const paymentMethod = await PaymentMethod.findById("789", {
        include: [{ association: "customer" }]
      });

      if (paymentMethod !== undefined) {
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.pk);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.sk);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.id);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.lastFour);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.customerId);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.updatedAt);
        // @ts-expect-no-error: Included associations are allowed
        Logger.log(paymentMethod.customer);
        // @ts-expect-error: Not included associations are not allowed
        Logger.log(paymentMethod.orders);
        // @ts-expect-error: Not included associations are not allowed
        Logger.log(paymentMethod.paymentMethodProvider);
      }
    });

    it("(BelongsTo HasOne) - results of a findById with include will not allow any types which were not included in the query", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });
      mockTransactGetItems.mockResolvedValueOnce({});

      const paymentMethod = await PaymentMethodProvider.findById("789", {
        include: [{ association: "paymentMethod" }]
      });

      if (paymentMethod !== undefined) {
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.pk);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.sk);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.id);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.name);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.paymentMethodId);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.updatedAt);
        // @ts-expect-no-error: Included associations are allowed
        Logger.log(paymentMethod.paymentMethod);
      }
    });

    it("(HasOne) - results of a findById with include will not allow any types which were not included in the query", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });
      mockTransactGetItems.mockResolvedValueOnce({});

      const paymentMethod = await PaymentMethod.findById("789", {
        include: [{ association: "paymentMethodProvider" }]
      });

      if (paymentMethod !== undefined) {
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.pk);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.sk);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.id);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.lastFour);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.customerId);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.updatedAt);
        // @ts-expect-error: Not included associations are not allowed
        Logger.log(paymentMethod.customer);
        // @ts-expect-error: Not included associations are not allowed
        Logger.log(paymentMethod.orders);
        // @ts-expect-no-error: Included associations are allowed
        Logger.log(paymentMethod.paymentMethodProvider);
      }
    });

    it("(HasMany) - results of a findById with include will not allow any types which were not included in the query", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });
      mockTransactGetItems.mockResolvedValueOnce({});

      const paymentMethod = await PaymentMethod.findById("789", {
        include: [{ association: "orders" }]
      });

      if (paymentMethod !== undefined) {
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.pk);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.sk);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.id);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.lastFour);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.customerId);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.updatedAt);
        // @ts-expect-error: Not included associations are not allowed
        Logger.log(paymentMethod.customer);
        // @ts-expect-no-error: Included associations are allowed
        Logger.log(paymentMethod.orders);
        // @ts-expect-error: Not included associations are not allowed
        Logger.log(paymentMethod.paymentMethodProvider);
      }
    });

    it("(HasAndBelongsToMany) - results of a findById with include will not allow any types which were not included in the query", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });
      mockTransactGetItems.mockResolvedValueOnce({});

      const book = await Book.findById("789", {
        include: [{ association: "authors" }]
      });

      if (book !== undefined) {
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(book.pk);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(book.sk);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(book.id);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(book.type);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(book.name);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(book.numPages);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(book.ownerId);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(book.createdAt);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(book.updatedAt);
        // @ts-expect-error: Not included associations are not allowed
        Logger.log(book.customer);
        // @ts-expect-no-error: Included associations are allowed
        Logger.log(book.authors);
        // @ts-expect-error: Not included associations are not allowed
        Logger.log(book.owner);
      }
    });

    it("(BelongsTo) - included relationships should not include any of their associations", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });
      mockTransactGetItems.mockResolvedValueOnce({});

      const paymentMethod = await PaymentMethod.findById("789", {
        include: [{ association: "customer" }]
      });

      if (paymentMethod !== undefined) {
        // @ts-expect-error: Included relationships should not include associations
        Logger.log(paymentMethod.customer?.orders);
        // @ts-expect-no-error: Entity attributes should include entity attributes
        Logger.log(paymentMethod.customer?.id);
      }
    });

    it("(HasMany) - included relationships should not include any of their associations", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });
      mockTransactGetItems.mockResolvedValueOnce({});

      const paymentMethod = await PaymentMethod.findById("789", {
        include: [{ association: "orders" }]
      });

      if (paymentMethod !== undefined && paymentMethod.orders?.length > 0) {
        // @ts-expect-error: Included relationships should not include associations
        Logger.log(paymentMethod.orders[0].customer);
        // @ts-expect-no-error: Entity attributes should include entity attributes
        Logger.log(paymentMethod.orders[0].id);
      }
    });

    it("(HasAndBelongsToMany) - included relationships should not include any of their associations", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });
      mockTransactGetItems.mockResolvedValueOnce({});

      const book = await Book.findById("789", {
        include: [{ association: "authors" }]
      });

      if (book !== undefined && book.authors?.length > 0) {
        // @ts-expect-error: Included relationships should not include associations
        Logger.log(book.authors[0].books);
        // @ts-expect-no-error: Entity attributes should include entity attributes
        Logger.log(book.authors[0].id);
      }
    });

    it("BelongsTo includes from NullableForeignKeys might be undefined", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });
      mockTransactGetItems.mockResolvedValueOnce({});

      const pet = await Pet.findById("789", {
        include: [{ association: "owner" }]
      });

      if (pet !== undefined) {
        // @ts-expect-error: BelongsTo includes from NullableForeignKeys might be undefined
        Logger.log(pet.owner.id);
      }
    });

    it("BelongsTo includes from (non-nullable) ForeignKeys will not be undefined", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });
      mockTransactGetItems.mockResolvedValueOnce({});

      const address = await Address.findById("123", {
        include: [{ association: "home" }]
      });

      if (address !== undefined) {
        // @ts-expect-no-error: BelongsTo includes from (non-nullable) ForeignKeys will not be undefined
        Logger.log(address.home.id);
      }
    });

    it("included HasMany relationships will be an array", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });
      mockTransactGetItems.mockResolvedValueOnce({});

      const phoneBook = await PhoneBook.findById("123", {
        include: [{ association: "addresses" }]
      });

      if (phoneBook !== undefined) {
        // @ts-expect-no-error: included HasMany relationships will be an array
        Logger.log(phoneBook.addresses.length);

        // @ts-expect-error: included HasMany relationships do not have attributes of the parent class instance
        Logger.log(phoneBook.addresses.some(address => address.edition));

        // @ts-expect-no-error: included HasMany relationships only have attributes of the included relationship entity class instance
        Logger.log(phoneBook.addresses.some(address => address.homeId));
      }
    });
  });
});
