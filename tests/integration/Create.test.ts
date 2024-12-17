import {
  TransactGetCommand,
  TransactWriteCommand
} from "@aws-sdk/lib-dynamodb";
import {
  ContactInformation,
  Customer,
  Grade,
  Home,
  MockTable,
  MyClassWithAllAttributeTypes,
  Order,
  PaymentMethod,
  PaymentMethodProvider,
  Person,
  Teacher,
  User
} from "./mockModels";
import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { ConditionalCheckFailedError } from "../../src/dynamo-utils";
import {
  BelongsTo,
  Entity,
  ForeignKeyAttribute,
  HasOne,
  StringAttribute
} from "../../src/decorators";
import type { ForeignKey, NullableForeignKey } from "../../src/types";
import { ValidationError } from "../../src";
import DynaRecord from "../../src/DynaRecord";

jest.mock("uuid");

const mockTransactGetItems = jest.fn();
const mockTransactWriteCommand = jest.mocked(TransactWriteCommand);
const mockTransactGetCommand = jest.mocked(TransactGetCommand);

const mockSend = jest.fn();
const mockedUuidv4 = jest.mocked(uuidv4);

jest.mock("@aws-sdk/client-dynamodb", () => {
  return {
    TransactionCanceledException: jest.fn().mockImplementation((...params) => {
      const obj = Object.create(TransactionCanceledException.prototype);
      Object.assign(obj, ...params);
      return obj;
    }),
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
            if (command.name === "TransactWriteCommand") {
              return await Promise.resolve(
                "TransactWriteCommand-mock-response"
              );
            }
            if (command.name === "TransactGetCommand") {
              return await Promise.resolve(mockTransactGetItems());
            }
          })
        };
      })
    },

    TransactWriteCommand: jest.fn().mockImplementation(() => {
      return { name: "TransactWriteCommand" };
    }),
    TransactGetCommand: jest.fn().mockImplementation(() => {
      return { name: "TransactGetCommand" };
    })
  };
});

// TODO move these types to a test helper
type CapitalizeFirst<T extends string> = T extends `${infer First}${infer Rest}`
  ? `${Uppercase<First>}${Rest}`
  : T;

/**
 * Represents an entity a table item for MockTable classes which use pascal cases aliases
 * Utility to assist with making test mocks
 * Mapping rules:
 * - Exclude attributes that are Functions, DynaRecord, or DynaRecord[]
 * - Map "pk" to "PK" and "sk" to "SK" (string)
 * - Map ForeignKey to string
 * - Map NullableForeignKey to string | undefined
 * - Convert other keys to PascalCase
 * - Map Date attributes to ISO strings
 */
type MockTableTableItem<T extends MockTable> = {
  // eslint-disable-next-line @typescript-eslint/ban-types
  [K in keyof T as T[K] extends Function | DynaRecord | DynaRecord[]
    ? never
    : K extends "pk"
      ? "PK"
      : K extends "sk"
        ? "SK"
        : CapitalizeFirst<string & K>]: T[K] extends ForeignKey
    ? string
    : T[K] extends NullableForeignKey
      ? string | undefined
      : T[K] extends Date
        ? string
        : K extends "pk" | "sk"
          ? string
          : T[K];
};

