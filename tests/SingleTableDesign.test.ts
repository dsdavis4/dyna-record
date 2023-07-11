import SingleTableDesign from "../src";
import {
  Table,
  Entity,
  Attribute,
  HasMany,
  HasOne,
  BelongsTo
} from "../src/decorators";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
jest.mock("@aws-sdk/client-dynamodb");

import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  QueryCommandInput
} from "@aws-sdk/lib-dynamodb";

const mockedDynamoDBClient = jest.mocked(DynamoDBClient);
const mockedDynamoDBDocumentClient = jest.mocked(DynamoDBDocumentClient);
const mockedGetCommand = jest.mocked(GetCommand);
const mockedQueryCommand = jest.mocked(QueryCommand);

const mockGet = jest.fn();
const mockQuery = jest.fn();
// const mockSend = jest.fn().mockImplementation(command => {
//   if (command.name == "GetCommand") {
//     return Promise.resolve(mockGet());
//   }
//   if (command.name == "QueryCommand") {
//     return Promise.resolve(mockQuery());
//   }
// });

const mockSend = jest.fn();

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
          send: jest.fn().mockImplementation(command => {
            mockSend(command);
            if (command.name == "GetCommand") {
              return Promise.resolve(mockGet());
            }
            if (command.name == "QueryCommand") {
              return Promise.resolve(mockQuery());
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
    })
  };
});

@Table({ name: "mock-table", primaryKey: "PK", sortKey: "SK", delimiter: "#" })
abstract class MockTable extends SingleTableDesign {
  @Attribute({ alias: "PK" })
  public pk: string;

  @Attribute({ alias: "SK" })
  public sk: string;
}

@Entity
class Order extends MockTable {
  @Attribute({ alias: "Id" })
  public id: string;

  @Attribute({ alias: "CustomerId" })
  public customerId: string;

  @Attribute({ alias: "PaymentMethodId" })
  public paymentMethodId: string;

  @Attribute({ alias: "OrderDate" })
  public orderDate: Date;

  @Attribute({ alias: "UpdatedAt" })
  public updatedAt: Date;

  @BelongsTo(() => Customer, { foreignKey: "customerId" })
  public customer: Customer;

  @BelongsTo(() => PaymentMethod, { foreignKey: "paymentMethodId" })
  public paymentMethod: PaymentMethod;
}

@Entity
class PaymentMethodProvider extends MockTable {
  @Attribute({ alias: "Id" })
  public id: string;

  @Attribute({ alias: "Name" })
  public name: string;
}

@Entity
class PaymentMethod extends MockTable {
  @Attribute({ alias: "Id" })
  public id: string;

  @Attribute({ alias: "LastFour" })
  public lastFour: string;

  @Attribute({ alias: "CustomerId" })
  public customerId: string;

  @Attribute({ alias: "PaymentMethodProviderId" })
  public paymentMethodProviderId: string;

  @Attribute({ alias: "UpdatedAt" })
  public updatedAt: Date;

  @BelongsTo(() => Customer, { foreignKey: "customerId" })
  public customer: Customer;

  @HasMany(() => Order, { targetKey: "paymentMethodId" })
  public orders: Order[];

  @HasOne(() => PaymentMethodProvider, {
    foreignKey: "paymentMethodProviderId"
  })
  public paymentMethodProvider: PaymentMethodProvider;
}

@Entity
class Customer extends MockTable {
  @Attribute({ alias: "Id" })
  public id: string;

  @Attribute({ alias: "Name" })
  public name: string;

  @Attribute({ alias: "Address" })
  public address: string;

  @Attribute({ alias: "UpdatedAt" })
  public updatedAt: Date;

  @HasMany(() => Order, { targetKey: "customerId" })
  public orders: Order[];

  @HasMany(() => PaymentMethod, { targetKey: "customerId" })
  public paymentMethods: PaymentMethod[];

  public mockCustomInstanceMethod() {
    return `${this.name}-${this.id}`;
  }
}

