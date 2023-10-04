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

import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand
} from "@aws-sdk/lib-dynamodb";
import { BelongsToLink } from "../src/relationships";
jest.mock("@aws-sdk/client-dynamodb");

// TODO types tests should cause failures when they break. Right now it just makes a red squiggly

const mockedDynamoDBClient = jest.mocked(DynamoDBClient);
const mockedDynamoDBDocumentClient = jest.mocked(DynamoDBDocumentClient);
const mockedGetCommand = jest.mocked(GetCommand);
const mockedQueryCommand = jest.mocked(QueryCommand);

const mockGet = jest.fn();
const mockQuery = jest.fn();

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

  public mockCustomInstanceMethod(): string {
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
        Items: [paymentMethodRes, ...orderLinks]
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

      it("(BelongsTo) - results of a findById with include will not allow any types which were not included in the query", async () => {
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
          console.log(paymentMethod.paymentMethodProviderId);
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
          console.log(paymentMethod.paymentMethodProviderId);
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
          console.log(paymentMethod.paymentMethodProviderId);
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

  describe("query", () => {
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
            updatedAt: "2022-09-15T04:26:31.148Z"
          },
          {
            id: "001",
            type: "BelongsToLink",
            createdAt: "2021-10-15T09:31:15.148Z",
            updatedAt: "2022-10-15T09:31:15.148Z"
          },
          {
            id: "003",
            type: "BelongsToLink",
            createdAt: "2021-11-01T23:31:21.148Z",
            updatedAt: "2022-11-01T23:31:21.148Z"
          },
          {
            id: "004",
            type: "BelongsToLink",
            createdAt: "2021-09-01T23:31:21.148Z",
            updatedAt: "2022-09-01T23:31:21.148Z"
          },
          {
            id: "007",
            type: "BelongsToLink",
            createdAt: "2021-10-01T12:31:21.148Z",
            updatedAt: "2022-10-01T12:31:21.148Z"
          },
          {
            id: "008",
            type: "BelongsToLink",
            createdAt: "2021-11-21T12:31:21.148Z",
            updatedAt: "2022-11-21T12:31:21.148Z"
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
            id: "001",
            type: "BelongsToLink",
            createdAt: "2021-10-15T09:31:15.148Z",
            updatedAt: "2022-10-15T09:31:15.148Z"
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
            id: "001",
            type: "BelongsToLink",
            createdAt: "2021-10-15T09:31:15.148Z",
            updatedAt: "2022-10-15T09:31:15.148Z"
          },
          {
            id: "003",
            type: "BelongsToLink",
            createdAt: "2021-11-01T23:31:21.148Z",
            updatedAt: "2022-11-01T23:31:21.148Z"
          },
          {
            id: "004",
            type: "BelongsToLink",
            createdAt: "2021-09-01T23:31:21.148Z",
            updatedAt: "2022-09-01T23:31:21.148Z"
          }
        ]);
        result.forEach(res => expect(res).toBeInstanceOf(BelongsToLink));

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
            id: "008",
            type: "BelongsToLink",
            createdAt: "2021-11-21T12:31:21.148Z",
            updatedAt: "2022-11-21T12:31:21.148Z"
          }
        ]);

        result.forEach(res => expect(res).toBeInstanceOf(BelongsToLink));

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
            updatedAt: "2022-09-15T04:26:31.148Z"
          }
        ]);
        result.forEach((res, index) => expect(res).toBeInstanceOf(Customer));

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
            id: "001",
            type: "BelongsToLink",
            createdAt: "2021-10-15T09:31:15.148Z",
            updatedAt: "2022-10-15T09:31:15.148Z"
          },
          {
            id: "003",
            type: "BelongsToLink",
            createdAt: "2021-11-01T23:31:21.148Z",
            updatedAt: "2022-11-01T23:31:21.148Z"
          },
          {
            id: "004",
            type: "BelongsToLink",
            createdAt: "2021-09-01T23:31:21.148Z",
            updatedAt: "2022-09-01T23:31:21.148Z"
          }
        ]);
        result.forEach(res => expect(res).toBeInstanceOf(BelongsToLink));

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
            updatedAt: "2022-09-15T04:26:31.148Z"
          },
          {
            id: "001",
            type: "BelongsToLink",
            createdAt: "2021-10-15T09:31:15.148Z",
            updatedAt: "2022-10-15T09:31:15.148Z"
          },
          {
            id: "003",
            type: "BelongsToLink",
            createdAt: "2021-11-01T23:31:21.148Z",
            updatedAt: "2022-11-01T23:31:21.148Z"
          },
          {
            id: "004",
            type: "BelongsToLink",
            createdAt: "2021-09-01T23:31:21.148Z",
            updatedAt: "2022-09-01T23:31:21.148Z"
          },
          {
            id: "007",
            type: "BelongsToLink",
            createdAt: "2021-10-01T12:31:21.148Z",
            updatedAt: "2022-10-01T12:31:21.148Z"
          },
          {
            id: "008",
            type: "BelongsToLink",
            createdAt: "2021-11-21T12:31:21.148Z",
            updatedAt: "2022-11-21T12:31:21.148Z"
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
            id: "001",
            type: "BelongsToLink",
            createdAt: "2021-10-15T09:31:15.148Z",
            updatedAt: "2022-10-15T09:31:15.148Z"
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
            id: "001",
            type: "BelongsToLink",
            createdAt: "2021-10-15T09:31:15.148Z",
            updatedAt: "2022-10-15T09:31:15.148Z"
          },
          {
            id: "003",
            type: "BelongsToLink",
            createdAt: "2021-11-01T23:31:21.148Z",
            updatedAt: "2022-11-01T23:31:21.148Z"
          },
          {
            id: "004",
            type: "BelongsToLink",
            createdAt: "2021-09-01T23:31:21.148Z",
            updatedAt: "2022-09-01T23:31:21.148Z"
          }
        ]);
        result.forEach(res => expect(res).toBeInstanceOf(BelongsToLink));

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
            id: "008",
            type: "BelongsToLink",
            createdAt: "2021-11-21T12:31:21.148Z",
            updatedAt: "2022-11-21T12:31:21.148Z"
          }
        ]);

        result.forEach(res => expect(res).toBeInstanceOf(BelongsToLink));

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
            updatedAt: "2022-09-15T04:26:31.148Z"
          }
        ]);
        result.forEach((res, index) => expect(res).toBeInstanceOf(Customer));

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
});