@Entity
class MyModelNullableAttribute extends MockTable {
  @StringAttribute({ alias: "MyAttribute", nullable: true })
  public myAttribute?: string;
}

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

  it("will create an entity and without relationship transactions if none are needed", async () => {
    expect.assertions(4);

    jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

    mockedUuidv4.mockReturnValueOnce("uuid1");

    const home = await Home.create({ mlsNum: "123" });

    expect(home).toEqual({
      pk: "Home#uuid1",
      sk: "Home",
      type: "Home",
      id: "uuid1",
      mlsNum: "123",
      createdAt: new Date("2023-10-16T03:31:35.918Z"),
      updatedAt: new Date("2023-10-16T03:31:35.918Z")
    });
    expect(home).toBeInstanceOf(Home);
    expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Put: {
                TableName: "mock-table",
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "Home#uuid1",
                  SK: "Home",
                  Type: "Home",
                  Id: "uuid1",
                  "MLS#": "123",
                  CreatedAt: "2023-10-16T03:31:35.918Z",
                  UpdatedAt: "2023-10-16T03:31:35.918Z"
                }
              }
            }
          ]
        }
      ]
    ]);
  });

  it("will create an entity that has a custom id field", async () => {
    expect.assertions(4);

    jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

    const user = await User.create({
      name: "test-name",
      email: "email@email.com"
    });

    expect(user).toEqual({
      pk: "User#email@email.com",
      sk: "User",
      type: "User",
      id: "email@email.com",
      email: "email@email.com",
      name: "test-name",
      createdAt: new Date("2023-10-16T03:31:35.918Z"),
      updatedAt: new Date("2023-10-16T03:31:35.918Z")
    });
    expect(user).toBeInstanceOf(User);
    expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Put: {
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "User#email@email.com",
                  SK: "User",
                  Type: "User",
                  Id: "email@email.com",
                  Email: "email@email.com",
                  Name: "test-name",
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

  it("can create an entity with all attribute types", async () => {
    expect.assertions(4);

    jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

    mockedUuidv4.mockReturnValueOnce("uuid1");

    const instance = await MyClassWithAllAttributeTypes.create({
      stringAttribute: "1",
      nullableStringAttribute: "2",
      dateAttribute: new Date(),
      nullableDateAttribute: new Date(),
      foreignKeyAttribute: "1111",
      nullableForeignKeyAttribute: "22222",
      boolAttribute: true,
      nullableBoolAttribute: false,
      numberAttribute: 9,
      nullableNumberAttribute: 10,
      enumAttribute: "val-1",
      nullableEnumAttribute: "val-2"
    });

    expect(instance).toEqual({
      pk: "MyClassWithAllAttributeTypes#uuid1",
      sk: "MyClassWithAllAttributeTypes",
      type: "MyClassWithAllAttributeTypes",
      id: "uuid1",
      stringAttribute: "1",
      nullableStringAttribute: "2",
      dateAttribute: new Date(),
      nullableDateAttribute: new Date(),
      foreignKeyAttribute: "1111",
      nullableForeignKeyAttribute: "22222",
      boolAttribute: true,
      nullableBoolAttribute: false,
      numberAttribute: 9,
      nullableNumberAttribute: 10,
      enumAttribute: "val-1",
      nullableEnumAttribute: "val-2",
      createdAt: new Date("2023-10-16T03:31:35.918Z"),
      updatedAt: new Date("2023-10-16T03:31:35.918Z")
    });
    expect(instance).toBeInstanceOf(MyClassWithAllAttributeTypes);
    expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Put: {
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  CreatedAt: "2023-10-16T03:31:35.918Z",
                  Id: "uuid1",
                  PK: "MyClassWithAllAttributeTypes#uuid1",
                  SK: "MyClassWithAllAttributeTypes",
                  Type: "MyClassWithAllAttributeTypes",
                  UpdatedAt: "2023-10-16T03:31:35.918Z",
                  boolAttribute: true,
                  dateAttribute: "2023-10-16T03:31:35.918Z",
                  enumAttribute: "val-1",
                  foreignKeyAttribute: "1111",
                  nullableBoolAttribute: false,
                  nullableDateAttribute: "2023-10-16T03:31:35.918Z",
                  nullableEnumAttribute: "val-2",
                  nullableForeignKeyAttribute: "22222",
                  nullableNumberAttribute: 10,
                  nullableStringAttribute: "2",
                  numberAttribute: 9,
                  stringAttribute: "1"
                },
                TableName: "mock-table"
              }
            }
          ]
        }
      ]
    ]);
  });

  it("has runtime schema validation to ensure that reserved keys are not set on create. They will be omitted from create", async () => {
    expect.assertions(4);

    jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

    mockedUuidv4.mockReturnValueOnce("uuid1");

    const home = await Home.create({
      // Begin reserved keys
      pk: "2",
      sk: "3",
      id: "4",
      type: "bad type",
      updatedAt: new Date(),
      createdAt: new Date(),
      update: () => {},
      // End reserved keys
      mlsNum: "123"
    } as any); // Use any to force bad type and allow runtime checks to be tested

    expect(home).toEqual({
      pk: "Home#uuid1",
      sk: "Home",
      type: "Home",
      id: "uuid1",
      mlsNum: "123",
      createdAt: new Date("2023-10-16T03:31:35.918Z"),
      updatedAt: new Date("2023-10-16T03:31:35.918Z")
    });
    expect(home).toBeInstanceOf(Home);
    expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Put: {
                TableName: "mock-table",
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "Home#uuid1",
                  SK: "Home",
                  Type: "Home",
                  Id: "uuid1",
                  "MLS#": "123",
                  CreatedAt: "2023-10-16T03:31:35.918Z",
                  UpdatedAt: "2023-10-16T03:31:35.918Z"
                }
              }
            }
          ]
        }
      ]
    ]);
  });

  it("will error if any required attributes are missing", async () => {
    expect.assertions(5);

    try {
      await MyClassWithAllAttributeTypes.create({} as any);
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual("Validation errors");
      expect(e.cause).toEqual([
        {
          code: "invalid_type",
          expected: "string",
          message: "Required",
          path: ["stringAttribute"],
          received: "undefined"
        },
        {
          code: "invalid_type",
          expected: "date",
          message: "Required",
          path: ["dateAttribute"],
          received: "undefined"
        },
        {
          code: "invalid_type",
          expected: "boolean",
          message: "Required",
          path: ["boolAttribute"],
          received: "undefined"
        },
        {
          code: "invalid_type",
          expected: "number",
          message: "Required",
          path: ["numberAttribute"],
          received: "undefined"
        },
        {
          code: "invalid_type",
          expected: "string",
          message: "Required",
          path: ["foreignKeyAttribute"],
          received: "undefined"
        },
        {
          code: "invalid_type",
          expected: "'val-1' | 'val-2'",
          message: "Required",
          path: ["enumAttribute"],
          received: "undefined"
        }
      ]);
      expect(mockSend.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    }
  });

  it("will error if any required attributes are the wrong type", async () => {
    expect.assertions(5);

    try {
      await MyClassWithAllAttributeTypes.create({
        stringAttribute: 1,
        nullableStringAttribute: 2,
        dateAttribute: 3,
        nullableDateAttribute: 4,
        foreignKeyAttribute: 5,
        nullableForeignKeyAttribute: 6,
        boolAttribute: 7,
        nullableBoolAttribute: 8,
        numberAttribute: "9",
        nullableNumberAttribute: "10",
        enumAttribute: "val-3",
        nullableEnumAttribute: "val-4"
      } as any);
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual("Validation errors");
      expect(e.cause).toEqual([
        {
          code: "invalid_type",
          expected: "string",
          message: "Expected string, received number",
          path: ["stringAttribute"],
          received: "number"
        },
        {
          code: "invalid_type",
          expected: "string",
          message: "Expected string, received number",
          path: ["nullableStringAttribute"],
          received: "number"
        },
        {
          code: "invalid_type",
          expected: "date",
          message: "Expected date, received number",
          path: ["dateAttribute"],
          received: "number"
        },
        {
          code: "invalid_type",
          expected: "date",
          message: "Expected date, received number",
          path: ["nullableDateAttribute"],
          received: "number"
        },
        {
          code: "invalid_type",
          expected: "boolean",
          message: "Expected boolean, received number",
          path: ["boolAttribute"],
          received: "number"
        },
        {
          code: "invalid_type",
          expected: "boolean",
          message: "Expected boolean, received number",
          path: ["nullableBoolAttribute"],
          received: "number"
        },
        {
          code: "invalid_type",
          expected: "number",
          message: "Expected number, received string",
          path: ["numberAttribute"],
          received: "string"
        },
        {
          code: "invalid_type",
          expected: "number",
          message: "Expected number, received string",
          path: ["nullableNumberAttribute"],
          received: "string"
        },
        {
          code: "invalid_type",
          expected: "string",
          message: "Expected string, received number",
          path: ["foreignKeyAttribute"],
          received: "number"
        },
        {
          code: "invalid_type",
          expected: "string",
          message: "Expected string, received number",
          path: ["nullableForeignKeyAttribute"],
          received: "number"
        },
        {
          code: "invalid_enum_value",
          message:
            "Invalid enum value. Expected 'val-1' | 'val-2', received 'val-3'",
          options: ["val-1", "val-2"],
          path: ["enumAttribute"],
          received: "val-3"
        },
        {
          code: "invalid_enum_value",
          message:
            "Invalid enum value. Expected 'val-1' | 'val-2', received 'val-4'",
          options: ["val-1", "val-2"],
          path: ["nullableEnumAttribute"],
          received: "val-4"
        }
      ]);
      expect(mockSend.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    }
  });

  it("will create an entity that BelongsTo an entity who HasMany of it (checks parents exists and denormalizes links)", async () => {
    expect.assertions(5);

    jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
    mockedUuidv4.mockReturnValueOnce("uuid1");

    const customer: MockTableTableItem<Customer> = {
      PK: "Customer#123",
      SK: "Customer",
      Id: "123",
      Type: "Customer",
      Name: "Mock Customer",
      Address: "11 Some St",
      CreatedAt: "2024-01-01T00:00:00.000Z",
      UpdatedAt: "2024-01-02T00:00:00.000Z"
    };

    const paymentMethod: MockTableTableItem<PaymentMethod> = {
      PK: "PaymentMethod#456",
      SK: "PaymentMethod",
      Id: "456",
      Type: "PaymentMethod",
      LastFour: "1234",
      CustomerId: customer.Id,
      CreatedAt: "2024-02-01T00:00:00.000Z",
      UpdatedAt: "2024-02-02T00:00:00.000Z"
    };

    mockTransactGetItems.mockResolvedValueOnce({
      Responses: [customer, paymentMethod]
    });

    const order = await Order.create({
      customerId: "123",
      paymentMethodId: "456",
      orderDate: new Date("2024-01-01")
    });

    expect(order).toEqual({
      createdAt: new Date("2023-10-16T03:31:35.918Z"),
      customerId: "123",
      id: "uuid1",
      orderDate: new Date("2024-01-01T00:00:00.000Z"),
      paymentMethodId: "456",
      pk: "Order#uuid1",
      sk: "Order",
      type: "Order",
      updatedAt: new Date("2023-10-16T03:31:35.918Z")
    });
    expect(order).toBeInstanceOf(Order);
    expect(mockSend.mock.calls).toEqual([
      [{ name: "TransactGetCommand" }],
      [{ name: "TransactWriteCommand" }]
    ]);
    expect(mockTransactGetCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Get: {
                TableName: "mock-table",
                Key: { PK: "Customer#123", SK: "Customer" }
              }
            },
            {
              Get: {
                TableName: "mock-table",
                Key: { PK: "PaymentMethod#456", SK: "PaymentMethod" }
              }
            }
          ]
        }
      ]
    ]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              // Put the new Order
              Put: {
                TableName: "mock-table",
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "Order#uuid1",
                  SK: "Order",
                  Id: "uuid1",
                  Type: "Order",
                  CustomerId: "123",
                  OrderDate: "2024-01-01T00:00:00.000Z",
                  PaymentMethodId: "456",
                  CreatedAt: "2023-10-16T03:31:35.918Z",
                  UpdatedAt: "2023-10-16T03:31:35.918Z"
                }
              }
            },
            // Check that the associated Customer exists
            {
              ConditionCheck: {
                ConditionExpression: "attribute_exists(PK)",
                Key: { PK: "Customer#123", SK: "Customer" },
                TableName: "mock-table"
              }
            },
            // Denormalize the Order to the Customer partition
            {
              Put: {
                TableName: "mock-table",
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "Customer#123",
                  SK: "Order#uuid1",
                  Id: "uuid1",
                  Type: "Order",
                  CustomerId: "123",
                  OrderDate: "2024-01-01T00:00:00.000Z",
                  PaymentMethodId: "456",
                  CreatedAt: "2023-10-16T03:31:35.918Z",
                  UpdatedAt: "2023-10-16T03:31:35.918Z"
                }
              }
            },
            // Check that the associated PaymentMethod exists
            {
              ConditionCheck: {
                ConditionExpression: "attribute_exists(PK)",
                Key: { PK: "PaymentMethod#456", SK: "PaymentMethod" },
                TableName: "mock-table"
              }
            },
            // Denormalize the Order to the PaymentMethod partition
            {
              Put: {
                TableName: "mock-table",
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "PaymentMethod#456",
                  SK: "Order#uuid1",
                  Id: "uuid1",
                  Type: "Order",
                  CustomerId: "123",
                  OrderDate: "2024-01-01T00:00:00.000Z",
                  PaymentMethodId: "456",
                  CreatedAt: "2023-10-16T03:31:35.918Z",
                  UpdatedAt: "2023-10-16T03:31:35.918Z"
                }
              }
            }
          ]
        }
      ]
    ]);
  });

  it("with a custom id field - will create an entity that BelongsTo an entity who HasMany of it (checks parents exists and creates BelongsToLinks)", async () => {
    expect.assertions(4);

    jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
    mockedUuidv4.mockReturnValueOnce("uuid1");

    const user = await User.create({
      name: "test-name",
      email: "email@email.com",
      orgId: "123"
    });

    expect(user).toEqual({
      pk: "User#email@email.com",
      sk: "User",
      type: "User",
      id: "email@email.com",
      email: "email@email.com",
      name: "test-name",
      orgId: "123",
      createdAt: new Date("2023-10-16T03:31:35.918Z"),
      updatedAt: new Date("2023-10-16T03:31:35.918Z")
    });
    expect(user).toBeInstanceOf(User);
    expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Put: {
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "User#email@email.com",
                  SK: "User",
                  Type: "User",
                  Id: "email@email.com",
                  Email: "email@email.com",
                  Name: "test-name",
                  OrgId: "123",
                  CreatedAt: "2023-10-16T03:31:35.918Z",
                  UpdatedAt: "2023-10-16T03:31:35.918Z"
                },
                TableName: "mock-table"
              }
            },
            {
              ConditionCheck: {
                ConditionExpression: "attribute_exists(PK)",
                Key: { PK: "Organization#123", SK: "Organization" },
                TableName: "mock-table"
              }
            },
            {
              Put: {
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "Organization#123",
                  SK: "User#email@email.com",
                  Type: "BelongsToLink",
                  Id: "uuid1",
                  ForeignEntityType: "User",
                  ForeignKey: "email@email.com",
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

  describe("entity BelongsTo an entity who HasOne of it", () => {
    it("will create the entity if the parent is not already associated to an entity of this type", async () => {
      expect.assertions(4);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedUuidv4.mockReturnValueOnce("uuid1").mockReturnValueOnce("uuid2");

      const paymentMethodProvider = await PaymentMethodProvider.create({
        name: "provider-1",
        paymentMethodId: "123"
      });

      expect(paymentMethodProvider).toEqual({
        pk: "PaymentMethodProvider#uuid1",
        sk: "PaymentMethodProvider",
        id: "uuid1",
        name: "provider-1",
        createdAt: new Date("2023-10-16T03:31:35.918Z"),
        paymentMethod: undefined,
        paymentMethodId: "123",
        type: "PaymentMethodProvider",
        updatedAt: new Date("2023-10-16T03:31:35.918Z")
      });
      expect(paymentMethodProvider).toBeInstanceOf(PaymentMethodProvider);
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              // Create the PaymentMethodProvider if it does not exist
              {
                Put: {
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: {
                    PK: "PaymentMethodProvider#uuid1",
                    SK: "PaymentMethodProvider",
                    Type: "PaymentMethodProvider",
                    Id: "uuid1",
                    Name: "provider-1",
                    PaymentMethodId: "123",
                    CreatedAt: "2023-10-16T03:31:35.918Z",
                    UpdatedAt: "2023-10-16T03:31:35.918Z"
                  },
                  TableName: "mock-table"
                }
              },
              // Check that the PaymentMethod the PaymentMethodProvider BelongsTo exists
              {
                ConditionCheck: {
                  ConditionExpression: "attribute_exists(PK)",
                  Key: { PK: "PaymentMethod#123", SK: "PaymentMethod" },
                  TableName: "mock-table"
                }
              },
              // Create the BelongsToLink for PaymentMethod HasOne PaymentMethodProvider if it does not exist
              {
                Put: {
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: {
                    PK: "PaymentMethod#123",
                    SK: "PaymentMethodProvider",
                    Id: "uuid2",
                    ForeignKey: "uuid1",
                    ForeignEntityType: "PaymentMethodProvider",
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

    it("with custom id field - will create the entity if the parent is not already associated to an entity of this type", async () => {
      expect.assertions(4);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedUuidv4.mockReturnValueOnce("uuid1");

      const user = await User.create({
        email: "email@email.com",
        name: "user-1",
        deskId: "123"
      });

      expect(user).toEqual({
        pk: "User#email@email.com",
        sk: "User",
        type: "User",
        id: "email@email.com",
        email: "email@email.com",
        name: "user-1",
        deskId: "123",
        createdAt: new Date("2023-10-16T03:31:35.918Z"),
        updatedAt: new Date("2023-10-16T03:31:35.918Z")
      });
      expect(user).toBeInstanceOf(User);
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Put: {
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: {
                    PK: "User#email@email.com",
                    SK: "User",
                    Type: "User",
                    Id: "email@email.com",
                    Email: "email@email.com",
                    Name: "user-1",
                    DeskId: "123",
                    CreatedAt: "2023-10-16T03:31:35.918Z",
                    UpdatedAt: "2023-10-16T03:31:35.918Z"
                  },
                  TableName: "mock-table"
                }
              },
              {
                ConditionCheck: {
                  ConditionExpression: "attribute_exists(PK)",
                  Key: { PK: "Desk#123", SK: "Desk" },
                  TableName: "mock-table"
                }
              },
              {
                Put: {
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: {
                    PK: "Desk#123",
                    SK: "User",
                    Type: "BelongsToLink",
                    ForeignEntityType: "User",
                    ForeignKey: "email@email.com",
                    Id: "uuid1",
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

    it("throws an error if the request fails because the parent already has an entity of this type associated with it", async () => {
      expect.assertions(2);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedUuidv4.mockReturnValueOnce("uuid1").mockReturnValueOnce("uuid2");

      mockSend.mockImplementationOnce(() => {
        throw new TransactionCanceledException({
          message: "MockMessage",
          CancellationReasons: [
            { Code: "None" },
            { Code: "None" },
            { Code: "ConditionalCheckFailed" }
          ],
          $metadata: {}
        });
      });

      try {
        await PaymentMethodProvider.create({
          name: "provider-1",
          paymentMethodId: "123"
        });
      } catch (e: any) {
        expect(e.constructor.name).toEqual("TransactionWriteFailedError");
        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: PaymentMethod with id: 123 already has an associated PaymentMethodProvider"
          )
        ]);
      }
    });
  });

  describe("entity BelongsTo an entity which HasOne of it and another entity HasMany of it", () => {
    it("will create the entity and de-normalize the BelongsToLinks", async () => {
      expect.assertions(4);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedUuidv4
        .mockReturnValueOnce("uuid1")
        .mockReturnValueOnce("uuid2")
        .mockReturnValueOnce("uuid3");

      const grade = await Grade.create({
        gradeValue: "A+",
        assignmentId: "123",
        studentId: "456"
      });

      expect(grade).toEqual({
        myPk: "Grade|uuid1",
        mySk: "Grade",
        id: "uuid1",
        type: "Grade",
        gradeValue: "A+",
        assignmentId: "123",
        studentId: "456",
        createdAt: new Date("2023-10-16T03:31:35.918Z"),
        updatedAt: new Date("2023-10-16T03:31:35.918Z")
      });
      expect(grade).toBeInstanceOf(Grade);
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Put: {
                  TableName: "other-table",
                  ConditionExpression: "attribute_not_exists(myPk)",
                  Item: {
                    myPk: "Grade|uuid1",
                    mySk: "Grade",
                    id: "uuid1",
                    type: "Grade",
                    LetterValue: "A+",
                    assignmentId: "123",
                    studentId: "456",
                    createdAt: "2023-10-16T03:31:35.918Z",
                    updatedAt: "2023-10-16T03:31:35.918Z"
                  }
                }
              },
              {
                ConditionCheck: {
                  TableName: "other-table",
                  Key: { myPk: "Assignment|123", mySk: "Assignment" },
                  ConditionExpression: "attribute_exists(myPk)"
                }
              },
              {
                Put: {
                  TableName: "other-table",
                  ConditionExpression: "attribute_not_exists(myPk)",
                  Item: {
                    myPk: "Assignment|123",
                    mySk: "Grade",
                    id: "uuid2",
                    type: "BelongsToLink",
                    foreignKey: "uuid1",
                    foreignEntityType: "Grade",
                    createdAt: "2023-10-16T03:31:35.918Z",
                    updatedAt: "2023-10-16T03:31:35.918Z"
                  }
                }
              },
              {
                ConditionCheck: {
                  TableName: "other-table",
                  ConditionExpression: "attribute_exists(myPk)",
                  Key: { myPk: "Student|456", mySk: "Student" }
                }
              },
              {
                Put: {
                  TableName: "other-table",
                  ConditionExpression: "attribute_not_exists(myPk)",
                  Item: {
                    myPk: "Student|456",
                    mySk: "Grade|uuid1",
                    id: "uuid3",
                    type: "BelongsToLink",
                    foreignKey: "uuid1",
                    foreignEntityType: "Grade",
                    createdAt: "2023-10-16T03:31:35.918Z",
                    updatedAt: "2023-10-16T03:31:35.918Z"
                  }
                }
              }
            ]
          }
        ]
      ]);
    });

    it("with a custom id field - will create the entity and de-normalize the BelongsToLinks", async () => {
      expect.assertions(4);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedUuidv4.mockReturnValueOnce("uuid1").mockReturnValueOnce("uuid2");

      const user = await User.create({
        name: "test-name",
        email: "email@email.com",
        orgId: "123",
        deskId: "456"
      });

      expect(user).toEqual({
        pk: "User#email@email.com",
        sk: "User",
        type: "User",
        id: "email@email.com",
        email: "email@email.com",
        name: "test-name",
        orgId: "123",
        deskId: "456",
        createdAt: new Date("2023-10-16T03:31:35.918Z"),
        updatedAt: new Date("2023-10-16T03:31:35.918Z")
      });
      expect(user).toBeInstanceOf(User);
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Put: {
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: {
                    PK: "User#email@email.com",
                    SK: "User",
                    Type: "User",
                    Id: "email@email.com",
                    Email: "email@email.com",
                    Name: "test-name",
                    OrgId: "123",
                    DeskId: "456",
                    CreatedAt: "2023-10-16T03:31:35.918Z",
                    UpdatedAt: "2023-10-16T03:31:35.918Z"
                  },
                  TableName: "mock-table"
                }
              },
              {
                ConditionCheck: {
                  ConditionExpression: "attribute_exists(PK)",
                  Key: { PK: "Organization#123", SK: "Organization" },
                  TableName: "mock-table"
                }
              },
              {
                Put: {
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: {
                    PK: "Organization#123",
                    SK: "User#email@email.com",
                    Type: "BelongsToLink",
                    ForeignEntityType: "User",
                    ForeignKey: "email@email.com",
                    Id: "uuid1",
                    CreatedAt: "2023-10-16T03:31:35.918Z",
                    UpdatedAt: "2023-10-16T03:31:35.918Z"
                  },
                  TableName: "mock-table"
                }
              },
              {
                ConditionCheck: {
                  ConditionExpression: "attribute_exists(PK)",
                  Key: { PK: "Desk#456", SK: "Desk" },
                  TableName: "mock-table"
                }
              },
              {
                Put: {
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: {
                    PK: "Desk#456",
                    SK: "User",
                    Type: "BelongsToLink",
                    ForeignEntityType: "User",
                    ForeignKey: "email@email.com",
                    Id: "uuid2",
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

    it("will throw an error if the request fails because the conditions fail (Assignment already has grade associated with it or parent entities don't exist)", async () => {
      expect.assertions(2);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedUuidv4
        .mockReturnValueOnce("uuid1")
        .mockReturnValueOnce("uuid2")
        .mockReturnValueOnce("uuid3");

      mockSend.mockImplementationOnce(() => {
        throw new TransactionCanceledException({
          message: "MockMessage",
          CancellationReasons: [
            { Code: "None" },
            { Code: "None" },
            { Code: "ConditionalCheckFailed" },
            { Code: "ConditionalCheckFailed" },
            { Code: "None" }
          ],
          $metadata: {}
        });
      });

      try {
        await Grade.create({
          gradeValue: "A+",
          assignmentId: "123",
          studentId: "456"
        });
      } catch (e: any) {
        expect(e.constructor.name).toEqual("TransactionWriteFailedError");
        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Assignment with id: 123 already has an associated Grade"
          ),
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Student with ID '456' does not exist"
          )
        ]);
      }
    });
  });

  describe("error handling", () => {
    describe("will return an error if an entity with that id already exists", () => {
      it("when there is a id attribute alias", async () => {
        expect.assertions(2);

        jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
        mockedUuidv4.mockReturnValueOnce("uuid1");

        mockSend.mockImplementationOnce(() => {
          throw new TransactionCanceledException({
            message: "MockMessage",
            CancellationReasons: [{ Code: "ConditionalCheckFailed" }],
            $metadata: {}
          });
        });

        try {
          await Person.create({ name: "some person" });
        } catch (e: any) {
          expect(e.constructor.name).toEqual("TransactionWriteFailedError");
          expect(e.errors).toEqual([
            new ConditionalCheckFailedError(
              "ConditionalCheckFailed: Person with id: uuid1 already exists"
            )
          ]);
        }
      });

      it("alternate table style - when there is not an id attribute alias", async () => {
        expect.assertions(2);

        jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
        mockedUuidv4.mockReturnValueOnce("uuid1");

        mockSend.mockImplementationOnce(() => {
          throw new TransactionCanceledException({
            message: "MockMessage",
            CancellationReasons: [{ Code: "ConditionalCheckFailed" }],
            $metadata: {}
          });
        });

        try {
          await Teacher.create({ name: "some person" });
        } catch (e: any) {
          expect(e.constructor.name).toEqual("TransactionWriteFailedError");
          expect(e.errors).toEqual([
            new ConditionalCheckFailedError(
              "ConditionalCheckFailed: Teacher with id: uuid1 already exists"
            )
          ]);
        }
      });

      it("when there is a a custom id field", async () => {
        expect.assertions(2);

        jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
        mockedUuidv4.mockReturnValueOnce("uuid1");

        mockSend.mockImplementationOnce(() => {
          throw new TransactionCanceledException({
            message: "MockMessage",
            CancellationReasons: [{ Code: "ConditionalCheckFailed" }],
            $metadata: {}
          });
        });

        try {
          await User.create({ email: "email@email.com", name: "some person" });
        } catch (e: any) {
          expect(e.constructor.name).toEqual("TransactionWriteFailedError");
          expect(e.errors).toEqual([
            new ConditionalCheckFailedError(
              "ConditionalCheckFailed: User with id: email@email.com already exists"
            )
          ]);
        }
      });
    });

    it("will return an AggregateError for a failed conditional check", async () => {
      expect.assertions(2);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedUuidv4
        .mockReturnValueOnce("uuid1")
        .mockReturnValueOnce("uuid2")
        .mockReturnValueOnce("uuid3");

      mockSend.mockImplementationOnce(() => {
        throw new TransactionCanceledException({
          message: "MockMessage",
          CancellationReasons: [
            { Code: "None" },
            { Code: "ConditionalCheckFailed" },
            { Code: "None" },
            { Code: "None" },
            { Code: "None" }
          ],
          $metadata: {}
        });
      });

      try {
        await Order.create({
          customerId: "123",
          paymentMethodId: "456",
          orderDate: new Date("2024-01-01")
        });
      } catch (e: any) {
        expect(e.constructor.name).toEqual("TransactionWriteFailedError");
        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Customer with ID '123' does not exist"
          )
        ]);
      }
    });

    it("will return an AggregateError for multiple failed conditional checks", async () => {
      expect.assertions(2);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedUuidv4
        .mockReturnValueOnce("uuid1")
        .mockReturnValueOnce("uuid2")
        .mockReturnValueOnce("uuid3");

      mockSend.mockImplementationOnce(() => {
        throw new TransactionCanceledException({
          message: "MockMessage",
          CancellationReasons: [
            { Code: "None" },
            { Code: "ConditionalCheckFailed" },
            { Code: "None" },
            { Code: "ConditionalCheckFailed" },
            { Code: "None" }
          ],
          $metadata: {}
        });
      });

      try {
        await Order.create({
          customerId: "123",
          paymentMethodId: "456",
          orderDate: new Date("2024-01-01")
        });
      } catch (e: any) {
        expect(e.constructor.name).toEqual("TransactionWriteFailedError");
        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Customer with ID '123' does not exist"
          ),
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: PaymentMethod with ID '456' does not exist"
          )
        ]);
      }
    });

    it("will throw the original error if the type is TransactionCanceledException but there are no ConditionalCheckFailed reasons", async () => {
      expect.assertions(1);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedUuidv4
        .mockReturnValueOnce("uuid1")
        .mockReturnValueOnce("uuid2")
        .mockReturnValueOnce("uuid3");

      mockSend.mockImplementationOnce(() => {
        throw new TransactionCanceledException({
          message: "MockMessage",
          CancellationReasons: [
            { Code: "None" },
            { Code: "None" },
            { Code: "MockCode" },
            { Code: "None" },
            { Code: "None" }
          ],
          $metadata: {}
        });
      });

      try {
        await Order.create({
          customerId: "123",
          paymentMethodId: "456",
          orderDate: new Date("2024-01-01")
        });
      } catch (e: any) {
        expect(e).toEqual(
          new TransactionCanceledException({
            message: "MockMessage",
            CancellationReasons: [
              { Code: "None" },
              { Code: "None" },
              { Code: "MockCode" },
              { Code: "None" },
              { Code: "None" }
            ],
            $metadata: {}
          })
        );
      }
    });

    it("allows non TransactionCanceledException errors to bubble up", async () => {
      expect.assertions(1);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedUuidv4
        .mockReturnValueOnce("uuid1")
        .mockReturnValueOnce("uuid2")
        .mockReturnValueOnce("uuid3");

      mockSend.mockImplementationOnce(() => {
        throw new Error("something bad");
      });

      try {
        await Order.create({
          customerId: "123",
          paymentMethodId: "456",
          orderDate: new Date("2024-01-01")
        });
      } catch (e) {
        expect(e).toEqual(new Error("something bad"));
      }
    });
  });

  describe("types", () => {
    it("will not accept relationship attributes on create", async () => {
      await Order.create({
        orderDate: new Date(),
        paymentMethodId: "123",
        customerId: "456",
        // @ts-expect-error relationship attributes are not allowed
        customer: new Customer()
      });
    });

    it("will not accept function attributes on create", async () => {
      @Entity
      class MyModel extends MockTable {
        @StringAttribute({ alias: "MyAttribute" })
        public myAttribute: string;

        public someMethod(): string {
          return "abc123";
        }
      }

      await MyModel.create({
        myAttribute: "someVal",
        // @ts-expect-error custom function attributes are not allowed
        someMethod: () => "123"
      });

      await MyModel.create({
        myAttribute: "someVal",
        // @ts-expect-error built in function attributes are not allowed
        update: () => "123"
      });
    });

    it("optional attributes are not required", async () => {
      @Entity
      class SomeModel extends MockTable {
        @StringAttribute({ alias: "MyAttribute1" })
        public myAttribute1: string;

        @StringAttribute({ alias: "MyAttribute2", nullable: true })
        public myAttribute2?: string;
      }

      await SomeModel.create({
        // @ts-expect-no-error Optional attributes do not have to be included
        myAttribute1: "someVal"
      });
    });

    it("will allow ForeignKey attributes to be passed at their inferred type without casting to type ForeignKey", async () => {
      await Order.create({
        orderDate: new Date(),
        // @ts-expect-no-error ForeignKey is of type string so it can be passed as such without casing to ForeignKey
        paymentMethodId: "123",
        // @ts-expect-no-error ForeignKey is of type string so it can be passed as such without casing to ForeignKey
        customerId: "456"
      });
    });

    it("will allow NullableForeignKey attributes to be passed at their inferred type without casting to type NullableForeignKey", async () => {
      await ContactInformation.create({
        email: "test@example.com",
        phone: "555-555-5555",
        // @ts-expect-no-error NullableForeignKey is of type string so it can be passed as such without casing to NullableForeignKey
        customerId: "123"
      });
    });

    it("will allow NullableForeignKey attributes to be passed at undefined", async () => {
      await ContactInformation.create({
        email: "test@example.com",
        phone: "555-555-5555",
        // @ts-expect-no-error NullableForeignKey can be passed as undefined
        customerId: undefined
      });
    });

    it("will allow a NullableForeignKey attribute to be omitted if its defined as optional on the model", async () => {
      @Entity
      class ContactInformationLocal extends MockTable {
        @StringAttribute({ alias: "Email" })
        public email: string;

        @StringAttribute({ alias: "Phone" })
        public phone: string;

        @ForeignKeyAttribute({ alias: "CustomerId", nullable: true })
        public customerId?: NullableForeignKey;

        @BelongsTo(() => CustomerLocal, { foreignKey: "customerId" })
        public customer: CustomerLocal;

        // mock method
        public static override create(bla: any): any {
          return "bla " as any;
        }
      }

      @Entity
      class CustomerLocal extends MockTable {
        @HasOne(() => ContactInformation, { foreignKey: "customerId" })
        public contactInformation?: ContactInformation;
      }

      // @ts-expect-no-error NullableForeignKey can be omitted if its defined as optional
      await ContactInformationLocal.create({
        email: "test@example.com",
        phone: "555-555-5555"
      });
    });

    it("will not accept DefaultFields (reserved) on create because they are managed by dyna-record", async () => {
      await Order.create({
        customerId: "customerId",
        paymentMethodId: "paymentMethodId",
        orderDate: new Date(),
        // @ts-expect-error default fields are not accepted on create, they are managed by dyna-record
        id: "123"
      });

      await Order.create({
        customerId: "customerId",
        paymentMethodId: "paymentMethodId",
        orderDate: new Date(),
        // @ts-expect-error default fields are not accepted on create, they are managed by dyna-record
        type: "456"
      });

      await Order.create({
        customerId: "customerId",
        paymentMethodId: "paymentMethodId",
        orderDate: new Date(),
        // @ts-expect-error default fields are not accepted on create, they are managed by dyna-record
        createdAt: new Date()
      });

      await Order.create({
        customerId: "customerId",
        paymentMethodId: "paymentMethodId",
        orderDate: new Date(),
        // @ts-expect-error default fields are not accepted on create, they are managed by dyna-record
        updatedAt: new Date()
      });
    });

    it("will not accept partition and sort keys on create because those are reserved and managed by dyna-record", async () => {
      await Order.create({
        customerId: "customerId",
        paymentMethodId: "paymentMethodId",
        orderDate: new Date(),
        // @ts-expect-error primary key fields are not accepted on create, they are managed by dyna-record
        pk: "123"
      });

      await Order.create({
        customerId: "customerId",
        paymentMethodId: "paymentMethodId",
        orderDate: new Date(),
        // @ts-expect-error sort key fields are not accepted on create, they are managed by dyna-record
        sk: "123"
      });
    });

    it("will not allow nullable attributes to be set to null (they should be left undefined)", async () => {
      await MyModelNullableAttribute.create({
        // @ts-expect-error nullable fields cannot be set to null (they should be left undefined)
        myAttribute: null
      });
    });

    it("relationships are not part of return value", async () => {
      const res = await Order.create({
        customerId: "123",
        paymentMethodId: "456",
        orderDate: new Date(),
        // @ts-expect-error default fields are not accepted on create, they are managed by dyna-record
        createdAt: new Date()
      });

      // @ts-expect-error relationships are not part of return value
      console.log(res.paymentMethod);
    });
  });
});
