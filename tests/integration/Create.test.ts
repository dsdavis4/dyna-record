import DynaRecord from "../../index.js";
import {
  TransactGetCommand,
  TransactWriteCommand
} from "@aws-sdk/lib-dynamodb";
import {
  Article,
  ContactInformation,
  Customer,
  Grade,
  Home,
  Listing,
  MockTable,
  MyClassWithAllAttributeTypes,
  Order,
  Organization,
  PaymentMethod,
  PaymentMethodProvider,
  Person,
  Store,
  Teacher,
  User,
  type Desk,
  type Assignment,
  type Student,
  Employee,
  Warehouse,
  Shipment,
  DeepNestedEntity,
  ArrayOfObjectsEntity,
  DiscriminatedUnionEntity,
  ArrayOfUnionsEntity,
  Vehicle,
  Car,
  Review,
  Founder,
  Category,
  Author,
  Book,
  mockEmbeddingProviderCalls,
  mockArticleEmbeddingProviderCalls
} from "./mockModels.js";
import {
  TransactionCanceledException,
  type CancellationReason
} from "@aws-sdk/client-dynamodb";
import { generateId } from "../../src/id.js";
import {
  ConditionalCheckFailedError,
  TransactionWriteFailedError,
  WriteConditionFailedError
} from "../../src/dynamo-utils/index.js";
import { FilterError } from "../../src/errors.js";
import type { CreateOptions } from "../../src/operations/Create/types.js";
import {
  BelongsTo,
  Entity,
  ForeignKeyAttribute,
  HasMany,
  HasOne,
  PartitionKeyAttribute,
  Searchable,
  SortKeyAttribute,
  StringAttribute,
  Table
} from "../../src/decorators/index.js";
import type {
  EntityClass,
  ForeignKey,
  NullableForeignKey,
  PartitionKey,
  SortKey,
  Searchable as SearchableText
} from "../../src/types.js";
import { EmbeddingError, ValidationError } from "../../src/index.js";
import {
  type MockTableEntityTableItem,
  type OtherTableEntityTableItem
} from "./utils.js";
import Logger from "../../src/Logger.js";

vi.mock("../../src/id");

const mockTransactGetItems = vi.fn();
const mockTransactWriteCommand = vi.mocked(TransactWriteCommand);
const mockTransactGetCommand = vi.mocked(TransactGetCommand);

const mockSend = vi.fn();
const mockedGenerateId = vi.mocked(generateId);

vi.mock("@aws-sdk/client-dynamodb", () => {
  return {
    TransactionCanceledException: vi.fn().mockImplementation((...params) => {
      const obj = Object.create(TransactionCanceledException.prototype);
      Object.assign(obj, ...params);
      return obj;
    }),
    DynamoDBClient: vi.fn().mockImplementation(() => {
      return { key: "MockDynamoDBClient" };
    })
  };
});

