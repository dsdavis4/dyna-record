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
  Student
} from "./mockModels";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactGetCommand
} from "@aws-sdk/lib-dynamodb";
import { profile } from "console";

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
        UpdatedAt: "2023-09-15T04:26:31.148Z",
        //TODO remove all instances of this
        SomeAttr: "attribute that is not modeled"
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

  it("findByIdOnly - will return null if it doesn't find the record", async () => {
    expect.assertions(4);

    mockGet.mockResolvedValueOnce({});

    const result = await Customer.findById("123");

    expect(result).toEqual(null);
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

  it("findByIdWithIncludes - will return null if it doesn't find the record", async () => {
    expect.assertions(4);

    mockQuery.mockResolvedValueOnce({ Items: [] });

    const result = await Customer.findById("123", {
      include: [{ association: "orders" }]
    });

    expect(result).toEqual(null);
    expect(mockedQueryCommand.mock.calls).toEqual([
      [
        {
          TableName: "mock-table",
          KeyConditionExpression: "#PK = :PK4",
          ConsistentRead: true,
          ExpressionAttributeNames: {
            "#ForeignEntityType": "ForeignEntityType",
            "#PK": "PK",
            "#Type": "Type"
          },
          ExpressionAttributeValues: {
            ":ForeignEntityType3": "Order",
            ":PK4": "Customer#123",
            ":Type1": "Customer",
            ":Type2": "BelongsToLink"
          },
          FilterExpression:
            "#Type = :Type1 OR (#Type = :Type2 AND #ForeignEntityType IN (:ForeignEntityType3))"
        }
      ]
    ]);
    expect(mockQuery.mock.calls).toEqual([[]]);
    expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
  });

  it("will find an entity with included HasMany associations", async () => {
    expect.assertions(7);

    const orderLinks = [
      {
        PK: "Customer#123",
        SK: "Order#001",
        Id: "001",
        Type: "BelongsToLink",
        ForeignKey: "111",
        ForeignEntityType: "Order",
        UpdatedAt: "2022-10-15T09:31:15.148Z",
        SomeAttr: "attribute that is not modeled"
      },
      {
        PK: "Customer#123",
        SK: "Order#003",
        Id: "003",
        Type: "BelongsToLink",
        ForeignKey: "112",
        ForeignEntityType: "Order",
        UpdatedAt: "2022-11-01T23:31:21.148Z",
        SomeAttr: "attribute that is not modeled"
      },
      {
        PK: "Customer#123",
        SK: "Order#004",
        Id: "004",
        Type: "BelongsToLink",
        ForeignKey: "113",
        ForeignEntityType: "Order",
        UpdatedAt: "2022-09-01T23:31:21.148Z",
        SomeAttr: "attribute that is not modeled"
      }
    ];

    const paymentMethodLinks = [
      {
        PK: "Customer#123",
        SK: "PaymentMethod#007",
        Id: "007",
        Type: "BelongsToLink",
        ForeignKey: "116",
        ForeignEntityType: "PaymentMethod",
        UpdatedAt: "2022-10-01T12:31:21.148Z",
        SomeAttr: "attribute that is not modeled"
      },
      {
        PK: "Customer#123",
        SK: "PaymentMethod#008",
        Id: "008",
        Type: "BelongsToLink",
        ForeignKey: "117",
        ForeignEntityType: "PaymentMethod",
        UpdatedAt: "2022-11-21T12:31:21.148Z",
        SomeAttr: "attribute that is not modeled"
      }
    ];

    mockQuery.mockResolvedValueOnce({
      Items: [
        {
          PK: "Customer#123",
          SK: "Customer",
          Id: "123",
          Name: "Some Customer",
          Address: "11 Some St",
          Type: "Customer",
          UpdatedAt: "2022-09-15T04:26:31.148Z",
          SomeAttr: "attribute that is not modeled"
        },
        ...orderLinks,
        ...paymentMethodLinks
      ]
    });

    const orders = orderLinks.map(link => ({
      Item: {
        PK: `${link.ForeignEntityType}#${link.ForeignKey}`,
        SK: link.ForeignEntityType,
        Id: link.ForeignKey,
        Type: link.ForeignEntityType,
        PaymentMethodId: "116",
        CustomerId: link.PK.split("#")[1],
        OrderDate: "2022-12-15T09:31:15.148Z",
        UpdatedAt: "2023-02-15T08:31:15.148Z"
      }
    }));

    const paymentMethods = paymentMethodLinks.map((link, idx) => ({
      Item: {
        PK: `${link.ForeignEntityType}#${link.ForeignKey}`,
        SK: link.ForeignEntityType,
        Id: link.ForeignKey,
        Type: link.ForeignEntityType,
        CustomerId: link.PK.split("#")[1],
        LastFour: `000${idx}`,
        UpdatedAt: "2023-02-15T08:31:15.148Z"
      }
    }));

    mockTransactGetItems.mockResolvedValueOnce({
      Responses: [...orders, ...paymentMethods]
    });

    const result = await Customer.findById("123", {
      include: [{ association: "orders" }, { association: "paymentMethods" }]
    });

    expect(result).toEqual({
      type: "Customer",
      pk: "Customer#123",
      sk: "Customer",
      id: "123",
      name: "Some Customer",
      address: "11 Some St",
      updatedAt: new Date("2022-09-15T04:26:31.148Z"),
      orders: [
        {
          pk: "Order#111",
          sk: "Order",
          id: "111",
          type: "Order",
          customerId: "123",
          paymentMethodId: "116",
          orderDate: new Date("2022-12-15T09:31:15.148Z"),
          updatedAt: new Date("2023-02-15T08:31:15.148Z")
        },
        {
          pk: "Order#112",
          sk: "Order",
          id: "112",
          type: "Order",
          customerId: "123",
          paymentMethodId: "116",
          orderDate: new Date("2022-12-15T09:31:15.148Z"),
          updatedAt: new Date("2023-02-15T08:31:15.148Z")
        },
        {
          pk: "Order#113",
          sk: "Order",
          id: "113",
          type: "Order",
          customerId: "123",
          paymentMethodId: "116",
          orderDate: new Date("2022-12-15T09:31:15.148Z"),
          updatedAt: new Date("2023-02-15T08:31:15.148Z")
        }
      ],
      paymentMethods: [
        {
          pk: "PaymentMethod#116",
          sk: "PaymentMethod",
          id: "116",
          type: "PaymentMethod",
          lastFour: "0000",
          customerId: "123",
          updatedAt: new Date("2023-02-15T08:31:15.148Z")
        },
        {
          pk: "PaymentMethod#117",
          sk: "PaymentMethod",
          id: "117",
          type: "PaymentMethod",
          lastFour: "0001",
          customerId: "123",
          updatedAt: new Date("2023-02-15T08:31:15.148Z")
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
          FilterExpression:
            "#Type = :Type1 OR (#Type = :Type2 AND #ForeignEntityType IN (:ForeignEntityType3,:ForeignEntityType4))",
          KeyConditionExpression: "#PK = :PK5",
          ExpressionAttributeNames: {
            "#PK": "PK",
            "#Type": "Type",
            "#ForeignEntityType": "ForeignEntityType"
          },
          ExpressionAttributeValues: {
            ":PK5": "Customer#123",
            ":Type1": "Customer",
            ":Type2": "BelongsToLink",
            ":ForeignEntityType3": "Order",
            ":ForeignEntityType4": "PaymentMethod"
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
                Key: { PK: "PaymentMethod#116", SK: "PaymentMethod" }
              }
            },
            {
              Get: {
                TableName: "mock-table",
                Key: { PK: "PaymentMethod#117", SK: "PaymentMethod" }
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

  // TODO this test should pass
  // Its also out of date since the transactGetItems refactor
  // TODO there should be an equivalent for not found HasOne or BelongsTo
  it.skip("will set HasMany associations to an empty array if it doesn't find any", async () => {
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
          UpdatedAt: "2022-09-15T04:26:31.148Z",
          SomeAttr: "attribute that is not modeled"
        }
      ]
    });

    const result = await Customer.findById("123", {
      include: [{ association: "orders" }, { association: "paymentMethods" }]
    });

    expect(result).toEqual({
      type: "Customer",
      pk: "Customer#123",
      sk: "Customer",
      id: "123",
      name: "Some Customer",
      address: "11 Some St",
      updatedAt: new Date("2022-09-15T04:26:31.148Z"),
      orders: [],
      paymentMethods: []
    });
    expect(result).toBeInstanceOf(Customer);
    expect(mockedQueryCommand.mock.calls).toEqual([
      [
        {
          TableName: "mock-table",
          FilterExpression: "#Type = :Type1 OR #Type = :Type2",
          KeyConditionExpression: "#PK = :PK3",
          ExpressionAttributeNames: { "#Type": "Type", "#PK": "PK" },
          ExpressionAttributeValues: {
            ":PK3": "Customer#123",
            ":Type1": "Customer",
            ":Type2": "BelongsToLink"
          }
        }
      ]
    ]);
    expect(mockedGetCommand.mock.calls).toEqual([]);
    expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
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
      UpdatedAt: "2022-09-15T04:26:31.148Z",
      SomeAttr: "attribute that is not modeled"
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
        UpdatedAt: "2022-10-15T09:31:15.148Z",
        SomeAttr: "attribute that is not modeled"
      },
      {
        PK: "PaymentMethod#789",
        SK: "Order#003",
        Id: "003",
        ForeignEntityType: "Order",
        ForeignKey: "112",
        Type: "BelongsToLink",
        UpdatedAt: "2022-11-01T23:31:21.148Z",
        SomeAttr: "attribute that is not modeled"
      },
      {
        PK: "PaymentMethod#789",
        SK: "Order#004",
        Id: "004",
        ForeignEntityType: "Order",
        ForeignKey: "113",
        Type: "BelongsToLink",
        UpdatedAt: "2022-09-01T23:31:21.148Z",
        SomeAttr: "attribute that is not modeled"
      }
    ];

    const customerRes = {
      PK: "Customer#123",
      SK: "Customer",
      Id: "123",
      Name: "Some Customer",
      Address: "11 Some St",
      Type: "Customer",
      UpdatedAt: "2023-09-15T04:26:31.148Z",
      SomeAttr: "attribute that is not modeled"
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

  // TODO remove only
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
        UpdatedAt: "2022-10-15T09:31:15.148Z",
        SomeAttr: "attribute that is not modeled"
      },
      {
        PK: "Book#789",
        SK: "Author#003",
        Id: "003",
        ForeignEntityType: "Author",
        ForeignKey: "112",
        Type: "BelongsToLink",
        UpdatedAt: "2022-11-01T23:31:21.148Z",
        SomeAttr: "attribute that is not modeled"
      },
      {
        PK: "Book#789",
        SK: "Author#004",
        Id: "004",
        ForeignEntityType: "Author",
        ForeignKey: "113",
        Type: "BelongsToLink",
        UpdatedAt: "2022-09-01T23:31:21.148Z",
        SomeAttr: "attribute that is not modeled"
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

  // TODO do a test like this (alternate table) for all operation types
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
                Key: { myPk: "Teacher|555", mySk: "Teacher" },
                TableName: "other-table"
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

      await PaymentMethod.findById("789", {
        include: [
          // @ts-expect-error: Cannot include association using a key not defined on the model
          { association: "nonExistent" }
        ]
      });
    });

    it("(BelongsTo HasMany) - results of a findById with include will not allow any types which were not included in the query", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });
      mockTransactGetItems.mockResolvedValueOnce({});

      const paymentMethod = await PaymentMethod.findById("789", {
        include: [{ association: "customer" }]
      });

      if (paymentMethod !== null) {
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(paymentMethod.pk);
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(paymentMethod.sk);
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(paymentMethod.id);
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(paymentMethod.lastFour);
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(paymentMethod.customerId);
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(paymentMethod.updatedAt);
        // @ts-expect-no-error: Included associations are allowed
        console.log(paymentMethod.customer);
        // @ts-expect-error: Not included associations are not allowed
        console.log(paymentMethod.orders);
        // @ts-expect-error: Not included associations are not allowed
        console.log(paymentMethod.paymentMethodProvider);
      }
    });

    it("(BelongsTo HasOne) - results of a findById with include will not allow any types which were not included in the query", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });
      mockTransactGetItems.mockResolvedValueOnce({});

      const paymentMethod = await PaymentMethodProvider.findById("789", {
        include: [{ association: "paymentMethod" }]
      });

      if (paymentMethod !== null) {
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(paymentMethod.pk);
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(paymentMethod.sk);
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(paymentMethod.id);
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(paymentMethod.name);
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(paymentMethod.paymentMethodId);
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(paymentMethod.updatedAt);
        // @ts-expect-no-error: Included associations are allowed
        console.log(paymentMethod.paymentMethod);
      }
    });

    it("(HasOne) - results of a findById with include will not allow any types which were not included in the query", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });
      mockTransactGetItems.mockResolvedValueOnce({});

      const paymentMethod = await PaymentMethod.findById("789", {
        include: [{ association: "paymentMethodProvider" }]
      });

      if (paymentMethod !== null) {
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(paymentMethod.pk);
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(paymentMethod.sk);
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(paymentMethod.id);
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(paymentMethod.lastFour);
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(paymentMethod.customerId);
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(paymentMethod.updatedAt);
        // @ts-expect-error: Not included associations are not allowed
        console.log(paymentMethod.customer);
        // @ts-expect-error: Not included associations are not allowed
        console.log(paymentMethod.orders);
        // @ts-expect-no-error: Included associations are allowed
        console.log(paymentMethod.paymentMethodProvider);
      }
    });

    it("(HasMany) - results of a findById with include will not allow any types which were not included in the query", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });
      mockTransactGetItems.mockResolvedValueOnce({});

      const paymentMethod = await PaymentMethod.findById("789", {
        include: [{ association: "orders" }]
      });

      if (paymentMethod !== null) {
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(paymentMethod.pk);
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(paymentMethod.sk);
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(paymentMethod.id);
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(paymentMethod.lastFour);
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(paymentMethod.customerId);
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(paymentMethod.updatedAt);
        // @ts-expect-error: Not included associations are not allowed
        console.log(paymentMethod.customer);
        // @ts-expect-no-error: Included associations are allowed
        console.log(paymentMethod.orders);
        // @ts-expect-error: Not included associations are not allowed
        console.log(paymentMethod.paymentMethodProvider);
      }
    });

    it("(HasAndBelongsToMany) - results of a findById with include will not allow any types which were not included in the query", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });
      mockTransactGetItems.mockResolvedValueOnce({});

      const book = await Book.findById("789", {
        include: [{ association: "authors" }]
      });

      if (book !== null) {
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(book.pk);
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(book.sk);
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(book.id);
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(book.type);
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(book.name);
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(book.numPages);
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(book.ownerId);
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(book.createdAt);
        // @ts-expect-no-error: Entity Attributes are allowed
        console.log(book.updatedAt);
        // @ts-expect-error: Not included associations are not allowed
        console.log(book.customer);
        // @ts-expect-no-error: Included associations are allowed
        console.log(book.authors);
        // @ts-expect-error: Not included associations are not allowed
        console.log(book.owner);
      }
    });

    it("(BelongsTo) - included relationships should not include any of their associations", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });
      mockTransactGetItems.mockResolvedValueOnce({});

      const paymentMethod = await PaymentMethod.findById("789", {
        include: [{ association: "customer" }]
      });

      if (paymentMethod !== null) {
        // @ts-expect-error: Included relationships should not include associations
        console.log(paymentMethod.customer?.orders);
        // @ts-expect-no-error: Entity attributes should include entity attributes
        console.log(paymentMethod.customer?.id);
      }
    });

    it("(HasMany) - included relationships should not include any of their associations", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });
      mockTransactGetItems.mockResolvedValueOnce({});

      const paymentMethod = await PaymentMethod.findById("789", {
        include: [{ association: "orders" }]
      });

      if (paymentMethod !== null && paymentMethod.orders?.length > 0) {
        // @ts-expect-error: Included relationships should not include associations
        console.log(paymentMethod.orders[0].customer);
        // @ts-expect-no-error: Entity attributes should include entity attributes
        console.log(paymentMethod.orders[0].id);
      }
    });

    it("(HasAndBelongsToMany) - included relationships should not include any of their associations", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });
      mockTransactGetItems.mockResolvedValueOnce({});

      const book = await Book.findById("789", {
        include: [{ association: "authors" }]
      });

      if (book !== null && book.authors?.length > 0) {
        // @ts-expect-error: Included relationships should not include associations
        console.log(book.authors[0].books);
        // @ts-expect-no-error: Entity attributes should include entity attributes
        console.log(book.authors[0].id);
      }
    });
  });
});
