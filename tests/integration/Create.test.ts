import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { Order } from "./mockModels";
import { v4 as uuidv4 } from "uuid";
jest.mock("uuid");

const mockTransactWriteCommand = jest.mocked(TransactWriteCommand);
const mockSend = jest.fn();
const mockedUuidv4 = jest.mocked(uuidv4);

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
          })
        };
      })
    },

    TransactWriteCommand: jest.fn().mockImplementationOnce(() => {
      return { name: "TransactWriteCommand" };
    })
  };
});

// TODO add types test
describe("Create", () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("will create an entity that BelongsTo an entity who HasMany of it (checks parents exists and creates BelongsToLinks)", async () => {
    expect.assertions(3);

    jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
    mockedUuidv4
      .mockReturnValueOnce("uuid1")
      .mockReturnValueOnce("uuid2")
      .mockReturnValueOnce("uuid3");

    const order = await Order.create({
      customerId: "Customer#123",
      paymentMethodId: "PaymentMethodId#456",
      orderDate: new Date("2024-01-01")
    });

    expect(order).toEqual({
      createdAt: new Date("2023-10-16T03:31:35.918Z"),
      customerId: "Customer#123",
      id: "uuid1",
      orderDate: new Date("2024-01-01T00:00:00.000Z"),
      paymentMethodId: "PaymentMethodId#456",
      pk: "Order#uuid1",
      sk: "Order",
      type: "Order",
      updatedAt: new Date("2023-10-16T03:31:35.918Z")
    });
    // TODO should pass
    // expect(order).toBeInstanceOf(Order);
    expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Put: {
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "Order#uuid1",
                  SK: "Order",
                  Type: "Order",
                  Id: "uuid1",
                  CustomerId: "Customer#123",
                  PaymentMethodId: "PaymentMethodId#456",
                  OrderDate: "2024-01-01T00:00:00.000Z",
                  CreatedAt: "2023-10-16T03:31:35.918Z",
                  UpdatedAt: "2023-10-16T03:31:35.918Z"
                },
                TableName: "mock-table"
              }
            },
            {
              ConditionCheck: {
                ConditionExpression: "attribute_exists(PK)",
                Key: { PK: "Customer#Customer#123", SK: "Customer" },
                TableName: "mock-table"
              }
            },
            {
              Put: {
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "Customer#Customer#123",
                  SK: "Order#uuid1",
                  Id: "uuid2",
                  ForeignEntityType: "Order",
                  Type: "BelongsToLink",
                  CreatedAt: "2023-10-16T03:31:35.918Z",
                  UpdatedAt: "2023-10-16T03:31:35.918Z"
                },
                TableName: "mock-table"
              }
            },
            {
              ConditionCheck: {
                ConditionExpression: "attribute_exists(PK)",
                Key: {
                  PK: "PaymentMethod#PaymentMethodId#456",
                  SK: "PaymentMethod"
                },
                TableName: "mock-table"
              }
            },
            {
              Put: {
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "PaymentMethod#PaymentMethodId#456",
                  SK: "Order#uuid1",
                  Id: "uuid3",
                  ForeignEntityType: "Order",
                  Type: "BelongsToLink",
                  CreatedAt: "2023-10-16T03:31:35.918Z",
                  UpdatedAt: "2023-10-16T03:31:35.918Z"
                },
                TableName: "mock-table"
              }
            }
          ]
        }
      ]
    ]);
  });
});