describe("SingleTableDesign", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("findById", () => {
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
          SK: "Order#111",
          Id: "001",
          Type: "BelongsToLink",
          UpdatedAt: "2022-10-15T09:31:15.148Z",
          SomeAttr: "attribute that is not modeled"
        },
        {
          PK: "Customer#123",
          SK: "Order#112",
          Id: "003",
          Type: "BelongsToLink",
          UpdatedAt: "2022-11-01T23:31:21.148Z",
          SomeAttr: "attribute that is not modeled"
        },
        {
          PK: "Customer#123",
          SK: "Order#113",
          Id: "004",
          Type: "BelongsToLink",
          UpdatedAt: "2022-09-01T23:31:21.148Z",
          SomeAttr: "attribute that is not modeled"
        }
      ];

      const paymentMethodLinks = [
        {
          PK: "Customer#123",
          SK: "PaymentMethod#116",
          Id: "007",
          Type: "BelongsToLink",
          UpdatedAt: "2022-10-01T12:31:21.148Z",
          SomeAttr: "attribute that is not modeled"
        },
        {
          PK: "Customer#123",
          SK: "PaymentMethod#117",
          Id: "008",
          Type: "BelongsToLink",
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
          // TODO As of now all belongs to links are returned even if not queried...
          // See branch/Pr "start_fixing_query_returning_all_links" for a potential solution
          {
            PK: "Customer#123",
            SK: "NotIncludedModel#114",
            Id: "005",
            Type: "BelongsToLink",
            UpdatedAt: "2023-01-01T12:31:21.148Z",
            SomeAttr: "attribute that is not modeled"
          },
          {
            PK: "Customer#123",
            SK: "NotIncludedModel#115",
            Id: "006",
            Type: "BelongsToLink",
            UpdatedAt: "2023-02-01T12:31:21.148Z",
            SomeAttr: "attribute that is not modeled"
          },
          ...paymentMethodLinks
        ]
      });

      orderLinks.forEach(link => {
        mockGet.mockResolvedValueOnce({
          Item: {
            PK: link.SK,
            SK: link.SK.split("#")[0],
            Id: link.SK.split("#")[1],
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
            PK: link.SK,
            SK: link.SK.split("#")[0],
            Id: link.SK.split("#")[1],
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
      expect(result?.orders.every(order => order instanceof Order)).toEqual(
        true
      );
      expect(
        result?.paymentMethods.every(
          paymentMethod => paymentMethod instanceof PaymentMethod
        )
      ).toEqual(true);
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
          },
          // TODO As of now all belongs to links are returned even if not queried...
          // See branch/Pr "start_fixing_query_returning_all_links" for a potential solution
          {
            PK: "Customer#123",
            SK: "NotIncludedModel#114",
            Id: "005",
            Type: "BelongsToLink",
            UpdatedAt: "2023-01-01T12:31:21.148Z",
            SomeAttr: "attribute that is not modeled"
          },
          {
            PK: "Customer#123",
            SK: "NotIncludedModel#115",
            Id: "006",
            Type: "BelongsToLink",
            UpdatedAt: "2023-02-01T12:31:21.148Z",
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

    it("will find an entity with included BelongsTo associations", async () => {
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

    it("will find an entity with included HasOne associations", async () => {
      expect.assertions(6);

      const paymentMethodRes = {
        PK: "PaymentMethod#789",
        SK: "PaymentMethod",
        Id: "789",
        LastFour: "0000",
        CustomerId: "123",
        UpdatedAt: "2023-02-15T08:31:15.148Z",
        PaymentMethodProviderId: "123"
      };

      const paymentMethodProviderRes = {
        PK: "PaymentMethodProvider#123",
        SK: "PaymentMethodProvider",
        Id: "123",
        Name: "Vida"
      };

      mockQuery.mockResolvedValueOnce({ Items: [paymentMethodRes] });
      mockGet.mockResolvedValueOnce({ Item: paymentMethodProviderRes });

      const result = await PaymentMethod.findById("789", {
        include: [{ association: "paymentMethodProvider" }]
      });

      expect(result).toEqual({
        customer: undefined,
        customerId: "123",
        id: "789",
        lastFour: "0000",
        orders: undefined,
        paymentMethodProviderId: "123",
        pk: "PaymentMethod#789",
        sk: "PaymentMethod",
        type: undefined,
        updatedAt: "2023-02-15T08:31:15.148Z",
        paymentMethodProvider: {
          id: "123",
          name: "Vida",
          pk: "PaymentMethodProvider#123",
          sk: "PaymentMethodProvider",
          type: undefined
        }
      });
      expect(result).toBeInstanceOf(PaymentMethod);
      expect(result?.paymentMethodProvider).toBeInstanceOf(
        PaymentMethodProvider
      );
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            FilterExpression: "#Type = :Type1",
            KeyConditionExpression: "#PK = :PK2",
            ExpressionAttributeNames: { "#Type": "Type", "#PK": "PK" },
            ExpressionAttributeValues: {
              ":PK2": "PaymentMethod#789",
              ":Type1": "PaymentMethod"
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
          SK: "Order#111",
          Id: "001",
          Type: "BelongsToLink",
          UpdatedAt: "2022-10-15T09:31:15.148Z",
          SomeAttr: "attribute that is not modeled"
        },
        {
          PK: "PaymentMethod#789",
          SK: "Order#112",
          Id: "003",
          Type: "BelongsToLink",
          UpdatedAt: "2022-11-01T23:31:21.148Z",
          SomeAttr: "attribute that is not modeled"
        },
        {
          PK: "PaymentMethod#789",
          SK: "Order#113",
          Id: "004",
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
        Items: [
          paymentMethodRes,
          ...orderLinks,
          // TODO As of now all belongs to links are returned even if not queried...
          // See branch/Pr "start_fixing_query_returning_all_links" for a potential solution
          {
            PK: "Customer#123",
            SK: "NotIncludedModel#114",
            Id: "005",
            Type: "BelongsToLink",
            UpdatedAt: "2023-01-01T12:31:21.148Z",
            SomeAttr: "attribute that is not modeled"
          },
          {
            PK: "Customer#123",
            SK: "NotIncludedModel#115",
            Id: "006",
            Type: "BelongsToLink",
            UpdatedAt: "2023-02-01T12:31:21.148Z",
            SomeAttr: "attribute that is not modeled"
          }
        ]
      });

      mockGet.mockResolvedValueOnce({ Item: customerRes });
      orderLinks.forEach(link => {
        mockGet.mockResolvedValueOnce({
          Item: {
            PK: link.SK,
            SK: link.SK.split("#")[0],
            Id: link.SK.split("#")[1],
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
      expect(result?.orders.every(order => order instanceof Order)).toEqual(
        true
      );
      expect(result?.customer).toBeInstanceOf(Customer);
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            FilterExpression: "#Type = :Type1 OR #Type = :Type2",
            KeyConditionExpression: "#PK = :PK3",
            ExpressionAttributeNames: { "#Type": "Type", "#PK": "PK" },
            ExpressionAttributeValues: {
              ":PK3": "PaymentMethod#789",
              ":Type1": "PaymentMethod",
              ":Type2": "BelongsToLink"
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
  });
});