vi.mock("@aws-sdk/lib-dynamodb", () => {
  return {
    DynamoDBDocumentClient: {
      from: vi.fn().mockImplementation(() => {
        return {
          send: vi.fn().mockImplementation(async command => {
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

    TransactWriteCommand: vi.fn().mockImplementation(() => {
      return { name: "TransactWriteCommand" };
    }),
    TransactGetCommand: vi.fn().mockImplementation(() => {
      return { name: "TransactGetCommand" };
    })
  };
});

// A standalone typed foreign key — no BelongsTo backs it — to an entity with an
// object attribute, so a write condition can guard the referenced Warehouse
// under the key's `target`
@Entity
class WarehouseInspection extends MockTable {
  declare readonly type: "WarehouseInspection";

  @StringAttribute({ alias: "Inspector" })
  public readonly inspector: string;

  @ForeignKeyAttribute(() => Warehouse, { alias: "WarehouseId" })
  public readonly warehouseId: ForeignKey<Warehouse>;
}

@Entity
class MyModelNullableAttribute extends MockTable {
  declare readonly type: "MyModelNullableAttribute";

  @StringAttribute({ alias: "MyAttribute", nullable: true })
  public myAttribute?: string;
}

describe("Create", () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockedGenerateId.mockReset();
  });

  it("will create an entity and without relationship transactions if none are needed", async () => {
    expect.assertions(4);

    vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

    mockedGenerateId.mockReturnValueOnce("uuid1");

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

    vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

    mockedGenerateId.mockReturnValueOnce("uuid1");

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

    vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

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

    vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

    mockedGenerateId.mockReturnValueOnce("uuid1");

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
        tags: ["work", "vip"],
        status: "active",
        createdDate: new Date()
      },
      addressAttribute: {
        street: "123 Main St",
        city: "Springfield",
        geo: { lat: 1, lng: 2, accuracy: "precise" },
        scores: [95]
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
        tags: ["work", "vip"],
        status: "active",
        createdDate: new Date()
      },
      addressAttribute: {
        street: "123 Main St",
        city: "Springfield",
        geo: { lat: 1, lng: 2, accuracy: "precise" },
        scores: [95]
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
                  addressAttribute: {
                    street: "123 Main St",
                    city: "Springfield",
                    geo: { lat: 1, lng: 2, accuracy: "precise" },
                    scores: [95]
                  },
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
                    tags: ["work", "vip"],
                    status: "active",
                    createdDate: "2023-10-16T03:31:35.918Z"
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

    vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

    mockedGenerateId.mockReturnValueOnce("uuid1");

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
          message: "Invalid input: expected string, received undefined",
          path: ["stringAttribute"]
        },
        {
          code: "invalid_type",
          expected: "date",
          message: "Invalid input: expected date, received undefined",
          path: ["dateAttribute"]
        },
        {
          code: "invalid_type",
          expected: "boolean",
          message: "Invalid input: expected boolean, received undefined",
          path: ["boolAttribute"]
        },
        {
          code: "invalid_type",
          expected: "number",
          message: "Invalid input: expected number, received undefined",
          path: ["numberAttribute"]
        },
        {
          code: "invalid_type",
          expected: "string",
          message: "Invalid input: expected string, received undefined",
          path: ["foreignKeyAttribute"]
        },
        {
          code: "invalid_value",
          values: ["val-1", "val-2"],
          path: ["enumAttribute"],
          message: 'Invalid option: expected one of "val-1"|"val-2"'
        },
        {
          code: "invalid_type",
          expected: "object",
          message: "Invalid input: expected object, received undefined",
          path: ["objectAttribute"]
        },
        {
          code: "invalid_type",
          expected: "object",
          message: "Invalid input: expected object, received undefined",
          path: ["addressAttribute"]
        }
      ]);
      expect(mockSend.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    }
  });

  it("will ensure standalone foreign key references exist", async () => {
    expect.assertions(3);

    vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
    mockedGenerateId.mockReturnValueOnce("uuid1");

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
          tags: ["work", "vip"],
          status: "active",
          createdDate: new Date()
        },
        addressAttribute: {
          street: "123 Main St",
          city: "Springfield",
          geo: { lat: 1, lng: 2, accuracy: "precise" },
          scores: [95]
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
                      tags: ["work", "vip"],
                      status: "active",
                      createdDate: "2023-10-16T03:31:35.918Z"
                    },
                    addressAttribute: {
                      street: "123 Main St",
                      city: "Springfield",
                      geo: { lat: 1, lng: 2, accuracy: "precise" },
                      scores: [95]
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
        nullableEnumAttribute: "val-4",
        addressAttribute: {
          street: "123 Main St",
          city: "Springfield",
          geo: { lat: 1, lng: 2, accuracy: "precise" },
          scores: [95]
        }
      } as any);
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual("Validation errors");
      expect(e.cause).toEqual([
        {
          code: "invalid_type",
          expected: "string",
          message: "Invalid input: expected string, received number",
          path: ["stringAttribute"]
        },
        {
          code: "invalid_type",
          expected: "string",
          message: "Invalid input: expected string, received number",
          path: ["nullableStringAttribute"]
        },
        {
          code: "invalid_type",
          expected: "date",
          message: "Invalid input: expected date, received number",
          path: ["dateAttribute"]
        },
        {
          code: "invalid_type",
          expected: "date",
          message: "Invalid input: expected date, received number",
          path: ["nullableDateAttribute"]
        },
        {
          code: "invalid_type",
          expected: "boolean",
          message: "Invalid input: expected boolean, received number",
          path: ["boolAttribute"]
        },
        {
          code: "invalid_type",
          expected: "boolean",
          message: "Invalid input: expected boolean, received number",
          path: ["nullableBoolAttribute"]
        },
        {
          code: "invalid_type",
          expected: "number",
          message: "Invalid input: expected number, received string",
          path: ["numberAttribute"]
        },
        {
          code: "invalid_type",
          expected: "number",
          message: "Invalid input: expected number, received string",
          path: ["nullableNumberAttribute"]
        },
        {
          code: "invalid_type",
          expected: "string",
          message: "Invalid input: expected string, received number",
          path: ["foreignKeyAttribute"]
        },
        {
          code: "invalid_type",
          expected: "string",
          message: "Invalid input: expected string, received number",
          path: ["nullableForeignKeyAttribute"]
        },
        {
          code: "invalid_value",
          message: 'Invalid option: expected one of "val-1"|"val-2"',
          values: ["val-1", "val-2"],
          path: ["enumAttribute"]
        },
        {
          code: "invalid_value",
          message: 'Invalid option: expected one of "val-1"|"val-2"',
          values: ["val-1", "val-2"],
          path: ["nullableEnumAttribute"]
        },
        {
          code: "invalid_type",
          expected: "object",
          message: "Invalid input: expected object, received undefined",
          path: ["objectAttribute"]
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
        },
        addressAttribute: {
          street: "123 Main St",
          city: "Springfield",
          geo: { lat: 1, lng: 2, accuracy: "precise" },
          scores: [95]
        }
      } as any);
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual("Validation errors");
      expect(e.cause).toEqual([
        {
          code: "invalid_type",
          expected: "string",
          message: "Invalid input: expected string, received number",
          path: ["objectAttribute", "name"]
        },
        {
          code: "invalid_type",
          expected: "string",
          message: "Invalid input: expected string, received boolean",
          path: ["objectAttribute", "email"]
        },
        {
          code: "invalid_type",
          expected: "array",
          message: "Invalid input: expected array, received string",
          path: ["objectAttribute", "tags"]
        },
        {
          code: "invalid_value",
          values: ["active", "inactive"],
          path: ["objectAttribute", "status"],
          message: 'Invalid option: expected one of "active"|"inactive"'
        },
        {
          code: "invalid_type",
          expected: "date",
          message: "Invalid input: expected date, received undefined",
          path: ["objectAttribute", "createdDate"]
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
        },
        addressAttribute: {
          street: "123 Main St",
          city: "Springfield",
          geo: { lat: 1, lng: 2, accuracy: "precise" },
          scores: [95]
        }
      } as any);
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual("Validation errors");
      expect(e.cause).toEqual([
        {
          code: "invalid_type",
          expected: "string",
          message: "Invalid input: expected string, received number",
          path: ["objectAttribute", "tags", 1]
        },
        {
          code: "invalid_type",
          expected: "string",
          message: "Invalid input: expected string, received boolean",
          path: ["objectAttribute", "tags", 2]
        },
        {
          code: "invalid_value",
          values: ["active", "inactive"],
          path: ["objectAttribute", "status"],
          message: 'Invalid option: expected one of "active"|"inactive"'
        },
        {
          code: "invalid_type",
          expected: "date",
          message: "Invalid input: expected date, received undefined",
          path: ["objectAttribute", "createdDate"]
        }
      ]);
      expect(mockSend.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    }
  });

  it("will error if addressAttribute nested object and array fields are the wrong type", async () => {
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
          tags: ["work"],
          status: "active",
          createdDate: new Date()
        },
        addressAttribute: {
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
          message: "Invalid input: expected number, received string",
          path: ["addressAttribute", "geo", "lat"]
        },
        {
          code: "invalid_type",
          expected: "number",
          message: "Invalid input: expected number, received string",
          path: ["addressAttribute", "geo", "lng"]
        },
        {
          code: "invalid_value",
          values: ["precise", "approximate"],
          path: ["addressAttribute", "geo", "accuracy"],
          message: 'Invalid option: expected one of "precise"|"approximate"'
        },
        {
          code: "invalid_type",
          expected: "number",
          message: "Invalid input: expected number, received string",
          path: ["addressAttribute", "scores", 0]
        }
      ]);
      expect(mockSend.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    }
  });

  it("will error if addressAttribute top-level fields are the wrong type", async () => {
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
          tags: ["work"],
          status: "active",
          createdDate: new Date()
        },
        addressAttribute: {
          street: 123,
          city: false,
          geo: { lat: 1, lng: 2, accuracy: "precise" },
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
          message: "Invalid input: expected string, received number",
          path: ["addressAttribute", "street"]
        },
        {
          code: "invalid_type",
          expected: "string",
          message: "Invalid input: expected string, received boolean",
          path: ["addressAttribute", "city"]
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
        },
        addressAttribute: {
          street: "123 Main St",
          city: "Springfield",
          geo: { lat: 1, lng: 2, accuracy: "precise" },
          scores: [95]
        }
      } as any);
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual("Validation errors");
      expect(e.cause).toEqual([
        {
          code: "invalid_type",
          expected: "string",
          message: "Invalid input: expected string, received null",
          path: ["objectAttribute", "name"]
        },
        {
          code: "invalid_type",
          expected: "string",
          message: "Invalid input: expected string, received null",
          path: ["objectAttribute", "email"]
        },
        {
          code: "invalid_type",
          expected: "array",
          message: "Invalid input: expected array, received null",
          path: ["objectAttribute", "tags"]
        },
        {
          code: "invalid_value",
          values: ["active", "inactive"],
          path: ["objectAttribute", "status"],
          message: 'Invalid option: expected one of "active"|"inactive"'
        },
        {
          code: "invalid_type",
          expected: "date",
          message: "Invalid input: expected date, received undefined",
          path: ["objectAttribute", "createdDate"]
        }
      ]);
      expect(mockSend.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    }
  });

  it("will error if non-nullable nested fields within addressAttribute are set to null", async () => {
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
          tags: ["work"],
          status: "active",
          createdDate: new Date()
        },
        addressAttribute: {
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
          message: "Invalid input: expected number, received null",
          path: ["addressAttribute", "geo", "lat"]
        },
        {
          code: "invalid_type",
          expected: "number",
          message: "Invalid input: expected number, received null",
          path: ["addressAttribute", "geo", "lng"]
        },
        {
          code: "invalid_value",
          values: ["precise", "approximate"],
          path: ["addressAttribute", "geo", "accuracy"],
          message: 'Invalid option: expected one of "precise"|"approximate"'
        },
        {
          code: "invalid_type",
          expected: "number",
          message: "Invalid input: expected number, received null",
          path: ["addressAttribute", "scores", 0]
        }
      ]);
      expect(mockSend.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    }
  });

  it("will strip null nullable fields within object attributes on create so they are not stored in DynamoDB", async () => {
    expect.assertions(5);

    vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

    mockedGenerateId.mockReturnValueOnce("uuid1");

    const instance = await MyClassWithAllAttributeTypes.create({
      stringAttribute: "1",
      dateAttribute: new Date(),
      foreignKeyAttribute: "1111" as ForeignKey,
      boolAttribute: true,
      numberAttribute: 9,
      enumAttribute: "val-1",
      objectAttribute: {
        name: "John",
        email: "john@example.com",
        tags: ["work"],
        status: "active",
        createdDate: new Date(),
        deletedAt: null as any
      },
      addressAttribute: {
        street: "123 Main St",
        city: "Springfield",
        geo: { lat: 1, lng: 2, accuracy: "precise" },
        scores: [95]
      }
    });

    expect(instance).toBeInstanceOf(MyClassWithAllAttributeTypes);
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
                  PK: "MyClassWithAllAttributeTypes#uuid1",
                  SK: "MyClassWithAllAttributeTypes",
                  Type: "MyClassWithAllAttributeTypes",
                  Id: "uuid1",
                  CreatedAt: "2023-10-16T03:31:35.918Z",
                  UpdatedAt: "2023-10-16T03:31:35.918Z",
                  stringAttribute: "1",
                  dateAttribute: "2023-10-16T03:31:35.918Z",
                  foreignKeyAttribute: "1111",
                  boolAttribute: true,
                  numberAttribute: 9,
                  enumAttribute: "val-1",
                  objectAttribute: {
                    name: "John",
                    email: "john@example.com",
                    tags: ["work"],
                    status: "active",
                    createdDate: "2023-10-16T03:31:35.918Z"
                  },
                  addressAttribute: {
                    street: "123 Main St",
                    city: "Springfield",
                    geo: { lat: 1, lng: 2, accuracy: "precise" },
                    scores: [95]
                  }
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
            }
          ]
        }
      ]
    ]);
    expect(
      (mockTransactWriteCommand.mock.calls[0][0] as any).TransactItems[0].Put
        .Item.objectAttribute
    ).not.toHaveProperty("deletedAt");
  });

  it("will error if objectAttribute enum field has an invalid value", async () => {
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
          tags: ["work"],
          status: "bad-value"
        },
        addressAttribute: {
          street: "123 Main St",
          city: "Springfield",
          geo: { lat: 1, lng: 2, accuracy: "precise" },
          scores: [95]
        }
      } as any);
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual("Validation errors");
      expect(e.cause).toEqual([
        {
          code: "invalid_value",
          message: 'Invalid option: expected one of "active"|"inactive"',
          values: ["active", "inactive"],
          path: ["objectAttribute", "status"]
        },
        {
          code: "invalid_type",
          expected: "date",
          message: "Invalid input: expected date, received undefined",
          path: ["objectAttribute", "createdDate"]
        }
      ]);
      expect(mockSend.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    }
  });

  it("will error if addressAttribute nested enum field has an invalid value", async () => {
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
          tags: ["work"],
          status: "active",
          createdDate: new Date()
        },
        addressAttribute: {
          street: "123 Main St",
          city: "Springfield",
          geo: { lat: 1, lng: 2, accuracy: "bad-value" },
          scores: [1]
        }
      } as any);
    } catch (e: any) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual("Validation errors");
      expect(e.cause).toEqual([
        {
          code: "invalid_value",
          message: 'Invalid option: expected one of "precise"|"approximate"',
          values: ["precise", "approximate"],
          path: ["addressAttribute", "geo", "accuracy"]
        }
      ]);
      expect(mockSend.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    }
  });

  it("will create an entity that BelongsTo an entity who HasMany of it (checks parents exists and denormalizes links)", async () => {
    expect.assertions(5);

    vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
    mockedGenerateId.mockReturnValueOnce("uuid1");

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

    vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
    mockedGenerateId.mockReturnValueOnce("uuid1");

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

      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedGenerateId.mockReturnValueOnce("uuid1");

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

      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedGenerateId.mockReturnValueOnce("uuid1");

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

      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedGenerateId.mockReturnValueOnce("uuid1");

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

      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedGenerateId.mockReturnValueOnce("uuid1");

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

      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedGenerateId.mockReturnValueOnce("uuid1");

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

      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedGenerateId.mockReturnValueOnce("uuid1");

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

      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

      mockedGenerateId
        .mockReturnValueOnce("uuid1")
        .mockReturnValueOnce("uuid2");

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

      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

      mockedGenerateId
        .mockReturnValueOnce("uuid1")
        .mockReturnValueOnce("uuid2");

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

      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

      mockedGenerateId
        .mockReturnValueOnce("uuid1")
        .mockReturnValueOnce("uuid2");

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

      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

      mockedGenerateId
        .mockReturnValueOnce("uuid1")
        .mockReturnValueOnce("uuid2");

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

    vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
    mockedGenerateId.mockReturnValueOnce("uuid1");

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

        vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
        mockedGenerateId.mockReturnValueOnce("uuid1");

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

        vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
        mockedGenerateId.mockReturnValueOnce("uuid1");

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

        vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
        mockedGenerateId.mockReturnValueOnce("uuid1");

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

      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedGenerateId.mockReturnValueOnce("uuid1");

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

      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedGenerateId.mockReturnValueOnce("uuid1");

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

      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedGenerateId.mockReturnValueOnce("uuid1");

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

      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedGenerateId.mockReturnValueOnce("uuid1");

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

        vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

        mockedGenerateId.mockReturnValueOnce("uuid1");

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
              tags: ["work", "vip"],
              status: "active",
              createdDate: new Date()
            },
            addressAttribute: {
              street: "123 Main St",
              city: "Springfield",
              geo: { lat: 1, lng: 2, accuracy: "precise" },
              scores: [95]
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
            tags: ["work", "vip"],
            status: "active",
            createdDate: new Date()
          },
          addressAttribute: {
            street: "123 Main St",
            city: "Springfield",
            geo: { lat: 1, lng: 2, accuracy: "precise" },
            scores: [95]
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
                      addressAttribute: {
                        street: "123 Main St",
                        city: "Springfield",
                        geo: { lat: 1, lng: 2, accuracy: "precise" },
                        scores: [95]
                      },
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
                        tags: ["work", "vip"],
                        status: "active",
                        createdDate: "2023-10-16T03:31:35.918Z"
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

        vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
        mockedGenerateId.mockReturnValueOnce("uuid1");

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

        vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
        mockedGenerateId.mockReturnValueOnce("uuid1");

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
              tags: ["work", "vip"],
              status: "active",
              createdDate: new Date()
            },
            addressAttribute: {
              street: "123 Main St",
              city: "Springfield",
              geo: { lat: 1, lng: 2, accuracy: "precise" },
              scores: [95]
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
                    tags: ["work", "vip"],
                    status: "active",
                    createdDate: "2023-10-16T03:31:35.918Z"
                  },
                  addressAttribute: {
                    street: "123 Main St",
                    city: "Springfield",
                    geo: { lat: 1, lng: 2, accuracy: "precise" },
                    scores: [95]
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

  describe("create deeply nested object with nullable fields omitted", () => {
    beforeEach(() => {
      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedGenerateId.mockReturnValueOnce("uuid1");
      mockSend.mockResolvedValue({});
    });

    it("creates with nested objects as empty objects when all inner fields are nullable and omitted", async () => {
      expect.assertions(4);

      await DeepNestedEntity.create({
        name: "Deep Test",
        data: {
          label: "root",
          level1: {
            level2: {
              level3: {}
            }
          }
        }
      });

      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockedGenerateId).toHaveBeenCalledTimes(1);
      expect(mockTransactWriteCommand.mock.calls).toHaveLength(1);
      expect(mockTransactWriteCommand.mock.calls[0][0].TransactItems).toEqual([
        {
          Put: {
            ConditionExpression: "attribute_not_exists(PK)",
            Item: {
              PK: "DeepNestedEntity#uuid1",
              SK: "DeepNestedEntity",
              Id: "uuid1",
              Type: "DeepNestedEntity",
              CreatedAt: "2023-10-16T03:31:35.918Z",
              UpdatedAt: "2023-10-16T03:31:35.918Z",
              Name: "Deep Test",
              Data: {
                label: "root",
                level1: {
                  level2: {
                    level3: {}
                  }
                }
              }
            },
            TableName: "mock-table"
          }
        }
      ]);
    });
  });

  describe("create with array of objects", () => {
    beforeEach(() => {
      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedGenerateId.mockReturnValueOnce("uuid1");
      mockSend.mockResolvedValue({});
    });

    it("creates entity with array of objects field", async () => {
      expect.assertions(4);

      await ArrayOfObjectsEntity.create({
        name: "Test Catalog",
        data: {
          title: "Spring",
          entries: [
            { sku: "A1", price: 10 },
            { sku: "B2", price: 20 }
          ]
        }
      });

      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockedGenerateId).toHaveBeenCalledTimes(1);
      expect(mockTransactWriteCommand.mock.calls).toHaveLength(1);
      expect(mockTransactWriteCommand.mock.calls[0][0].TransactItems).toEqual([
        {
          Put: {
            ConditionExpression: "attribute_not_exists(PK)",
            Item: {
              PK: "ArrayOfObjectsEntity#uuid1",
              SK: "ArrayOfObjectsEntity",
              Id: "uuid1",
              Type: "ArrayOfObjectsEntity",
              CreatedAt: "2023-10-16T03:31:35.918Z",
              UpdatedAt: "2023-10-16T03:31:35.918Z",
              Name: "Test Catalog",
              Data: {
                title: "Spring",
                entries: [
                  { sku: "A1", price: 10 },
                  { sku: "B2", price: 20 }
                ]
              }
            },
            TableName: "mock-table"
          }
        }
      ]);
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
        declare readonly type: "MyModel";

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
        declare readonly type: "SomeModel";

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
        declare readonly type: "ContactInformationLocal";

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
        public static override create(_bla: any): any {
          return "bla " as any;
        }
      }

      @Entity
      class CustomerLocal extends MockTable {
        declare readonly type: "CustomerLocal";

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
          tags: ["work"],
          status: "active",
          createdDate: new Date()
        },
        addressAttribute: {
          street: "123 Main St",
          city: "Springfield",
          geo: { lat: 1, lng: 2, accuracy: "precise" },
          scores: [95]
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
          tags: ["work"],
          status: "active",
          createdDate: new Date()
        },
        addressAttribute: {
          street: "123 Main St",
          city: "Springfield",
          geo: { lat: 1, lng: 2, accuracy: "precise" },
          scores: [95]
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
          tags: "not-array",
          createdDate: new Date()
        },
        addressAttribute: {
          street: "123 Main St",
          city: "Springfield",
          geo: { lat: 1, lng: 2, accuracy: "precise" },
          scores: [95]
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
          tags: [123, 456],
          createdDate: new Date()
        },
        addressAttribute: {
          street: "123 Main St",
          city: "Springfield",
          geo: { lat: 1, lng: 2, accuracy: "precise" },
          scores: [95]
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
        },
        addressAttribute: {
          street: "123 Main St",
          city: "Springfield",
          geo: { lat: 1, lng: 2, accuracy: "precise" },
          scores: [95]
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
          status: "active",
          createdDate: new Date(),
          // @ts-expect-error: extra is not in the schema
          extra: "not-allowed"
        }
      }).catch(() => {
        Logger.log("Testing types");
      });
    });

    it("addressAttribute is required on create", async () => {
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
          status: "active",
          createdDate: new Date()
        },
        // @ts-expect-no-error: addressAttribute is required
        addressAttribute: {
          street: "123 Main St",
          city: "Springfield",
          geo: { lat: 1, lng: 2, accuracy: "precise" },
          scores: [95]
        }
      });
    });

    it("addressAttribute accepts correct nested object shape", async () => {
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
          status: "active",
          createdDate: new Date()
        },
        // @ts-expect-no-error: correct nested shape is accepted
        addressAttribute: {
          street: "123 Main St",
          city: "Springfield",
          geo: { lat: 1, lng: 2, accuracy: "precise" },
          scores: [95, 87]
        }
      });
    });

    it("addressAttribute does not accept wrong types for nested object fields", async () => {
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
          status: "active",
          createdDate: new Date()
        },
        addressAttribute: {
          street: "123 Main St",
          city: "Springfield",
          geo: {
            // @ts-expect-error: lat must be a number, not string
            lat: "bad",
            lng: 2,
            accuracy: "precise"
          },
          scores: [95]
        }
      }).catch(() => {
        Logger.log("Testing types");
      });
    });

    it("addressAttribute does not accept wrong item types in arrays", async () => {
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
          status: "active",
          createdDate: new Date()
        },
        addressAttribute: {
          street: "123 Main St",
          city: "Springfield",
          geo: { lat: 1, lng: 2, accuracy: "precise" },
          // @ts-expect-error: scores must be number[], not string[]
          scores: ["bad"]
        }
      }).catch(() => {
        Logger.log("Testing types");
      });
    });

    it("addressAttribute allows nullable fields to be omitted", async () => {
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
          status: "active",
          createdDate: new Date()
        },
        // @ts-expect-no-error: zip is nullable so it can be omitted
        addressAttribute: {
          street: "123 Main St",
          city: "Springfield",
          geo: { lat: 1, lng: 2, accuracy: "precise" },
          scores: [95]
        }
      });
    });

    it("addressAttribute does not allow nullable fields to be null (omit instead)", async () => {
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
          status: "active",
          createdDate: new Date()
        },
        addressAttribute: {
          street: "123 Main St",
          city: "Springfield",
          // @ts-expect-error: nullable fields cannot be set to null, they should be left undefined
          zip: null,
          geo: { lat: 1, lng: 2, accuracy: "precise" },
          scores: [95]
        }
      }).catch(() => {
        Logger.log("Testing types");
      });
    });

    it("addressAttribute does not allow non-nullable fields to be null", async () => {
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
          status: "active",
          createdDate: new Date()
        },
        addressAttribute: {
          // @ts-expect-error: street is non-nullable, cannot be null
          street: null,
          city: "Springfield",
          geo: { lat: 1, lng: 2, accuracy: "precise" },
          scores: [95]
        }
      }).catch(() => {
        Logger.log("Testing types");
      });
    });

    it("addressAttribute does not accept missing required nested fields", async () => {
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
          status: "active",
          createdDate: new Date()
        },
        addressAttribute: {
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
            tags: ["work"],
            status: "active",
            createdDate: new Date()
          },
          addressAttribute: {
            street: "123 Main",
            city: "Springfield",
            geo: { lat: 1, lng: 2, accuracy: "precise" },
            scores: [95]
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
            tags: ["work"],
            status: "active",
            createdDate: new Date()
          },
          addressAttribute: {
            street: "123 Main",
            city: "Springfield",
            geo: { lat: 1, lng: 2, accuracy: "precise" },
            scores: [95]
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
            tags: ["work"],
            status: "active",
            createdDate: new Date()
          },
          addressAttribute: {
            street: "123 Main",
            city: "Springfield",
            geo: { lat: 1, lng: 2, accuracy: "precise" },
            scores: [95]
          }
        });

        // @ts-expect-error: nonExistent is not in the schema
        Logger.log(res.objectAttribute.nonExistent);
      });

      it("return value addressAttribute is always present (not optional)", async () => {
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
            tags: ["work"],
            status: "active",
            createdDate: new Date()
          },
          addressAttribute: {
            street: "123 Main",
            city: "Springfield",
            geo: { lat: 1, lng: 2, accuracy: "precise" },
            scores: [95]
          }
        });

        // @ts-expect-no-error: addressAttribute is always present, direct access works
        Logger.log(res.addressAttribute.city);
      });

      it("return value addressAttribute nested fields have correct types", async () => {
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
            tags: ["work"],
            status: "active",
            createdDate: new Date()
          },
          addressAttribute: {
            street: "123 Main",
            city: "Springfield",
            geo: { lat: 1, lng: 2, accuracy: "precise" },
            scores: [95]
          }
        });

        if (res.addressAttribute !== undefined) {
          // @ts-expect-error: city is string, not number
          const cityAsNum: number = res.addressAttribute.city;
          Logger.log(cityAsNum);

          // @ts-expect-error: geo.lat is number, not string
          const latAsStr: string = res.addressAttribute.geo.lat;
          Logger.log(latAsStr);

          // @ts-expect-error: scores is number[], not string[]
          const scoresAsStrs: string[] = res.addressAttribute.scores;
          Logger.log(scoresAsStrs);

          // @ts-expect-error: nonExistent is not in the schema
          Logger.log(res.addressAttribute.nonExistent);
        }
      });

      it("root-level enumAttribute rejects invalid literal on create input", async () => {
        await MyClassWithAllAttributeTypes.create({
          stringAttribute: "val",
          dateAttribute: new Date(),
          foreignKeyAttribute: "123",
          boolAttribute: true,
          numberAttribute: 1,
          // @ts-expect-error: "val-3" is not a valid enum value for enumAttribute ("val-1" | "val-2")
          enumAttribute: "val-3",
          objectAttribute: {
            name: "John",
            email: "john@example.com",
            tags: ["work"],
            status: "active",
            createdDate: new Date()
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("root-level nullableEnumAttribute rejects invalid literal on create input", async () => {
        await MyClassWithAllAttributeTypes.create({
          stringAttribute: "val",
          dateAttribute: new Date(),
          foreignKeyAttribute: "123",
          boolAttribute: true,
          numberAttribute: 1,
          enumAttribute: "val-1",
          // @ts-expect-error: "val-3" is not a valid enum value for nullableEnumAttribute ("val-1" | "val-2")
          nullableEnumAttribute: "val-3",
          objectAttribute: {
            name: "John",
            email: "john@example.com",
            tags: ["work"],
            status: "active",
            createdDate: new Date()
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("return value root-level enumAttribute is typed as literal union", async () => {
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
            tags: ["work"],
            status: "active",
            createdDate: new Date()
          },
          addressAttribute: {
            street: "123 Main",
            city: "Springfield",
            geo: { lat: 1, lng: 2, accuracy: "precise" },
            scores: [95]
          }
        });

        // @ts-expect-no-error: enumAttribute is "val-1" | "val-2"
        const val: "val-1" | "val-2" = res.enumAttribute;
        Logger.log(val);

        // @ts-expect-error: enumAttribute is "val-1" | "val-2", not number
        const valAsNum: number = res.enumAttribute;
        Logger.log(valAsNum);
      });

      it("return value root-level nullableEnumAttribute is typed as literal union or undefined", async () => {
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
            tags: ["work"],
            status: "active",
            createdDate: new Date()
          },
          addressAttribute: {
            street: "123 Main",
            city: "Springfield",
            geo: { lat: 1, lng: 2, accuracy: "precise" },
            scores: [95]
          }
        });

        // @ts-expect-no-error: nullableEnumAttribute is "val-1" | "val-2" | undefined
        const val: "val-1" | "val-2" | undefined = res.nullableEnumAttribute;
        Logger.log(val);

        // @ts-expect-error: nullableEnumAttribute is not number
        const valAsNum: number = res.nullableEnumAttribute;
        Logger.log(valAsNum);
      });

      it("objectAttribute nested enum accuracy rejects invalid literal on create input", async () => {
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
            status: "active",
            createdDate: new Date()
          },
          addressAttribute: {
            street: "123 Main",
            city: "Springfield",
            geo: {
              lat: 1,
              lng: 2,
              // @ts-expect-error: "bad-value" is not a valid enum value for accuracy ("precise" | "approximate")
              accuracy: "bad-value"
            },
            scores: [95]
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("objectAttribute nullable enum category rejects invalid literal on create input", async () => {
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
            status: "active",
            createdDate: new Date()
          },
          addressAttribute: {
            street: "123 Main",
            city: "Springfield",
            geo: { lat: 1, lng: 2, accuracy: "precise" },
            scores: [95],
            // @ts-expect-error: "bad-value" is not a valid enum value for category ("home" | "work" | "other")
            category: "bad-value"
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("return value objectAttribute enum field is typed as union of values", async () => {
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
            tags: ["work"],
            status: "active",
            createdDate: new Date()
          },
          addressAttribute: {
            street: "123 Main",
            city: "Springfield",
            geo: { lat: 1, lng: 2, accuracy: "precise" },
            scores: [95]
          }
        });

        // @ts-expect-no-error: status is "active" | "inactive"
        const status: "active" | "inactive" = res.objectAttribute.status;
        Logger.log(status);

        // @ts-expect-error: status is "active" | "inactive", not number
        const statusAsNum: number = res.objectAttribute.status;
        Logger.log(statusAsNum);
      });

      it("return value objectAttribute rejects wrong enum value on create", async () => {
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
            // @ts-expect-error: "bad-value" is not a valid enum value
            status: "bad-value"
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("return value addressAttribute nullable enum field supports undefined", async () => {
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
            tags: ["work"],
            status: "active",
            createdDate: new Date()
          },
          addressAttribute: {
            street: "123 Main",
            city: "Springfield",
            geo: { lat: 1, lng: 2, accuracy: "precise" },
            scores: [95]
          }
        });

        // @ts-expect-no-error: nullable enum field can be accessed with optional chaining
        Logger.log(res.addressAttribute?.category);

        if (res.addressAttribute !== undefined) {
          // @ts-expect-no-error: category is "home" | "work" | "other" | undefined
          const cat: "home" | "work" | "other" | undefined =
            res.addressAttribute.category;
          Logger.log(cat);
        }
      });

      it("return value nested objectAttribute enum field is typed correctly", async () => {
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
            tags: ["work"],
            status: "active",
            createdDate: new Date()
          },
          addressAttribute: {
            street: "123 Main",
            city: "Springfield",
            geo: { lat: 1, lng: 2, accuracy: "precise" },
            scores: [95]
          }
        });

        // @ts-expect-no-error: accuracy is accessible on geo via optional chaining
        Logger.log(res.addressAttribute?.geo.accuracy);

        if (res.addressAttribute !== undefined) {
          // @ts-expect-no-error: accuracy is "precise" | "approximate"
          const acc: "precise" | "approximate" =
            res.addressAttribute.geo.accuracy;
          Logger.log(acc);

          // @ts-expect-error: accuracy is "precise" | "approximate", not number
          const accAsNum: number = res.addressAttribute.geo.accuracy;
          Logger.log(accAsNum);
        }
      });
    });

    describe("write conditions", () => {
      // A BelongsTo to the entity with every attribute kind, so a target
      // condition can be audited across every kind
      @Entity
      class Variant extends MockTable {
        declare readonly type: "Variant";

        @StringAttribute({ alias: "Name" })
        public readonly name: string;

        @ForeignKeyAttribute(() => MyClassWithAllAttributeTypes, {
          alias: "SourceId"
        })
        public readonly sourceId: ForeignKey<MyClassWithAllAttributeTypes>;

        @BelongsTo(() => MyClassWithAllAttributeTypes, {
          foreignKey: "sourceId"
        })
        public readonly source: MyClassWithAllAttributeTypes;
      }

      // Standalone foreign keys to the entity with every attribute kind, so a
      // target guard's condition can be audited across every kind
      @Entity
      class Sample extends MockTable {
        declare readonly type: "Sample";

        @StringAttribute({ alias: "Name" })
        public readonly name: string;

        @ForeignKeyAttribute(() => MyClassWithAllAttributeTypes, {
          alias: "SourceId"
        })
        public readonly sourceId: ForeignKey<MyClassWithAllAttributeTypes>;

        @ForeignKeyAttribute(() => MyClassWithAllAttributeTypes, {
          alias: "BackupSourceId",
          nullable: true
        })
        public readonly backupSourceId?: NullableForeignKey<MyClassWithAllAttributeTypes>;
      }

      // Widening a target to DynaRecord is what leaves a key bare: the
      // decorator otherwise requires ForeignKey<Target>
      @Entity
      class LooseOrder extends MockTable {
        declare readonly type: "LooseOrder";

        @StringAttribute({ alias: "Name" })
        public readonly name: string;

        @ForeignKeyAttribute((): EntityClass<DynaRecord> => Customer, {
          alias: "CustomerId"
        })
        public readonly customerId: ForeignKey;

        @BelongsTo(() => Customer, { foreignKey: "customerId" })
        public readonly customer: Customer;
      }

      @Entity
      class LooseFounder extends MockTable {
        declare readonly type: "LooseFounder";

        @StringAttribute({ alias: "Name" })
        public readonly name: string;

        @ForeignKeyAttribute((): EntityClass<DynaRecord> => Organization, {
          alias: "OrganizationId"
        })
        public readonly organizationId: ForeignKey;
      }

      const order = {
        orderDate: new Date(),
        customerId: "c1",
        paymentMethodId: "pm1"
      };
      const variant = { name: "Blue", sourceId: "s1" };
      const sample = { name: "Swatch", sourceId: "s1", backupSourceId: "s2" };
      const founder = { name: "Jane", organizationId: "o1" };
      const allTypes: CreateOptions<MyClassWithAllAttributeTypes> = {
        stringAttribute: "1",
        dateAttribute: new Date(),
        foreignKeyAttribute: "c1",
        nullableForeignKeyAttribute: "c2",
        boolAttribute: true,
        numberAttribute: 9,
        enumAttribute: "val-1",
        objectAttribute: {
          name: "John",
          email: "john@example.com",
          tags: ["vip"],
          status: "active",
          createdDate: new Date()
        },
        addressAttribute: {
          street: "123 Main St",
          city: "Springfield",
          geo: { lat: 1, lng: 2, accuracy: "precise" },
          scores: [95]
        }
      };

      it("takes BelongsTo keys backed by a typed foreign key", async () => {
        await Order.create(order, {
          condition: {
            // @ts-expect-no-error: a ForeignKey<Customer> backs customer
            customer: { name: "Jane" },
            // @ts-expect-no-error: a ForeignKey<PaymentMethod> backs paymentMethod
            paymentMethod: { lastFour: "1234" }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await ContactInformation.create(
          { email: "jane@example.com", customerId: "c1" },
          {
            condition: {
              // @ts-expect-no-error: a NullableForeignKey<Customer> backs customer
              customer: { address: { $beginsWith: "1 " } }
            }
          }
        ).catch(() => {
          Logger.log("Testing types");
        });

        await Book.create(
          { name: "Dune", numPages: 412, ownerId: "p1" },
          {
            condition: {
              // @ts-expect-no-error: the BelongsTo of an entity that also has a HasAndBelongsToMany
              owner: { name: "Jane" }
            }
          }
        ).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("takes an empty target condition, which requires the parent to exist", async () => {
        await Order.create(order, {
          // @ts-expect-no-error: {} guards only that each parent exists
          condition: { customer: {}, paymentMethod: {} }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Order.create(order, {
          // @ts-expect-no-error: an empty condition guards nothing
          condition: {}
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("takes $or within the target, on the target's own attributes", async () => {
        await Order.create(order, {
          condition: {
            // @ts-expect-no-error: $or combines blocks on the Customer's row
            customer: {
              address: "1 Main St",
              $or: [{ name: "Jane" }, { name: { $beginsWith: "J" } }]
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("takes every operator each attribute kind allows, in a BelongsTo target condition", async () => {
        await Variant.create(variant, {
          condition: {
            // @ts-expect-no-error: each attribute takes the operators its kind supports
            source: {
              stringAttribute: { $beginsWith: "a" },
              dateAttribute: { $gte: new Date("2026-01-01") },
              boolAttribute: true,
              numberAttribute: { $between: [1, 10] },
              enumAttribute: ["val-1", "val-2"],
              foreignKeyAttribute: "customer-1",
              nullableStringAttribute: { $contains: "a" },
              nullableNumberAttribute: { $lte: 5 }
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Variant.create(variant, {
          condition: {
            // @ts-expect-no-error: comparisons, IN lists and stored-form prefixes per kind
            source: {
              stringAttribute: { $gt: "a", $lte: "m" },
              numberAttribute: [1, 2],
              dateAttribute: { $beginsWith: "2026" },
              enumAttribute: { $beginsWith: "val" },
              foreignKeyAttribute: { $gt: "customer-1" },
              boolAttribute: [true, false],
              nullableDateAttribute: {
                $between: [new Date("2026-01-01"), new Date("2026-12-31")]
              },
              nullableForeignKeyAttribute: { $beginsWith: "customer-" }
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("takes an enum range across two of its members in a target condition", async () => {
        await Variant.create(variant, {
          condition: {
            // @ts-expect-no-error: both bounds are members of the enum, at the top level and nested
            source: {
              enumAttribute: { $between: ["val-1", "val-2"] },
              nullableEnumAttribute: { $gte: "val-1", $lte: "val-2" },
              "objectAttribute.status": { $between: ["active", "inactive"] },
              "addressAttribute.category": { $gt: "home", $lt: "work" }
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("takes dot paths and list-index paths in a target condition", async () => {
        await Variant.create(variant, {
          condition: {
            // @ts-expect-no-error: dot paths reach the target's nested fields at any depth
            source: {
              "objectAttribute.name": { $contains: "Jane" },
              "objectAttribute.tags": { $contains: "vip" },
              "addressAttribute.geo.lat": { $lt: 41 },
              "addressAttribute.scores[0]": 5
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Shipment.create(
          {
            destination: "Springfield",
            dimensions: { weight: 1, unit: "kg" },
            warehouseId: "w1"
          },
          {
            condition: {
              // @ts-expect-no-error: the Warehouse's object attribute resolves its fields
              warehouse: {
                "location.city": { $beginsWith: "Spring" },
                $or: [{ "location.state": "IL" }, { name: "Central" }]
              }
            }
          }
        ).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("takes null on a nullable target attribute, at any depth and inside $or", async () => {
        await Variant.create(variant, {
          condition: {
            // @ts-expect-no-error: null means "not set" on a nullable attribute
            source: {
              nullableStringAttribute: null,
              nullableDateAttribute: null,
              nullableBoolAttribute: null,
              nullableNumberAttribute: null,
              nullableEnumAttribute: null,
              nullableForeignKeyAttribute: null,
              "addressAttribute.zip": null,
              "objectAttribute.deletedAt": null,
              $or: [
                { "addressAttribute.category": null },
                { nullableStringAttribute: null }
              ]
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("takes target on the typed child side of a one-way HasMany (OwnedBy)", async () => {
        await Founder.create(founder, {
          condition: {
            // @ts-expect-no-error: a ForeignKey<Organization> with no BelongsTo guards its owner
            organizationId: { target: { name: "Acme" } }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Employee.create(
          { name: "Jane", organizationId: "o1" },
          {
            condition: {
              // @ts-expect-no-error: a NullableForeignKey<Organization> guards its owner too
              organizationId: { target: {} }
            }
          }
        ).catch(() => {
          Logger.log("Testing types");
        });

        await Category.create(
          { name: "Mugs", parentCategoryId: "cat0" },
          {
            condition: {
              // @ts-expect-no-error: a self-referential owner is guarded the same way
              parentCategoryId: { target: { name: { $beginsWith: "K" } } }
            }
          }
        ).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("takes target on a typed standalone foreign key", async () => {
        await MyClassWithAllAttributeTypes.create(allTypes, {
          condition: {
            // @ts-expect-no-error: a ForeignKey<Customer> guards its Customer
            foreignKeyAttribute: { target: { name: "Jane" } },
            // @ts-expect-no-error: a NullableForeignKey<Customer> guards its Customer
            nullableForeignKeyAttribute: { target: {} }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("takes the full vocabulary in a target guard's condition", async () => {
        await Sample.create(sample, {
          condition: {
            // @ts-expect-no-error: operators per kind, dot paths, enum ranges, null and $or in a guard
            sourceId: {
              target: {
                stringAttribute: { $between: ["a", "m"] },
                numberAttribute: { $gte: 1, $lt: 10 },
                dateAttribute: [new Date("2026-01-01")],
                enumAttribute: { $between: ["val-1", "val-2"] },
                nullableBoolAttribute: null,
                "objectAttribute.createdDate": { $gte: new Date("2026-01-01") },
                "addressAttribute.geo.accuracy": { $beginsWith: "pre" },
                $or: [
                  { "addressAttribute.zip": null },
                  { boolAttribute: false }
                ]
              }
            },
            // @ts-expect-no-error: a NullableForeignKey guard takes the same vocabulary
            backupSourceId: {
              target: { "addressAttribute.scores[0]": { $gt: 1 } }
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("takes referentialIntegrityCheck beside condition, either alone, or no options", async () => {
        await Order.create(order, {
          // @ts-expect-no-error: both options together
          referentialIntegrityCheck: false,
          condition: { customer: { name: "Jane" } }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Order.create(order, {
          // @ts-expect-no-error: condition alone
          condition: { paymentMethod: {} }
        }).catch(() => {
          Logger.log("Testing types");
        });

        // @ts-expect-no-error: the options argument may be empty
        await Order.create(order, {}).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("takes only an empty condition on an entity with nothing to guard", async () => {
        // @ts-expect-no-error: an entity whose relationships are all HasMany guards nothing
        await Organization.create({ name: "Acme" }, { condition: {} }).catch(
          () => {
            Logger.log("Testing types");
          }
        );

        // @ts-expect-no-error: so does one with no relationships at all
        await MyModelNullableAttribute.create({}, { condition: {} }).catch(
          () => {
            Logger.log("Testing types");
          }
        );
      });

      it("accepts a HasOne beside a typed foreign key to the same entity", async () => {
        // Known limit: the types tell a BelongsTo from a HasOne only by
        // whether a typed foreign key to the same entity exists. Here one
        // does, so paymentMethod reads as a BelongsTo backed by
        // backupPaymentMethodId and the type accepts it. The condition
        // compiler reads the relationship metadata and throws a FilterError
        // at run time
        @Entity
        class Kiosk extends MockTable {
          declare readonly type: "Kiosk";

          @StringAttribute({ alias: "Name" })
          public readonly name: string;

          @ForeignKeyAttribute(() => PaymentMethod, {
            alias: "BackupPaymentMethodId"
          })
          public readonly backupPaymentMethodId: ForeignKey<PaymentMethod>;

          @HasOne(() => PaymentMethod, { foreignKey: "customerId" })
          public readonly paymentMethod?: PaymentMethod;
        }

        await Kiosk.create(
          { name: "Lobby", backupPaymentMethodId: "pm1" },
          {
            // @ts-expect-no-error: known limit — read as a BelongsTo; the compiler refuses it at run time
            condition: { paymentMethod: {} }
          }
        ).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses a condition on any of the entity's own attributes", async () => {
        await Order.create(order, {
          condition: {
            // @ts-expect-error: create already requires the row to be absent
            orderDate: new Date()
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Founder.create(founder, {
          condition: {
            // @ts-expect-error: name is the new row's own attribute
            name: "Jane"
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.create(allTypes, {
          condition: {
            // @ts-expect-error: null on a nullable own attribute is still a condition on the new row
            nullableStringAttribute: null
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses a value condition on a foreign key", async () => {
        await Order.create(order, {
          condition: {
            // @ts-expect-error: the foreign key's value is the new row's own
            customerId: "c1"
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Founder.create(founder, {
          condition: {
            // @ts-expect-error: create takes no condition on the new row's own attributes; a foreign key can only guard the row it references, with target
            organizationId: "o1"
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Founder.create(founder, {
          condition: {
            // @ts-expect-error: nor an operator on its value
            organizationId: { $beginsWith: "o" }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses $or at the top level", async () => {
        await Order.create(order, {
          condition: {
            // @ts-expect-error: $or holds conditions on the new row
            $or: [{ orderDate: new Date() }]
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Order.create(order, {
          condition: {
            // @ts-expect-error: nor relationship guards, which never span rows
            $or: [{ customer: { name: "Jane" } }]
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses type, which the write already fixes", async () => {
        await Order.create(order, {
          condition: {
            // @ts-expect-error: type is not a condition key
            type: "Order"
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses HasOne, HasMany and HasAndBelongsToMany keys", async () => {
        await Customer.create(
          { name: "Jane", address: "1 Main St" },
          {
            condition: {
              // @ts-expect-error: a new entity has no HasOne child yet
              contactInformation: {}
            }
          }
        ).catch(() => {
          Logger.log("Testing types");
        });

        await Customer.create(
          { name: "Jane", address: "1 Main St" },
          {
            condition: {
              // @ts-expect-error: a new entity has no HasMany children yet
              orders: [{ id: "order-1", condition: {} }]
            }
          }
        ).catch(() => {
          Logger.log("Testing types");
        });

        await Book.create(
          { name: "Dune", numPages: 412 },
          {
            condition: {
              // @ts-expect-error: a new entity has no link partners yet
              authors: [{ id: "author-1", condition: {} }]
            }
          }
        ).catch(() => {
          Logger.log("Testing types");
        });

        await PaymentMethod.create(
          { lastFour: "1234", customerId: "c1" },
          {
            condition: {
              // @ts-expect-error: a HasOne beside a BelongsTo is still a child, not a parent
              paymentMethodProvider: {}
            }
          }
        ).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses the parent side of a one-way HasMany", async () => {
        await Category.create(
          { name: "Kitchen" },
          {
            condition: {
              // @ts-expect-error: a new entity has no HasMany children yet, self-referential or not
              subcategories: [{ id: "cat-1", condition: {} }]
            }
          }
        ).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses a BelongsTo whose foreign key is bare", async () => {
        await LooseOrder.create(
          { name: "Loose", customerId: "c1" },
          {
            condition: {
              // @ts-expect-error: with a bare customerId the types cannot tell this BelongsTo from a HasOne, which create refuses
              customer: { name: "Jane" }
            }
          }
        ).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses target on a foreign key backing a BelongsTo", async () => {
        await Order.create(order, {
          condition: {
            // @ts-expect-error: guard the Customer under the customer key
            customerId: { target: { name: "Jane" } }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Order.create(order, {
          condition: {
            // @ts-expect-error: even an existence-only guard
            paymentMethodId: { target: {} }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses target on a bare foreign key (AE18)", async () => {
        await LooseFounder.create(founder, {
          condition: {
            // @ts-expect-error: organizationId needs its target type to guard it
            organizationId: { target: { name: "Acme" } }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await LooseOrder.create(
          { name: "Loose", customerId: "c1" },
          {
            condition: {
              // @ts-expect-error: a bare key backing a BelongsTo takes no target either
              customerId: { target: {} }
            }
          }
        ).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses any key on an entity with nothing to guard", async () => {
        await Organization.create(
          { name: "Acme" },
          {
            condition: {
              // @ts-expect-error: a new entity has no HasMany children yet
              employees: [{ id: "employee-1", condition: {} }]
            }
          }
        ).catch(() => {
          Logger.log("Testing types");
        });

        await Organization.create(
          { name: "Acme" },
          {
            condition: {
              // @ts-expect-error: nor a condition on its own row
              name: "Acme"
            }
          }
        ).catch(() => {
          Logger.log("Testing types");
        });

        await Author.create(
          { name: "Jane" },
          {
            condition: {
              // @ts-expect-error: a HasAndBelongsToMany-only entity has no parent to guard
              books: [{ id: "book-1", condition: {} }]
            }
          }
        ).catch(() => {
          Logger.log("Testing types");
        });

        await MyModelNullableAttribute.create(
          {},
          {
            condition: {
              // @ts-expect-error: an entity with no relationships has nothing to guard
              myAttribute: null
            }
          }
        ).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses an attribute the target does not declare", async () => {
        await Order.create(order, {
          condition: {
            // @ts-expect-error: orderDate is an Order attribute, not a Customer one
            customer: { orderDate: new Date() }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Founder.create(founder, {
          condition: {
            // @ts-expect-error: lastFour is a PaymentMethod attribute, not an Organization one
            organizationId: { target: { lastFour: "1234" } }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.create(allTypes, {
          condition: {
            // @ts-expect-error: lastFour is a PaymentMethod attribute, and the key references a Customer
            nullableForeignKeyAttribute: { target: { lastFour: "1234" } }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses type in a target condition", async () => {
        await Order.create(order, {
          condition: {
            // @ts-expect-error: the target's type is fixed by the relationship
            customer: { type: "Customer" }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Founder.create(founder, {
          condition: {
            // @ts-expect-error: and by the foreign key's target type
            organizationId: { target: { type: "Organization" } }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses a dot path naming no declared field, at each depth", async () => {
        await Variant.create(variant, {
          condition: {
            source: {
              // @ts-expect-error: objectAttribute declares no such field
              "objectAttribute.nope": 1
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Variant.create(variant, {
          condition: {
            source: {
              // @ts-expect-error: geo declares lat, lng and accuracy, not this
              "addressAttribute.geo.nope": 1
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Variant.create(variant, {
          condition: {
            source: {
              // @ts-expect-error: stringAttribute is not an object attribute
              "stringAttribute.x": "a"
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Variant.create(variant, {
          condition: {
            source: {
              // @ts-expect-error: name is a string, not a list
              "objectAttribute.name[0]": "J"
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Sample.create(sample, {
          condition: {
            sourceId: {
              target: {
                // @ts-expect-error: a guard's condition resolves dot paths the same way
                "addressAttribute.geo.nope": 1
              }
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses a value an attribute cannot hold in a target condition", async () => {
        await Variant.create(variant, {
          condition: {
            source: {
              // @ts-expect-error: stringAttribute is a string
              stringAttribute: 1
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Variant.create(variant, {
          condition: {
            source: {
              // @ts-expect-error: numberAttribute is a number
              numberAttribute: "5"
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Variant.create(variant, {
          condition: {
            source: {
              // @ts-expect-error: dateAttribute is compared as a Date
              dateAttribute: "2026-01-01"
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Variant.create(variant, {
          condition: {
            source: {
              // @ts-expect-error: enumAttribute takes val-1 or val-2
              enumAttribute: "val-3"
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Variant.create(variant, {
          condition: {
            source: {
              // @ts-expect-error: boolAttribute is a boolean
              boolAttribute: "true"
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Variant.create(variant, {
          condition: {
            source: {
              // @ts-expect-error: geo.lat is a number
              "addressAttribute.geo.lat": "41"
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Variant.create(variant, {
          condition: {
            source: {
              $or: [
                // @ts-expect-error: a $or branch is typed the same way
                { numberAttribute: "5" }
              ]
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Sample.create(sample, {
          condition: {
            sourceId: {
              target: {
                // @ts-expect-error: a guard's condition is typed the same way
                numberAttribute: "5"
              }
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses an operator an attribute cannot take in a target condition", async () => {
        await Variant.create(variant, {
          condition: {
            source: {
              // @ts-expect-error: a boolean has no prefix
              boolAttribute: { $beginsWith: "t" }
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Variant.create(variant, {
          condition: {
            source: {
              // @ts-expect-error: a number has no substring
              numberAttribute: { $contains: 1 }
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Variant.create(variant, {
          condition: {
            source: {
              // @ts-expect-error: a boolean has no ordering
              boolAttribute: { $gt: true }
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Variant.create(variant, {
          condition: {
            source: {
              // @ts-expect-error: a list has no ordering
              "objectAttribute.tags": { $gt: "a" }
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Sample.create(sample, {
          condition: {
            backupSourceId: {
              target: {
                // @ts-expect-error: a guard's condition refuses the same operators
                boolAttribute: { $between: [false, true] }
              }
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses a bad range operand in a target condition", async () => {
        await Variant.create(variant, {
          condition: {
            source: {
              // @ts-expect-error: both bounds are numbers
              numberAttribute: { $between: [1, "10"] }
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Variant.create(variant, {
          condition: {
            source: {
              // @ts-expect-error: $between takes a pair
              numberAttribute: { $between: [1] }
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Variant.create(variant, {
          condition: {
            source: {
              // @ts-expect-error: a date compares against a Date
              dateAttribute: { $gte: "2026-01-01" }
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Variant.create(variant, {
          condition: {
            source: {
              // @ts-expect-error: val-3 is not one of the enum's values
              enumAttribute: { $between: ["val-1", "val-3"] }
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Variant.create(variant, {
          condition: {
            source: {
              // @ts-expect-error: archived is not one of the nested enum's values
              "objectAttribute.status": { $gte: "active", $lte: "archived" }
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Variant.create(variant, {
          condition: {
            source: {
              // @ts-expect-error: a range bound is never null, nullable enum or not
              nullableEnumAttribute: { $between: [null, "val-2"] }
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Sample.create(sample, {
          condition: {
            sourceId: {
              target: {
                // @ts-expect-error: a guard's range bounds are typed the same way
                "addressAttribute.geo.lat": { $between: [1, "2"] }
              }
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses null on a non-nullable target attribute, at any depth", async () => {
        await Variant.create(variant, {
          condition: {
            source: {
              // @ts-expect-error: stringAttribute is not nullable
              stringAttribute: null
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Variant.create(variant, {
          condition: {
            source: {
              // @ts-expect-error: city is not nullable
              "addressAttribute.city": null
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Order.create(order, {
          condition: {
            // @ts-expect-error: a Customer's name is not nullable
            customer: { $or: [{ name: null }] }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Founder.create(founder, {
          condition: {
            organizationId: {
              target: {
                // @ts-expect-error: an Organization's name is not nullable
                name: null
              }
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses null inside an IN array in a target condition, nullable attribute or not", async () => {
        await Variant.create(variant, {
          condition: {
            source: {
              // @ts-expect-error: an IN list holds values; null is not one
              enumAttribute: ["val-1", null]
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Variant.create(variant, {
          condition: {
            source: {
              // @ts-expect-error: null means "not set", which IN cannot express
              nullableEnumAttribute: ["val-1", null]
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Sample.create(sample, {
          condition: {
            sourceId: {
              target: {
                // @ts-expect-error: nor in a guard's condition
                nullableNumberAttribute: [1, null]
              }
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses a relationship key inside a target condition", async () => {
        await Order.create(order, {
          condition: {
            // @ts-expect-error: a target condition names the parent's own attributes
            customer: { orders: [{ id: "order-1", condition: {} }] }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Order.create(order, {
          condition: {
            // @ts-expect-error: nor the parent's own BelongsTo
            paymentMethod: { customer: {} }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Founder.create(founder, {
          condition: {
            organizationId: {
              target: {
                // @ts-expect-error: nor the referenced entity's relationships in a guard
                employees: [{ id: "employee-1", condition: {} }]
              }
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses a nested guard inside a target condition", async () => {
        await Order.create(order, {
          condition: {
            // @ts-expect-error: the parent's foreign key takes its own value only
            paymentMethod: { customerId: { target: { name: "Jane" } } }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Variant.create(variant, {
          condition: {
            // @ts-expect-error: a standalone foreign key on the parent takes its own value only
            source: { foreignKeyAttribute: { target: {} } }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Category.create(
          { name: "Mugs", parentCategoryId: "cat0" },
          {
            condition: {
              parentCategoryId: {
                target: {
                  // @ts-expect-error: a guard's condition holds no further guard
                  parentCategoryId: { target: {} }
                }
              }
            }
          }
        ).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses a malformed guard shape", async () => {
        await Order.create(order, {
          condition: {
            // @ts-expect-error: the library resolves a BelongsTo target itself
            customer: { id: "c1", condition: { name: "Jane" } }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Order.create(order, {
          condition: {
            // @ts-expect-error: a BelongsTo takes one condition, not entries
            customer: [{ id: "c1", condition: {} }]
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Order.create(order, {
          condition: {
            // @ts-expect-error: a BelongsTo takes a condition object, not an id
            customer: "c1"
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Order.create(order, {
          condition: {
            // @ts-expect-error: a BelongsTo takes a condition object, not null
            customer: null
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Founder.create(founder, {
          condition: {
            // @ts-expect-error: a guard wraps its condition in target
            organizationId: { name: "Acme" }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Founder.create(founder, {
          condition: {
            // @ts-expect-error: target holds a condition object
            organizationId: { target: "Acme" }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Founder.create(founder, {
          condition: {
            // @ts-expect-error: a value condition never sits beside a guard (R33)
            organizationId: { target: { name: "Acme" }, $beginsWith: "o" }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses an option create does not take", async () => {
        await Order.create(order, {
          condition: { customer: {} },
          // @ts-expect-error: create has no such option
          conditions: { customer: {} }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Order.create(order, {
          // @ts-expect-error: a create embeds once, so it has no forceEmbed
          forceEmbed: true
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses an option value of the wrong type", async () => {
        await Order.create(order, {
          // @ts-expect-error: referentialIntegrityCheck is a boolean
          referentialIntegrityCheck: "no"
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Order.create(order, {
          // @ts-expect-error: condition is an object of guards
          condition: "x"
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Order.create(order, {
          // @ts-expect-error: condition is one object, not a list of them
          condition: [{ customer: {} }]
        }).catch(() => {
          Logger.log("Testing types");
        });
      });
    });
  });

  describe("discriminated union attributes", () => {
    it("can create an entity with a discriminated union field", async () => {
      expect.assertions(3);

      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedGenerateId.mockReturnValueOnce("du-uuid-1");

      const testDate = new Date("2024-06-15T12:00:00.000Z");

      const instance = await DiscriminatedUnionEntity.create({
        payment: {
          method: {
            type: "creditCard",
            cardNumber: "4111111111111111",
            expiry: "12/25",
            expiryDate: testDate
          },
          amount: 99.99
        },
        nullableUnion: {
          preference: {
            channel: "email",
            address: "test@example.com"
          }
        }
      });

      expect(instance).toBeInstanceOf(DiscriminatedUnionEntity);
      expect(instance.payment).toEqual({
        method: {
          type: "creditCard",
          cardNumber: "4111111111111111",
          expiry: "12/25",
          expiryDate: testDate
        },
        amount: 99.99
      });
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Put: {
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: {
                    CreatedAt: "2023-10-16T03:31:35.918Z",
                    Id: "du-uuid-1",
                    PK: "DiscriminatedUnionEntity#du-uuid-1",
                    SK: "DiscriminatedUnionEntity",
                    Type: "DiscriminatedUnionEntity",
                    UpdatedAt: "2023-10-16T03:31:35.918Z",
                    Payment: {
                      method: {
                        type: "creditCard",
                        cardNumber: "4111111111111111",
                        expiry: "12/25",
                        expiryDate: "2024-06-15T12:00:00.000Z"
                      },
                      amount: 99.99
                    },
                    NullableUnion: {
                      preference: {
                        channel: "email",
                        address: "test@example.com"
                      }
                    }
                  },
                  TableName: "mock-table"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("can create an entity with a different discriminated union variant", async () => {
      expect.assertions(2);

      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedGenerateId.mockReturnValueOnce("du-uuid-2");

      const instance = await DiscriminatedUnionEntity.create({
        payment: {
          method: {
            type: "crypto",
            walletAddress: "0xabc123",
            network: "ethereum"
          },
          amount: 50
        },
        nullableUnion: {}
      });

      expect(instance).toBeInstanceOf(DiscriminatedUnionEntity);
      expect(instance.payment.method).toEqual({
        type: "crypto",
        walletAddress: "0xabc123",
        network: "ethereum"
      });
    });

    describe("types", () => {
      beforeEach(() => {
        vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
        mockedGenerateId.mockReturnValueOnce("du-uuid-type");
      });

      it("accepts a valid complete variant on create", async () => {
        await DiscriminatedUnionEntity.create({
          payment: {
            // @ts-expect-no-error: full creditCard variant is valid
            method: {
              type: "creditCard",
              cardNumber: "4111",
              expiry: "12/25",
              expiryDate: new Date()
            },
            amount: 100
          },
          nullableUnion: {}
        });
      });

      it("rejects invalid discriminator value on create", async () => {
        await DiscriminatedUnionEntity.create({
          payment: {
            // @ts-expect-error: "paypal" is not a valid discriminator value
            method: { type: "paypal", email: "a@b.com" },
            amount: 100
          },
          nullableUnion: {}
        }).catch(() => {});
      });

      it("rejects missing required variant fields on create", async () => {
        await DiscriminatedUnionEntity.create({
          payment: {
            // @ts-expect-error: creditCard variant requires cardNumber, expiry, expiryDate
            method: { type: "creditCard" },
            amount: 100
          },
          nullableUnion: {}
        }).catch(() => {});
      });

      it("rejects wrong fields for variant on create", async () => {
        await DiscriminatedUnionEntity.create({
          payment: {
            method: {
              type: "creditCard",
              // @ts-expect-error: walletAddress does not exist on creditCard variant
              walletAddress: "0xabc"
            },
            amount: 100
          },
          nullableUnion: {}
        }).catch(() => {});
      });

      it("type narrows discriminated union on result", async () => {
        const result = await DiscriminatedUnionEntity.create({
          payment: {
            method: {
              type: "creditCard",
              cardNumber: "4111",
              expiry: "12/25",
              expiryDate: new Date()
            },
            amount: 100
          },
          nullableUnion: {}
        });

        if (result.payment.method.type === "creditCard") {
          // @ts-expect-no-error: after narrowing, cardNumber is accessible
          const card: string = result.payment.method.cardNumber;
          Logger.log(card);
        }

        if (result.payment.method.type === "crypto") {
          // @ts-expect-no-error: after narrowing, network is accessible
          const net: "ethereum" | "bitcoin" | "solana" =
            result.payment.method.network;
          Logger.log(net);
        }
      });
    });

    it("will error if discriminated union variant is missing required fields", async () => {
      expect.assertions(5);

      try {
        await DiscriminatedUnionEntity.create({
          payment: {
            method: {
              type: "creditCard"
            } as never,
            amount: 100
          },
          nullableUnion: {}
        });
      } catch (e: any) {
        expect(e).toBeInstanceOf(ValidationError);
        expect(e.message).toEqual("Validation errors");
        expect(e.cause).toEqual([
          {
            code: "invalid_type",
            expected: "string",
            message: "Invalid input: expected string, received undefined",
            path: ["payment", "method", "cardNumber"]
          },
          {
            code: "invalid_type",
            expected: "string",
            message: "Invalid input: expected string, received undefined",
            path: ["payment", "method", "expiry"]
          },
          {
            code: "invalid_type",
            expected: "date",
            message: "Invalid input: expected date, received undefined",
            path: ["payment", "method", "expiryDate"]
          }
        ]);
        expect(mockSend.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([]);
      }
    });

    it("will error if discriminated union has an invalid discriminator value", async () => {
      expect.assertions(5);

      try {
        await DiscriminatedUnionEntity.create({
          payment: {
            method: {
              type: "paypal",
              email: "a@b.com"
            } as never,
            amount: 100
          },
          nullableUnion: {}
        });
      } catch (e: any) {
        expect(e).toBeInstanceOf(ValidationError);
        expect(e.message).toEqual("Validation errors");
        expect(e.cause).toEqual([
          {
            code: "invalid_union",
            errors: [],
            note: "No matching discriminator",
            discriminator: "type",
            path: ["payment", "method", "type"],
            message: "Invalid input"
          }
        ]);
        expect(mockSend.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([]);
      }
    });

    it("will error if discriminated union variant has wrong fields for its discriminator", async () => {
      expect.assertions(5);

      try {
        await DiscriminatedUnionEntity.create({
          payment: {
            method: {
              type: "creditCard",
              bankName: "Chase",
              accountNumber: "123"
            } as never,
            amount: 100
          },
          nullableUnion: {}
        });
      } catch (e: any) {
        expect(e).toBeInstanceOf(ValidationError);
        expect(e.message).toEqual("Validation errors");
        expect(e.cause).toEqual([
          {
            code: "invalid_type",
            expected: "string",
            message: "Invalid input: expected string, received undefined",
            path: ["payment", "method", "cardNumber"]
          },
          {
            code: "invalid_type",
            expected: "string",
            message: "Invalid input: expected string, received undefined",
            path: ["payment", "method", "expiry"]
          },
          {
            code: "invalid_type",
            expected: "date",
            message: "Invalid input: expected date, received undefined",
            path: ["payment", "method", "expiryDate"]
          }
        ]);
        expect(mockSend.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([]);
      }
    });

    it("will error if discriminated union is missing the discriminator key", async () => {
      expect.assertions(5);

      try {
        await DiscriminatedUnionEntity.create({
          payment: {
            method: {
              cardNumber: "4111",
              expiry: "12/25",
              expiryDate: new Date()
            } as never,
            amount: 100
          },
          nullableUnion: {}
        });
      } catch (e: any) {
        expect(e).toBeInstanceOf(ValidationError);
        expect(e.message).toEqual("Validation errors");
        expect(e.cause).toEqual([
          {
            code: "invalid_union",
            errors: [],
            note: "No matching discriminator",
            discriminator: "type",
            path: ["payment", "method", "type"],
            message: "Invalid input"
          }
        ]);
        expect(mockSend.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([]);
      }
    });
  });

  describe("array of discriminated unions", () => {
    it("can create an entity with an array of discriminated union items", async () => {
      expect.assertions(3);

      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedGenerateId.mockReturnValueOnce("aou-uuid-1");

      const testDate = new Date("2024-06-15T12:00:00.000Z");

      const instance = await ArrayOfUnionsEntity.create({
        dashboard: {
          title: "Daily Report",
          widgets: [
            {
              type: "metric-card",
              label: "Revenue",
              value: 420,
              format: "currency",
              trend: "flat"
            },
            {
              type: "narrative-block",
              body: "Steady day.",
              tone: "neutral"
            },
            {
              type: "date-marker",
              date: testDate,
              label: "Start"
            }
          ]
        }
      });

      expect(instance).toBeInstanceOf(ArrayOfUnionsEntity);
      expect(instance.dashboard).toEqual({
        title: "Daily Report",
        widgets: [
          {
            type: "metric-card",
            label: "Revenue",
            value: 420,
            format: "currency",
            trend: "flat"
          },
          {
            type: "narrative-block",
            body: "Steady day.",
            tone: "neutral"
          },
          {
            type: "date-marker",
            date: testDate,
            label: "Start"
          }
        ]
      });
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Put: {
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: {
                    CreatedAt: "2023-10-16T03:31:35.918Z",
                    Id: "aou-uuid-1",
                    PK: "ArrayOfUnionsEntity#aou-uuid-1",
                    SK: "ArrayOfUnionsEntity",
                    Type: "ArrayOfUnionsEntity",
                    UpdatedAt: "2023-10-16T03:31:35.918Z",
                    Dashboard: {
                      title: "Daily Report",
                      widgets: [
                        {
                          type: "metric-card",
                          label: "Revenue",
                          value: 420,
                          format: "currency",
                          trend: "flat"
                        },
                        {
                          type: "narrative-block",
                          body: "Steady day.",
                          tone: "neutral"
                        },
                        {
                          type: "date-marker",
                          date: "2024-06-15T12:00:00.000Z",
                          label: "Start"
                        }
                      ]
                    }
                  },
                  TableName: "mock-table"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("can create an entity with an empty array of union items", async () => {
      expect.assertions(2);

      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedGenerateId.mockReturnValueOnce("aou-uuid-2");

      const instance = await ArrayOfUnionsEntity.create({
        dashboard: {
          title: "Empty",
          widgets: []
        }
      });

      expect(instance).toBeInstanceOf(ArrayOfUnionsEntity);
      expect(instance.dashboard.widgets).toEqual([]);
    });

    it("omits nullable fields when not provided in array union items on create", async () => {
      expect.assertions(1);

      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedGenerateId.mockReturnValueOnce("aou-uuid-3");

      await ArrayOfUnionsEntity.create({
        dashboard: {
          title: "Report",
          widgets: [
            {
              type: "metric-card",
              label: "Revenue",
              value: 420,
              format: "currency"
            }
          ]
        }
      });

      const calls = mockTransactWriteCommand.mock.calls as any;
      const putItem = calls[0][0].TransactItems[0].Put.Item;
      expect(putItem.Dashboard.widgets[0]).toEqual({
        type: "metric-card",
        label: "Revenue",
        value: 420,
        format: "currency"
      });
    });

    describe("types", () => {
      beforeEach(() => {
        vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
        mockedGenerateId.mockReturnValueOnce("aou-uuid-type");
      });

      it("accepts valid mixed variants in array on create", async () => {
        // @ts-expect-no-error: mixed valid variants
        await ArrayOfUnionsEntity.create({
          dashboard: {
            title: "Report",
            widgets: [
              {
                type: "metric-card",
                label: "Rev",
                value: 100,
                format: "currency"
              },
              { type: "narrative-block", body: "Good", tone: "neutral" }
            ]
          }
        });
      });

      it("rejects invalid discriminator value in array item", async () => {
        await ArrayOfUnionsEntity.create({
          dashboard: {
            title: "Report",
            widgets: [
              // @ts-expect-error: "chart" is not a valid discriminator value
              { type: "chart", data: [1, 2, 3] }
            ]
          }
        }).catch(() => {});
      });

      it("rejects wrong fields for variant in array item", async () => {
        await ArrayOfUnionsEntity.create({
          dashboard: {
            title: "Report",
            widgets: [
              {
                type: "metric-card",
                label: "Rev",
                value: 100,
                format: "currency",
                // @ts-expect-error: body does not exist on metric-card variant
                body: "Some text"
              }
            ]
          }
        }).catch(() => {});
      });

      it("type narrows discriminated union items in array result", async () => {
        const result = await ArrayOfUnionsEntity.create({
          dashboard: {
            title: "Report",
            widgets: [
              {
                type: "metric-card",
                label: "Rev",
                value: 100,
                format: "currency"
              }
            ]
          }
        });

        const widget = result.dashboard.widgets[0];
        if (widget.type === "metric-card") {
          // @ts-expect-no-error: after narrowing, label is accessible
          const label: string = widget.label;
          Logger.log(label);
        }

        if (widget.type === "date-marker") {
          // @ts-expect-no-error: after narrowing, date is accessible
          const d: Date = widget.date;
          Logger.log(d);
        }
      });
    });

    it("will error if array union item is missing required fields", async () => {
      expect.assertions(5);

      try {
        await ArrayOfUnionsEntity.create({
          dashboard: {
            title: "Report",
            widgets: [
              {
                type: "metric-card"
              } as never
            ]
          }
        });
      } catch (e: any) {
        expect(e).toBeInstanceOf(ValidationError);
        expect(e.message).toEqual("Validation errors");
        expect(e.cause).toEqual([
          {
            code: "invalid_type",
            expected: "string",
            message: "Invalid input: expected string, received undefined",
            path: ["dashboard", "widgets", 0, "label"]
          },
          {
            code: "invalid_type",
            expected: "number",
            message: "Invalid input: expected number, received undefined",
            path: ["dashboard", "widgets", 0, "value"]
          },
          {
            code: "invalid_value",
            message:
              'Invalid option: expected one of "currency"|"number"|"percent"',
            path: ["dashboard", "widgets", 0, "format"],
            values: ["currency", "number", "percent"]
          }
        ]);
        expect(mockSend.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([]);
      }
    });

    it("will error if array union item has an invalid discriminator value", async () => {
      expect.assertions(5);

      try {
        await ArrayOfUnionsEntity.create({
          dashboard: {
            title: "Report",
            widgets: [{ type: "unknown-widget", foo: "bar" } as never]
          }
        });
      } catch (e: any) {
        expect(e).toBeInstanceOf(ValidationError);
        expect(e.message).toEqual("Validation errors");
        expect(e.cause).toEqual([
          {
            code: "invalid_union",
            errors: [],
            note: "No matching discriminator",
            discriminator: "type",
            path: ["dashboard", "widgets", 0, "type"],
            message: "Invalid input"
          }
        ]);
        expect(mockSend.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([]);
      }
    });

    it("will error if array union item is missing the discriminator key", async () => {
      expect.assertions(5);

      try {
        await ArrayOfUnionsEntity.create({
          dashboard: {
            title: "Report",
            widgets: [{ label: "Rev", value: 100, format: "currency" } as never]
          }
        });
      } catch (e: any) {
        expect(e).toBeInstanceOf(ValidationError);
        expect(e.message).toEqual("Validation errors");
        expect(e.cause).toEqual([
          {
            code: "invalid_union",
            errors: [],
            note: "No matching discriminator",
            discriminator: "type",
            path: ["dashboard", "widgets", 0, "type"],
            message: "Invalid input"
          }
        ]);
        expect(mockSend.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([]);
      }
    });
  });

  describe("entity inheritance", () => {
    it("will create an entity registered through an abstract base class, including inherited attributes", async () => {
      expect.assertions(5);

      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

      mockedGenerateId.mockReturnValueOnce("uuid1");

      const car = await Car.create({ make: "Toyota", year: 2020, doors: 4 });

      expect(car).toEqual({
        pk: "Car#uuid1",
        sk: "Car",
        type: "Car",
        id: "uuid1",
        make: "Toyota",
        year: 2020,
        doors: 4,
        createdAt: new Date("2023-10-16T03:31:35.918Z"),
        updatedAt: new Date("2023-10-16T03:31:35.918Z")
      });
      expect(car).toBeInstanceOf(Car);
      expect(car).toBeInstanceOf(Vehicle);
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
                    PK: "Car#uuid1",
                    SK: "Car",
                    Type: "Car",
                    Id: "uuid1",
                    Make: "Toyota",
                    Year: 2020,
                    Doors: 4,
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

    it("enforces schema validation for attributes inherited from the base class", async () => {
      expect.assertions(5);

      try {
        await Car.create({ doors: 4 } as any);
      } catch (e: any) {
        expect(e).toBeInstanceOf(ValidationError);
        expect(e.message).toEqual("Validation errors");
        expect(e.cause).toEqual([
          {
            code: "invalid_type",
            expected: "string",
            message: "Invalid input: expected string, received undefined",
            path: ["make"]
          },
          {
            code: "invalid_type",
            expected: "number",
            message: "Invalid input: expected number, received undefined",
            path: ["year"]
          }
        ]);
        expect(mockSend.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([]);
      }
    });
  });
});

describe("Create with write conditions", () => {
  const now = "2023-10-16T03:31:35.918Z";

  /**
   * Makes the transaction write fail with the given cancellation reasons. Every
   * other command resolves as the shared mocks resolve it
   */
  const cancelTransactWrite = (reasons: CancellationReason[]): void => {
    mockSend.mockImplementation((command: { name: string }) => {
      if (command.name === "TransactWriteCommand") {
        throw new TransactionCanceledException({
          message: "MockMessage",
          CancellationReasons: reasons,
          $metadata: {}
        });
      }
    });
  };

  /**
   * Runs a create expected to fail and returns its error
   */
  const failureOf = async (create: () => Promise<unknown>): Promise<any> => {
    try {
      await create();
    } catch (e: unknown) {
      return e;
    }
    throw new Error("Expected the create to fail");
  };

  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.setSystemTime(new Date(now));
    mockedGenerateId.mockReturnValueOnce("uuid1");
  });

  afterEach(() => {
    mockSend.mockReset();
    mockTransactGetItems.mockReset();
    mockedGenerateId.mockReset();
    vi.clearAllMocks();
  });

  describe("on an entity with BelongsTo relationships", () => {
    const customer: MockTableEntityTableItem<Customer> = {
      PK: "Customer#c1",
      SK: "Customer",
      Id: "c1",
      Type: "Customer",
      Name: "Jane",
      Address: "1 Main St",
      CreatedAt: "2023-01-01T00:00:00.000Z",
      UpdatedAt: "2023-01-02T00:00:00.000Z"
    };
    const paymentMethod: MockTableEntityTableItem<PaymentMethod> = {
      PK: "PaymentMethod#pm1",
      SK: "PaymentMethod",
      Id: "pm1",
      Type: "PaymentMethod",
      LastFour: "1234",
      CustomerId: "c1",
      CreatedAt: "2023-01-01T00:00:00.000Z",
      UpdatedAt: "2023-01-02T00:00:00.000Z"
    };

    const orderAttributes = {
      customerId: "c1",
      paymentMethodId: "pm1",
      orderDate: new Date("2023-10-01T00:00:00.000Z")
    };

    const newOrder = {
      Id: "uuid1",
      Type: "Order",
      CustomerId: "c1",
      PaymentMethodId: "pm1",
      OrderDate: "2023-10-01T00:00:00.000Z",
      CreatedAt: now,
      UpdatedAt: now
    };

    /**
     * The earlier read of the parents, which a condition never changes
     */
    const parentsGet = [
      [
        {
          TransactItems: [
            {
              Get: {
                TableName: "mock-table",
                Key: { PK: "Customer#c1", SK: "Customer" }
              }
            },
            {
              Get: {
                TableName: "mock-table",
                Key: { PK: "PaymentMethod#pm1", SK: "PaymentMethod" }
              }
            }
          ]
        }
      ]
    ];

    const orderPut = {
      // The canonical Put keeps its own condition: create requires the row
      // to be absent, and no condition is ever merged onto it
      Put: {
        TableName: "mock-table",
        ConditionExpression: "attribute_not_exists(PK)",
        Item: { PK: "Order#uuid1", SK: "Order", ...newOrder }
      }
    };
    const customerCheck = {
      ConditionCheck: {
        TableName: "mock-table",
        Key: { PK: "Customer#c1", SK: "Customer" },
        ConditionExpression: "attribute_exists(PK)"
      }
    };
    const customerLinkPut = {
      Put: {
        TableName: "mock-table",
        ConditionExpression: "attribute_not_exists(PK)",
        Item: { PK: "Customer#c1", SK: "Order#uuid1", ...newOrder }
      }
    };
    const paymentMethodCheck = {
      ConditionCheck: {
        TableName: "mock-table",
        Key: { PK: "PaymentMethod#pm1", SK: "PaymentMethod" },
        ConditionExpression: "attribute_exists(PK)"
      }
    };
    const paymentMethodLinkPut = {
      Put: {
        TableName: "mock-table",
        ConditionExpression: "attribute_not_exists(PK)",
        Item: { PK: "PaymentMethod#pm1", SK: "Order#uuid1", ...newOrder }
      }
    };
    const customerCopyPut = {
      Put: {
        TableName: "mock-table",
        ConditionExpression: "attribute_not_exists(PK)",
        Item: { ...customer, PK: "Order#uuid1", SK: "Customer" }
      }
    };
    const paymentMethodCopyPut = {
      Put: {
        TableName: "mock-table",
        ConditionExpression: "attribute_not_exists(PK)",
        Item: { ...paymentMethod, PK: "Order#uuid1", SK: "PaymentMethod" }
      }
    };

    describe("with referential integrity checks", () => {
      beforeEach(() => {
        mockTransactGetItems.mockResolvedValue({
          Responses: [{ Item: customer }, { Item: paymentMethod }]
        });
      });

      describe("an unconditioned create", () => {
        const unconditionedItems = [
          orderPut,
          customerCheck,
          customerLinkPut,
          paymentMethodCheck,
          paymentMethodLinkPut,
          customerCopyPut,
          paymentMethodCopyPut
        ];

        it("sends exactly today's commands without options", async () => {
          expect.assertions(3);

          await Order.create(orderAttributes);

          expect(mockSend.mock.calls).toEqual([
            [{ name: "TransactGetCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockTransactGetCommand.mock.calls).toEqual(parentsGet);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [{ TransactItems: unconditionedItems }]
          ]);
        });

        it("sends exactly today's command with only referentialIntegrityCheck", async () => {
          expect.assertions(1);

          await Order.create(orderAttributes, {
            referentialIntegrityCheck: true
          });

          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [{ TransactItems: unconditionedItems }]
          ]);
        });

        it("sends exactly today's command for an empty condition (R29)", async () => {
          expect.assertions(1);

          await Order.create(orderAttributes, { condition: {} });

          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [{ TransactItems: unconditionedItems }]
          ]);
        });
      });

      describe("a BelongsTo guard (AE3)", () => {
        const create = async (): Promise<void> => {
          await Order.create(orderAttributes, {
            condition: { customer: { name: "Jane" } }
          });
        };

        const sentItems = [
          orderPut,
          {
            // One check on the Customer's row carries both the library's
            // existence check and the guard
            ConditionCheck: {
              TableName: "mock-table",
              Key: { PK: "Customer#c1", SK: "Customer" },
              ConditionExpression:
                "attribute_exists(PK) AND (attribute_exists(PK) AND (#Name = :wc1_Name1))",
              ExpressionAttributeNames: { "#Name": "Name" },
              ExpressionAttributeValues: { ":wc1_Name1": "Jane" },
              ReturnValuesOnConditionCheckFailure: "ALL_OLD"
            }
          },
          customerLinkPut,
          paymentMethodCheck,
          paymentMethodLinkPut,
          customerCopyPut,
          paymentMethodCopyPut
        ];

        it("merges into the parent's referential-integrity check", async () => {
          expect.assertions(3);

          await create();

          expect(mockSend.mock.calls).toEqual([
            [{ name: "TransactGetCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockTransactGetCommand.mock.calls).toEqual(parentsGet);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [{ TransactItems: sentItems }]
          ]);
        });

        it("reports a failed guard as a WriteConditionFailedError naming the relationship, with the returned row stripped from the cause", async () => {
          expect.assertions(6);

          cancelTransactWrite([
            { Code: "None" },
            {
              Code: "ConditionalCheckFailed",
              Item: {
                PK: { S: "Customer#c1" },
                SK: { S: "Customer" },
                Name: { S: "Bob" }
              }
            },
            { Code: "None" },
            { Code: "None" },
            { Code: "None" },
            { Code: "None" },
            { Code: "None" }
          ]);

          const e = await failureOf(create);

          expect(e).toBeInstanceOf(TransactionWriteFailedError);
          expect(e.message).toEqual("Failed Conditional Checks");
          expect(e.errors).toEqual([
            new WriteConditionFailedError(
              "ConditionalCheckFailed: Write condition failed on Order with ID 'uuid1': relationship 'customer'",
              {
                entity: "Order",
                id: "uuid1",
                guards: [{ kind: "relationship", name: "customer" }]
              }
            )
          ]);
          expect(e.errors[0].guards).toEqual([
            { kind: "relationship", name: "customer" }
          ]);
          expect(e.cause.CancellationReasons[1]).toEqual({
            Code: "ConditionalCheckFailed"
          });
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [{ TransactItems: sentItems }]
          ]);
        });

        it("reports a missing parent as a referential-integrity failure, not the guard", async () => {
          expect.assertions(2);

          cancelTransactWrite([
            { Code: "None" },
            { Code: "ConditionalCheckFailed" },
            { Code: "None" },
            { Code: "None" },
            { Code: "None" },
            { Code: "None" },
            { Code: "None" }
          ]);

          const e = await failureOf(create);

          expect(e.errors).toEqual([
            new ConditionalCheckFailedError(
              "ConditionalCheckFailed: Customer with ID 'c1' does not exist"
            )
          ]);
          expect(e.errors[0]).not.toBeInstanceOf(WriteConditionFailedError);
        });

        it("reports an existing row with the canonical Put's own message", async () => {
          expect.assertions(2);

          cancelTransactWrite([
            { Code: "ConditionalCheckFailed" },
            { Code: "None" },
            { Code: "None" },
            { Code: "None" },
            { Code: "None" },
            { Code: "None" },
            { Code: "None" }
          ]);

          const e = await failureOf(create);

          expect(e.errors).toEqual([
            new ConditionalCheckFailedError(
              "ConditionalCheckFailed: Order with id: uuid1 already exists"
            )
          ]);
          expect(e.errors[0]).not.toBeInstanceOf(WriteConditionFailedError);
        });

        it("passes a TransactionConflict-only cancellation through unchanged", async () => {
          expect.assertions(3);

          const reasons = [
            { Code: "None" },
            { Code: "TransactionConflict" },
            { Code: "None" },
            { Code: "None" },
            { Code: "None" },
            { Code: "None" },
            { Code: "None" }
          ];
          cancelTransactWrite(reasons);

          const e = await failureOf(create);

          expect(e).toBeInstanceOf(TransactionCanceledException);
          expect(e.CancellationReasons).toEqual(reasons);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [{ TransactItems: sentItems }]
          ]);
        });
      });

      it("merges guards on both parents into each one's integrity check, in the full vocabulary", async () => {
        expect.assertions(1);

        await Order.create(orderAttributes, {
          condition: {
            customer: {
              $or: [{ name: { $beginsWith: "J" } }, { address: "1 Main St" }]
            },
            paymentMethod: { lastFour: ["1234", "5678"] }
          }
        });

        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                orderPut,
                {
                  ConditionCheck: {
                    TableName: "mock-table",
                    Key: { PK: "Customer#c1", SK: "Customer" },
                    ConditionExpression:
                      "attribute_exists(PK) AND (attribute_exists(PK) AND (begins_with(#Name, :wc1_Name1) OR #Address = :wc1_Address2))",
                    ExpressionAttributeNames: {
                      "#Name": "Name",
                      "#Address": "Address"
                    },
                    ExpressionAttributeValues: {
                      ":wc1_Name1": "J",
                      ":wc1_Address2": "1 Main St"
                    },
                    ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                  }
                },
                customerLinkPut,
                {
                  ConditionCheck: {
                    TableName: "mock-table",
                    Key: { PK: "PaymentMethod#pm1", SK: "PaymentMethod" },
                    ConditionExpression:
                      "attribute_exists(PK) AND (attribute_exists(PK) AND (#LastFour IN (:wc2_LastFour1,:wc2_LastFour2)))",
                    ExpressionAttributeNames: { "#LastFour": "LastFour" },
                    ExpressionAttributeValues: {
                      ":wc2_LastFour1": "1234",
                      ":wc2_LastFour2": "5678"
                    },
                    ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                  }
                },
                paymentMethodLinkPut,
                customerCopyPut,
                paymentMethodCopyPut
              ]
            }
          ]
        ]);
      });

      it("merges an existence-only guard (customer: {}) into the integrity check (R29)", async () => {
        expect.assertions(1);

        await Order.create(orderAttributes, { condition: { customer: {} } });

        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                orderPut,
                {
                  ConditionCheck: {
                    TableName: "mock-table",
                    Key: { PK: "Customer#c1", SK: "Customer" },
                    ConditionExpression:
                      "attribute_exists(PK) AND (attribute_exists(PK))",
                    ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                  }
                },
                customerLinkPut,
                paymentMethodCheck,
                paymentMethodLinkPut,
                customerCopyPut,
                paymentMethodCopyPut
              ]
            }
          ]
        ]);
      });
    });

    describe("with referentialIntegrityCheck: false", () => {
      beforeEach(() => {
        // The Customer does not exist
        mockTransactGetItems.mockResolvedValue({
          Responses: [{}, { Item: paymentMethod }]
        });
      });

      describe("a guard on a missing parent (AE14, R18)", () => {
        const create = async (): Promise<void> => {
          await Order.create(orderAttributes, {
            referentialIntegrityCheck: false,
            condition: { customer: { name: "Jane" } }
          });
        };

        const sentItems = [
          orderPut,
          customerLinkPut,
          paymentMethodLinkPut,
          paymentMethodCopyPut,
          {
            // With no integrity check queued, the guard adds its own check,
            // which still requires the Customer to exist
            ConditionCheck: {
              TableName: "mock-table",
              Key: { PK: "Customer#c1", SK: "Customer" },
              ConditionExpression:
                "attribute_exists(PK) AND (attribute_exists(PK) AND (#Name = :wc1_Name1))",
              ExpressionAttributeNames: { "#Name": "Name" },
              ExpressionAttributeValues: { ":wc1_Name1": "Jane" },
              ReturnValuesOnConditionCheckFailure: "ALL_OLD"
            }
          }
        ];

        it("adds its own check on the parent's row", async () => {
          expect.assertions(3);

          await create();

          expect(mockSend.mock.calls).toEqual([
            [{ name: "TransactGetCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockTransactGetCommand.mock.calls).toEqual(parentsGet);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [{ TransactItems: sentItems }]
          ]);
        });

        it("reports the missing parent as a referential-integrity failure, not the guard", async () => {
          expect.assertions(2);

          cancelTransactWrite([
            { Code: "None" },
            { Code: "None" },
            { Code: "None" },
            { Code: "None" },
            { Code: "ConditionalCheckFailed" }
          ]);

          const e = await failureOf(create);

          expect(e.errors).toEqual([
            new ConditionalCheckFailedError(
              "ConditionalCheckFailed: Customer with ID 'c1' does not exist"
            )
          ]);
          expect(e.errors[0]).not.toBeInstanceOf(WriteConditionFailedError);
        });

        it("reports a failed guard on an existing parent as a WriteConditionFailedError", async () => {
          expect.assertions(1);

          cancelTransactWrite([
            { Code: "None" },
            { Code: "None" },
            { Code: "None" },
            { Code: "None" },
            {
              Code: "ConditionalCheckFailed",
              Item: {
                PK: { S: "Customer#c1" },
                SK: { S: "Customer" },
                Name: { S: "Bob" }
              }
            }
          ]);

          const e = await failureOf(create);

          expect(e.errors).toEqual([
            new WriteConditionFailedError(
              "ConditionalCheckFailed: Write condition failed on Order with ID 'uuid1': relationship 'customer'",
              {
                entity: "Order",
                id: "uuid1",
                guards: [{ kind: "relationship", name: "customer" }]
              }
            )
          ]);
        });
      });

      it("adds an existence-only check for customer: {} (AE17)", async () => {
        expect.assertions(1);

        await Order.create(orderAttributes, {
          referentialIntegrityCheck: false,
          condition: { customer: {} }
        });

        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                orderPut,
                customerLinkPut,
                paymentMethodLinkPut,
                paymentMethodCopyPut,
                {
                  ConditionCheck: {
                    TableName: "mock-table",
                    Key: { PK: "Customer#c1", SK: "Customer" },
                    ConditionExpression:
                      "attribute_exists(PK) AND (attribute_exists(PK))",
                    ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                  }
                }
              ]
            }
          ]
        ]);
      });
    });
  });

  describe("a foreign key target guard on the child side of a one-way HasMany (OwnedBy)", () => {
    const create = async (): Promise<void> => {
      await Founder.create(
        { name: "Jane", organizationId: "o1" },
        { condition: { organizationId: { target: { name: "Acme" } } } }
      );
    };

    const newFounder = {
      Id: "uuid1",
      Type: "Founder",
      Name: "Jane",
      OrganizationId: "o1",
      CreatedAt: now,
      UpdatedAt: now
    };

    const sentItems = [
      {
        Put: {
          TableName: "mock-table",
          ConditionExpression: "attribute_not_exists(PK)",
          Item: { PK: "Founder#uuid1", SK: "Founder", ...newFounder }
        }
      },
      {
        // The guard merges into the owner's integrity check
        ConditionCheck: {
          TableName: "mock-table",
          Key: { PK: "Organization#o1", SK: "Organization" },
          ConditionExpression:
            "attribute_exists(PK) AND (attribute_exists(PK) AND (#Name = :wc1_Name1))",
          ExpressionAttributeNames: { "#Name": "Name" },
          ExpressionAttributeValues: { ":wc1_Name1": "Acme" },
          ReturnValuesOnConditionCheckFailure: "ALL_OLD"
        }
      },
      {
        Put: {
          TableName: "mock-table",
          ConditionExpression: "attribute_not_exists(PK)",
          Item: { PK: "Organization#o1", SK: "Founder#uuid1", ...newFounder }
        }
      }
    ];

    it("checks the owner in its integrity check, with no earlier read", async () => {
      expect.assertions(2);

      await create();

      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [{ TransactItems: sentItems }]
      ]);
    });

    it("reports a failed guard naming the foreign key", async () => {
      expect.assertions(1);

      cancelTransactWrite([
        { Code: "None" },
        {
          Code: "ConditionalCheckFailed",
          Item: {
            PK: { S: "Organization#o1" },
            SK: { S: "Organization" },
            Name: { S: "Globex" }
          }
        },
        { Code: "None" }
      ]);

      const e = await failureOf(create);

      expect(e.errors).toEqual([
        new WriteConditionFailedError(
          "ConditionalCheckFailed: Write condition failed on Founder with ID 'uuid1': foreign key 'organizationId'",
          {
            entity: "Founder",
            id: "uuid1",
            guards: [{ kind: "foreignKey", name: "organizationId" }]
          }
        )
      ]);
    });

    it("checks a self-referential owner the same way", async () => {
      expect.assertions(1);

      await Category.create(
        { name: "Mugs", parentCategoryId: "cat0" },
        { condition: { parentCategoryId: { target: { name: "Kitchen" } } } }
      );

      const newCategory = {
        Id: "uuid1",
        Type: "Category",
        Name: "Mugs",
        ParentCategoryId: "cat0",
        CreatedAt: now,
        UpdatedAt: now
      };

      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Put: {
                  TableName: "mock-table",
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: { PK: "Category#uuid1", SK: "Category", ...newCategory }
                }
              },
              {
                ConditionCheck: {
                  TableName: "mock-table",
                  Key: { PK: "Category#cat0", SK: "Category" },
                  ConditionExpression:
                    "attribute_exists(PK) AND (attribute_exists(PK) AND (#Name = :wc1_Name1))",
                  ExpressionAttributeNames: { "#Name": "Name" },
                  ExpressionAttributeValues: { ":wc1_Name1": "Kitchen" },
                  ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                }
              },
              {
                Put: {
                  TableName: "mock-table",
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: {
                    PK: "Category#cat0",
                    SK: "Category#uuid1",
                    ...newCategory
                  }
                }
              }
            ]
          }
        ]
      ]);
    });
  });

  describe("a standalone typed foreign key target guard (AE12)", () => {
    const attributes: CreateOptions<MyClassWithAllAttributeTypes> = {
      stringAttribute: "1",
      dateAttribute: new Date(now),
      foreignKeyAttribute: "c1",
      nullableForeignKeyAttribute: "c2",
      boolAttribute: true,
      numberAttribute: 9,
      enumAttribute: "val-1",
      objectAttribute: {
        name: "John",
        email: "john@example.com",
        tags: ["work", "vip"],
        status: "active",
        createdDate: new Date(now)
      },
      addressAttribute: {
        street: "123 Main St",
        city: "Springfield",
        geo: { lat: 1, lng: 2, accuracy: "precise" },
        scores: [95]
      }
    };

    const putItem = (foreignKeys: {
      foreignKeyAttribute: string;
      nullableForeignKeyAttribute: string;
    }): Record<string, unknown> => ({
      Put: {
        TableName: "mock-table",
        ConditionExpression: "attribute_not_exists(PK)",
        Item: {
          PK: "MyClassWithAllAttributeTypes#uuid1",
          SK: "MyClassWithAllAttributeTypes",
          Id: "uuid1",
          Type: "MyClassWithAllAttributeTypes",
          CreatedAt: now,
          UpdatedAt: now,
          stringAttribute: "1",
          dateAttribute: now,
          ...foreignKeys,
          boolAttribute: true,
          numberAttribute: 9,
          enumAttribute: "val-1",
          objectAttribute: {
            name: "John",
            email: "john@example.com",
            tags: ["work", "vip"],
            status: "active",
            createdDate: now
          },
          addressAttribute: {
            street: "123 Main St",
            city: "Springfield",
            geo: { lat: 1, lng: 2, accuracy: "precise" },
            scores: [95]
          }
        }
      }
    });

    const existenceCheck = (id: string): Record<string, unknown> => ({
      ConditionCheck: {
        TableName: "mock-table",
        Key: { PK: `Customer#${id}`, SK: "Customer" },
        ConditionExpression: "attribute_exists(PK)"
      }
    });

    describe("on one foreign key", () => {
      const create = async (): Promise<void> => {
        await MyClassWithAllAttributeTypes.create(attributes, {
          condition: { foreignKeyAttribute: { target: { name: "Jane" } } }
        });
      };

      const sentItems = [
        putItem({
          foreignKeyAttribute: "c1",
          nullableForeignKeyAttribute: "c2"
        }),
        {
          ConditionCheck: {
            TableName: "mock-table",
            Key: { PK: "Customer#c1", SK: "Customer" },
            ConditionExpression:
              "attribute_exists(PK) AND (attribute_exists(PK) AND (#Name = :wc1_Name1))",
            ExpressionAttributeNames: { "#Name": "Name" },
            ExpressionAttributeValues: { ":wc1_Name1": "Jane" },
            ReturnValuesOnConditionCheckFailure: "ALL_OLD"
          }
        },
        existenceCheck("c2")
      ];

      it("merges into the referenced row's integrity check", async () => {
        expect.assertions(2);

        await create();

        expect(mockSend.mock.calls).toEqual([
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [{ TransactItems: sentItems }]
        ]);
      });

      it("reports a failed guard naming the foreign key", async () => {
        expect.assertions(1);

        cancelTransactWrite([
          { Code: "None" },
          {
            Code: "ConditionalCheckFailed",
            Item: {
              PK: { S: "Customer#c1" },
              SK: { S: "Customer" },
              Name: { S: "Bob" }
            }
          },
          { Code: "None" }
        ]);

        const e = await failureOf(create);

        expect(e.errors).toEqual([
          new WriteConditionFailedError(
            "ConditionalCheckFailed: Write condition failed on MyClassWithAllAttributeTypes with ID 'uuid1': foreign key 'foreignKeyAttribute'",
            {
              entity: "MyClassWithAllAttributeTypes",
              id: "uuid1",
              guards: [{ kind: "foreignKey", name: "foreignKeyAttribute" }]
            }
          )
        ]);
      });

      it("adds its own check with referentialIntegrityCheck: false", async () => {
        expect.assertions(1);

        await MyClassWithAllAttributeTypes.create(attributes, {
          referentialIntegrityCheck: false,
          condition: { nullableForeignKeyAttribute: { target: {} } }
        });

        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                putItem({
                  foreignKeyAttribute: "c1",
                  nullableForeignKeyAttribute: "c2"
                }),
                {
                  ConditionCheck: {
                    TableName: "mock-table",
                    Key: { PK: "Customer#c2", SK: "Customer" },
                    ConditionExpression:
                      "attribute_exists(PK) AND (attribute_exists(PK))",
                    ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                  }
                }
              ]
            }
          ]
        ]);
      });
    });

    describe("two foreign keys to the same parent", () => {
      const sameParent = {
        ...attributes,
        nullableForeignKeyAttribute: "c1"
      };
      const samePut = putItem({
        foreignKeyAttribute: "c1",
        nullableForeignKeyAttribute: "c1"
      });

      it("sends exactly today's command when unconditioned, duplicate checks included (KTD4 invariant 3)", async () => {
        expect.assertions(1);

        await MyClassWithAllAttributeTypes.create(sameParent);

        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                samePut,
                existenceCheck("c1"),
                existenceCheck("c1")
              ]
            }
          ]
        ]);
      });

      describe("guarded through both keys", () => {
        const create = async (): Promise<void> => {
          await MyClassWithAllAttributeTypes.create(sameParent, {
            referentialIntegrityCheck: false,
            condition: {
              foreignKeyAttribute: { target: { name: "Jane" } },
              nullableForeignKeyAttribute: { target: { name: "Janet" } }
            }
          });
        };

        it("merge into one check with distinct placeholders", async () => {
          expect.assertions(1);

          await create();

          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [
              {
                TransactItems: [
                  samePut,
                  {
                    ConditionCheck: {
                      TableName: "mock-table",
                      Key: { PK: "Customer#c1", SK: "Customer" },
                      ConditionExpression:
                        "attribute_exists(PK) AND (attribute_exists(PK) AND (#Name = :wc1_Name1)) AND (attribute_exists(PK) AND (#Name = :wc2_Name1))",
                      ExpressionAttributeNames: { "#Name": "Name" },
                      ExpressionAttributeValues: {
                        ":wc1_Name1": "Jane",
                        ":wc2_Name1": "Janet"
                      },
                      ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                    }
                  }
                ]
              }
            ]
          ]);
        });

        it("names both guards when the row's check fails (R26)", async () => {
          expect.assertions(1);

          cancelTransactWrite([
            { Code: "None" },
            {
              Code: "ConditionalCheckFailed",
              Item: {
                PK: { S: "Customer#c1" },
                SK: { S: "Customer" },
                Name: { S: "Jane" }
              }
            }
          ]);

          const e = await failureOf(create);

          expect(e.errors).toEqual([
            new WriteConditionFailedError(
              "ConditionalCheckFailed: Write condition failed on MyClassWithAllAttributeTypes with ID 'uuid1': foreign key 'foreignKeyAttribute', foreign key 'nullableForeignKeyAttribute'",
              {
                entity: "MyClassWithAllAttributeTypes",
                id: "uuid1",
                guards: [
                  { kind: "foreignKey", name: "foreignKeyAttribute" },
                  { kind: "foreignKey", name: "nullableForeignKeyAttribute" }
                ]
              }
            )
          ]);
        });
      });
    });
  });

  describe("an invalid condition", () => {
    const orderAttributes = {
      customerId: "c1",
      paymentMethodId: "pm1",
      orderDate: new Date("2023-10-01T00:00:00.000Z")
    };

    it("throws a FilterError before any read for a condition on the entity's own row (R2)", async () => {
      expect.assertions(3);

      const e = await failureOf(async () => {
        await Order.create(orderAttributes, {
          // @ts-expect-error: a plain JavaScript caller's self condition
          condition: { orderDate: new Date(now) }
        });
      });

      expect(e).toBeInstanceOf(FilterError);
      expect(e.message).toEqual(
        `Invalid write condition key "orderDate": a create takes no condition on the entity's own row, which must not exist yet. Guard its BelongsTo relationships or foreign keys instead`
      );
      expect(mockSend.mock.calls).toEqual([]);
    });

    it("throws a FilterError before any read for a $or or a value condition on a foreign key, which are self conditions", async () => {
      expect.assertions(4);

      const or = await failureOf(async () => {
        await Order.create(orderAttributes, {
          // @ts-expect-error: a plain JavaScript caller's $or on the new row
          condition: { $or: [{ orderDate: new Date(now) }] }
        });
      });
      const foreignKeyValue = await failureOf(async () => {
        await Founder.create(
          { name: "Jane", organizationId: "o1" },
          {
            // @ts-expect-error: a plain JavaScript caller's value condition on the new row's key
            condition: { organizationId: "o1" }
          }
        );
      });

      expect(or).toBeInstanceOf(FilterError);
      expect(foreignKeyValue).toBeInstanceOf(FilterError);
      expect(foreignKeyValue.message).toEqual(
        `Invalid write condition key "organizationId": a create takes no condition on the entity's own row, which must not exist yet. Guard its BelongsTo relationships or foreign keys instead`
      );
      expect(mockSend.mock.calls).toEqual([]);
    });

    it("throws a FilterError before any read for a HasOne or HasMany key", async () => {
      expect.assertions(4);

      const hasOne = await failureOf(async () => {
        await Customer.create(
          { name: "Jane", address: "1 Main St" },
          {
            // @ts-expect-error: a plain JavaScript caller's HasOne guard
            condition: { contactInformation: {} }
          }
        );
      });
      const hasMany = await failureOf(async () => {
        await Customer.create(
          { name: "Jane", address: "1 Main St" },
          {
            // @ts-expect-error: a plain JavaScript caller's HasMany guard
            condition: { orders: [{ id: "o1", condition: {} }] }
          }
        );
      });

      expect(hasOne).toBeInstanceOf(FilterError);
      expect(hasOne.message).toEqual(
        `Invalid write condition key "contactInformation": a create guards only its BelongsTo relationships, because a new entity has no children or link partners yet`
      );
      expect(hasMany).toBeInstanceOf(FilterError);
      expect(mockSend.mock.calls).toEqual([]);
    });

    it("throws a FilterError before any read for a guard on a relationship the payload does not reference (R28)", async () => {
      expect.assertions(3);

      const e = await failureOf(async () => {
        await ContactInformation.create(
          { email: "jane@example.com" },
          { condition: { customer: { name: "Jane" } } }
        );
      });

      expect(e).toBeInstanceOf(FilterError);
      expect(e.message).toEqual(
        `Invalid write condition for "customer": the create does not set "customerId", so there is no row for the guard to check`
      );
      expect(mockSend.mock.calls).toEqual([]);
    });

    it("throws a FilterError before any read for target on a foreign key backing a BelongsTo (R32)", async () => {
      expect.assertions(3);

      const e = await failureOf(async () => {
        await Order.create(orderAttributes, {
          // @ts-expect-error: a plain JavaScript caller's guard on the BelongsTo's foreign key
          condition: { customerId: { target: { name: "Jane" } } }
        });
      });

      expect(e).toBeInstanceOf(FilterError);
      expect(e.message).toEqual(
        `Invalid write condition for "customerId": this foreign key backs the BelongsTo relationship "customer". Guard the row it references under "customer" instead`
      );
      expect(mockSend.mock.calls).toEqual([]);
    });

    it("throws a FilterError before any read for an empty $or, null in IN and an undefined operand inside a target condition (R29, R6)", async () => {
      expect.assertions(4);

      const emptyOr = await failureOf(async () => {
        await Order.create(orderAttributes, {
          condition: { customer: { $or: [] } }
        });
      });
      const nullInIn = await failureOf(async () => {
        await Order.create(orderAttributes, {
          // @ts-expect-error: a plain JavaScript caller's null inside IN
          condition: { customer: { name: ["Jane", null] } }
        });
      });
      const maybeName: string | undefined = undefined;
      const undefinedOperand = await failureOf(async () => {
        await Order.create(orderAttributes, {
          condition: { customer: { name: maybeName } }
        });
      });

      expect(emptyOr).toBeInstanceOf(FilterError);
      expect(nullInIn).toBeInstanceOf(FilterError);
      expect(undefinedOperand).toBeInstanceOf(FilterError);
      expect(mockSend.mock.calls).toEqual([]);
    });

    it("throws a FilterError before any read for a key the entity does not declare", async () => {
      expect.assertions(3);

      const e = await failureOf(async () => {
        await Order.create(orderAttributes, {
          // @ts-expect-error: a plain JavaScript caller's unknown key
          condition: { store: {} }
        });
      });

      expect(e).toBeInstanceOf(FilterError);
      expect(e.message).toEqual(
        `Invalid write condition key "store": it is not an attribute, relationship or foreign key of Order`
      );
      expect(mockSend.mock.calls).toEqual([]);
    });
  });

  describe("a whole-value object operand naming a field its schema does not declare (R30, R15)", () => {
    // Before this was refused, the operand was converted to its stored form,
    // which strips a field the schema does not declare: `{ ..., region: "west" }`
    // was sent as `{ ... }`, so the guard held against a Warehouse holding no
    // region at all and let through the create the caller meant to stop
    const undeclared = new FilterError(
      'Invalid filter value for attribute "location": "region" is not a field the attribute declares. An object is compared whole, so no stored value can equal this operand'
    );

    const location = { city: "Denver", state: "CO" };

    const expectNothingSent = (): void => {
      expect(mockSend.mock.calls).toEqual([]);
      expect(mockTransactGetCommand.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    };

    it("refuses one in a BelongsTo guard's condition before anything is sent", async () => {
      expect.assertions(4);

      const e = await failureOf(
        async () =>
          await Shipment.create(
            {
              destination: "Boise",
              dimensions: { weight: 2, unit: "kg" },
              warehouseId: "w1"
            },
            {
              condition: {
                warehouse: {
                  location: {
                    ...location,
                    // @ts-expect-error: a plain JavaScript caller's undeclared field
                    region: "west"
                  }
                }
              }
            }
          )
      );

      expect(e).toEqual(undeclared);
      expectNothingSent();
    });

    it("refuses one in a foreign key target guard's condition, including inside an IN element, before anything is sent", async () => {
      expect.assertions(5);

      const e = await failureOf(
        async () =>
          await WarehouseInspection.create(
            { inspector: "Ann", warehouseId: "w1" },
            {
              condition: {
                warehouseId: {
                  target: {
                    location: {
                      ...location,
                      // @ts-expect-error: a plain JavaScript caller's undeclared field
                      region: "west"
                    }
                  }
                }
              }
            }
          )
      );
      const inElement = await failureOf(
        async () =>
          await WarehouseInspection.create(
            { inspector: "Ann", warehouseId: "w1" },
            {
              condition: {
                warehouseId: {
                  target: {
                    location: [
                      location,
                      {
                        ...location,
                        // @ts-expect-error: a plain JavaScript caller's undeclared field
                        region: "west"
                      }
                    ]
                  }
                }
              }
            }
          )
      );

      expect(e).toEqual(undeclared);
      expect(inElement).toEqual(undeclared);
      expectNothingSent();
    });
  });
});

const mockNoteEmbed = vi.fn();

@Table({
  name: "note-table",
  defaultFields: {
    id: { alias: "Id" },
    type: { alias: "Type" },
    createdAt: { alias: "CreatedAt" },
    updatedAt: { alias: "UpdatedAt" }
  }
})
abstract class NoteTable extends DynaRecord {
  @PartitionKeyAttribute({ alias: "PK" })
  public readonly pk: PartitionKey;

  @SortKeyAttribute({ alias: "SK" })
  public readonly sk: SortKey;
}

@Entity
class Notebook extends NoteTable {
  declare readonly type: "Notebook";

  @StringAttribute({ alias: "Title" })
  public readonly title: string;

  @HasMany(() => Note, { foreignKey: "notebookId" })
  public readonly notes: Note[];
}

@Entity
class Note extends NoteTable {
  declare readonly type: "Note";

  @Searchable()
  @StringAttribute({ alias: "Body" })
  public readonly body: SearchableText;

  @ForeignKeyAttribute(() => Notebook, { alias: "NotebookId", nullable: true })
  public readonly notebookId?: NullableForeignKey<Notebook>;

  @BelongsTo(() => Notebook, { foreignKey: "notebookId" })
  public readonly notebook?: Notebook;
}

// Small-dimension descriptor so tests can assert exact vector values, with a
// controllable provider for failure and truncation scenarios. Inline lambdas
// under the const-generic declaration need explicit parameter types
NoteTable.vectorIndexes({
  noteSearchIndex: {
    name: "note-search-index",
    vectorAttribute: "__dyna_vector",
    model: {
      name: "test-embed-model",
      dimensions: 3,
      distanceFunction: "COSINE",
      scoreToSimilarity: (score: number) => 1 - score
    },
    provider: async (text: string) => await mockNoteEmbed(text),
    members: [() => Note]
  }
});

describe("Create searchable entities (vector write path)", () => {
  const expectedTitanVector = new Array<number>(1024).fill(0.1);
  // The article index's provider fills a distinguishable value
  const expectedArticleVector = new Array<number>(1024).fill(0.7);

  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockedGenerateId.mockReset();
    mockNoteEmbed.mockReset();
    mockEmbeddingProviderCalls.length = 0;
  });

  it("will embed the searchable attribute and write the vector and content hash to the canonical row only", async () => {
    expect.assertions(5);

    mockedGenerateId.mockReturnValueOnce("uuid1");

    // Raw fetched parent rows bypass entity serialization, so this fetched
    // store carries vector attributes to prove the raw-copy path strips the
    // vector (the registered content hash is harmless on copies)
    const store = {
      PK: "Store#123",
      SK: "Store",
      Id: "123",
      Type: "Store",
      Name: "Mock Store",
      CreatedAt: "2024-01-01T00:00:00.000Z",
      UpdatedAt: "2024-01-02T00:00:00.000Z",
      // Two per-index attributes: stripping is by reserved prefix, not by
      // one literal name
      __dyna_vector: [0.5, 0.5],
      __dyna_vector_articles: [0.6, 0.6]
    };

    mockTransactGetItems.mockResolvedValueOnce({
      Responses: [{ Item: store }]
    });

    const listing = await Listing.create({
      description: "Hand thrown ceramic mug",
      category: "Mugs",
      storeId: "123"
    });

    const listingAttributes = {
      Id: "uuid1",
      Type: "Listing",
      Description: "Hand thrown ceramic mug",
      Category: "Mugs",
      StoreId: "123",
      CreatedAt: "2023-10-16T03:31:35.918Z",
      UpdatedAt: "2023-10-16T03:31:35.918Z"
    };

    expect(listing).toEqual({
      pk: "Listing#uuid1",
      sk: "Listing",
      id: "uuid1",
      type: "Listing",
      description: "Hand thrown ceramic mug",
      category: "Mugs",
      storeId: "123",
      createdAt: new Date("2023-10-16T03:31:35.918Z"),
      updatedAt: new Date("2023-10-16T03:31:35.918Z")
    });
    expect(mockEmbeddingProviderCalls).toEqual(["Hand thrown ceramic mug"]);
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
                TableName: "search-table",
                Key: { PK: "Store#123", SK: "Store" }
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
              // Canonical row carries the vector and content hash
              Put: {
                TableName: "search-table",
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "Listing#uuid1",
                  SK: "Listing",
                  ...listingAttributes,
                  __dyna_vector: expectedTitanVector
                }
              }
            },
            {
              // Check that the associated Store exists
              ConditionCheck: {
                ConditionExpression: "attribute_exists(PK)",
                Key: { PK: "Store#123", SK: "Store" },
                TableName: "search-table"
              }
            },
            {
              // Denormalized Listing in the Store partition carries neither
              // the vector nor the hash
              Put: {
                TableName: "search-table",
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "Store#123",
                  SK: "Listing#uuid1",
                  ...listingAttributes
                }
              }
            },
            {
              // Denormalized Store in the Listing partition: the raw copy
              // strips the parent's vector and content hash — copies carry
              // no vector-search bookkeeping
              Put: {
                TableName: "search-table",
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "Listing#uuid1",
                  SK: "Store",
                  Id: "123",
                  Type: "Store",
                  Name: "Mock Store",
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

  it("will embed a member that belongs to the index only through its members list", async () => {
    expect.assertions(3);

    mockedGenerateId.mockReturnValueOnce("uuid1");

    // Review carries the scoping foreign key but has no declared
    // relationship on Store — it is a member of the store index purely
    // because the index lists it, the case that replaced the pre-3.0
    // include: option
    await Review.create({
      body: "Beautiful glaze, sturdy handle",
      storeId: "123"
    });

    expect(mockEmbeddingProviderCalls).toEqual([
      "Beautiful glaze, sturdy handle"
    ]);
    expect(mockArticleEmbeddingProviderCalls).toEqual([]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Put: {
                TableName: "search-table",
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "Review#uuid1",
                  SK: "Review",
                  Id: "uuid1",
                  Type: "Review",
                  Body: "Beautiful glaze, sturdy handle",
                  StoreId: "123",
                  CreatedAt: "2023-10-16T03:31:35.918Z",
                  UpdatedAt: "2023-10-16T03:31:35.918Z",
                  __dyna_vector: expectedTitanVector
                }
              }
            },
            {
              ConditionCheck: {
                TableName: "search-table",
                Key: { PK: "Store#123", SK: "Store" },
                ConditionExpression: "attribute_exists(PK)"
              }
            }
          ]
        }
      ]
    ]);
  });

  it("will embed for a relationship-free searchable entity", async () => {
    expect.assertions(5);

    mockedGenerateId.mockReturnValueOnce("uuid1");

    const article = await Article.create({
      title: "Hello",
      content: "Fresh article content"
    });

    expect(article).toEqual({
      pk: "Article#uuid1",
      sk: "Article",
      id: "uuid1",
      type: "Article",
      title: "Hello",
      content: "Fresh article content",
      createdAt: new Date("2023-10-16T03:31:35.918Z"),
      updatedAt: new Date("2023-10-16T03:31:35.918Z")
    });
    // Article is owned by the article index, so its own provider embedded
    // this write — the store index's provider was never called
    expect(mockArticleEmbeddingProviderCalls).toEqual([
      "Fresh article content"
    ]);
    expect(mockEmbeddingProviderCalls).toEqual([]);
    expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Put: {
                TableName: "search-table",
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "Article#uuid1",
                  SK: "Article",
                  Id: "uuid1",
                  Type: "Article",
                  Title: "Hello",
                  Content: "Fresh article content",
                  CreatedAt: "2023-10-16T03:31:35.918Z",
                  UpdatedAt: "2023-10-16T03:31:35.918Z",
                  // Article's owning index writes under its own attribute
                  __dyna_vector_articles: expectedArticleVector
                }
              }
            }
          ]
        }
      ]
    ]);
  });

  it("will not call the provider or write vector attributes when the searchable value is not present", async () => {
    expect.assertions(3);

    mockedGenerateId.mockReturnValueOnce("uuid1");

    const article = await Article.create({ title: "Hello" });

    expect(article).toEqual({
      pk: "Article#uuid1",
      sk: "Article",
      id: "uuid1",
      type: "Article",
      title: "Hello",
      createdAt: new Date("2023-10-16T03:31:35.918Z"),
      updatedAt: new Date("2023-10-16T03:31:35.918Z")
    });
    expect(mockEmbeddingProviderCalls).toEqual([]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Put: {
                TableName: "search-table",
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "Article#uuid1",
                  SK: "Article",
                  Id: "uuid1",
                  Type: "Article",
                  Title: "Hello",
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

  it("will not call the provider or write vector attributes for a non-searchable entity on a table with vector indexes", async () => {
    expect.assertions(2);

    mockedGenerateId.mockReturnValueOnce("uuid1");

    await Store.create({ name: "My Store" });

    expect(mockEmbeddingProviderCalls).toEqual([]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Put: {
                TableName: "search-table",
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "Store#uuid1",
                  SK: "Store",
                  Id: "uuid1",
                  Type: "Store",
                  Name: "My Store",
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

  it("rejects with an EmbeddingError carrying the provider error as cause and sends no transaction when the provider fails", async () => {
    expect.assertions(5);

    mockedGenerateId.mockReturnValueOnce("uuid1");

    const providerError = new Error("bedrock unavailable");
    mockNoteEmbed.mockRejectedValueOnce(providerError);

    try {
      await Note.create({ body: "A searchable note body" });
    } catch (e: any) {
      expect(e).toBeInstanceOf(EmbeddingError);
      expect(e.code).toEqual("EmbeddingError");
      expect(e.message).toEqual(
        "Embedding failed for Note.body via the test-embed-model provider on vector index note-search-index"
      );
      expect(e.cause).toEqual(providerError);
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("does not emit an unhandled rejection when the prefetch fails while the embed is in flight", async () => {
    expect.assertions(3);

    // Real timers so the runtime gets genuine event-loop turns to surface
    // any unhandled rejection
    vi.useRealTimers();

    const unhandledRejections: unknown[] = [];
    const captureUnhandled = (reason: unknown): void => {
      unhandledRejections.push(reason);
    };
    process.on("unhandledRejection", captureUnhandled);

    try {
      mockedGenerateId.mockReturnValueOnce("uuid1");

      // The embed settles only after the create has already rejected through
      // the failed prefetch — the window the rejection absorber covers
      let rejectEmbed: (err: Error) => void = () => undefined;
      mockNoteEmbed.mockImplementationOnce(
        async () =>
          await new Promise((_resolve, reject) => {
            rejectEmbed = reject;
          })
      );

      const prefetchError = new Error("prefetch unavailable");
      mockTransactGetItems.mockRejectedValueOnce(prefetchError);

      try {
        await Note.create({
          body: "A searchable note body",
          notebookId: "notebook-1"
        });
      } catch (e: any) {
        expect(e).toEqual(prefetchError);
      }

      rejectEmbed(new Error("embed failed after the create already rejected"));

      // Two macrotask turns: one for the rejection to settle, one for the
      // runtime to report it if it were unhandled
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));

      expect(unhandledRejections).toEqual([]);
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactGetCommand" }]]);
    } finally {
      process.off("unhandledRejection", captureUnhandled);
      vi.useFakeTimers();
    }
  });

  it("rejects with an EmbeddingError before any AWS call when the provider returns the wrong dimensions", async () => {
    expect.assertions(4);

    mockedGenerateId.mockReturnValueOnce("uuid1");

    mockNoteEmbed.mockResolvedValueOnce([0.1, 0.2]);

    try {
      await Note.create({ body: "A searchable note body" });
    } catch (e: any) {
      expect(e).toBeInstanceOf(EmbeddingError);
      expect(e.message).toEqual(
        "Embedding provider returned a 2-dimension vector for Note.body; the test-embed-model descriptor requires 3 dimensions"
      );
      // Error messages carry identities only — never the searchable text
      expect(e.message).not.toContain("A searchable note body");
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("truncates embedding values to 7 significant digits before writing (float32 precision)", async () => {
    expect.assertions(1);

    mockedGenerateId.mockReturnValueOnce("uuid1");

    mockNoteEmbed.mockResolvedValueOnce([
      0.123456789, 1234567.89, 0.000012345678
    ]);

    await Note.create({ body: "A searchable note body" });

    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Put: {
                TableName: "note-table",
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "Note#uuid1",
                  SK: "Note",
                  Id: "uuid1",
                  Type: "Note",
                  Body: "A searchable note body",
                  CreatedAt: "2023-10-16T03:31:35.918Z",
                  UpdatedAt: "2023-10-16T03:31:35.918Z",
                  __dyna_vector: [0.1234568, 1234568, 0.00001234568]
                }
              }
            }
          ]
        }
      ]
    ]);
  });
});
