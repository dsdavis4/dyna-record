import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  Customer,
  PaymentMethod,
  Order,
  PaymentMethodProvider,
  ContactInformation
} from "./mockModels";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand
} from "@aws-sdk/lib-dynamodb";

const mockGet = jest.fn();
const mockSend = jest.fn();
const mockQuery = jest.fn();
const mockedDynamoDBClient = jest.mocked(DynamoDBClient);
const mockedDynamoDBDocumentClient = jest.mocked(DynamoDBDocumentClient);
const mockedGetCommand = jest.mocked(GetCommand);
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
            if (command.name === "GetCommand") {
              return await Promise.resolve(mockGet());
            }
            if (command.name === "QueryCommand") {
              return await Promise.resolve(mockQuery());
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
    TransactWriteCommand: jest.fn().mockImplementationOnce(() => {
      return { name: "TransactWriteCommand" };
    })
  };
});

describe("FindById", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("will initialize a Dynamo client", async () => {
    expect.assertions(2);

    mockGet.mockResolvedValueOnce({});

    await Customer.findById("123");

    expect(mockedDynamoDBClient.mock.calls).toEqual([
      [{ region: "us-west-2" }]
    ]);
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
      updatedAt: "2023-09-15T04:26:31.148Z"
    });
    expect(result?.mockCustomInstanceMethod()).toEqual("Some Customer-123");
    expect(mockedGetCommand.mock.calls).toEqual([
      [
        {
          Key: { PK: "Customer#123", SK: "Customer" },
          TableName: "mock-table"
        }
      ]
    ]);
    expect(mockSend.mock.calls).toEqual([[{ name: "GetCommand" }]]);
  });

  it("will return null if it doesn't find the record", async () => {
    expect.assertions(3);

    mockGet.mockResolvedValueOnce({});

    const result = await Customer.findById("123");

    expect(result).toEqual(null);
    expect(mockedGetCommand.mock.calls).toEqual([
      [
        {
          Key: { PK: "Customer#123", SK: "Customer" },
          TableName: "mock-table"
        }
      ]
    ]);
    expect(mockSend.mock.calls).toEqual([[{ name: "GetCommand" }]]);
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

    orderLinks.forEach(link => {
      mockGet.mockResolvedValueOnce({
        Item: {
          PK: `${link.ForeignEntityType}#${link.ForeignKey}`,
          SK: link.ForeignEntityType,
          Id: link.ForeignKey,
          PaymentMethodId: "116",
          CustomerId: link.PK.split("#")[1],
          OrderDate: "2022-12-15T09:31:15.148Z",
          UpdatedAt: "2023-02-15T08:31:15.148Z"
        }
      });
    });

    paymentMethodLinks.forEach((link, idx) => {
      mockGet.mockResolvedValueOnce({
        Item: {
          PK: `${link.ForeignEntityType}#${link.ForeignKey}`,
          SK: link.ForeignEntityType,
          Id: link.ForeignKey,
          CustomerId: link.PK.split("#")[1],
          LastFour: `000${idx}`,
          UpdatedAt: "2023-02-15T08:31:15.148Z"
        }
      });
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
      updatedAt: "2022-09-15T04:26:31.148Z",
      orders: [
        {
          pk: "Order#111",
          sk: "Order",
          id: "111",
          customerId: "123",
          paymentMethodId: "116",
          orderDate: "2022-12-15T09:31:15.148Z",
          updatedAt: "2023-02-15T08:31:15.148Z"
        },
        {
          pk: "Order#112",
          sk: "Order",
          id: "112",
          customerId: "123",
          paymentMethodId: "116",
          orderDate: "2022-12-15T09:31:15.148Z",
          updatedAt: "2023-02-15T08:31:15.148Z"
        },
        {
          pk: "Order#113",
          sk: "Order",
          id: "113",
          customerId: "123",
          paymentMethodId: "116",
          orderDate: "2022-12-15T09:31:15.148Z",
          updatedAt: "2023-02-15T08:31:15.148Z"
        }
      ],
      paymentMethods: [
        {
          pk: "PaymentMethod#116",
          sk: "PaymentMethod",
          id: "116",
          lastFour: "0000",
          customerId: "123",
          updatedAt: "2023-02-15T08:31:15.148Z"
        },
        {
          pk: "PaymentMethod#117",
          sk: "PaymentMethod",
          id: "117",
          lastFour: "0001",
          customerId: "123",
          updatedAt: "2023-02-15T08:31:15.148Z"
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
          }
        }
      ]
    ]);
    expect(mockedGetCommand.mock.calls).toEqual([
      [{ TableName: "mock-table", Key: { PK: "Order#111", SK: "Order" } }],
      [{ TableName: "mock-table", Key: { PK: "Order#112", SK: "Order" } }],
      [{ TableName: "mock-table", Key: { PK: "Order#113", SK: "Order" } }],
      [
        {
          TableName: "mock-table",
          Key: { PK: "PaymentMethod#116", SK: "PaymentMethod" }
        }
      ],
      [
        {
          TableName: "mock-table",
          Key: { PK: "PaymentMethod#117", SK: "PaymentMethod" }
        }
      ]
    ]);
    expect(mockSend.mock.calls).toEqual([
      [{ name: "QueryCommand" }],
      [{ name: "GetCommand" }],
      [{ name: "GetCommand" }],
      [{ name: "GetCommand" }],
      [{ name: "GetCommand" }],
      [{ name: "GetCommand" }]
    ]);
  });

  // TODO this test should pass
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
      updatedAt: "2022-09-15T04:26:31.148Z",
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
      LastFour: "0000",
      CustomerId: "123",
      UpdatedAt: "2023-02-15T08:31:15.148Z"
    };

    mockQuery.mockResolvedValueOnce({ Items: [orderRes] });
    mockGet
      .mockResolvedValueOnce({ Item: customerRes })
      .mockResolvedValueOnce({ Item: paymentMethodRes });

    const result = await Order.findById("123", {
      include: [{ association: "customer" }, { association: "paymentMethod" }]
    });

    expect(result).toEqual({
      pk: "Order#123",
      sk: "Order",
      id: "123",
      customerId: "456",
      paymentMethodId: "789",
      orderDate: "2023-09-15T04:26:31.148Z",
      customer: {
        type: "Customer",
        pk: "Customer#456",
        sk: "Customer",
        id: "456",
        name: "Some Customer",
        address: "11 Some St",
        updatedAt: "2022-09-15T04:26:31.148Z"
      },
      paymentMethod: {
        pk: "PaymentMethod#789",
        sk: "PaymentMethod",
        id: "789",
        lastFour: "0000",
        customerId: "123",
        updatedAt: "2023-02-15T08:31:15.148Z"
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
          }
        }
      ]
    ]);
    expect(mockedGetCommand.mock.calls).toEqual([
      [
        {
          TableName: "mock-table",
          Key: { PK: "Customer#456", SK: "Customer" }
        }
      ],
      [
        {
          TableName: "mock-table",
          Key: { PK: "PaymentMethod#789", SK: "PaymentMethod" }
        }
      ]
    ]);
    expect(mockSend.mock.calls).toEqual([
      [{ name: "QueryCommand" }],
      [{ name: "GetCommand" }],
      [{ name: "GetCommand" }]
    ]);
  });

  it("will find an entity with included BelongsTo HasOne associations", async () => {
    expect.assertions(6);

    const paymentMethodProviderRes = {
      PK: "PaymentMethodProvider#123",
      SK: "PaymentMethodProvider",
      Id: "123",
      Name: "Vida",
      PaymentMethodId: "789"
    };

    const paymentMethodRes = {
      PK: "PaymentMethod#789",
      SK: "PaymentMethod",
      Id: "789",
      LastFour: "0000",
      CustomerId: "123",
      UpdatedAt: "2023-02-15T08:31:15.148Z"
    };

    mockQuery.mockResolvedValueOnce({ Items: [paymentMethodProviderRes] });
    mockGet.mockResolvedValueOnce({ Item: paymentMethodRes });

    const result = await PaymentMethodProvider.findById("123", {
      include: [{ association: "paymentMethod" }]
    });

    expect(result).toEqual({
      pk: "PaymentMethodProvider#123",
      sk: "PaymentMethodProvider",
      id: "123",
      name: "Vida",
      paymentMethodId: "789",
      paymentMethod: {
        pk: "PaymentMethod#789",
        sk: "PaymentMethod",
        id: "789",
        lastFour: "0000",
        customerId: "123",
        updatedAt: "2023-02-15T08:31:15.148Z"
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
          }
        }
      ]
    ]);
    expect(mockedGetCommand.mock.calls).toEqual([
      [
        {
          TableName: "mock-table",
          Key: { PK: "PaymentMethod#789", SK: "PaymentMethod" }
        }
      ]
    ]);
    expect(mockSend.mock.calls).toEqual([
      [{ name: "QueryCommand" }],
      [{ name: "GetCommand" }]
    ]);
  });

  it("will find an entity with included HasOne associations", async () => {
    expect.assertions(6);

    const paymentMethodRes = {
      PK: "PaymentMethod#789",
      SK: "PaymentMethod",
      Id: "789",
      LastFour: "0000",
      CustomerId: "123",
      UpdatedAt: "2023-02-15T08:31:15.148Z"
    };

    const paymentMethodProviderLink = {
      PK: "PaymentMethod#789",
      SK: "PaymentMethodProvider",
      Id: "001",
      Type: "BelongsToLink",
      ForeignKey: 123,
      ForeignEntityType: "PaymentMethodProvider",
      CreatedAt: "2022-10-15T09:31:15.148Z",
      UpdatedAt: "2022-10-15T09:31:15.148Z"
    };

    const paymentMethodProviderRes = {
      PK: "PaymentMethodProvider#123",
      SK: "PaymentMethodProvider",
      Id: "123",
      Name: "Vida",
      PaymentMethodId: "789"
    };

    mockQuery.mockResolvedValueOnce({
      Items: [paymentMethodRes, paymentMethodProviderLink]
    });
    mockGet.mockResolvedValueOnce({ Item: paymentMethodProviderRes });

    const result = await PaymentMethod.findById("789", {
      include: [{ association: "paymentMethodProvider" }]
    });

    expect(result).toEqual({
      pk: "PaymentMethod#789",
      sk: "PaymentMethod",
      id: "789",
      lastFour: "0000",
      customerId: "123",
      updatedAt: "2023-02-15T08:31:15.148Z",
      paymentMethodProvider: {
        pk: "PaymentMethodProvider#123",
        sk: "PaymentMethodProvider",
        id: "123",
        name: "Vida",
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
          }
        }
      ]
    ]);
    expect(mockedGetCommand.mock.calls).toEqual([
      [
        {
          TableName: "mock-table",
          Key: {
            PK: "PaymentMethodProvider#123",
            SK: "PaymentMethodProvider"
          }
        }
      ]
    ]);
    expect(mockSend.mock.calls).toEqual([
      [{ name: "QueryCommand" }],
      [{ name: "GetCommand" }]
    ]);
  });

  it("will find an entity with HasMany and BelongsTo associations", async () => {
    expect.assertions(7);

    const paymentMethodRes = {
      PK: "PaymentMethod#789",
      SK: "PaymentMethod",
      Id: "789",
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

    mockGet.mockResolvedValueOnce({ Item: customerRes });
    orderLinks.forEach(link => {
      mockGet.mockResolvedValueOnce({
        Item: {
          PK: `${link.ForeignEntityType}#${link.ForeignKey}`,
          SK: link.ForeignEntityType,
          Id: link.ForeignKey,
          PaymentMethodId: link.PK.split("#")[1],
          CustomerId: "123",
          OrderDate: "2022-12-15T09:31:15.148Z",
          UpdatedAt: "2023-02-15T08:31:15.148Z"
        }
      });
    });

    const result = await PaymentMethod.findById("789", {
      include: [{ association: "orders" }, { association: "customer" }]
    });

    expect(result).toEqual({
      pk: "PaymentMethod#789",
      sk: "PaymentMethod",
      id: "789",
      lastFour: "0000",
      customerId: "123",
      updatedAt: "2023-02-15T08:31:15.148Z",
      customer: {
        type: "Customer",
        pk: "Customer#123",
        sk: "Customer",
        id: "123",
        name: "Some Customer",
        address: "11 Some St",
        updatedAt: "2023-09-15T04:26:31.148Z"
      },
      orders: [
        {
          pk: "Order#111",
          sk: "Order",
          id: "111",
          customerId: "123",
          paymentMethodId: "789",
          orderDate: "2022-12-15T09:31:15.148Z",
          updatedAt: "2023-02-15T08:31:15.148Z"
        },
        {
          pk: "Order#112",
          sk: "Order",
          id: "112",
          customerId: "123",
          paymentMethodId: "789",
          orderDate: "2022-12-15T09:31:15.148Z",
          updatedAt: "2023-02-15T08:31:15.148Z"
        },
        {
          pk: "Order#113",
          sk: "Order",
          id: "113",
          customerId: "123",
          paymentMethodId: "789",
          orderDate: "2022-12-15T09:31:15.148Z",
          updatedAt: "2023-02-15T08:31:15.148Z"
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
          }
        }
      ]
    ]);
    expect(mockedGetCommand.mock.calls).toEqual([
      [
        {
          TableName: "mock-table",
          Key: { PK: "Customer#123", SK: "Customer" }
        }
      ],
      [{ TableName: "mock-table", Key: { PK: "Order#111", SK: "Order" } }],
      [{ TableName: "mock-table", Key: { PK: "Order#112", SK: "Order" } }],
      [{ TableName: "mock-table", Key: { PK: "Order#113", SK: "Order" } }]
    ]);
    expect(mockSend.mock.calls).toEqual([
      [{ name: "QueryCommand" }],
      [{ name: "GetCommand" }],
      [{ name: "GetCommand" }],
      [{ name: "GetCommand" }],
      [{ name: "GetCommand" }]
    ]);
  });

  describe("types", () => {
    describe("operation results", () => {
      it("HasOne - when including an optional property, the returned type is optional", async () => {
        expect.assertions(1);

        mockQuery.mockResolvedValueOnce({ Items: [] });

        const result = await Customer.findById("123", {
          include: [{ association: "contactInformation" }]
        });

        if (result !== null) {
          try {
            // @ts-expect-error ContactInformation could be undefined
            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            result.contactInformation.id;
          } catch (_e) {
            expect(true).toEqual(true);
          }
        }
      });
    });
    it("will allow options with include options that are associations/relationships defined on the model", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });

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

      await PaymentMethod.findById("789", {
        include: [
          // @ts-expect-error: Cannot include association using a key not defined on the model
          { association: "nonExistent" }
        ]
      });
    });

    it("(BelongsTo HasMany) - results of a findById with include will not allow any types which were not included in the query", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });

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

    it("(BelongsTo) - included relationships should not include any of their associations", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });

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
  });
});
