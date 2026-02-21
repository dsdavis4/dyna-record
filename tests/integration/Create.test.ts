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
  type Organization,
  type PaymentMethod,
  PaymentMethodProvider,
  Person,
  Teacher,
  User,
  type Desk,
  type Assignment,
  type Student,
  Employee,
  type Warehouse,
  Shipment
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
import type { NullableForeignKey } from "../../src/types";
import { ValidationError } from "../../src";
import {
  type MockTableEntityTableItem,
  type OtherTableEntityTableItem
} from "./utils";
import Logger from "../../src/Logger";


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
    mockedUuidv4.mockReset();
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

  it("will discard optional attributes which are passed as undefined", async () => {
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
      neighborhood: undefined, // Explicity passed as undefined
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
    expect.assertions(5);

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
    expect(mockTransactGetCommand.mock.calls).toEqual([]);
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
      nullableEnumAttribute: "val-2",
      objectAttribute: {
        name: "John",
        email: "john@example.com",
        tags: ["work", "vip"]
      }
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
      objectAttribute: {
        name: "John",
        email: "john@example.com",
        tags: ["work", "vip"]
      },
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
                  objectAttribute: {
                    name: "John",
                    email: "john@example.com",
                    tags: ["work", "vip"]
                  },
                  stringAttribute: "1"
                },
                TableName: "mock-table"
              }
            },
            {
              ConditionCheck: {
                ConditionExpression: "attribute_exists(PK)",
                Key: { PK: "Customer#1111", SK: "Customer" },
                TableName: "mock-table"
              }
            },
            {
              ConditionCheck: {
                ConditionExpression: "attribute_exists(PK)",
                Key: { PK: "Customer#22222", SK: "Customer" },
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
        },
        {
          code: "invalid_type",
          expected: "object",
          message: "Required",
          path: ["objectAttribute"],
          received: "undefined"
        }
      ]);
      expect(mockSend.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    }
  });

  it("will ensure standalone foreign key references exist", async () => {
    expect.assertions(3);

    jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
    mockedUuidv4.mockReturnValueOnce("uuid1");

    mockSend.mockImplementationOnce(() => {
      throw new TransactionCanceledException({
        message: "MockMessage",
        CancellationReasons: [
          { Code: "None" },
          { Code: "ConditionalCheckFailed" },
          { Code: "ConditionalCheckFailed" }
        ],
        $metadata: {}
      });
    });

    try {
      await MyClassWithAllAttributeTypes.create({
        stringAttribute: "1",
        dateAttribute: new Date(),
        foreignKeyAttribute: "missing-customer",
        nullableForeignKeyAttribute: "missing-optional-customer",
        boolAttribute: true,
        numberAttribute: 9,
        enumAttribute: "val-1",
        objectAttribute: {
          name: "John",
          email: "john@example.com",
          tags: ["work", "vip"]
        }
      });
    } catch (e: any) {
      expect(e.constructor.name).toEqual("TransactionWriteFailedError");
      expect(e.errors).toEqual([
        new ConditionalCheckFailedError(
          "ConditionalCheckFailed: Customer with ID 'missing-customer' does not exist"
        ),
        new ConditionalCheckFailedError(
          "ConditionalCheckFailed: Customer with ID 'missing-optional-customer' does not exist"
        )
      ]);
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
                    foreignKeyAttribute: "missing-customer",
                    nullableForeignKeyAttribute: "missing-optional-customer",
                    numberAttribute: 9,
                    objectAttribute: {
                      name: "John",
                      email: "john@example.com",
                      tags: ["work", "vip"]
                    },
                    stringAttribute: "1"
                  },
                  TableName: "mock-table"
                }
              },
              {
                ConditionCheck: {
                  ConditionExpression: "attribute_exists(PK)",
                  Key: { PK: "Customer#missing-customer", SK: "Customer" },
                  TableName: "mock-table"
                }
              },
              {
                ConditionCheck: {
                  ConditionExpression: "attribute_exists(PK)",
                  Key: {
                    PK: "Customer#missing-optional-customer",
                    SK: "Customer"
                  },
                  TableName: "mock-table"
                }
              }
            ]
          }
        ]
      ]);
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
        },
        {
          code: "invalid_type",
          expected: "object",
          message: "Required",
          path: ["objectAttribute"],
          received: "undefined"
        }
      ]);
      expect(mockSend.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    }
  });

  it("will error if objectAttribute fields are the wrong type", async () => {
    expect.assertions(5);

    try {
      await MyClassWithAllAttributeTypes.create({
        stringAttribute: "val",
        dateAttribute: new Date(),
        foreignKeyAttribute: "123" as any,
        boolAttribute: true,
        numberAttribute: 1,
        enumAttribute: "val-1",
        objectAttribute: {
          name: 123,
          email: true,
          tags: "not-array"
        }
      } as any);
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual("Validation errors");
      expect(e.cause).toEqual([
        {
          code: "invalid_type",
          expected: "string",
          message: "Expected string, received number",
          path: ["objectAttribute", "name"],
          received: "number"
        },
        {
          code: "invalid_type",
          expected: "string",
          message: "Expected string, received boolean",
          path: ["objectAttribute", "email"],
          received: "boolean"
        },
        {
          code: "invalid_type",
          expected: "array",
          message: "Expected array, received string",
          path: ["objectAttribute", "tags"],
          received: "string"
        }
      ]);
      expect(mockSend.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    }
  });

  it("will error if objectAttribute array items are the wrong type", async () => {
    expect.assertions(5);

    try {
      await MyClassWithAllAttributeTypes.create({
        stringAttribute: "val",
        dateAttribute: new Date(),
        foreignKeyAttribute: "123" as any,
        boolAttribute: true,
        numberAttribute: 1,
        enumAttribute: "val-1",
        objectAttribute: {
          name: "John",
          email: "john@example.com",
          tags: ["valid", 123, true]
        }
      } as any);
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual("Validation errors");
      expect(e.cause).toEqual([
        {
          code: "invalid_type",
          expected: "string",
          message: "Expected string, received number",
          path: ["objectAttribute", "tags", 1],
          received: "number"
        },
        {
          code: "invalid_type",
          expected: "string",
          message: "Expected string, received boolean",
          path: ["objectAttribute", "tags", 2],
          received: "boolean"
        }
      ]);
      expect(mockSend.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    }
  });

  it("will error if nullableObjectAttribute nested object and array fields are the wrong type", async () => {
    expect.assertions(5);

    try {
      await MyClassWithAllAttributeTypes.create({
        stringAttribute: "val",
        dateAttribute: new Date(),
        foreignKeyAttribute: "123" as any,
        boolAttribute: true,
        numberAttribute: 1,
        enumAttribute: "val-1",
        objectAttribute: {
          name: "John",
          email: "john@example.com",
          tags: ["work"]
        },
        nullableObjectAttribute: {
          street: "123 Main St",
          city: "Springfield",
          geo: { lat: "bad", lng: "bad" },
          scores: ["bad"]
        }
      } as any);
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual("Validation errors");
      expect(e.cause).toEqual([
        {
          code: "invalid_type",
          expected: "number",
          message: "Expected number, received string",
          path: ["nullableObjectAttribute", "geo", "lat"],
          received: "string"
        },
        {
          code: "invalid_type",
          expected: "number",
          message: "Expected number, received string",
          path: ["nullableObjectAttribute", "geo", "lng"],
          received: "string"
        },
        {
          code: "invalid_type",
          expected: "number",
          message: "Expected number, received string",
          path: ["nullableObjectAttribute", "scores", 0],
          received: "string"
        }
      ]);
      expect(mockSend.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    }
  });

  it("will error if nullableObjectAttribute top-level fields are the wrong type", async () => {
    expect.assertions(5);

    try {
      await MyClassWithAllAttributeTypes.create({
        stringAttribute: "val",
        dateAttribute: new Date(),
        foreignKeyAttribute: "123" as any,
        boolAttribute: true,
        numberAttribute: 1,
        enumAttribute: "val-1",
        objectAttribute: {
          name: "John",
          email: "john@example.com",
          tags: ["work"]
        },
        nullableObjectAttribute: {
          street: 123,
          city: false,
          geo: { lat: 1, lng: 2 },
          scores: [1]
        }
      } as any);
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual("Validation errors");
      expect(e.cause).toEqual([
        {
          code: "invalid_type",
          expected: "string",
          message: "Expected string, received number",
          path: ["nullableObjectAttribute", "street"],
          received: "number"
        },
        {
          code: "invalid_type",
          expected: "string",
          message: "Expected string, received boolean",
          path: ["nullableObjectAttribute", "city"],
          received: "boolean"
        }
      ]);
      expect(mockSend.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    }
  });

  it("will error if non-nullable objectAttribute fields are set to null", async () => {
    expect.assertions(5);

    try {
      await MyClassWithAllAttributeTypes.create({
        stringAttribute: "val",
        dateAttribute: new Date(),
        foreignKeyAttribute: "123" as any,
        boolAttribute: true,
        numberAttribute: 1,
        enumAttribute: "val-1",
        objectAttribute: {
          name: null,
          email: null,
          tags: null
        }
      } as any);
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual("Validation errors");
      expect(e.cause).toEqual([
        {
          code: "invalid_type",
          expected: "string",
          message: "Expected string, received null",
          path: ["objectAttribute", "name"],
          received: "null"
        },
        {
          code: "invalid_type",
          expected: "string",
          message: "Expected string, received null",
          path: ["objectAttribute", "email"],
          received: "null"
        },
        {
          code: "invalid_type",
          expected: "array",
          message: "Expected array, received null",
          path: ["objectAttribute", "tags"],
          received: "null"
        }
      ]);
      expect(mockSend.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    }
  });

  it("will error if non-nullable nullableObjectAttribute fields are set to null", async () => {
    expect.assertions(5);

    try {
      await MyClassWithAllAttributeTypes.create({
        stringAttribute: "val",
        dateAttribute: new Date(),
        foreignKeyAttribute: "123" as any,
        boolAttribute: true,
        numberAttribute: 1,
        enumAttribute: "val-1",
        objectAttribute: {
          name: "John",
          email: "john@example.com",
          tags: ["work"]
        },
        nullableObjectAttribute: {
          street: null,
          city: null,
          zip: null,
          geo: null,
          scores: null
        }
      } as any);
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual("Validation errors");
      expect(e.cause).toEqual([
        {
          code: "invalid_type",
          expected: "string",
          message: "Expected string, received null",
          path: ["nullableObjectAttribute", "street"],
          received: "null"
        },
        {
          code: "invalid_type",
          expected: "string",
          message: "Expected string, received null",
          path: ["nullableObjectAttribute", "city"],
          received: "null"
        },
        {
          code: "invalid_type",
          expected: "object",
          message: "Expected object, received null",
          path: ["nullableObjectAttribute", "geo"],
          received: "null"
        },
        {
          code: "invalid_type",
          expected: "array",
          message: "Expected array, received null",
          path: ["nullableObjectAttribute", "scores"],
          received: "null"
        }
      ]);
      expect(mockSend.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    }
  });

  it("will error if non-nullable nested fields within nullableObjectAttribute are set to null", async () => {
    expect.assertions(5);

    try {
      await MyClassWithAllAttributeTypes.create({
        stringAttribute: "val",
        dateAttribute: new Date(),
        foreignKeyAttribute: "123" as any,
        boolAttribute: true,
        numberAttribute: 1,
        enumAttribute: "val-1",
        objectAttribute: {
          name: "John",
          email: "john@example.com",
          tags: ["work"]
        },
        nullableObjectAttribute: {
          street: "123 Main St",
          city: "Springfield",
          geo: { lat: null, lng: null },
          scores: [null]
        }
      } as any);
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual("Validation errors");
      expect(e.cause).toEqual([
        {
          code: "invalid_type",
          expected: "number",
          message: "Expected number, received null",
          path: ["nullableObjectAttribute", "geo", "lat"],
          received: "null"
        },
        {
          code: "invalid_type",
          expected: "number",
          message: "Expected number, received null",
          path: ["nullableObjectAttribute", "geo", "lng"],
          received: "null"
        },
        {
          code: "invalid_type",
          expected: "number",
          message: "Expected number, received null",
          path: ["nullableObjectAttribute", "scores", 0],
          received: "null"
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

    const customer: MockTableEntityTableItem<Customer> = {
      PK: "Customer#123",
      SK: "Customer",
      Id: "123",
      Type: "Customer",
      Name: "Mock Customer",
      Address: "11 Some St",
      CreatedAt: "2024-01-01T00:00:00.000Z",
      UpdatedAt: "2024-01-02T00:00:00.000Z"
    };

    const paymentMethod: MockTableEntityTableItem<PaymentMethod> = {
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
      Responses: [{ Item: customer }, { Item: paymentMethod }]
    });

    const order = await Order.create({
      customerId: "123",
      paymentMethodId: "456",
      orderDate: new Date("2024-01-01")
    });

    const newOrderTableAttributes = {
      Id: "uuid1",
      Type: "Order",
      CustomerId: "123",
      OrderDate: "2024-01-01T00:00:00.000Z",
      PaymentMethodId: "456",
      CreatedAt: "2023-10-16T03:31:35.918Z",
      UpdatedAt: "2023-10-16T03:31:35.918Z"
    };

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
    // Prefetch associated records to denormalize
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
                  ...newOrderTableAttributes
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
                  ...newOrderTableAttributes
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
                  ...newOrderTableAttributes
                }
              }
            },
            // Denormalize the Customer to the Order partition
            {
              Put: {
                TableName: "mock-table",
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "Order#uuid1",
                  SK: "Customer",
                  Id: "123",
                  Type: "Customer",
                  Name: "Mock Customer",
                  Address: "11 Some St",
                  CreatedAt: "2024-01-01T00:00:00.000Z",
                  UpdatedAt: "2024-01-02T00:00:00.000Z"
                }
              }
            },
            // Denormalize the PaymentMethod to the Order partition
            {
              Put: {
                TableName: "mock-table",
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "Order#uuid1",
                  SK: "PaymentMethod",
                  Id: "456",
                  Type: "PaymentMethod",
                  CustomerId: "123",
                  LastFour: "1234",
                  CreatedAt: "2024-02-01T00:00:00.000Z",
                  UpdatedAt: "2024-02-02T00:00:00.000Z"
                }
              }
            }
          ]
        }
      ]
    ]);
  });

  it("with a custom id field - will create an entity that BelongsTo an entity who HasMany of it (checks parents exists and creates denormalizes records to partitions)", async () => {
    expect.assertions(5);

    jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
    mockedUuidv4.mockReturnValueOnce("uuid1");

    const org: MockTableEntityTableItem<Organization> = {
      PK: "Organization#123",
      SK: "Organization",
      Id: "123",
      Type: "Organization",
      Name: "Mock Org",
      CreatedAt: "2024-01-01T00:00:00.000Z",
      UpdatedAt: "2024-01-02T00:00:00.000Z"
    };

    mockTransactGetItems.mockResolvedValueOnce({
      Responses: [{ Item: org }]
    });

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
    expect(mockSend.mock.calls).toEqual([
      [{ name: "TransactGetCommand" }],
      [{ name: "TransactWriteCommand" }]
    ]);
    // Prefetch associated records to denormalize
    expect(mockTransactGetCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Get: {
                TableName: "mock-table",
                Key: { PK: "Organization#123", SK: "Organization" }
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
              // Put the new User
              Put: {
                TableName: "mock-table",
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "User#email@email.com",
                  SK: "User",
                  Id: "email@email.com",
                  Type: "User",
                  Email: "email@email.com",
                  Name: "test-name",
                  OrgId: "123",
                  CreatedAt: "2023-10-16T03:31:35.918Z",
                  UpdatedAt: "2023-10-16T03:31:35.918Z"
                }
              }
            },
            // Check that the associated Organization exists
            {
              ConditionCheck: {
                TableName: "mock-table",
                ConditionExpression: "attribute_exists(PK)",
                Key: {
                  PK: "Organization#123",
                  SK: "Organization"
                }
              }
            },
            // Denormalize the User to the User Organization
            {
              Put: {
                TableName: "mock-table",
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "Organization#123",
                  SK: "User#email@email.com",
                  Id: "email@email.com",
                  Type: "User",
                  Email: "email@email.com",
                  Name: "test-name",
                  OrgId: "123",
                  CreatedAt: "2023-10-16T03:31:35.918Z",
                  UpdatedAt: "2023-10-16T03:31:35.918Z"
                }
              }
            },
            // Denormalize the Organization to the User partition
            {
              Put: {
                TableName: "mock-table",
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "User#email@email.com",
                  SK: "Organization",
                  Id: "123",
                  Type: "Organization",
                  Name: "Mock Org",
                  CreatedAt: "2024-01-01T00:00:00.000Z",
                  UpdatedAt: "2024-01-02T00:00:00.000Z"
                }
              }
            }
          ]
        }
      ]
    ]);
  });

  describe("entity BelongsTo an entity who HasOne of it", () => {
    it("will create the entity if the parent is not already associated to an entity of this type", async () => {
      expect.assertions(5);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedUuidv4.mockReturnValueOnce("uuid1");

      const paymentMethod: MockTableEntityTableItem<PaymentMethod> = {
        PK: "PaymentMethod#123",
        SK: "PaymentMethod",
        Id: "123",
        Type: "PaymentMethod",
        LastFour: "1234",
        CustomerId: "456",
        CreatedAt: "2024-02-01T00:00:00.000Z",
        UpdatedAt: "2024-02-02T00:00:00.000Z"
      };

      mockTransactGetItems.mockResolvedValueOnce({
        Responses: [{ Item: paymentMethod }]
      });

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
                  Key: { PK: "PaymentMethod#123", SK: "PaymentMethod" }
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
                // Put the new PaymentMethodProvider
                Put: {
                  TableName: "mock-table",
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: {
                    PK: "PaymentMethodProvider#uuid1",
                    SK: "PaymentMethodProvider",
                    Id: "uuid1",
                    Type: "PaymentMethodProvider",
                    Name: "provider-1",
                    PaymentMethodId: "123",
                    CreatedAt: "2023-10-16T03:31:35.918Z",
                    UpdatedAt: "2023-10-16T03:31:35.918Z"
                  }
                }
              },
              // Check that the associated PaymentMethod exists
              {
                ConditionCheck: {
                  TableName: "mock-table",
                  ConditionExpression: "attribute_exists(PK)",
                  Key: {
                    PK: "PaymentMethod#123",
                    SK: "PaymentMethod"
                  }
                }
              },
              // Denormalize the PaymentMethodProvider to the PaymentMethod partition
              {
                Put: {
                  TableName: "mock-table",
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: {
                    PK: "PaymentMethod#123",
                    SK: "PaymentMethodProvider",
                    Id: "uuid1",
                    Type: "PaymentMethodProvider",
                    Name: "provider-1",
                    PaymentMethodId: "123",
                    CreatedAt: "2023-10-16T03:31:35.918Z",
                    UpdatedAt: "2023-10-16T03:31:35.918Z"
                  }
                }
              },
              // Denormalize the PaymentMethod to the PaymentMethodProvider partition
              {
                Put: {
                  TableName: "mock-table",
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: {
                    PK: "PaymentMethodProvider#uuid1",
                    SK: "PaymentMethod",
                    Id: "123",
                    Type: "PaymentMethod",
                    CustomerId: "456",
                    LastFour: "1234",
                    CreatedAt: "2024-02-01T00:00:00.000Z",
                    UpdatedAt: "2024-02-02T00:00:00.000Z"
                  }
                }
              }
            ]
          }
        ]
      ]);
    });

    it("with custom id field - will create the entity if the parent is not already associated to an entity of this type", async () => {
      expect.assertions(5);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedUuidv4.mockReturnValueOnce("uuid1");

      const desk: MockTableEntityTableItem<Desk> = {
        PK: "Desk#123",
        SK: "Desk",
        Id: "123",
        Type: "Desk",
        Num: 1,
        CreatedAt: "2024-01-01T00:00:00.000Z",
        UpdatedAt: "2024-01-02T00:00:00.000Z"
      };

      mockTransactGetItems.mockResolvedValueOnce({
        Responses: [{ Item: desk }]
      });

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
      expect(mockSend.mock.calls).toEqual([
        [{ name: "TransactGetCommand" }],
        [{ name: "TransactWriteCommand" }]
      ]);
      // Prefetch associated records to denormalize
      expect(mockTransactGetCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Get: {
                  TableName: "mock-table",
                  Key: { PK: "Desk#123", SK: "Desk" }
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
                // Put the new User
                Put: {
                  TableName: "mock-table",
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: {
                    PK: "User#email@email.com",
                    SK: "User",
                    Id: "email@email.com",
                    Type: "User",
                    DeskId: "123",
                    Email: "email@email.com",
                    Name: "user-1",
                    CreatedAt: "2023-10-16T03:31:35.918Z",
                    UpdatedAt: "2023-10-16T03:31:35.918Z"
                  }
                }
              },
              // Check that the associated Desk exists
              {
                ConditionCheck: {
                  TableName: "mock-table",
                  ConditionExpression: "attribute_exists(PK)",
                  Key: { PK: "Desk#123", SK: "Desk" }
                }
              },
              // Denormalize the User to the Desk partition
              {
                Put: {
                  TableName: "mock-table",
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: {
                    PK: "Desk#123",
                    SK: "User",
                    Id: "email@email.com",
                    Type: "User",
                    DeskId: "123",
                    Email: "email@email.com",
                    Name: "user-1",
                    CreatedAt: "2023-10-16T03:31:35.918Z",
                    UpdatedAt: "2023-10-16T03:31:35.918Z"
                  }
                }
              },
              // Denormalize the Desk to the User partition
              {
                Put: {
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: {
                    PK: "User#email@email.com",
                    SK: "Desk",
                    Id: "123",
                    Type: "Desk",
                    Num: 1,
                    CreatedAt: "2024-01-01T00:00:00.000Z",
                    UpdatedAt: "2024-01-02T00:00:00.000Z"
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
      mockedUuidv4.mockReturnValueOnce("uuid1");

      const paymentMethod: MockTableEntityTableItem<PaymentMethod> = {
        PK: "PaymentMethod#123",
        SK: "PaymentMethod",
        Id: "123",
        Type: "PaymentMethod",
        LastFour: "1234",
        CustomerId: "456",
        CreatedAt: "2024-02-01T00:00:00.000Z",
        UpdatedAt: "2024-02-02T00:00:00.000Z"
      };

      mockTransactGetItems.mockResolvedValueOnce({
        Responses: [{ Item: paymentMethod }]
      });

      mockSend
        .mockResolvedValueOnce("Prefetch data")
        .mockImplementationOnce(() => {
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
    it("will create the entity and de-normalize the linked records", async () => {
      expect.assertions(5);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedUuidv4.mockReturnValueOnce("uuid1");

      const assignment: OtherTableEntityTableItem<Assignment> = {
        myPk: "Assignment|123",
        mySk: "Assignment",
        id: "123",
        type: "Assignment",
        title: "MockTitle",
        courseId: "987",
        createdAt: "2024-02-01T00:00:00.000Z",
        updatedAt: "2024-02-02T00:00:00.000Z"
      };

      const student: OtherTableEntityTableItem<Student> = {
        myPk: "Student|456",
        mySk: "Student",
        id: "456",
        type: "Student",
        name: "MockName",
        createdAt: "2024-03-01T00:00:00.000Z",
        updatedAt: "2024-03-02T00:00:00.000Z"
      };

      mockTransactGetItems.mockResolvedValueOnce({
        Responses: [{ Item: assignment }, { Item: student }]
      });

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
                  TableName: "other-table",
                  Key: { myPk: "Assignment|123", mySk: "Assignment" }
                }
              },
              {
                Get: {
                  TableName: "other-table",
                  Key: { myPk: "Student|456", mySk: "Student" }
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
                // Put the new Grade
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
              // Check that the associated Assignment exists
              {
                ConditionCheck: {
                  TableName: "other-table",
                  ConditionExpression: "attribute_exists(myPk)",
                  Key: {
                    myPk: "Assignment|123",
                    mySk: "Assignment"
                  }
                }
              },
              // Denormalize the Grade to the Assignment partition
              {
                Put: {
                  TableName: "other-table",
                  ConditionExpression: "attribute_not_exists(myPk)",
                  Item: {
                    myPk: "Assignment|123",
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
              // Check that the associated Student exists
              {
                ConditionCheck: {
                  TableName: "other-table",
                  ConditionExpression: "attribute_exists(myPk)",
                  Key: {
                    myPk: "Student|456",
                    mySk: "Student"
                  }
                }
              },
              // Denormalize the Grade to the Student partition
              {
                Put: {
                  TableName: "other-table",
                  ConditionExpression: "attribute_not_exists(myPk)",
                  Item: {
                    myPk: "Student|456",
                    mySk: "Grade|uuid1",
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
              // Denormalize the Assignment to the Grade partition
              {
                Put: {
                  TableName: "other-table",
                  ConditionExpression: "attribute_not_exists(myPk)",
                  Item: {
                    myPk: "Grade|uuid1",
                    mySk: "Assignment",
                    id: "123",
                    type: "Assignment",
                    courseId: "987",
                    title: "MockTitle",
                    createdAt: "2024-02-01T00:00:00.000Z",
                    updatedAt: "2024-02-02T00:00:00.000Z"
                  }
                }
              },
              // Denormalize the Student to the Grade partition
              {
                Put: {
                  TableName: "other-table",
                  ConditionExpression: "attribute_not_exists(myPk)",
                  Item: {
                    myPk: "Grade|uuid1",
                    mySk: "Student",
                    id: "456",
                    type: "Student",
                    name: "MockName",
                    createdAt: "2024-03-01T00:00:00.000Z",
                    updatedAt: "2024-03-02T00:00:00.000Z"
                  }
                }
              }
            ]
          }
        ]
      ]);
    });

    it("with a custom id field - will create the entity and de-normalize the linked records", async () => {
      expect.assertions(5);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedUuidv4.mockReturnValueOnce("uuid1");

      const org: MockTableEntityTableItem<Organization> = {
        PK: "Organization#123",
        SK: "Organization",
        Id: "123",
        Type: "Organization",
        Name: "Mock Org",
        CreatedAt: "2024-01-01T00:00:00.000Z",
        UpdatedAt: "2024-01-02T00:00:00.000Z"
      };

      const desk: MockTableEntityTableItem<Desk> = {
        PK: "Desk#456",
        SK: "Desk",
        Id: "456",
        Type: "Desk",
        Num: 1,
        CreatedAt: "2024-02-01T00:00:00.000Z",
        UpdatedAt: "2024-02-02T00:00:00.000Z"
      };

      mockTransactGetItems.mockResolvedValueOnce({
        Responses: [{ Item: org }, { Item: desk }]
      });

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
      expect(mockSend.mock.calls).toEqual([
        [{ name: "TransactGetCommand" }],
        [{ name: "TransactWriteCommand" }]
      ]);
      // Prefetch associated records to denormalize
      expect(mockTransactGetCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Get: {
                  TableName: "mock-table",
                  Key: {
                    PK: "Organization#123",
                    SK: "Organization"
                  }
                }
              },
              {
                Get: {
                  TableName: "mock-table",
                  Key: {
                    PK: "Desk#456",
                    SK: "Desk"
                  }
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
                // Put the new User
                Put: {
                  TableName: "mock-table",
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: {
                    PK: "User#email@email.com",
                    SK: "User",
                    Id: "email@email.com",
                    Type: "User",
                    DeskId: "456",
                    Email: "email@email.com",
                    Name: "test-name",
                    OrgId: "123",
                    CreatedAt: "2023-10-16T03:31:35.918Z",
                    UpdatedAt: "2023-10-16T03:31:35.918Z"
                  }
                }
              },
              // Check that the associated Organization exists
              {
                ConditionCheck: {
                  TableName: "mock-table",
                  ConditionExpression: "attribute_exists(PK)",
                  Key: {
                    PK: "Organization#123",
                    SK: "Organization"
                  }
                }
              },
              // Denormalize the User to the Organization partition
              {
                Put: {
                  TableName: "mock-table",
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: {
                    PK: "Organization#123",
                    SK: "User#email@email.com",
                    Id: "email@email.com",
                    Type: "User",
                    DeskId: "456",
                    Email: "email@email.com",
                    Name: "test-name",
                    OrgId: "123",
                    CreatedAt: "2023-10-16T03:31:35.918Z",
                    UpdatedAt: "2023-10-16T03:31:35.918Z"
                  }
                }
              },
              // Check that the associated Desk exists
              {
                ConditionCheck: {
                  TableName: "mock-table",
                  ConditionExpression: "attribute_exists(PK)",
                  Key: {
                    PK: "Desk#456",
                    SK: "Desk"
                  }
                }
              },
              // Denormalize the User to the Desk partition
              {
                Put: {
                  TableName: "mock-table",
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: {
                    PK: "Desk#456",
                    SK: "User",
                    Id: "email@email.com",
                    Type: "User",
                    DeskId: "456",
                    Email: "email@email.com",
                    Name: "test-name",
                    OrgId: "123",
                    CreatedAt: "2023-10-16T03:31:35.918Z",
                    UpdatedAt: "2023-10-16T03:31:35.918Z"
                  }
                }
              },
              // Denormalize the Organization to the User partition
              {
                Put: {
                  TableName: "mock-table",
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: {
                    PK: "User#email@email.com",
                    SK: "Organization",
                    Id: "123",
                    Type: "Organization",
                    Name: "Mock Org",
                    CreatedAt: "2024-01-01T00:00:00.000Z",
                    UpdatedAt: "2024-01-02T00:00:00.000Z"
                  }
                }
              },
              // Denormalize the Desk to the User partition
              {
                Put: {
                  TableName: "mock-table",
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: {
                    PK: "User#email@email.com",
                    SK: "Desk",
                    Id: "456",
                    Type: "Desk",
                    Num: 1,
                    CreatedAt: "2024-02-01T00:00:00.000Z",
                    UpdatedAt: "2024-02-02T00:00:00.000Z"
                  }
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
      mockedUuidv4.mockReturnValueOnce("uuid1");

      const assignment: OtherTableEntityTableItem<Assignment> = {
        myPk: "Assignment|123",
        mySk: "Assignment",
        id: "123",
        type: "Assignment",
        title: "MockTitle",
        courseId: "987",
        createdAt: "2024-02-01T00:00:00.000Z",
        updatedAt: "2024-02-02T00:00:00.000Z"
      };

      const student: OtherTableEntityTableItem<Student> = {
        myPk: "Student|456",
        mySk: "Student",
        id: "456",
        type: "Student",
        name: "MockName",
        createdAt: "2024-03-01T00:00:00.000Z",
        updatedAt: "2024-03-02T00:00:00.000Z"
      };

      mockTransactGetItems.mockResolvedValueOnce({
        Responses: [{ Item: assignment }, { Item: student }]
      });

      mockSend
        .mockResolvedValueOnce("Prefetch data")
        .mockImplementationOnce(() => {
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

  describe("when the entity is owned by a uniDirectional HasMany relationships", () => {
    it("will create the entity, ensure the referenced entity exists and create a reference link", async () => {
      expect.assertions(4);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

      mockedUuidv4.mockReturnValueOnce("uuid1").mockReturnValueOnce("uuid2");

      const employee = await Employee.create({
        name: "MockName",
        organizationId: "123"
      });

      expect(employee).toEqual({
        pk: "Employee#uuid1",
        sk: "Employee",
        type: "Employee",
        id: "uuid1",
        name: "MockName",
        organizationId: "123",
        createdAt: new Date("2023-10-16T03:31:35.918Z"),
        updatedAt: new Date("2023-10-16T03:31:35.918Z")
      });
      expect(employee).toBeInstanceOf(Employee);
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                // create the employee
                Put: {
                  TableName: "mock-table",
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: {
                    PK: "Employee#uuid1",
                    SK: "Employee",
                    Type: "Employee",
                    Id: "uuid1",
                    Name: "MockName",
                    OrganizationId: "123",
                    CreatedAt: "2023-10-16T03:31:35.918Z",
                    UpdatedAt: "2023-10-16T03:31:35.918Z"
                  }
                }
              },
              {
                // Check that the org exists
                ConditionCheck: {
                  TableName: "mock-table",
                  ConditionExpression: "attribute_exists(PK)",
                  Key: {
                    PK: "Organization#123",
                    SK: "Organization"
                  }
                }
              },
              {
                // Denormalize the Employee to the Organization partition
                Put: {
                  TableName: "mock-table",
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: {
                    PK: "Organization#123",
                    SK: "Employee#uuid1",
                    Type: "Employee",
                    Id: "uuid1",
                    Name: "MockName",
                    OrganizationId: "123",
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

    it("will throw an error if the entity being created already exists", async () => {
      expect.assertions(2);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

      mockedUuidv4.mockReturnValueOnce("uuid1").mockReturnValueOnce("uuid2");

      mockSend.mockImplementationOnce(() => {
        throw new TransactionCanceledException({
          message: "MockMessage",
          CancellationReasons: [
            { Code: "ConditionalCheckFailed" },
            { Code: "None" },
            { Code: "None" }
          ],
          $metadata: {}
        });
      });

      try {
        await Employee.create({
          name: "MockName",
          organizationId: "123"
        });
      } catch (e: any) {
        expect(e.constructor.name).toEqual("TransactionWriteFailedError");
        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Employee with id: uuid1 already exists"
          )
        ]);
      }
    });

    it("will throw an error if the referenced entity does not exist", async () => {
      expect.assertions(2);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

      mockedUuidv4.mockReturnValueOnce("uuid1").mockReturnValueOnce("uuid2");

      mockSend.mockImplementationOnce(() => {
        throw new TransactionCanceledException({
          message: "MockMessage",
          CancellationReasons: [
            { Code: "None" },
            { Code: "ConditionalCheckFailed" },
            { Code: "None" }
          ],
          $metadata: {}
        });
      });

      try {
        await Employee.create({
          name: "MockName",
          organizationId: "123"
        });
      } catch (e: any) {
        expect(e.constructor.name).toEqual("TransactionWriteFailedError");
        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Organization with ID '123' does not exist"
          )
        ]);
      }
    });

    it("will throw an error if the reference link already exists", async () => {
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
        await Employee.create({
          name: "MockName",
          organizationId: "123"
        });
      } catch (e: any) {
        expect(e.constructor.name).toEqual("TransactionWriteFailedError");
        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Organization with id: 123 already has an associated Employee"
          )
        ]);
      }
    });
  });

  it("will denormalize object attributes to related entity partitions (HasMany with ObjectAttribute)", async () => {
    expect.assertions(5);

    jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
    mockedUuidv4.mockReturnValueOnce("uuid1");

    const warehouse: MockTableEntityTableItem<Warehouse> = {
      PK: "Warehouse#123",
      SK: "Warehouse",
      Id: "123",
      Type: "Warehouse",
      Name: "Main Warehouse",
      Location: { city: "Springfield", state: "IL" },
      CreatedAt: "2024-01-01T00:00:00.000Z",
      UpdatedAt: "2024-01-02T00:00:00.000Z"
    };

    mockTransactGetItems.mockResolvedValueOnce({
      Responses: [{ Item: warehouse }]
    });

    const shipment = await Shipment.create({
      destination: "Chicago",
      warehouseId: "123",
      dimensions: { weight: 50, unit: "kg" }
    });

    const newShipmentTableAttributes = {
      Id: "uuid1",
      Type: "Shipment",
      Destination: "Chicago",
      Dimensions: { weight: 50, unit: "kg" },
      WarehouseId: "123",
      CreatedAt: "2023-10-16T03:31:35.918Z",
      UpdatedAt: "2023-10-16T03:31:35.918Z"
    };

    expect(shipment).toEqual({
      pk: "Shipment#uuid1",
      sk: "Shipment",
      id: "uuid1",
      type: "Shipment",
      destination: "Chicago",
      dimensions: { weight: 50, unit: "kg" },
      warehouseId: "123",
      createdAt: new Date("2023-10-16T03:31:35.918Z"),
      updatedAt: new Date("2023-10-16T03:31:35.918Z")
    });
    expect(shipment).toBeInstanceOf(Shipment);
    expect(mockSend.mock.calls).toEqual([
      [{ name: "TransactGetCommand" }],
      [{ name: "TransactWriteCommand" }]
    ]);
    // Prefetch associated records to denormalize
    expect(mockTransactGetCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Get: {
                TableName: "mock-table",
                Key: { PK: "Warehouse#123", SK: "Warehouse" }
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
              // Put the new Shipment
              Put: {
                TableName: "mock-table",
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "Shipment#uuid1",
                  SK: "Shipment",
                  ...newShipmentTableAttributes
                }
              }
            },
            // Check that the associated Warehouse exists
            {
              ConditionCheck: {
                ConditionExpression: "attribute_exists(PK)",
                Key: { PK: "Warehouse#123", SK: "Warehouse" },
                TableName: "mock-table"
              }
            },
            // Denormalize the Shipment to the Warehouse partition
            {
              Put: {
                TableName: "mock-table",
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "Warehouse#123",
                  SK: "Shipment#uuid1",
                  ...newShipmentTableAttributes
                }
              }
            },
            // Denormalize the Warehouse (with ObjectAttribute) to the Shipment partition
            {
              Put: {
                TableName: "mock-table",
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "Shipment#uuid1",
                  SK: "Warehouse",
                  Id: "123",
                  Type: "Warehouse",
                  Name: "Main Warehouse",
                  Location: { city: "Springfield", state: "IL" },
                  CreatedAt: "2024-01-01T00:00:00.000Z",
                  UpdatedAt: "2024-01-02T00:00:00.000Z"
                }
              }
            }
          ]
        }
      ]
    ]);
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
      mockedUuidv4.mockReturnValueOnce("uuid1");

      const customer: MockTableEntityTableItem<Customer> = {
        PK: "Customer#123",
        SK: "Customer",
        Id: "123",
        Type: "Customer",
        Name: "Mock Customer",
        Address: "11 Some St",
        CreatedAt: "2024-01-01T00:00:00.000Z",
        UpdatedAt: "2024-01-02T00:00:00.000Z"
      };

      const paymentMethod: MockTableEntityTableItem<PaymentMethod> = {
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
        Responses: [{ Item: customer }, { Item: paymentMethod }]
      });

      mockSend
        .mockResolvedValueOnce("Prefetch data")
        .mockImplementationOnce(() => {
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
      mockedUuidv4.mockReturnValueOnce("uuid1");

      const customer: MockTableEntityTableItem<Customer> = {
        PK: "Customer#123",
        SK: "Customer",
        Id: "123",
        Type: "Customer",
        Name: "Mock Customer",
        Address: "11 Some St",
        CreatedAt: "2024-01-01T00:00:00.000Z",
        UpdatedAt: "2024-01-02T00:00:00.000Z"
      };

      const paymentMethod: MockTableEntityTableItem<PaymentMethod> = {
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
        Responses: [{ Item: customer }, { Item: paymentMethod }]
      });

      mockSend
        .mockResolvedValueOnce("Prefetch data")
        .mockImplementationOnce(() => {
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
      mockedUuidv4.mockReturnValueOnce("uuid1");

      const customer: MockTableEntityTableItem<Customer> = {
        PK: "Customer#123",
        SK: "Customer",
        Id: "123",
        Type: "Customer",
        Name: "Mock Customer",
        Address: "11 Some St",
        CreatedAt: "2024-01-01T00:00:00.000Z",
        UpdatedAt: "2024-01-02T00:00:00.000Z"
      };

      const paymentMethod: MockTableEntityTableItem<PaymentMethod> = {
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
        Responses: [{ Item: customer }, { Item: paymentMethod }]
      });

      mockSend
        .mockResolvedValueOnce("Prefetch data")
        .mockImplementationOnce(() => {
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
      mockedUuidv4.mockReturnValueOnce("uuid1");

      const customer: MockTableEntityTableItem<Customer> = {
        PK: "Customer#123",
        SK: "Customer",
        Id: "123",
        Type: "Customer",
        Name: "Mock Customer",
        Address: "11 Some St",
        CreatedAt: "2024-01-01T00:00:00.000Z",
        UpdatedAt: "2024-01-02T00:00:00.000Z"
      };

      const paymentMethod: MockTableEntityTableItem<PaymentMethod> = {
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
        Responses: [{ Item: customer }, { Item: paymentMethod }]
      });

      mockSend
        .mockResolvedValueOnce("Prefetch data")
        .mockImplementationOnce(() => {
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

  describe("referentialIntegrityCheck option", () => {
    describe("with referentialIntegrityCheck: false", () => {
      it("can create an entity with all attribute types without condition checks", async () => {
        expect.assertions(4);

        jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

        mockedUuidv4.mockReturnValueOnce("uuid1");

        const instance = await MyClassWithAllAttributeTypes.create(
          {
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
            objectAttribute: {
              name: "John",
              email: "john@example.com",
              tags: ["work", "vip"]
            }
          },
          { referentialIntegrityCheck: false }
        );

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
          objectAttribute: {
            name: "John",
            email: "john@example.com",
            tags: ["work", "vip"]
          },
          createdAt: new Date("2023-10-16T03:31:35.918Z"),
          updatedAt: new Date("2023-10-16T03:31:35.918Z")
        });
        expect(instance).toBeInstanceOf(MyClassWithAllAttributeTypes);
        expect(mockSend.mock.calls).toEqual([
          [{ name: "TransactWriteCommand" }]
        ]);
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
                      objectAttribute: {
                        name: "John",
                        email: "john@example.com",
                        tags: ["work", "vip"]
                      },
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

      it("will create an entity that BelongsTo an entity who HasMany of it without condition checks", async () => {
        expect.assertions(5);

        jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
        mockedUuidv4.mockReturnValueOnce("uuid1");

        const customer: MockTableEntityTableItem<Customer> = {
          PK: "Customer#123",
          SK: "Customer",
          Id: "123",
          Type: "Customer",
          Name: "Mock Customer",
          Address: "11 Some St",
          CreatedAt: "2024-01-01T00:00:00.000Z",
          UpdatedAt: "2024-01-02T00:00:00.000Z"
        };

        const paymentMethod: MockTableEntityTableItem<PaymentMethod> = {
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
          Responses: [{ Item: customer }, { Item: paymentMethod }]
        });

        const order = await Order.create(
          {
            customerId: "123",
            paymentMethodId: "456",
            orderDate: new Date("2024-01-01")
          },
          { referentialIntegrityCheck: false }
        );

        const newOrderTableAttributes = {
          Id: "uuid1",
          Type: "Order",
          CustomerId: "123",
          OrderDate: "2024-01-01T00:00:00.000Z",
          PaymentMethodId: "456",
          CreatedAt: "2023-10-16T03:31:35.918Z",
          UpdatedAt: "2023-10-16T03:31:35.918Z"
        };

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
        // Prefetch associated records to denormalize
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
                      ...newOrderTableAttributes
                    }
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
                      ...newOrderTableAttributes
                    }
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
                      ...newOrderTableAttributes
                    }
                  }
                },
                // Denormalize the Customer to the Order partition
                {
                  Put: {
                    TableName: "mock-table",
                    ConditionExpression: "attribute_not_exists(PK)",
                    Item: {
                      PK: "Order#uuid1",
                      SK: "Customer",
                      Id: "123",
                      Type: "Customer",
                      Name: "Mock Customer",
                      Address: "11 Some St",
                      CreatedAt: "2024-01-01T00:00:00.000Z",
                      UpdatedAt: "2024-01-02T00:00:00.000Z"
                    }
                  }
                },
                // Denormalize the PaymentMethod to the Order partition
                {
                  Put: {
                    TableName: "mock-table",
                    ConditionExpression: "attribute_not_exists(PK)",
                    Item: {
                      PK: "Order#uuid1",
                      SK: "PaymentMethod",
                      Id: "456",
                      Type: "PaymentMethod",
                      CustomerId: "123",
                      LastFour: "1234",
                      CreatedAt: "2024-02-01T00:00:00.000Z",
                      UpdatedAt: "2024-02-02T00:00:00.000Z"
                    }
                  }
                }
              ]
            }
          ]
        ]);
      });

      it("will create an entity with standalone foreign keys even if referenced entities don't exist", async () => {
        expect.assertions(3);

        jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
        mockedUuidv4.mockReturnValueOnce("uuid1");

        const instance = await MyClassWithAllAttributeTypes.create(
          {
            stringAttribute: "1",
            dateAttribute: new Date(),
            foreignKeyAttribute: "missing-customer",
            nullableForeignKeyAttribute: "missing-optional-customer",
            boolAttribute: true,
            numberAttribute: 9,
            enumAttribute: "val-1",
            objectAttribute: {
              name: "John",
              email: "john@example.com",
              tags: ["work", "vip"]
            }
          },
          { referentialIntegrityCheck: false }
        );

        expect(instance).toBeInstanceOf(MyClassWithAllAttributeTypes);
        expect(mockSend.mock.calls).toEqual([
          [{ name: "TransactWriteCommand" }]
        ]);
        // Verify no ConditionCheck items are present
        expect(mockTransactWriteCommand.mock.calls[0][0].TransactItems).toEqual(
          [
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
                  foreignKeyAttribute: "missing-customer",
                  nullableForeignKeyAttribute: "missing-optional-customer",
                  numberAttribute: 9,
                  objectAttribute: {
                    name: "John",
                    email: "john@example.com",
                    tags: ["work", "vip"]
                  },
                  stringAttribute: "1"
                },
                TableName: "mock-table"
              }
            }
          ]
        );
      });
    });
  });

  describe("types", () => {
    beforeAll(() => {
      // Mock return values as empty since it doesn't matter for type does
      mockTransactGetItems.mockResolvedValue({
        Responses: []
      });
    });

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

        @ForeignKeyAttribute(() => CustomerLocal, {
          alias: "CustomerId",
          nullable: true
        })
        public customerId?: NullableForeignKey<CustomerLocal>;

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
      Logger.log(res.paymentMethod);
    });

    it("will accept referentialIntegrityCheck option", async () => {
      await Order.create(
        {
          orderDate: new Date(),
          paymentMethodId: "123",
          customerId: "456"
        },
        // @ts-expect-no-error referentialIntegrityCheck option is accepted
        { referentialIntegrityCheck: false }
      );

      await Order.create(
        {
          orderDate: new Date(),
          paymentMethodId: "123",
          customerId: "456"
        },
        // @ts-expect-no-error referentialIntegrityCheck option is optional
        { referentialIntegrityCheck: true }
      );

      await Order.create(
        {
          orderDate: new Date(),
          paymentMethodId: "123",
          customerId: "456"
        }
        // @ts-expect-no-error options parameter is optional
      );
    });

    it("will not accept invalid options", async () => {
      await Order.create(
        {
          orderDate: new Date(),
          paymentMethodId: "123",
          customerId: "456"
        },
        {
          // @ts-expect-error invalid option property
          invalidOption: true
        }
      );
    });

    it("objectAttribute requires the correct shape", async () => {
      await MyClassWithAllAttributeTypes.create({
        stringAttribute: "val",
        dateAttribute: new Date(),
        foreignKeyAttribute: "123",
        boolAttribute: true,
        numberAttribute: 1,
        enumAttribute: "val-1",
        // @ts-expect-no-error: correct object shape is accepted
        objectAttribute: {
          name: "John",
          email: "john@example.com",
          tags: ["work"]
        }
      });
    });

    it("objectAttribute is required on create", async () => {
      // @ts-expect-error: objectAttribute is required (non-nullable)
      await MyClassWithAllAttributeTypes.create({
        stringAttribute: "val",
        dateAttribute: new Date(),
        foreignKeyAttribute: "123",
        boolAttribute: true,
        numberAttribute: 1,
        enumAttribute: "val-1"
      }).catch(() => {
        Logger.log("Testing types");
      });
    });

    it("objectAttribute does not accept wrong types for string fields", async () => {
      await MyClassWithAllAttributeTypes.create({
        stringAttribute: "val",
        dateAttribute: new Date(),
        foreignKeyAttribute: "123",
        boolAttribute: true,
        numberAttribute: 1,
        enumAttribute: "val-1",
        objectAttribute: {
          // @ts-expect-error: name must be a string, not number
          name: 123,
          email: "john@example.com",
          tags: ["work"]
        }
      }).catch(() => {
        Logger.log("Testing types");
      });
    });

    it("objectAttribute does not accept wrong types for array fields", async () => {
      await MyClassWithAllAttributeTypes.create({
        stringAttribute: "val",
        dateAttribute: new Date(),
        foreignKeyAttribute: "123",
        boolAttribute: true,
        numberAttribute: 1,
        enumAttribute: "val-1",
        objectAttribute: {
          name: "John",
          email: "john@example.com",
          // @ts-expect-error: tags must be string[], not string
          tags: "not-array"
        }
      }).catch(() => {
        Logger.log("Testing types");
      });
    });

    it("objectAttribute does not accept wrong item types in arrays", async () => {
      await MyClassWithAllAttributeTypes.create({
        stringAttribute: "val",
        dateAttribute: new Date(),
        foreignKeyAttribute: "123",
        boolAttribute: true,
        numberAttribute: 1,
        enumAttribute: "val-1",
        objectAttribute: {
          name: "John",
          email: "john@example.com",
          // @ts-expect-error: tags must be string[], not number[]
          tags: [123, 456]
        }
      }).catch(() => {
        Logger.log("Testing types");
      });
    });

    it("objectAttribute does not accept missing required fields", async () => {
      await MyClassWithAllAttributeTypes.create({
        stringAttribute: "val",
        dateAttribute: new Date(),
        foreignKeyAttribute: "123",
        boolAttribute: true,
        numberAttribute: 1,
        enumAttribute: "val-1",
        // @ts-expect-error: email and tags are missing
        objectAttribute: {
          name: "John"
        }
      }).catch(() => {
        Logger.log("Testing types");
      });
    });

    it("objectAttribute does not accept extra fields", async () => {
      await MyClassWithAllAttributeTypes.create({
        stringAttribute: "val",
        dateAttribute: new Date(),
        foreignKeyAttribute: "123",
        boolAttribute: true,
        numberAttribute: 1,
        enumAttribute: "val-1",
        objectAttribute: {
          name: "John",
          email: "john@example.com",
          tags: ["work"],
          // @ts-expect-error: extra is not in the schema
          extra: "not-allowed"
        }
      }).catch(() => {
        Logger.log("Testing types");
      });
    });

    it("nullableObjectAttribute is optional on create", async () => {
      await MyClassWithAllAttributeTypes.create({
        stringAttribute: "val",
        dateAttribute: new Date(),
        foreignKeyAttribute: "123",
        boolAttribute: true,
        numberAttribute: 1,
        enumAttribute: "val-1",
        objectAttribute: {
          name: "John",
          email: "john@example.com",
          tags: ["work"]
        }
        // @ts-expect-no-error: nullableObjectAttribute is optional
      });
    });

    it("nullableObjectAttribute accepts correct nested object shape", async () => {
      await MyClassWithAllAttributeTypes.create({
        stringAttribute: "val",
        dateAttribute: new Date(),
        foreignKeyAttribute: "123",
        boolAttribute: true,
        numberAttribute: 1,
        enumAttribute: "val-1",
        objectAttribute: {
          name: "John",
          email: "john@example.com",
          tags: ["work"]
        },
        // @ts-expect-no-error: correct nested shape is accepted
        nullableObjectAttribute: {
          street: "123 Main St",
          city: "Springfield",
          geo: { lat: 1, lng: 2 },
          scores: [95, 87]
        }
      });
    });

    it("nullableObjectAttribute does not accept wrong types for nested object fields", async () => {
      await MyClassWithAllAttributeTypes.create({
        stringAttribute: "val",
        dateAttribute: new Date(),
        foreignKeyAttribute: "123",
        boolAttribute: true,
        numberAttribute: 1,
        enumAttribute: "val-1",
        objectAttribute: {
          name: "John",
          email: "john@example.com",
          tags: ["work"]
        },
        nullableObjectAttribute: {
          street: "123 Main St",
          city: "Springfield",
          geo: {
            // @ts-expect-error: lat must be a number, not string
            lat: "bad",
            lng: 2
          },
          scores: [95]
        }
      }).catch(() => {
        Logger.log("Testing types");
      });
    });

    it("nullableObjectAttribute does not accept wrong item types in arrays", async () => {
      await MyClassWithAllAttributeTypes.create({
        stringAttribute: "val",
        dateAttribute: new Date(),
        foreignKeyAttribute: "123",
        boolAttribute: true,
        numberAttribute: 1,
        enumAttribute: "val-1",
        objectAttribute: {
          name: "John",
          email: "john@example.com",
          tags: ["work"]
        },
        nullableObjectAttribute: {
          street: "123 Main St",
          city: "Springfield",
          geo: { lat: 1, lng: 2 },
          // @ts-expect-error: scores must be number[], not string[]
          scores: ["bad"]
        }
      }).catch(() => {
        Logger.log("Testing types");
      });
    });

    it("nullableObjectAttribute allows nullable fields to be null or omitted", async () => {
      await MyClassWithAllAttributeTypes.create({
        stringAttribute: "val",
        dateAttribute: new Date(),
        foreignKeyAttribute: "123",
        boolAttribute: true,
        numberAttribute: 1,
        enumAttribute: "val-1",
        objectAttribute: {
          name: "John",
          email: "john@example.com",
          tags: ["work"]
        },
        // @ts-expect-no-error: zip is nullable so it can be null or omitted
        nullableObjectAttribute: {
          street: "123 Main St",
          city: "Springfield",
          zip: null,
          geo: { lat: 1, lng: 2 },
          scores: [95]
        }
      });
    });

    it("nullableObjectAttribute does not allow non-nullable fields to be null", async () => {
      await MyClassWithAllAttributeTypes.create({
        stringAttribute: "val",
        dateAttribute: new Date(),
        foreignKeyAttribute: "123",
        boolAttribute: true,
        numberAttribute: 1,
        enumAttribute: "val-1",
        objectAttribute: {
          name: "John",
          email: "john@example.com",
          tags: ["work"]
        },
        nullableObjectAttribute: {
          // @ts-expect-error: street is non-nullable, cannot be null
          street: null,
          city: "Springfield",
          geo: { lat: 1, lng: 2 },
          scores: [95]
        }
      }).catch(() => {
        Logger.log("Testing types");
      });
    });

    it("nullableObjectAttribute does not accept missing required nested fields", async () => {
      await MyClassWithAllAttributeTypes.create({
        stringAttribute: "val",
        dateAttribute: new Date(),
        foreignKeyAttribute: "123",
        boolAttribute: true,
        numberAttribute: 1,
        enumAttribute: "val-1",
        objectAttribute: {
          name: "John",
          email: "john@example.com",
          tags: ["work"]
        },
        nullableObjectAttribute: {
          street: "123 Main St",
          city: "Springfield",
          // @ts-expect-error: geo is missing required field lng
          geo: { lat: 1 },
          scores: [95]
        }
      }).catch(() => {
        Logger.log("Testing types");
      });
    });

    describe("return value object attribute types", () => {
      it("return value includes objectAttribute with correct nested types", async () => {
        const res = await MyClassWithAllAttributeTypes.create({
          stringAttribute: "val",
          dateAttribute: new Date(),
          foreignKeyAttribute: "123",
          boolAttribute: true,
          numberAttribute: 1,
          enumAttribute: "val-1",
          objectAttribute: {
            name: "John",
            email: "john@example.com",
            tags: ["work"]
          }
        });

        // @ts-expect-no-error: objectAttribute is accessible on return value
        Logger.log(res.objectAttribute);

        // @ts-expect-no-error: nested string field is accessible
        Logger.log(res.objectAttribute.name);

        // @ts-expect-no-error: nested string field is accessible
        Logger.log(res.objectAttribute.email);

        // @ts-expect-no-error: nested array field is accessible
        Logger.log(res.objectAttribute.tags);

        // @ts-expect-no-error: array item is a string
        Logger.log(res.objectAttribute.tags[0]);
      });

      it("return value objectAttribute fields have correct types (rejects wrong type assignments)", async () => {
        const res = await MyClassWithAllAttributeTypes.create({
          stringAttribute: "val",
          dateAttribute: new Date(),
          foreignKeyAttribute: "123",
          boolAttribute: true,
          numberAttribute: 1,
          enumAttribute: "val-1",
          objectAttribute: {
            name: "John",
            email: "john@example.com",
            tags: ["work"]
          }
        });

        // @ts-expect-error: name is string, not number
        const nameAsNum: number = res.objectAttribute.name;
        Logger.log(nameAsNum);

        // @ts-expect-error: tags is string[], not number[]
        const tagsAsNums: number[] = res.objectAttribute.tags;
        Logger.log(tagsAsNums);
      });

      it("return value objectAttribute does not have extra fields", async () => {
        const res = await MyClassWithAllAttributeTypes.create({
          stringAttribute: "val",
          dateAttribute: new Date(),
          foreignKeyAttribute: "123",
          boolAttribute: true,
          numberAttribute: 1,
          enumAttribute: "val-1",
          objectAttribute: {
            name: "John",
            email: "john@example.com",
            tags: ["work"]
          }
        });

        // @ts-expect-error: nonExistent is not in the schema
        Logger.log(res.objectAttribute.nonExistent);
      });

      it("return value nullableObjectAttribute is optional (may be undefined)", async () => {
        const res = await MyClassWithAllAttributeTypes.create({
          stringAttribute: "val",
          dateAttribute: new Date(),
          foreignKeyAttribute: "123",
          boolAttribute: true,
          numberAttribute: 1,
          enumAttribute: "val-1",
          objectAttribute: {
            name: "John",
            email: "john@example.com",
            tags: ["work"]
          }
        });

        try {
          // @ts-expect-error: nullableObjectAttribute might be undefined, requires optional chaining
          Logger.log(res.nullableObjectAttribute.city);
        } catch {
          Logger.log("Testing types");
        }
      });

      it("return value nullableObjectAttribute is accessible with optional chaining", async () => {
        const res = await MyClassWithAllAttributeTypes.create({
          stringAttribute: "val",
          dateAttribute: new Date(),
          foreignKeyAttribute: "123",
          boolAttribute: true,
          numberAttribute: 1,
          enumAttribute: "val-1",
          objectAttribute: {
            name: "John",
            email: "john@example.com",
            tags: ["work"]
          }
        });

        // @ts-expect-no-error: optional chaining allows safe access
        Logger.log(res.nullableObjectAttribute?.street);

        // @ts-expect-no-error: nested string field
        Logger.log(res.nullableObjectAttribute?.city);

        // @ts-expect-no-error: nested nullable field can be number, null, or undefined
        Logger.log(res.nullableObjectAttribute?.zip);

        // @ts-expect-no-error: nested object field
        Logger.log(res.nullableObjectAttribute?.geo.lat);

        // @ts-expect-no-error: nested object field
        Logger.log(res.nullableObjectAttribute?.geo.lng);

        // @ts-expect-no-error: nested array field
        Logger.log(res.nullableObjectAttribute?.scores);

        // @ts-expect-no-error: array item is a number
        Logger.log(res.nullableObjectAttribute?.scores[0]);
      });

      it("return value nullableObjectAttribute nested fields have correct types", async () => {
        const res = await MyClassWithAllAttributeTypes.create({
          stringAttribute: "val",
          dateAttribute: new Date(),
          foreignKeyAttribute: "123",
          boolAttribute: true,
          numberAttribute: 1,
          enumAttribute: "val-1",
          objectAttribute: {
            name: "John",
            email: "john@example.com",
            tags: ["work"]
          }
        });

        if (res.nullableObjectAttribute !== undefined) {
          // @ts-expect-error: city is string, not number
          const cityAsNum: number = res.nullableObjectAttribute.city;
          Logger.log(cityAsNum);

          // @ts-expect-error: geo.lat is number, not string
          const latAsStr: string = res.nullableObjectAttribute.geo.lat;
          Logger.log(latAsStr);

          // @ts-expect-error: scores is number[], not string[]
          const scoresAsStrs: string[] = res.nullableObjectAttribute.scores;
          Logger.log(scoresAsStrs);

          // @ts-expect-error: nonExistent is not in the schema
          Logger.log(res.nullableObjectAttribute.nonExistent);
        }
      });
    });
  });
});
