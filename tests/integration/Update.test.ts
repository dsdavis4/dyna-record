import DynaRecord from "../../index.js";
import {
  TransactWriteCommand,
  TransactGetCommand,
  QueryCommand
} from "@aws-sdk/lib-dynamodb";
import {
  type Address,
  Article,
  type Assignment,
  Catalog,
  type CatalogItem,
  ContactInformation,
  Customer,
  Desk,
  DuplicateFieldEntity,
  Employee,
  Festival,
  Grade,
  Listing,
  MockTable,
  MyClassWithAllAttributeTypes,
  Order,
  Organization,
  PaymentMethod,
  type Person,
  Pet,
  PhoneBook,
  Shipment,
  Sponsor,
  type Student,
  type User,
  Website,
  Warehouse,
  ArrayOfObjectsEntity,
  DeepNestedEntity,
  DiscriminatedUnionEntity,
  ArrayOfUnionsEntity,
  Car,
  Vendor,
  type Discovery,
  Category,
  Accessory,
  Author,
  Book,
  Founder,
  Profile,
  mockEmbeddingProvider,
  mockEmbeddingProviderCalls,
  mockArticleEmbeddingProviderCalls
} from "./mockModels.js";
import {
  TransactionCanceledException,
  type CancellationReason
} from "@aws-sdk/client-dynamodb";
import {
  ConditionalCheckFailedError,
  TransactionWriteFailedError,
  WriteConditionFailedError
} from "../../src/dynamo-utils/index.js";
import {
  ForeignKeyAttribute,
  BelongsTo,
  Entity,
  HasMany,
  HasOne,
  DateAttribute,
  IdAttribute,
  ObjectAttribute,
  PartitionKeyAttribute,
  Searchable,
  SortKeyAttribute,
  StringAttribute,
  Table
} from "../../src/decorators/index.js";
import type {
  InferObjectSchema,
  ObjectSchema
} from "../../src/decorators/index.js";
import { TitanTextEmbedV2 } from "../../src/embedding/types.js";
import {
  type EntityClass,
  type NullableForeignKey,
  type PartitionKey,
  type SortKey,
  type ForeignKey,
  type Searchable as SearchableText
} from "../../src/types.js";
import {
  FilterError,
  NotFoundError,
  ValidationError
} from "../../src/index.js";
import { createInstance } from "../../src/utils.js";
import {
  type OtherTableEntityTableItem,
  type MockTableEntityTableItem
} from "./utils.js";
import Logger from "../../src/Logger.js";

const mockTransactWriteCommand = vi.mocked(TransactWriteCommand);
const mockTransactGetCommand = vi.mocked(TransactGetCommand);
const mockedQueryCommand = vi.mocked(QueryCommand);

const mockSend = vi.fn();
const mockTransactGetItems = vi.fn();
const mockQuery = vi.fn();

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
            if (command.name === "TransactGetCommand") {
              return await Promise.resolve(mockTransactGetItems());
            }

            if (command.name === "TransactWriteCommand") {
              return await Promise.resolve(
                "TransactWriteCommand-mock-response"
              );
            }

            if (command.name === "QueryCommand") {
              return await Promise.resolve(mockQuery());
            }
          })
        };
      })
    },
    TransactGetCommand: vi.fn().mockImplementation(() => {
      return { name: "TransactGetCommand" };
    }),
    TransactWriteCommand: vi.fn().mockImplementation(() => {
      return { name: "TransactWriteCommand" };
    }),
    QueryCommand: vi.fn().mockImplementation(() => {
      return { name: "QueryCommand" };
    })
  };
});

@Entity
class MyModelNullableAttribute extends MockTable {
  declare readonly type: "MyModelNullableAttribute";

  @StringAttribute({ alias: "MyAttribute", nullable: true })
  public myAttribute?: string;
}

@Entity
class MyModelNonNullableAttribute extends MockTable {
  declare readonly type: "MyModelNonNullableAttribute";

  @DateAttribute({ alias: "DateAttribute", nullable: false })
  public myAttribute: Date;
}

@Entity
class MockInformation extends MockTable {
  declare readonly type: "MockInformation";

  @StringAttribute({ alias: "Address" })
  public address: string;

  @StringAttribute({ alias: "Email" })
  public email: string;

  @StringAttribute({ alias: "Phone", nullable: true })
  public phone?: string;

  @StringAttribute({ alias: "State", nullable: true })
  public state?: string;

  @DateAttribute({ nullable: true })
  public someDate?: Date;
}

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

/**
 * Lists of objects below the attribute's root: a list inside a nested object
 * field, whose elements hold a nested object and a list of objects of their
 * own, each with a nullable field
 */
const nestedListsSchema = {
  section: {
    type: "object",
    fields: {
      entries: {
        type: "array",
        items: {
          type: "object",
          fields: {
            sku: { type: "string" },
            note: { type: "string", nullable: true },
            placement: {
              type: "object",
              fields: {
                aisle: { type: "string" },
                bin: { type: "string", nullable: true }
              }
            },
            restocks: {
              type: "array",
              items: {
                type: "object",
                fields: {
                  at: { type: "date" },
                  note: { type: "string", nullable: true }
                }
              }
            }
          }
        }
      }
    }
  }
} as const satisfies ObjectSchema;

@Entity
class NestedListsEntity extends MockTable {
  declare readonly type: "NestedListsEntity";

  @ObjectAttribute({ alias: "Layout", schema: nestedListsSchema })
  public layout: InferObjectSchema<typeof nestedListsSchema>;
}

describe("Update", () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("will update an entity without foreign key attributes (this entity has no local denormalized links)", () => {
    const dbOperationAssertions = (): void => {
      expect(mockSend.mock.calls).toEqual([
        [{ name: "QueryCommand" }],
        [{ name: "TransactWriteCommand" }]
      ]);
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK5",
            ExpressionAttributeNames: { "#PK": "PK", "#Type": "Type" },
            ExpressionAttributeValues: {
              ":PK5": "Customer#123",
              ":Type1": "Customer",
              ":Type2": "Order",
              ":Type3": "PaymentMethod",
              ":Type4": "ContactInformation"
            },
            FilterExpression: "#Type IN (:Type1,:Type2,:Type3,:Type4)",
            ConsistentRead: true
          }
        ]
      ]);
      expect(mockTransactGetCommand.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  TableName: "mock-table",
                  Key: { PK: "Customer#123", SK: "Customer" },
                  UpdateExpression:
                    "SET #Name = :Name, #Address = :Address, #UpdatedAt = :UpdatedAt",
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#Address": "Address",
                    "#Name": "Name",
                    "#UpdatedAt": "UpdatedAt"
                  },
                  ExpressionAttributeValues: {
                    ":Address": "new Address",
                    ":Name": "New Name",
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                  }
                }
              }
            ]
          }
        ]
      ]);
    };

    let customer: MockTableEntityTableItem<Customer>;

    beforeEach(() => {
      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

      customer = {
        PK: "Customer#123",
        SK: "Customer",
        Id: "123",
        Type: "Customer",
        Name: "Mock Customer",
        Address: "11 Some St",
        CreatedAt: "2023-01-01T00:00:00.000Z",
        UpdatedAt: "2023-01-02T00:00:00.000Z"
      };

      mockQuery.mockResolvedValueOnce({
        Items: [customer]
      });
    });

    test("static method", async () => {
      expect.assertions(5);

      expect(
        await Customer.update("123", {
          name: "New Name",
          address: "new Address"
        })
      ).toBeUndefined();
      dbOperationAssertions();
    });

    test("instance method", async () => {
      expect.assertions(7);

      const instance = createInstance(Customer, {
        pk: customer.PK as PartitionKey,
        sk: customer.SK as SortKey,
        id: customer.Id,
        type: customer.Type,
        name: customer.Name,
        address: customer.Address,
        createdAt: new Date(customer.CreatedAt),
        updatedAt: new Date(customer.UpdatedAt)
      });

      const updatedInstance = await instance.update({
        name: "New Name",
        address: "new Address"
      });

      expect(updatedInstance).toEqual({
        ...instance,
        name: "New Name", // Updated name
        address: "new Address", // Updated address
        updatedAt: new Date("2023-10-16T03:31:35.918Z")
      });
      expect(updatedInstance).toBeInstanceOf(Customer);
      // Original instance is not mutated
      expect(instance).toEqual({
        pk: customer.PK as PartitionKey,
        sk: customer.SK as SortKey,
        id: customer.Id,
        type: customer.Type,
        name: customer.Name,
        address: customer.Address,
        createdAt: new Date(customer.CreatedAt),
        updatedAt: new Date(customer.UpdatedAt)
      });
      dbOperationAssertions();
    });
  });

  describe("has runtime schema validation to ensure that reserved keys are not set on update. They will be omitted from update", () => {
    const dbOperationAssertions = (): void => {
      expect(mockSend.mock.calls).toEqual([
        [{ name: "QueryCommand" }],
        [{ name: "TransactWriteCommand" }]
      ]);
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK5",
            ExpressionAttributeNames: { "#PK": "PK", "#Type": "Type" },
            ExpressionAttributeValues: {
              ":PK5": "Customer#123",
              ":Type1": "Customer",
              ":Type2": "Order",
              ":Type3": "PaymentMethod",
              ":Type4": "ContactInformation"
            },
            FilterExpression: "#Type IN (:Type1,:Type2,:Type3,:Type4)",
            ConsistentRead: true
          }
        ]
      ]);
      expect(mockTransactGetCommand.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  TableName: "mock-table",
                  Key: { PK: "Customer#123", SK: "Customer" },
                  UpdateExpression:
                    "SET #Name = :Name, #Address = :Address, #UpdatedAt = :UpdatedAt",
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#Address": "Address",
                    "#Name": "Name",
                    "#UpdatedAt": "UpdatedAt"
                  },
                  ExpressionAttributeValues: {
                    ":Address": "new Address",
                    ":Name": "New Name",
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                  }
                }
              }
            ]
          }
        ]
      ]);
    };

    let customer: MockTableEntityTableItem<Customer>;

    beforeEach(() => {
      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

      customer = {
        PK: "Customer#123",
        SK: "Customer",
        Id: "123",
        Type: "Customer",
        Name: "Mock Customer",
        Address: "11 Some St",
        CreatedAt: "2023-01-01T00:00:00.000Z",
        UpdatedAt: "2023-01-02T00:00:00.000Z"
      };

      mockQuery.mockResolvedValueOnce({
        Items: [customer]
      });
    });

    test("static method", async () => {
      expect.assertions(5);

      expect(
        await Customer.update("123", {
          // Begin reserved keys
          pk: "2",
          sk: "3",
          id: "4",
          type: "bad type",
          updatedAt: new Date(),
          createdAt: new Date(),
          update: () => {},
          // End reserved keys
          name: "New Name",
          address: "new Address"
        } as any) // Use any to force bad type and allow runtime checks to be tested
      ).toBeUndefined();

      dbOperationAssertions();
    });

    test("instance method", async () => {
      expect.assertions(7);

      const instance = createInstance(Customer, {
        pk: customer.PK as PartitionKey,
        sk: customer.SK as SortKey,
        id: customer.Id,
        type: customer.Type,
        name: customer.Name,
        address: customer.Address,
        createdAt: new Date(customer.CreatedAt),
        updatedAt: new Date(customer.UpdatedAt)
      });

      const updatedInstance = await instance.update({
        // Begin reserved keys
        pk: "2",
        sk: "3",
        id: "4",
        type: "bad type",
        updatedAt: new Date(),
        createdAt: new Date(),
        update: () => {},
        // End reserved keys
        name: "New Name",
        address: "new Address"
      } as any); // Use any to force bad type and allow runtime checks to be tested

      expect(updatedInstance).toEqual({
        ...instance,
        name: "New Name", // Updated name
        address: "new Address", // Updated address
        updatedAt: new Date("2023-10-16T03:31:35.918Z")
      });
      expect(updatedInstance).toBeInstanceOf(Customer);
      // Original instance is not mutated
      expect(instance).toEqual({
        pk: customer.PK as PartitionKey,
        sk: customer.SK as SortKey,
        id: customer.Id,
        type: customer.Type,
        name: customer.Name,
        address: customer.Address,
        createdAt: new Date(customer.CreatedAt),
        updatedAt: new Date(customer.UpdatedAt)
      });
      dbOperationAssertions();
    });
  });

  describe("can update all attribute types", () => {
    const dbOperationAssertions = (): void => {
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockedQueryCommand.mock.calls).toEqual([]);
      expect(mockTransactGetCommand.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#UpdatedAt": "UpdatedAt",
                    "#boolAttribute": "boolAttribute",
                    "#createdDate": "createdDate",
                    "#dateAttribute": "dateAttribute",
                    "#email": "email",
                    "#enumAttribute": "enumAttribute",
                    "#foreignKeyAttribute": "foreignKeyAttribute",
                    "#name": "name",
                    "#nullableBoolAttribute": "nullableBoolAttribute",
                    "#nullableDateAttribute": "nullableDateAttribute",
                    "#nullableEnumAttribute": "nullableEnumAttribute",
                    "#nullableForeignKeyAttribute":
                      "nullableForeignKeyAttribute",
                    "#nullableNumberAttribute": "nullableNumberAttribute",
                    "#nullableStringAttribute": "nullableStringAttribute",
                    "#numberAttribute": "numberAttribute",
                    "#objectAttribute": "objectAttribute",
                    "#status": "status",
                    "#stringAttribute": "stringAttribute",
                    "#tags": "tags"
                  },
                  ExpressionAttributeValues: {
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                    ":boolAttribute": true,
                    ":dateAttribute": "2023-10-16T03:31:35.918Z",
                    ":enumAttribute": "val-1",
                    ":foreignKeyAttribute": "1111",
                    ":nullableBoolAttribute": false,
                    ":nullableDateAttribute": "2023-10-16T03:31:35.918Z",
                    ":nullableEnumAttribute": "val-2",
                    ":nullableForeignKeyAttribute": "22222",
                    ":nullableNumberAttribute": 10,
                    ":nullableStringAttribute": "2",
                    ":numberAttribute": 9,
                    ":objectAttribute_createdDate": "2023-10-16T03:31:35.918Z",
                    ":objectAttribute_email": "john@example.com",
                    ":objectAttribute_name": "John",
                    ":objectAttribute_status": "active",
                    ":objectAttribute_tags": ["work", "vip"],
                    ":stringAttribute": "1"
                  },
                  Key: {
                    PK: "MyClassWithAllAttributeTypes#123",
                    SK: "MyClassWithAllAttributeTypes"
                  },
                  TableName: "mock-table",
                  UpdateExpression:
                    "SET #stringAttribute = :stringAttribute, #nullableStringAttribute = :nullableStringAttribute, #dateAttribute = :dateAttribute, #nullableDateAttribute = :nullableDateAttribute, #boolAttribute = :boolAttribute, #nullableBoolAttribute = :nullableBoolAttribute, #numberAttribute = :numberAttribute, #nullableNumberAttribute = :nullableNumberAttribute, #foreignKeyAttribute = :foreignKeyAttribute, #nullableForeignKeyAttribute = :nullableForeignKeyAttribute, #enumAttribute = :enumAttribute, #nullableEnumAttribute = :nullableEnumAttribute, #UpdatedAt = :UpdatedAt, #objectAttribute.#name = :objectAttribute_name, #objectAttribute.#email = :objectAttribute_email, #objectAttribute.#tags = :objectAttribute_tags, #objectAttribute.#status = :objectAttribute_status, #objectAttribute.#createdDate = :objectAttribute_createdDate"
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
    };

    beforeEach(() => {
      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
    });

    test("static method", async () => {
      expect.assertions(5);

      expect(
        await MyClassWithAllAttributeTypes.update("123", {
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
          }
        })
      ).toBeUndefined();
      dbOperationAssertions();
    });

    test("instance method", async () => {
      expect.assertions(7);

      const instance = createInstance(MyClassWithAllAttributeTypes, {
        pk: "MyClassWithAllAttributeTypes#123" as PartitionKey,
        sk: "MyClassWithAllAttributeTypes" as SortKey,
        id: "123",
        type: "MyClassWithAllAttributeTypes",
        stringAttribute: "old-1",
        nullableStringAttribute: "old-2",
        dateAttribute: new Date("2023-01-02"),
        nullableDateAttribute: new Date(),
        foreignKeyAttribute: "old-1111" as ForeignKey<Customer>,
        nullableForeignKeyAttribute: "old-2222" as NullableForeignKey<Customer>,
        boolAttribute: false,
        nullableBoolAttribute: true,
        numberAttribute: 9,
        nullableNumberAttribute: 8,
        enumAttribute: "val-2",
        nullableEnumAttribute: "val-1",
        objectAttribute: {
          name: "Old",
          email: "old@example.com",
          tags: ["old-tag"],
          status: "active",
          createdDate: new Date()
        },
        addressAttribute: {
          street: "123 Main St",
          city: "Springfield",
          geo: { lat: 1, lng: 2, accuracy: "precise" as const },
          scores: [95]
        },
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });

      const updatedInstance = await instance.update({
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
        }
      });

      expect(updatedInstance).toEqual({
        ...instance,
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
        updatedAt: new Date("2023-10-16T03:31:35.918Z")
      });
      expect(updatedInstance).toBeInstanceOf(MyClassWithAllAttributeTypes);
      // Assert original instance is not mutated
      expect(instance).toEqual({
        pk: "MyClassWithAllAttributeTypes#123",
        sk: "MyClassWithAllAttributeTypes",
        id: "123",
        type: "MyClassWithAllAttributeTypes",
        stringAttribute: "old-1",
        nullableStringAttribute: "old-2",
        dateAttribute: new Date("2023-01-02"),
        nullableDateAttribute: new Date(),
        foreignKeyAttribute: "old-1111",
        nullableForeignKeyAttribute: "old-2222",
        boolAttribute: false,
        nullableBoolAttribute: true,
        numberAttribute: 9,
        nullableNumberAttribute: 8,
        enumAttribute: "val-2",
        nullableEnumAttribute: "val-1",
        objectAttribute: {
          name: "Old",
          email: "old@example.com",
          tags: ["old-tag"],
          status: "active",
          createdDate: new Date()
        },
        addressAttribute: {
          street: "123 Main St",
          city: "Springfield",
          geo: { lat: 1, lng: 2, accuracy: "precise" },
          scores: [95]
        },
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });
      dbOperationAssertions();
    });

    test("ensures standalone foreign key references exist", async () => {
      expect.assertions(3);

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
        await MyClassWithAllAttributeTypes.update("123", {
          foreignKeyAttribute: "missing-customer",
          nullableForeignKeyAttribute: "missing-optional-customer"
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
                  Update: {
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeNames: {
                      "#UpdatedAt": "UpdatedAt",
                      "#foreignKeyAttribute": "foreignKeyAttribute",
                      "#nullableForeignKeyAttribute":
                        "nullableForeignKeyAttribute"
                    },
                    ExpressionAttributeValues: {
                      ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                      ":foreignKeyAttribute": "missing-customer",
                      ":nullableForeignKeyAttribute":
                        "missing-optional-customer"
                    },
                    Key: {
                      PK: "MyClassWithAllAttributeTypes#123",
                      SK: "MyClassWithAllAttributeTypes"
                    },
                    TableName: "mock-table",
                    UpdateExpression:
                      "SET #foreignKeyAttribute = :foreignKeyAttribute, #nullableForeignKeyAttribute = :nullableForeignKeyAttribute, #UpdatedAt = :UpdatedAt"
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
  });

  describe("can update an entity without relationships - no prefetch or denormalization", () => {
    const dbOperationAssertions = (): void => {
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockedQueryCommand.mock.calls).toEqual([]);
      expect(mockTransactGetCommand.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  TableName: "mock-table",
                  Key: {
                    PK: "MockInformation#123",
                    SK: "MockInformation"
                  },
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#State": "State",
                    "#UpdatedAt": "UpdatedAt"
                  },
                  ExpressionAttributeValues: {
                    ":State": "CO",
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                  },
                  UpdateExpression:
                    "SET #State = :State, #UpdatedAt = :UpdatedAt"
                }
              }
            ]
          }
        ]
      ]);
    };

    beforeEach(() => {
      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
    });

    test("static method", async () => {
      expect.assertions(5);

      expect(
        await MockInformation.update("123", {
          state: "CO"
        })
      ).toBeUndefined();
      dbOperationAssertions();
    });

    test("instance method", async () => {
      expect.assertions(7);

      const instance = createInstance(MockInformation, {
        pk: "MockInformation#123" as PartitionKey,
        sk: "MockInformation" as SortKey,
        id: "123",
        type: "MockInformation",
        address: "11 Some St",
        email: "test@test.com",
        state: "AZ",
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });

      const updatedInstance = await instance.update({
        state: "CO"
      });

      expect(updatedInstance).toEqual({
        ...instance,
        state: "CO",
        updatedAt: new Date("2023-10-16T03:31:35.918Z")
      });
      expect(updatedInstance).toBeInstanceOf(MockInformation);
      // Assert original instance is not mutated
      expect(instance).toEqual({
        pk: "MockInformation#123",
        sk: "MockInformation",
        id: "123",
        type: "MockInformation",
        address: "11 Some St",
        email: "test@test.com",
        state: "AZ",
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });
      dbOperationAssertions();
    });
  });

  describe("will update an entity and remove nullable attributes", () => {
    const dbOperationAssertions = (): void => {
      expect(mockSend.mock.calls).toEqual([
        [{ name: "QueryCommand" }],
        [{ name: "TransactWriteCommand" }]
      ]);
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK2",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#Type": "Type"
            },
            ExpressionAttributeValues: {
              ":PK2": "ContactInformation#123",
              ":Type1": "ContactInformation"
            },
            FilterExpression: "#Type IN (:Type1)",
            ConsistentRead: true
          }
        ]
      ]);
      expect(mockTransactGetCommand.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  TableName: "mock-table",
                  Key: {
                    PK: "ContactInformation#123",
                    SK: "ContactInformation"
                  },
                  UpdateExpression:
                    "SET #Email = :Email, #UpdatedAt = :UpdatedAt REMOVE #Phone",
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#Email": "Email",
                    "#Phone": "Phone",
                    "#UpdatedAt": "UpdatedAt"
                  },
                  ExpressionAttributeValues: {
                    ":Email": "new@example.com",
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                  }
                }
              }
            ]
          }
        ]
      ]);
    };

    const dbOperationAssertionsWithUndefinedOmitted = (): void => {
      expect(mockSend.mock.calls).toEqual([
        [{ name: "QueryCommand" }],
        [{ name: "TransactWriteCommand" }]
      ]);
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK2",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#Type": "Type"
            },
            ExpressionAttributeValues: {
              ":PK2": "ContactInformation#123",
              ":Type1": "ContactInformation"
            },
            FilterExpression: "#Type IN (:Type1)",
            ConsistentRead: true
          }
        ]
      ]);
      expect(mockTransactGetCommand.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  TableName: "mock-table",
                  Key: {
                    PK: "ContactInformation#123",
                    SK: "ContactInformation"
                  },
                  UpdateExpression:
                    "SET #Email = :Email, #UpdatedAt = :UpdatedAt",
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#Email": "Email",
                    "#UpdatedAt": "UpdatedAt"
                  },
                  ExpressionAttributeValues: {
                    ":Email": "new@example.com",
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                  }
                }
              }
            ]
          }
        ]
      ]);
    };

    let contactInformation: MockTableEntityTableItem<ContactInformation>;

    beforeEach(() => {
      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

      contactInformation = {
        PK: "ContactInformation#123",
        SK: "ContactInformation",
        Id: "123",
        Type: "ContactInformation",
        Email: "email@email.com",
        Phone: "555-555-5555",
        CreatedAt: "2023-01-01T00:00:00.000Z",
        UpdatedAt: "2023-01-02T00:00:00.000Z"
      };

      mockQuery.mockResolvedValueOnce({
        Items: [contactInformation]
      });
    });

    it("static method", async () => {
      expect.assertions(5);

      expect(
        await ContactInformation.update("123", {
          email: "new@example.com",
          phone: null
        })
      ).toBeUndefined();
      dbOperationAssertions();
    });

    it("static method - will discard optional properties passed as undefined", async () => {
      expect.assertions(5);

      expect(
        await ContactInformation.update("123", {
          email: "new@example.com",
          phone: undefined
        })
      ).toBeUndefined();
      dbOperationAssertionsWithUndefinedOmitted();
    });

    it("instance method", async () => {
      expect.assertions(7);

      const instance = createInstance(ContactInformation, {
        pk: contactInformation.PK as PartitionKey,
        sk: contactInformation.SK as SortKey,
        id: contactInformation.Id,
        type: contactInformation.Type,
        email: contactInformation.Email,
        phone: contactInformation.Phone,
        createdAt: new Date(contactInformation.CreatedAt),
        updatedAt: new Date(contactInformation.UpdatedAt)
      });

      const updatedInstance = await instance.update({
        email: "new@example.com",
        phone: null
      });

      expect(updatedInstance).toEqual({
        ...instance,
        email: "new@example.com",
        phone: undefined,
        updatedAt: new Date("2023-10-16T03:31:35.918Z")
      });
      expect(updatedInstance).toBeInstanceOf(ContactInformation);
      // Original instance is not mutated
      expect(instance).toEqual({
        pk: contactInformation.PK,
        sk: contactInformation.SK,
        id: contactInformation.Id,
        type: contactInformation.Type,
        email: contactInformation.Email,
        phone: contactInformation.Phone,
        createdAt: new Date(contactInformation.CreatedAt),
        updatedAt: new Date(contactInformation.UpdatedAt)
      });
      dbOperationAssertions();
    });

    it("instance method - will discard optional properties passed as undefined", async () => {
      expect.assertions(7);

      const instance = createInstance(ContactInformation, {
        pk: contactInformation.PK as PartitionKey,
        sk: contactInformation.SK as SortKey,
        id: contactInformation.Id,
        type: contactInformation.Type,
        email: contactInformation.Email,
        phone: contactInformation.Phone,
        createdAt: new Date(contactInformation.CreatedAt),
        updatedAt: new Date(contactInformation.UpdatedAt)
      });

      const updatedInstance = await instance.update({
        email: "new@example.com",
        phone: undefined
      });

      expect(updatedInstance).toEqual({
        ...instance,
        email: "new@example.com",
        phone: "555-555-5555",
        updatedAt: new Date("2023-10-16T03:31:35.918Z")
      });
      expect(updatedInstance).toBeInstanceOf(ContactInformation);
      // Original instance is not mutated
      expect(instance).toEqual({
        pk: contactInformation.PK,
        sk: contactInformation.SK,
        id: contactInformation.Id,
        type: contactInformation.Type,
        email: contactInformation.Email,
        phone: contactInformation.Phone,
        createdAt: new Date(contactInformation.CreatedAt),
        updatedAt: new Date(contactInformation.UpdatedAt)
      });
      dbOperationAssertionsWithUndefinedOmitted();
    });
  });

  describe("will update and remove multiple nullable attributes", () => {
    const dbOperationAssertions = (): void => {
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockedQueryCommand.mock.calls).toEqual([]);
      expect(mockTransactGetCommand.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  TableName: "mock-table",
                  Key: {
                    PK: "MockInformation#123",
                    SK: "MockInformation"
                  },
                  UpdateExpression:
                    "SET #Address = :Address, #Email = :Email, #UpdatedAt = :UpdatedAt REMOVE #Phone, #State",
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#Address": "Address",
                    "#Email": "Email",
                    "#Phone": "Phone",
                    "#State": "State",
                    "#UpdatedAt": "UpdatedAt"
                  },
                  ExpressionAttributeValues: {
                    ":Address": "11 Some St",
                    ":Email": "new@example.com",
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                  }
                }
              }
            ]
          }
        ]
      ]);
    };

    beforeEach(() => {
      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
    });

    test("static method", async () => {
      expect.assertions(5);

      expect(
        await MockInformation.update("123", {
          address: "11 Some St",
          email: "new@example.com",
          state: null,
          phone: null
        })
      ).toBeUndefined();
      dbOperationAssertions();
    });

    it("instance method", async () => {
      expect.assertions(7);

      const now = new Date("2023-10-16T03:31:35.918Z");
      vi.setSystemTime(now);

      const instance = createInstance(MockInformation, {
        pk: "MockInformation#123" as PartitionKey,
        sk: "MockInformation" as SortKey,
        id: "123",
        type: "MockInformation",
        address: "9 Example Ave",
        email: "example@example.com",
        state: "SomeState",
        phone: "555-555-5555",
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });

      const updatedInstance = await instance.update({
        address: "11 Some St",
        email: "new@example.com",
        state: null,
        phone: null
      });

      expect(updatedInstance).toEqual({
        ...instance,
        address: "11 Some St",
        email: "new@example.com",
        state: undefined,
        phone: undefined,
        updatedAt: new Date("2023-10-16T03:31:35.918Z")
      });
      expect(updatedInstance).toBeInstanceOf(MockInformation);
      // Original instance is not mutated
      expect(instance).toEqual({
        pk: "MockInformation#123",
        sk: "MockInformation",
        id: "123",
        type: "MockInformation",
        address: "9 Example Ave",
        email: "example@example.com",
        state: "SomeState",
        phone: "555-555-5555",
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });
      dbOperationAssertions();
    });
  });

  describe("will error if any attributes are the wrong type", () => {
    const operationSharedAssertions = (e: any): void => {
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
          message: "Invalid input: expected object, received string",
          path: ["objectAttribute"]
        }
      ]);
      expect(mockedQueryCommand.mock.calls).toEqual([]);
      expect(mockTransactGetCommand.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    };

    test("static method", async () => {
      expect.assertions(6);

      try {
        await MyClassWithAllAttributeTypes.update("123", {
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
          objectAttribute: "val-5"
        } as any); // Force any to test runtime validations
      } catch (e: any) {
        operationSharedAssertions(e);
      }
    });

    test("instance method", async () => {
      expect.assertions(6);

      const instance = createInstance(MyClassWithAllAttributeTypes, {
        pk: "MyClassWithAllAttributeTypes#123" as PartitionKey,
        sk: "MyClassWithAllAttributeTypes" as SortKey,
        id: "123",
        type: "MyClassWithAllAttributeTypes",
        stringAttribute: "1",
        dateAttribute: new Date(),
        foreignKeyAttribute: "11111" as ForeignKey<Customer>,
        boolAttribute: true,
        numberAttribute: 9,
        enumAttribute: "val-2",
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
          geo: { lat: 1, lng: 2, accuracy: "precise" as const },
          scores: [95]
        },
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });

      try {
        await instance.update({
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
          objectAttribute: "val-5"
        } as any); // Force any to test runtime validations
      } catch (e: any) {
        operationSharedAssertions(e);
      }
    });
  });

  describe("will error if objectAttribute fields are the wrong type", () => {
    const operationSharedAssertions = (e: any): void => {
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
        }
      ]);
      expect(mockedQueryCommand.mock.calls).toEqual([]);
      expect(mockTransactGetCommand.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    };

    test("static method", async () => {
      expect.assertions(6);

      try {
        await MyClassWithAllAttributeTypes.update("123", {
          objectAttribute: {
            name: 123,
            email: true,
            tags: "not-array"
          }
        } as any);
      } catch (e: any) {
        operationSharedAssertions(e);
      }
    });

    test("instance method", async () => {
      expect.assertions(6);

      const instance = createInstance(MyClassWithAllAttributeTypes, {
        pk: "MyClassWithAllAttributeTypes#123" as PartitionKey,
        sk: "MyClassWithAllAttributeTypes" as SortKey,
        id: "123",
        type: "MyClassWithAllAttributeTypes",
        stringAttribute: "1",
        dateAttribute: new Date(),
        foreignKeyAttribute: "11111" as ForeignKey<Customer>,
        boolAttribute: true,
        numberAttribute: 9,
        enumAttribute: "val-2",
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
          geo: { lat: 1, lng: 2, accuracy: "precise" as const },
          scores: [95]
        },
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });

      try {
        await instance.update({
          objectAttribute: {
            name: 123,
            email: true,
            tags: "not-array"
          }
        } as any);
      } catch (e: any) {
        operationSharedAssertions(e);
      }
    });
  });

  describe("will error if objectAttribute array items are the wrong type", () => {
    const operationSharedAssertions = (e: any): void => {
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
        }
      ]);
      expect(mockedQueryCommand.mock.calls).toEqual([]);
      expect(mockTransactGetCommand.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    };

    test("static method", async () => {
      expect.assertions(6);

      try {
        await MyClassWithAllAttributeTypes.update("123", {
          objectAttribute: {
            name: "John",
            email: "john@example.com",
            tags: ["valid", 123, true]
          }
        } as any);
      } catch (e: any) {
        operationSharedAssertions(e);
      }
    });

    test("instance method", async () => {
      expect.assertions(6);

      const instance = createInstance(MyClassWithAllAttributeTypes, {
        pk: "MyClassWithAllAttributeTypes#123" as PartitionKey,
        sk: "MyClassWithAllAttributeTypes" as SortKey,
        id: "123",
        type: "MyClassWithAllAttributeTypes",
        stringAttribute: "1",
        dateAttribute: new Date(),
        foreignKeyAttribute: "11111" as ForeignKey<Customer>,
        boolAttribute: true,
        numberAttribute: 9,
        enumAttribute: "val-2",
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
          geo: { lat: 1, lng: 2, accuracy: "precise" as const },
          scores: [95]
        },
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });

      try {
        await instance.update({
          objectAttribute: {
            name: "John",
            email: "john@example.com",
            tags: ["valid", 123, true]
          }
        } as any);
      } catch (e: any) {
        operationSharedAssertions(e);
      }
    });
  });

  describe("will error if addressAttribute nested object and array fields are the wrong type", () => {
    const operationSharedAssertions = (e: any): void => {
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
          code: "invalid_type",
          expected: "number",
          message: "Invalid input: expected number, received string",
          path: ["addressAttribute", "scores", 0]
        }
      ]);
      expect(mockedQueryCommand.mock.calls).toEqual([]);
      expect(mockTransactGetCommand.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    };

    test("static method", async () => {
      expect.assertions(6);

      try {
        await MyClassWithAllAttributeTypes.update("123", {
          addressAttribute: {
            street: "123 Main St",
            city: "Springfield",
            geo: { lat: "bad", lng: "bad" },
            scores: ["bad"]
          }
        } as any);
      } catch (e: any) {
        operationSharedAssertions(e);
      }
    });

    test("instance method", async () => {
      expect.assertions(6);

      const instance = createInstance(MyClassWithAllAttributeTypes, {
        pk: "MyClassWithAllAttributeTypes#123" as PartitionKey,
        sk: "MyClassWithAllAttributeTypes" as SortKey,
        id: "123",
        type: "MyClassWithAllAttributeTypes",
        stringAttribute: "1",
        dateAttribute: new Date(),
        foreignKeyAttribute: "11111" as ForeignKey<Customer>,
        boolAttribute: true,
        numberAttribute: 9,
        enumAttribute: "val-2",
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
          geo: { lat: 1, lng: 2, accuracy: "precise" as const },
          scores: [95]
        },
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });

      try {
        await instance.update({
          addressAttribute: {
            street: "123 Main St",
            city: "Springfield",
            geo: { lat: "bad", lng: "bad" },
            scores: ["bad"]
          }
        } as any);
      } catch (e: any) {
        operationSharedAssertions(e);
      }
    });
  });

  describe("will error if addressAttribute top-level fields are the wrong type", () => {
    const operationSharedAssertions = (e: any): void => {
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
      expect(mockedQueryCommand.mock.calls).toEqual([]);
      expect(mockTransactGetCommand.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    };

    test("static method", async () => {
      expect.assertions(6);

      try {
        await MyClassWithAllAttributeTypes.update("123", {
          addressAttribute: {
            street: 123,
            city: false,
            geo: { lat: 1, lng: 2, accuracy: "precise" },
            scores: [1]
          }
        } as any);
      } catch (e: any) {
        operationSharedAssertions(e);
      }
    });

    test("instance method", async () => {
      expect.assertions(6);

      const instance = createInstance(MyClassWithAllAttributeTypes, {
        pk: "MyClassWithAllAttributeTypes#123" as PartitionKey,
        sk: "MyClassWithAllAttributeTypes" as SortKey,
        id: "123",
        type: "MyClassWithAllAttributeTypes",
        stringAttribute: "1",
        dateAttribute: new Date(),
        foreignKeyAttribute: "11111" as ForeignKey<Customer>,
        boolAttribute: true,
        numberAttribute: 9,
        enumAttribute: "val-2",
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
          geo: { lat: 1, lng: 2, accuracy: "precise" as const },
          scores: [95]
        },
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });

      try {
        await instance.update({
          addressAttribute: {
            street: 123,
            city: false,
            geo: { lat: 1, lng: 2, accuracy: "precise" },
            scores: [1]
          }
        } as any);
      } catch (e: any) {
        operationSharedAssertions(e);
      }
    });
  });

  describe("will error if non-nullable objectAttribute fields are set to null", () => {
    const operationSharedAssertions = (e: any): void => {
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
        }
      ]);
      expect(mockedQueryCommand.mock.calls).toEqual([]);
      expect(mockTransactGetCommand.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    };

    test("static method", async () => {
      expect.assertions(6);

      try {
        await MyClassWithAllAttributeTypes.update("123", {
          objectAttribute: {
            name: null,
            email: null,
            tags: null
          }
        } as any);
      } catch (e: any) {
        operationSharedAssertions(e);
      }
    });

    test("instance method", async () => {
      expect.assertions(6);

      const instance = createInstance(MyClassWithAllAttributeTypes, {
        pk: "MyClassWithAllAttributeTypes#123" as PartitionKey,
        sk: "MyClassWithAllAttributeTypes" as SortKey,
        id: "123",
        type: "MyClassWithAllAttributeTypes",
        stringAttribute: "1",
        dateAttribute: new Date(),
        foreignKeyAttribute: "11111" as ForeignKey<Customer>,
        boolAttribute: true,
        numberAttribute: 9,
        enumAttribute: "val-2",
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
          geo: { lat: 1, lng: 2, accuracy: "precise" as const },
          scores: [95]
        },
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });

      try {
        await instance.update({
          objectAttribute: {
            name: null,
            email: null,
            tags: null
          }
        } as any);
      } catch (e: any) {
        operationSharedAssertions(e);
      }
    });
  });

  describe("will error if non-nullable addressAttribute fields are set to null", () => {
    const operationSharedAssertions = (e: any): void => {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual("Validation errors");
      expect(e.cause).toEqual([
        {
          code: "invalid_type",
          expected: "string",
          message: "Invalid input: expected string, received null",
          path: ["addressAttribute", "street"]
        },
        {
          code: "invalid_type",
          expected: "string",
          message: "Invalid input: expected string, received null",
          path: ["addressAttribute", "city"]
        },
        {
          code: "invalid_type",
          expected: "object",
          message: "Invalid input: expected object, received null",
          path: ["addressAttribute", "geo"]
        },
        {
          code: "invalid_type",
          expected: "array",
          message: "Invalid input: expected array, received null",
          path: ["addressAttribute", "scores"]
        }
      ]);
      expect(mockedQueryCommand.mock.calls).toEqual([]);
      expect(mockTransactGetCommand.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    };

    test("static method", async () => {
      expect.assertions(6);

      try {
        await MyClassWithAllAttributeTypes.update("123", {
          addressAttribute: {
            street: null,
            city: null,
            zip: null,
            geo: null,
            scores: null
          }
        } as any);
      } catch (e: any) {
        operationSharedAssertions(e);
      }
    });

    test("instance method", async () => {
      expect.assertions(6);

      const instance = createInstance(MyClassWithAllAttributeTypes, {
        pk: "MyClassWithAllAttributeTypes#123" as PartitionKey,
        sk: "MyClassWithAllAttributeTypes" as SortKey,
        id: "123",
        type: "MyClassWithAllAttributeTypes",
        stringAttribute: "1",
        dateAttribute: new Date(),
        foreignKeyAttribute: "11111" as ForeignKey<Customer>,
        boolAttribute: true,
        numberAttribute: 9,
        enumAttribute: "val-2",
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
          geo: { lat: 1, lng: 2, accuracy: "precise" as const },
          scores: [95]
        },
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });

      try {
        await instance.update({
          addressAttribute: {
            street: null,
            city: null,
            zip: null,
            geo: null,
            scores: null
          }
        } as any);
      } catch (e: any) {
        operationSharedAssertions(e);
      }
    });
  });

  describe("will error if non-nullable nested fields within addressAttribute are set to null", () => {
    const operationSharedAssertions = (e: any): void => {
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
          code: "invalid_type",
          expected: "number",
          message: "Invalid input: expected number, received null",
          path: ["addressAttribute", "scores", 0]
        }
      ]);
      expect(mockedQueryCommand.mock.calls).toEqual([]);
      expect(mockTransactGetCommand.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    };

    test("static method", async () => {
      expect.assertions(6);

      try {
        await MyClassWithAllAttributeTypes.update("123", {
          addressAttribute: {
            street: "123 Main St",
            city: "Springfield",
            geo: { lat: null, lng: null },
            scores: [null]
          }
        } as any);
      } catch (e: any) {
        operationSharedAssertions(e);
      }
    });

    test("instance method", async () => {
      expect.assertions(6);

      const instance = createInstance(MyClassWithAllAttributeTypes, {
        pk: "MyClassWithAllAttributeTypes#123" as PartitionKey,
        sk: "MyClassWithAllAttributeTypes" as SortKey,
        id: "123",
        type: "MyClassWithAllAttributeTypes",
        stringAttribute: "1",
        dateAttribute: new Date(),
        foreignKeyAttribute: "11111" as ForeignKey<Customer>,
        boolAttribute: true,
        numberAttribute: 9,
        enumAttribute: "val-2",
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
          geo: { lat: 1, lng: 2, accuracy: "precise" as const },
          scores: [95]
        },
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });

      try {
        await instance.update({
          addressAttribute: {
            street: "123 Main St",
            city: "Springfield",
            geo: { lat: null, lng: null },
            scores: [null]
          }
        } as any);
      } catch (e: any) {
        operationSharedAssertions(e);
      }
    });
  });

  describe("will error if objectAttribute enum field has an invalid value", () => {
    const operationSharedAssertions = (e: any): void => {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual("Validation errors");
      expect(e.cause).toEqual([
        {
          code: "invalid_value",
          message: 'Invalid option: expected one of "active"|"inactive"',
          values: ["active", "inactive"],
          path: ["objectAttribute", "status"]
        }
      ]);
      expect(mockedQueryCommand.mock.calls).toEqual([]);
      expect(mockTransactGetCommand.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    };

    test("static method", async () => {
      expect.assertions(6);

      try {
        await MyClassWithAllAttributeTypes.update("123", {
          objectAttribute: {
            name: "John",
            email: "john@example.com",
            tags: ["work"],
            status: "bad-value",
            createdDate: new Date()
          }
        } as any);
      } catch (e: any) {
        operationSharedAssertions(e);
      }
    });

    test("instance method", async () => {
      expect.assertions(6);

      const instance = createInstance(MyClassWithAllAttributeTypes, {
        pk: "MyClassWithAllAttributeTypes#123" as PartitionKey,
        sk: "MyClassWithAllAttributeTypes" as SortKey,
        id: "123",
        type: "MyClassWithAllAttributeTypes",
        stringAttribute: "1",
        dateAttribute: new Date(),
        foreignKeyAttribute: "11111" as ForeignKey<Customer>,
        boolAttribute: true,
        numberAttribute: 9,
        enumAttribute: "val-2",
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
          geo: { lat: 1, lng: 2, accuracy: "precise" as const },
          scores: [95]
        },
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });

      try {
        await instance.update({
          objectAttribute: {
            name: "John",
            email: "john@example.com",
            tags: ["work"],
            status: "bad-value",
            createdDate: new Date()
          }
        } as any);
      } catch (e: any) {
        operationSharedAssertions(e);
      }
    });
  });

  describe("will error if addressAttribute nested enum field has an invalid value", () => {
    const operationSharedAssertions = (e: any): void => {
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
      expect(mockedQueryCommand.mock.calls).toEqual([]);
      expect(mockTransactGetCommand.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    };

    test("static method", async () => {
      expect.assertions(6);

      try {
        await MyClassWithAllAttributeTypes.update("123", {
          addressAttribute: {
            street: "123 Main St",
            city: "Springfield",
            geo: { lat: 1, lng: 2, accuracy: "bad-value" },
            scores: [1]
          }
        } as any);
      } catch (e: any) {
        operationSharedAssertions(e);
      }
    });

    test("instance method", async () => {
      expect.assertions(6);

      const instance = createInstance(MyClassWithAllAttributeTypes, {
        pk: "MyClassWithAllAttributeTypes#123" as PartitionKey,
        sk: "MyClassWithAllAttributeTypes" as SortKey,
        id: "123",
        type: "MyClassWithAllAttributeTypes",
        stringAttribute: "1",
        dateAttribute: new Date(),
        foreignKeyAttribute: "11111" as ForeignKey<Customer>,
        boolAttribute: true,
        numberAttribute: 9,
        enumAttribute: "val-2",
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
          geo: { lat: 1, lng: 2, accuracy: "precise" as const },
          scores: [95]
        },
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });

      try {
        await instance.update({
          addressAttribute: {
            street: "123 Main St",
            city: "Springfield",
            geo: { lat: 1, lng: 2, accuracy: "bad-value" },
            scores: [1]
          }
        } as any);
      } catch (e: any) {
        operationSharedAssertions(e);
      }
    });
  });

  describe("nullable fields within object attributes are stripped when set to null", () => {
    beforeEach(() => {
      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
    });

    test("static method", async () => {
      expect.assertions(4);

      await MyClassWithAllAttributeTypes.update("123", {
        addressAttribute: {
          street: "123 Main St",
          city: "Springfield",
          zip: null,
          geo: { lat: 1, lng: 2, accuracy: "precise" },
          scores: [95],
          category: null
        }
      });

      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockedQueryCommand.mock.calls).toEqual([]);
      expect(mockTransactGetCommand.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#UpdatedAt": "UpdatedAt",
                    "#accuracy": "accuracy",
                    "#category": "category",
                    "#city": "city",
                    "#geo": "geo",
                    "#lat": "lat",
                    "#lng": "lng",
                    "#addressAttribute": "addressAttribute",
                    "#scores": "scores",
                    "#street": "street",
                    "#zip": "zip"
                  },
                  ExpressionAttributeValues: {
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                    ":addressAttribute_city": "Springfield",
                    ":addressAttribute_geo_accuracy": "precise",
                    ":addressAttribute_geo_lat": 1,
                    ":addressAttribute_geo_lng": 2,
                    ":addressAttribute_scores": [95],
                    ":addressAttribute_street": "123 Main St"
                  },
                  Key: {
                    PK: "MyClassWithAllAttributeTypes#123",
                    SK: "MyClassWithAllAttributeTypes"
                  },
                  TableName: "mock-table",
                  UpdateExpression:
                    "SET #UpdatedAt = :UpdatedAt, #addressAttribute.#street = :addressAttribute_street, #addressAttribute.#city = :addressAttribute_city, #addressAttribute.#geo.#lat = :addressAttribute_geo_lat, #addressAttribute.#geo.#lng = :addressAttribute_geo_lng, #addressAttribute.#geo.#accuracy = :addressAttribute_geo_accuracy, #addressAttribute.#scores = :addressAttribute_scores REMOVE #addressAttribute.#zip, #addressAttribute.#category"
                }
              }
            ]
          }
        ]
      ]);
    });
  });

  describe("a nullable field inside a list element set to null is left out of the stored element", () => {
    beforeEach(() => {
      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
    });

    it("in a list nested in an object, in an object inside the element and in a list inside the element", async () => {
      expect.assertions(4);

      await NestedListsEntity.update("123", {
        layout: {
          section: {
            entries: [
              {
                sku: "sku-1",
                note: null,
                placement: { aisle: "A1", bin: null },
                restocks: [
                  { at: new Date("2024-06-15T12:00:00.000Z"), note: null },
                  { at: new Date("2024-06-16T12:00:00.000Z"), note: "late" }
                ]
              },
              {
                sku: "sku-2",
                note: "kept",
                placement: { aisle: "B2", bin: "7" },
                restocks: []
              }
            ]
          }
        }
      });

      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockedQueryCommand.mock.calls).toEqual([]);
      expect(mockTransactGetCommand.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#UpdatedAt": "UpdatedAt",
                    "#Layout": "Layout",
                    "#section": "section",
                    "#entries": "entries"
                  },
                  ExpressionAttributeValues: {
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                    ":Layout_section_entries": [
                      {
                        sku: "sku-1",
                        placement: { aisle: "A1" },
                        restocks: [
                          { at: "2024-06-15T12:00:00.000Z" },
                          { at: "2024-06-16T12:00:00.000Z", note: "late" }
                        ]
                      },
                      {
                        sku: "sku-2",
                        note: "kept",
                        placement: { aisle: "B2", bin: "7" },
                        restocks: []
                      }
                    ]
                  },
                  Key: {
                    PK: "NestedListsEntity#123",
                    SK: "NestedListsEntity"
                  },
                  TableName: "mock-table",
                  UpdateExpression:
                    "SET #UpdatedAt = :UpdatedAt, #Layout.#section.#entries = :Layout_section_entries"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("in a discriminated union variant inside a list", async () => {
      expect.assertions(4);

      await ArrayOfUnionsEntity.update("123", {
        dashboard: {
          widgets: [
            {
              type: "metric-card",
              label: "Revenue",
              value: 500,
              format: "currency",
              trend: null
            },
            {
              type: "date-marker",
              date: new Date("2024-06-15T12:00:00.000Z"),
              label: null
            }
          ]
        }
      });

      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockedQueryCommand.mock.calls).toEqual([]);
      expect(mockTransactGetCommand.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#UpdatedAt": "UpdatedAt",
                    "#Dashboard": "Dashboard",
                    "#widgets": "widgets"
                  },
                  ExpressionAttributeValues: {
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                    ":Dashboard_widgets": [
                      {
                        type: "metric-card",
                        label: "Revenue",
                        value: 500,
                        format: "currency"
                      },
                      {
                        type: "date-marker",
                        date: "2024-06-15T12:00:00.000Z"
                      }
                    ]
                  },
                  Key: {
                    PK: "ArrayOfUnionsEntity#123",
                    SK: "ArrayOfUnionsEntity"
                  },
                  TableName: "mock-table",
                  UpdateExpression:
                    "SET #UpdatedAt = :UpdatedAt, #Dashboard.#widgets = :Dashboard_widgets"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("through the instance method, which returns the element without the field", async () => {
      expect.assertions(5);

      const instance = createInstance(NestedListsEntity, {
        pk: "NestedListsEntity#123" as PartitionKey,
        sk: "NestedListsEntity" as SortKey,
        id: "123",
        type: "NestedListsEntity",
        layout: {
          section: {
            entries: [
              {
                sku: "sku-1",
                note: "old",
                placement: { aisle: "A1", bin: "3" },
                restocks: [
                  { at: new Date("2024-06-14T12:00:00.000Z"), note: "old" }
                ]
              }
            ]
          }
        },
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });

      const updatedInstance = await instance.update({
        layout: {
          section: {
            entries: [
              {
                sku: "sku-1",
                note: null,
                placement: { aisle: "A1", bin: null },
                restocks: [
                  { at: new Date("2024-06-15T12:00:00.000Z"), note: null }
                ]
              }
            ]
          }
        }
      });

      expect(updatedInstance).toEqual({
        ...instance,
        layout: {
          section: {
            entries: [
              {
                sku: "sku-1",
                placement: { aisle: "A1" },
                restocks: [{ at: new Date("2024-06-15T12:00:00.000Z") }]
              }
            ]
          }
        },
        updatedAt: new Date("2023-10-16T03:31:35.918Z")
      });
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockedQueryCommand.mock.calls).toEqual([]);
      expect(mockTransactGetCommand.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#UpdatedAt": "UpdatedAt",
                    "#Layout": "Layout",
                    "#section": "section",
                    "#entries": "entries"
                  },
                  ExpressionAttributeValues: {
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                    ":Layout_section_entries": [
                      {
                        sku: "sku-1",
                        placement: { aisle: "A1" },
                        restocks: [{ at: "2024-06-15T12:00:00.000Z" }]
                      }
                    ]
                  },
                  Key: {
                    PK: "NestedListsEntity#123",
                    SK: "NestedListsEntity"
                  },
                  TableName: "mock-table",
                  UpdateExpression:
                    "SET #UpdatedAt = :UpdatedAt, #Layout.#section.#entries = :Layout_section_entries"
                }
              }
            ]
          }
        ]
      ]);
    });
  });

  describe("will allow nullable attributes to be set to null", () => {
    const dbOperationAssertions = (): void => {
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockedQueryCommand.mock.calls).toEqual([]);
      expect(mockTransactGetCommand.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  TableName: "mock-table",
                  Key: {
                    PK: "MockInformation#123",
                    SK: "MockInformation"
                  },
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#Phone": "Phone",
                    "#UpdatedAt": "UpdatedAt",
                    "#someDate": "someDate"
                  },
                  ExpressionAttributeValues: {
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                  },
                  UpdateExpression:
                    "SET #UpdatedAt = :UpdatedAt REMOVE #Phone, #someDate"
                }
              }
            ]
          }
        ]
      ]);
    };

    beforeEach(() => {
      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
    });

    it("static method", async () => {
      expect.assertions(4);

      await MockInformation.update("123", {
        someDate: null,
        phone: null
      });

      dbOperationAssertions();
    });

    it("instance method", async () => {
      expect.assertions(7);

      const instance = createInstance(MockInformation, {
        pk: "MockInformation#123" as PartitionKey,
        sk: "MockInformation" as SortKey,
        id: "123",
        type: "MockInformation",
        address: "9 Example Ave",
        email: "example@example.com",
        someDate: new Date(),
        state: "SomeState",
        phone: "555-555-5555",
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });

      const updatedInstance = await instance.update({
        someDate: null,
        phone: null
      });

      expect(updatedInstance).toEqual({
        ...instance,
        someDate: undefined,
        phone: undefined,
        updatedAt: new Date("2023-10-16T03:31:35.918Z")
      });
      expect(updatedInstance).toBeInstanceOf(MockInformation);
      // Original instance is not mutated
      expect(instance).toEqual({
        pk: "MockInformation#123",
        sk: "MockInformation",
        id: "123",
        type: "MockInformation",
        address: "9 Example Ave",
        email: "example@example.com",
        someDate: new Date(),
        state: "SomeState",
        phone: "555-555-5555",
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });
      dbOperationAssertions();
    });
  });

  describe("will not allow non nullable attributes to be null", () => {
    const operationSharedAssertions = (e: any): void => {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual("Validation errors");
      expect(e.cause).toEqual([
        {
          code: "invalid_type",
          expected: "date",
          message: "Invalid input: expected date, received null",
          path: ["myAttribute"]
        }
      ]);
      expect(mockSend.mock.calls).toEqual([]);
      expect(mockedQueryCommand.mock.calls).toEqual([]);
      expect(mockTransactGetCommand.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    };

    test("static method", async () => {
      expect.assertions(7);

      try {
        await MyModelNonNullableAttribute.update("123", {
          myAttribute: null as any // Force any to test runtime validations
        });
      } catch (e: any) {
        operationSharedAssertions(e);
      }
    });

    test("instance method", async () => {
      expect.assertions(7);

      const instance = createInstance(MyModelNonNullableAttribute, {
        pk: "test-pk" as PartitionKey,
        sk: "test-sk" as SortKey,
        id: "123",
        type: "MyModelNonNullableAttribute",
        myAttribute: new Date(),
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });

      try {
        await instance.update({
          myAttribute: null as any // Force any to test runtime validations
        });
      } catch (e: any) {
        operationSharedAssertions(e);
      }
    });
  });

  describe("an entity which BelongsTo an entity who HasOne of it", () => {
    describe("when the entity does not already belong to another entity", () => {
      const contactInformation: MockTableEntityTableItem<ContactInformation> = {
        PK: "ContactInformation#123",
        SK: "ContactInformation",
        Id: "123",
        Type: "ContactInformation",
        Email: "old-email@email.com",
        Phone: "555-555-5555",
        CustomerId: undefined, // Not already associated to an entity
        CreatedAt: "2023-01-01T00:00:00.000Z",
        UpdatedAt: "2023-01-02T00:00:00.000Z"
      };

      const instance = createInstance(ContactInformation, {
        pk: contactInformation.PK as PartitionKey,
        sk: contactInformation.SK as SortKey,
        id: contactInformation.Id,
        type: contactInformation.Type,
        email: contactInformation.Email,
        phone: contactInformation.Phone,
        createdAt: new Date(contactInformation.CreatedAt),
        updatedAt: new Date(contactInformation.UpdatedAt)
      });

      beforeEach(() => {
        const customer: MockTableEntityTableItem<Customer> = {
          PK: "Customer#456",
          SK: "Customer",
          Id: "456",
          Type: "Customer",
          Name: "Mock Customer",
          Address: "11 Some St",
          CreatedAt: "2023-01-01T00:00:00.000Z",
          UpdatedAt: "2023-01-02T00:00:00.000Z"
        };

        mockQuery.mockResolvedValue({
          Items: [contactInformation]
        });
        mockTransactGetItems.mockResolvedValue({
          Responses: [{ Item: customer }]
        });

        vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      });

      afterEach(() => {
        mockSend.mockReset();
        mockQuery.mockReset();
        mockTransactGetItems.mockReset();
      });

      describe("will update the entity and its denormalized records", () => {
        const dbOperationAssertions = (): void => {
          expect(mockSend.mock.calls).toEqual([
            [{ name: "QueryCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockedQueryCommand.mock.calls).toEqual([
            [
              {
                TableName: "mock-table",
                KeyConditionExpression: "#PK = :PK2",
                ExpressionAttributeNames: {
                  "#PK": "PK",
                  "#Type": "Type"
                },
                ExpressionAttributeValues: {
                  ":PK2": "ContactInformation#123",
                  ":Type1": "ContactInformation"
                },

                FilterExpression: "#Type IN (:Type1)",
                ConsistentRead: true
              }
            ]
          ]);
          // Does not need to fetch denormalized record
          expect(mockTransactGetCommand.mock.calls).toEqual([]);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [
              {
                TransactItems: [
                  {
                    Update: {
                      TableName: "mock-table",
                      Key: {
                        PK: "ContactInformation#123",
                        SK: "ContactInformation"
                      },
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#Email": "Email",
                        "#UpdatedAt": "UpdatedAt"
                      },
                      ExpressionAttributeValues: {
                        ":Email": "new-email@example.com",
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      },
                      UpdateExpression:
                        "SET #Email = :Email, #UpdatedAt = :UpdatedAt"
                    }
                  }
                ]
              }
            ]
          ]);
        };

        test("static method", async () => {
          expect.assertions(5);

          expect(
            await ContactInformation.update("123", {
              email: "new-email@example.com"
            })
          ).toBeUndefined();

          dbOperationAssertions();
        });

        test("instance method", async () => {
          expect.assertions(7);

          const updatedInstance = await instance.update({
            email: "new-email@example.com"
          });

          expect(updatedInstance).toEqual({
            ...instance,
            email: "new-email@example.com",
            updatedAt: new Date("2023-10-16T03:31:35.918Z")
          });
          expect(updatedInstance).toBeInstanceOf(ContactInformation);
          // Original instance is not mutated
          expect(instance).toEqual({
            pk: contactInformation.PK as PartitionKey,
            sk: contactInformation.SK as SortKey,
            id: contactInformation.Id,
            type: contactInformation.Type,
            email: contactInformation.Email,
            phone: contactInformation.Phone,
            createdAt: new Date(contactInformation.CreatedAt),
            updatedAt: new Date(contactInformation.UpdatedAt)
          });

          dbOperationAssertions();
        });
      });

      describe("when a foreign key is updated", () => {
        describe("will update the foreign key if the entity being associated with exists", () => {
          const dbOperationAssertions = (): void => {
            expect(mockSend.mock.calls).toEqual([
              [{ name: "TransactGetCommand" }],
              [{ name: "QueryCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
            expect(mockedQueryCommand.mock.calls).toEqual([
              [
                {
                  TableName: "mock-table",
                  KeyConditionExpression: "#PK = :PK2",
                  ExpressionAttributeNames: {
                    "#PK": "PK",
                    "#Type": "Type"
                  },
                  ExpressionAttributeValues: {
                    ":PK2": "ContactInformation#123",
                    ":Type1": "ContactInformation"
                  },
                  FilterExpression: "#Type IN (:Type1)",
                  ConsistentRead: true
                }
              ]
            ]);
            // Get the new customer so that it can be denormalized
            expect(mockTransactGetCommand.mock.calls).toEqual([
              [
                {
                  TransactItems: [
                    {
                      Get: {
                        TableName: "mock-table",
                        Key: { PK: "Customer#456", SK: "Customer" }
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
                      // Update the ContactInformation entity
                      Update: {
                        TableName: "mock-table",
                        Key: {
                          PK: "ContactInformation#123",
                          SK: "ContactInformation"
                        },
                        UpdateExpression:
                          "SET #Email = :Email, #CustomerId = :CustomerId, #UpdatedAt = :UpdatedAt",
                        ConditionExpression: "attribute_exists(PK)",
                        ExpressionAttributeNames: {
                          "#CustomerId": "CustomerId",
                          "#Email": "Email",
                          "#UpdatedAt": "UpdatedAt"
                        },
                        ExpressionAttributeValues: {
                          ":CustomerId": "456",
                          ":Email": "new-email@example.com",
                          ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                        }
                      }
                    },
                    // Check that the customer being associated with exists
                    {
                      ConditionCheck: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_exists(PK)",
                        Key: {
                          PK: "Customer#456",
                          SK: "Customer"
                        }
                      }
                    },
                    // Denormalize ContactInformation to Customer partition
                    {
                      Put: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_not_exists(PK)",
                        Item: {
                          PK: "Customer#456",
                          SK: "ContactInformation",
                          Id: "123",
                          Type: "ContactInformation",
                          CustomerId: "456",
                          Email: "new-email@example.com",
                          Phone: "555-555-5555",
                          CreatedAt: "2023-01-01T00:00:00.000Z",
                          UpdatedAt: "2023-10-16T03:31:35.918Z"
                        }
                      }
                    },
                    // Denormalize Customer to ContactInformation partition
                    {
                      Put: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_not_exists(PK)",
                        Item: {
                          PK: "ContactInformation#123",
                          SK: "Customer",
                          Id: "456",
                          Type: "Customer",
                          Address: "11 Some St",
                          Name: "Mock Customer",
                          CreatedAt: "2023-01-01T00:00:00.000Z",
                          UpdatedAt: "2023-01-02T00:00:00.000Z"
                        }
                      }
                    }
                  ]
                }
              ]
            ]);
          };

          test("static method", async () => {
            expect.assertions(5);

            expect(
              await ContactInformation.update("123", {
                email: "new-email@example.com",
                customerId: "456"
              })
            ).toBeUndefined();
            dbOperationAssertions();
          });

          test("instance method", async () => {
            expect.assertions(7);

            const updatedInstance = await instance.update({
              email: "new-email@example.com",
              customerId: "456"
            });

            expect(updatedInstance).toEqual({
              ...instance,
              email: "new-email@example.com",
              customerId: "456",
              updatedAt: new Date("2023-10-16T03:31:35.918Z")
            });
            expect(updatedInstance).toBeInstanceOf(ContactInformation);
            // Original instance is not mutated
            expect(instance).toEqual({
              pk: contactInformation.PK as PartitionKey,
              sk: contactInformation.SK as SortKey,
              id: contactInformation.Id,
              type: contactInformation.Type,
              email: contactInformation.Email,
              phone: contactInformation.Phone,
              createdAt: new Date(contactInformation.CreatedAt),
              updatedAt: new Date(contactInformation.UpdatedAt)
            });

            dbOperationAssertions();
          });
        });

        describe("will throw an error if the entity being updated does not exist at pre fetch", () => {
          const operationSharedAssertions = (e: any): void => {
            expect(e).toEqual(
              new NotFoundError("ContactInformation does not exist: 123")
            );
            expect(mockSend.mock.calls).toEqual([
              [{ name: "TransactGetCommand" }],
              [{ name: "QueryCommand" }]
            ]);
          };

          beforeEach(() => {
            mockQuery.mockResolvedValueOnce({ Items: [] }); // Entity does not exist but will fail in transaction

            mockSend
              // TransactGet
              .mockResolvedValueOnce(undefined)
              // Query
              .mockResolvedValueOnce(undefined)
              // TransactWrite
              .mockImplementationOnce(() => {
                throw new TransactionCanceledException({
                  message: "MockMessage",
                  CancellationReasons: [
                    { Code: "ConditionalCheckFailed" },
                    { Code: "None" },
                    { Code: "None" },
                    { Code: "None" }
                  ],
                  $metadata: {}
                });
              });
          });

          test("static method", async () => {
            expect.assertions(2);

            try {
              await ContactInformation.update("123", {
                email: "new-email@example.com",
                customerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });

          test("instance method", async () => {
            expect.assertions(2);

            try {
              await instance.update({
                email: "new-email@example.com",
                customerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });
        });

        describe("will throw an error if the entity being updated existed at pre fetch but was deleted before the transaction was committed", () => {
          const operationSharedAssertions = (e: any): void => {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: ContactInformation with ID '123' does not exist"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "TransactGetCommand" }],
              [{ name: "QueryCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
          };

          beforeEach(() => {
            mockSend
              // TransactGet
              .mockResolvedValueOnce(undefined)
              // Query
              .mockResolvedValueOnce(undefined)
              // TransactWrite
              .mockImplementationOnce(() => {
                throw new TransactionCanceledException({
                  message: "MockMessage",
                  CancellationReasons: [
                    { Code: "ConditionalCheckFailed" },
                    { Code: "None" },
                    { Code: "None" },
                    { Code: "None" }
                  ],
                  $metadata: {}
                });
              });
          });

          test("static method", async () => {
            expect.assertions(3);

            try {
              await ContactInformation.update("123", {
                email: "new-email@example.com",
                customerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });

          test("instance method", async () => {
            expect.assertions(3);

            try {
              await instance.update({
                email: "new-email@example.com",
                customerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });
        });

        describe("will throw an error if the entity being associated with does not exist at preFetch", () => {
          const operationSharedAssertions = (e: any): void => {
            expect(e).toEqual(
              new NotFoundError("Customer does not exist: 456")
            );
            expect(mockSend.mock.calls).toEqual([
              [{ name: "TransactGetCommand" }],
              [{ name: "QueryCommand" }]
            ]);
          };

          beforeEach(() => {
            mockTransactGetItems.mockResolvedValueOnce({ Responses: [] }); // Entity does not exist but will fail in transaction

            mockSend
              .mockResolvedValueOnce(undefined)
              .mockReturnValueOnce(undefined)
              .mockImplementationOnce(() => {
                throw new TransactionCanceledException({
                  message: "MockMessage",
                  CancellationReasons: [
                    { Code: "None" },
                    { Code: "ConditionalCheckFailed" },
                    { Code: "None" },
                    { Code: "None" }
                  ],
                  $metadata: {}
                });
              });
          });

          test("static method", async () => {
            expect.assertions(2);

            try {
              await ContactInformation.update("123", {
                email: "new-email@example.com",
                customerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });

          test("instance method", async () => {
            expect.assertions(2);

            try {
              await instance.update({
                email: "new-email@example.com",
                customerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });
        });

        describe("will throw an error if the entity being updated existed when preFetched but was deleted before the transaction was committed (causing transaction error)", () => {
          const operationSharedAssertions = (e: any): void => {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: Customer with ID '456' does not exist"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "TransactGetCommand" }],
              [{ name: "QueryCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
          };

          beforeEach(() => {
            mockSend
              // TransactGet
              .mockResolvedValueOnce(undefined)
              // Query
              .mockResolvedValueOnce(undefined)
              // TransactWrite
              .mockImplementationOnce(() => {
                throw new TransactionCanceledException({
                  message: "MockMessage",
                  CancellationReasons: [
                    { Code: "None" },
                    { Code: "ConditionalCheckFailed" },
                    { Code: "None" },
                    { Code: "None" }
                  ],
                  $metadata: {}
                });
              });
          });

          test("static method", async () => {
            expect.assertions(3);

            try {
              await ContactInformation.update("123", {
                email: "new-email@example.com",
                customerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });

          test("instance method", async () => {
            expect.assertions(3);

            try {
              await instance.update({
                email: "new-email@example.com",
                customerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });
        });

        describe("will remove a nullable foreign key", () => {
          const dbOperationAssertions = (): void => {
            expect(mockSend.mock.calls).toEqual([
              [{ name: "QueryCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
            expect(mockedQueryCommand.mock.calls).toEqual([
              [
                {
                  TableName: "mock-table",
                  KeyConditionExpression: "#PK = :PK2",
                  ExpressionAttributeNames: {
                    "#PK": "PK",
                    "#Type": "Type"
                  },
                  ExpressionAttributeValues: {
                    ":PK2": "ContactInformation#123",
                    ":Type1": "ContactInformation"
                  },
                  FilterExpression: "#Type IN (:Type1)",
                  ConsistentRead: true
                }
              ]
            ]);
            // Don't get customer because its being deleted
            expect(mockTransactGetCommand.mock.calls).toEqual([]);
            // Does not include removing a denormalized link because it doesn't exist
            expect(mockTransactWriteCommand.mock.calls).toEqual([
              [
                {
                  TransactItems: [
                    {
                      Update: {
                        TableName: "mock-table",
                        Key: {
                          PK: "ContactInformation#123",
                          SK: "ContactInformation"
                        },
                        ConditionExpression: "attribute_exists(PK)",
                        ExpressionAttributeNames: {
                          "#CustomerId": "CustomerId",
                          "#Email": "Email",
                          "#UpdatedAt": "UpdatedAt"
                        },
                        ExpressionAttributeValues: {
                          ":Email": "new-email@example.com",
                          ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                        },
                        UpdateExpression:
                          "SET #Email = :Email, #UpdatedAt = :UpdatedAt REMOVE #CustomerId"
                      }
                    }
                  ]
                }
              ]
            ]);
          };

          test("static method", async () => {
            expect.assertions(5);

            expect(
              await ContactInformation.update("123", {
                email: "new-email@example.com",
                customerId: null
              })
            ).toBeUndefined();
            dbOperationAssertions();
          });

          test("instance method", async () => {
            expect.assertions(7);

            const updatedInstance = await instance.update({
              email: "new-email@example.com",
              customerId: null
            });

            expect(updatedInstance).toEqual({
              ...instance,
              email: "new-email@example.com",
              customerId: undefined,
              updatedAt: new Date("2023-10-16T03:31:35.918Z")
            });
            expect(updatedInstance).toBeInstanceOf(ContactInformation);
            // Original instance is not mutated
            expect(instance).toEqual({
              pk: contactInformation.PK as PartitionKey,
              sk: contactInformation.SK as SortKey,
              id: contactInformation.Id,
              type: contactInformation.Type,
              email: contactInformation.Email,
              phone: contactInformation.Phone,
              createdAt: new Date(contactInformation.CreatedAt),
              updatedAt: new Date(contactInformation.UpdatedAt)
            });

            dbOperationAssertions();
          });
        });
      });
    });

    describe("when the entity belongs to another another entity (Adds delete transaction for deleting denormalized records from previous related entities partition)", () => {
      const contactInformation: MockTableEntityTableItem<ContactInformation> = {
        PK: "ContactInformation#123",
        SK: "ContactInformation",
        Id: "123",
        Type: "ContactInformation",
        Email: "old-email@email.com",
        Phone: "555-555-5555",
        CustomerId: "001", // Already associated to an entity
        CreatedAt: "2023-01-01T00:00:00.000Z",
        UpdatedAt: "2023-01-02T00:00:00.000Z"
      };

      const instance = createInstance(ContactInformation, {
        pk: contactInformation.PK as PartitionKey,
        sk: contactInformation.SK as SortKey,
        id: contactInformation.Id,
        type: contactInformation.Type,
        customerId:
          contactInformation.CustomerId as NullableForeignKey<Customer>,
        email: contactInformation.Email,
        phone: contactInformation.Phone,
        createdAt: new Date(contactInformation.CreatedAt),
        updatedAt: new Date(contactInformation.UpdatedAt)
      });

      beforeEach(() => {
        const customer: MockTableEntityTableItem<Customer> = {
          PK: "Customer#456",
          SK: "Customer",
          Id: "456",
          Type: "Customer",
          Name: "Mock Customer",
          Address: "11 Some St",
          CreatedAt: "2023-03-01T00:00:00.000Z",
          UpdatedAt: "2023-04-02T00:00:00.000Z"
        };

        vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
        mockQuery.mockResolvedValue({
          Items: [contactInformation]
        });
        mockTransactGetItems.mockResolvedValue({
          Responses: [{ Item: customer }]
        });
      });

      afterEach(() => {
        mockSend.mockReset();
        mockQuery.mockReset();
        mockTransactGetItems.mockReset();
      });

      describe("will update the entity and its denormalized records", () => {
        const dbOperationAssertions = (): void => {
          expect(mockSend.mock.calls).toEqual([
            [{ name: "QueryCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockedQueryCommand.mock.calls).toEqual([
            [
              {
                TableName: "mock-table",
                KeyConditionExpression: "#PK = :PK2",
                ExpressionAttributeNames: {
                  "#PK": "PK",
                  "#Type": "Type"
                },
                ExpressionAttributeValues: {
                  ":PK2": "ContactInformation#123",
                  ":Type1": "ContactInformation"
                },

                FilterExpression: "#Type IN (:Type1)",
                ConsistentRead: true
              }
            ]
          ]);
          // Get denormalized entity to update
          expect(mockTransactGetCommand.mock.calls).toEqual([]);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [
              {
                TransactItems: [
                  {
                    // Update the main entity
                    Update: {
                      TableName: "mock-table",
                      Key: {
                        PK: "ContactInformation#123",
                        SK: "ContactInformation"
                      },
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#Email": "Email",
                        "#UpdatedAt": "UpdatedAt"
                      },
                      ExpressionAttributeValues: {
                        ":Email": "new-email@example.com",
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      },
                      UpdateExpression:
                        "SET #Email = :Email, #UpdatedAt = :UpdatedAt"
                    }
                  },
                  {
                    // Update the entity's denormalized copy to existing partition
                    Update: {
                      TableName: "mock-table",
                      Key: {
                        PK: "Customer#001",
                        SK: "ContactInformation"
                      },
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#Email": "Email",
                        "#UpdatedAt": "UpdatedAt"
                      },
                      ExpressionAttributeValues: {
                        ":Email": "new-email@example.com",
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      },
                      UpdateExpression:
                        "SET #Email = :Email, #UpdatedAt = :UpdatedAt"
                    }
                  }
                ]
              }
            ]
          ]);
        };

        test("static method", async () => {
          expect.assertions(5);

          expect(
            await ContactInformation.update("123", {
              email: "new-email@example.com"
            })
          ).toBeUndefined();

          dbOperationAssertions();
        });

        test("instance method", async () => {
          expect.assertions(7);

          const updatedInstance = await instance.update({
            email: "new-email@example.com"
          });

          expect(updatedInstance).toEqual({
            ...instance,
            email: "new-email@example.com",
            updatedAt: new Date("2023-10-16T03:31:35.918Z")
          });
          expect(updatedInstance).toBeInstanceOf(ContactInformation);
          // Original instance is not mutated
          expect(instance).toEqual({
            pk: contactInformation.PK as PartitionKey,
            sk: contactInformation.SK as SortKey,
            id: contactInformation.Id,
            type: contactInformation.Type,
            email: contactInformation.Email,
            phone: contactInformation.Phone,
            customerId: contactInformation.CustomerId,
            createdAt: new Date(contactInformation.CreatedAt),
            updatedAt: new Date(contactInformation.UpdatedAt)
          });

          dbOperationAssertions();
        });
      });

      describe("when a foreign key is updated", () => {
        describe("will update the foreign key, delete the old denormalized link and create a new one if the entity being associated with exists", () => {
          const dbOperationAssertions = (): void => {
            expect(mockSend.mock.calls).toEqual([
              [{ name: "TransactGetCommand" }],
              [{ name: "QueryCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
            expect(mockedQueryCommand.mock.calls).toEqual([
              [
                {
                  TableName: "mock-table",
                  KeyConditionExpression: "#PK = :PK2",
                  ExpressionAttributeNames: {
                    "#PK": "PK",
                    "#Type": "Type"
                  },
                  ExpressionAttributeValues: {
                    ":PK2": "ContactInformation#123",
                    ":Type1": "ContactInformation"
                  },
                  FilterExpression: "#Type IN (:Type1)",
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
                      // Update the ContactInformation including the foreign key
                      Update: {
                        TableName: "mock-table",
                        Key: {
                          PK: "ContactInformation#123",
                          SK: "ContactInformation"
                        },
                        UpdateExpression:
                          "SET #Email = :Email, #CustomerId = :CustomerId, #UpdatedAt = :UpdatedAt",
                        ConditionExpression: "attribute_exists(PK)",
                        ExpressionAttributeNames: {
                          "#CustomerId": "CustomerId",
                          "#Email": "Email",
                          "#UpdatedAt": "UpdatedAt"
                        },
                        ExpressionAttributeValues: {
                          ":CustomerId": "456",
                          ":Email": "new-email@example.com",
                          ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                        }
                      }
                    },
                    // Delete the denormalized link to the previous ContactInformation
                    {
                      Delete: {
                        TableName: "mock-table",
                        Key: {
                          PK: "Customer#001",
                          SK: "ContactInformation"
                        }
                      }
                    },
                    // Check that the new customer being associated with exists
                    {
                      ConditionCheck: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_exists(PK)",
                        Key: {
                          PK: "Customer#456",
                          SK: "Customer"
                        }
                      }
                    },
                    // Denormalize a link of the ContactInformation to the new customer's partition
                    {
                      Put: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_not_exists(PK)",
                        Item: {
                          PK: "Customer#456",
                          SK: "ContactInformation",
                          Id: "123",
                          Type: "ContactInformation",
                          CustomerId: "456",
                          Email: "new-email@example.com",
                          Phone: "555-555-5555",
                          CreatedAt: "2023-01-01T00:00:00.000Z",
                          UpdatedAt: "2023-10-16T03:31:35.918Z"
                        }
                      }
                    },
                    // Overwrite the existing denormalized link to the Customer in the ContactInformation's partition
                    {
                      Put: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_exists(PK)",
                        Item: {
                          PK: "ContactInformation#123",
                          SK: "Customer",
                          Id: "456",
                          Type: "Customer",
                          Address: "11 Some St",
                          Name: "Mock Customer",
                          CreatedAt: "2023-03-01T00:00:00.000Z",
                          UpdatedAt: "2023-04-02T00:00:00.000Z"
                        }
                      }
                    }
                  ]
                }
              ]
            ]);
          };

          test("static method", async () => {
            expect.assertions(5);

            expect(
              await ContactInformation.update("123", {
                email: "new-email@example.com",
                customerId: "456"
              })
            ).toBeUndefined();
            dbOperationAssertions();
          });

          test("instance method", async () => {
            expect.assertions(7);

            const updatedInstance = await instance.update({
              email: "new-email@example.com",
              customerId: "456"
            });

            expect(updatedInstance).toEqual({
              ...instance,
              email: "new-email@example.com",
              customerId: "456",
              updatedAt: new Date("2023-10-16T03:31:35.918Z")
            });
            expect(updatedInstance).toBeInstanceOf(ContactInformation);
            // Original instance is not mutated
            expect(instance).toEqual({
              pk: contactInformation.PK as PartitionKey,
              sk: contactInformation.SK as SortKey,
              id: contactInformation.Id,
              type: contactInformation.Type,
              customerId: contactInformation.CustomerId,
              email: contactInformation.Email,
              phone: contactInformation.Phone,
              createdAt: new Date(contactInformation.CreatedAt),
              updatedAt: new Date(contactInformation.UpdatedAt)
            });

            dbOperationAssertions();
          });
        });

        describe("will throw an error if the entity being updated does not exist at preFetch", () => {
          const operationSharedAssertions = (e: any): void => {
            expect(e).toEqual(
              new NotFoundError("ContactInformation does not exist: 123")
            );
            expect(mockSend.mock.calls).toEqual([
              [{ name: "TransactGetCommand" }],
              [{ name: "QueryCommand" }]
            ]);
          };

          beforeEach(() => {
            mockQuery.mockResolvedValueOnce({ Items: [] }); // Entity does not exist but will fail in transaction

            mockSend
              // TransactGet
              .mockResolvedValueOnce(undefined)
              // Query
              .mockResolvedValueOnce(undefined)
              // TransactWrite
              .mockImplementationOnce(() => {
                throw new TransactionCanceledException({
                  message: "MockMessage",
                  CancellationReasons: [
                    { Code: "ConditionalCheckFailed" },
                    { Code: "None" },
                    { Code: "None" },
                    { Code: "None" },
                    { Code: "None" }
                  ],
                  $metadata: {}
                });
              });
          });

          test("static method", async () => {
            expect.assertions(2);

            try {
              await ContactInformation.update("123", {
                email: "new-email@example.com",
                customerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });

          test("instance method", async () => {
            expect.assertions(2);

            try {
              await instance.update({
                email: "new-email@example.com",
                customerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });
        });

        describe("will throw an error if the entity being updated existed at preFetch but was deleted before the transaction was committed", () => {
          const operationSharedAssertions = (e: any): void => {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: ContactInformation with ID '123' does not exist"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "TransactGetCommand" }],
              [{ name: "QueryCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
          };

          beforeEach(() => {
            mockSend
              // TransactGet
              .mockResolvedValueOnce(undefined)
              // Query
              .mockResolvedValueOnce(undefined)
              // TransactWrite
              .mockImplementationOnce(() => {
                throw new TransactionCanceledException({
                  message: "MockMessage",
                  CancellationReasons: [
                    { Code: "ConditionalCheckFailed" },
                    { Code: "None" },
                    { Code: "None" },
                    { Code: "None" },
                    { Code: "None" }
                  ],
                  $metadata: {}
                });
              });
          });

          test("static method", async () => {
            expect.assertions(3);

            try {
              await ContactInformation.update("123", {
                email: "new-email@example.com",
                customerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });

          test("instance method", async () => {
            expect.assertions(3);

            try {
              await instance.update({
                email: "new-email@example.com",
                customerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });
        });

        describe("will throw an error if the associated entity does not exist at preFetch", () => {
          const operationSharedAssertions = (e: any): void => {
            expect(e).toEqual(
              new NotFoundError("Customer does not exist: 456")
            );
            expect(mockSend.mock.calls).toEqual([
              [{ name: "TransactGetCommand" }],
              [{ name: "QueryCommand" }]
            ]);
          };

          beforeEach(() => {
            mockTransactGetItems.mockResolvedValueOnce({ Responses: [] }); // Entity does not exist but will fail in transaction

            mockSend
              // TransactGet
              .mockResolvedValueOnce(undefined)
              // Query
              .mockResolvedValueOnce(undefined)
              // TransactWrite
              .mockImplementationOnce(() => {
                throw new TransactionCanceledException({
                  message: "MockMessage",
                  CancellationReasons: [
                    { Code: "None" },
                    { Code: "None" },
                    { Code: "ConditionalCheckFailed" },
                    { Code: "None" },
                    { Code: "None" }
                  ],
                  $metadata: {}
                });
              });
          });

          test("static method", async () => {
            expect.assertions(2);

            try {
              await ContactInformation.update("123", {
                email: "new-email@example.com",
                customerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });

          test("instance method", async () => {
            expect.assertions(2);

            try {
              await instance.update({
                email: "new-email@example.com",
                customerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });
        });

        describe("will throw an error if the associated entity existed at preFetch but was deleted before the transaction was committed", () => {
          const operationSharedAssertions = (e: any): void => {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: Customer with ID '456' does not exist"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "TransactGetCommand" }],
              [{ name: "QueryCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
          };

          beforeEach(() => {
            mockSend
              // TransactGet
              .mockResolvedValueOnce(undefined)
              // Query
              .mockResolvedValueOnce(undefined)
              // TransactWrite
              .mockImplementationOnce(() => {
                throw new TransactionCanceledException({
                  message: "MockMessage",
                  CancellationReasons: [
                    { Code: "None" },
                    { Code: "None" },
                    { Code: "ConditionalCheckFailed" },
                    { Code: "None" },
                    { Code: "None" }
                  ],
                  $metadata: {}
                });
              });
          });

          test("static method", async () => {
            expect.assertions(3);

            try {
              await ContactInformation.update("123", {
                email: "new-email@example.com",
                customerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });

          test("instance method", async () => {
            expect.assertions(3);

            try {
              await instance.update({
                email: "new-email@example.com",
                customerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });
        });

        describe("will throw an error if the entity is already associated with the requested entity", () => {
          const operationSharedAssertions = (e: any): void => {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: Customer with id: 456 already has an associated ContactInformation"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "TransactGetCommand" }],
              [{ name: "QueryCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
          };

          beforeEach(() => {
            mockSend
              // TransactGet
              .mockResolvedValueOnce(undefined)
              // Query
              .mockResolvedValueOnce(undefined)
              // TransactWrite
              .mockImplementationOnce(() => {
                throw new TransactionCanceledException({
                  message: "MockMessage",
                  CancellationReasons: [
                    { Code: "None" },
                    { Code: "None" },
                    { Code: "None" },
                    { Code: "ConditionalCheckFailed" },
                    { Code: "None" }
                  ],
                  $metadata: {}
                });
              });
          });

          test("static method", async () => {
            expect.assertions(3);

            try {
              await ContactInformation.update("123", {
                email: "new-email@example.com",
                customerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });

          test("instance method", async () => {
            expect.assertions(3);

            try {
              await instance.update({
                email: "new-email@example.com",
                customerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });
        });

        describe("will remove a nullable foreign key and delete the denormalized records for the associated entity", () => {
          const dbOperationAssertions = (): void => {
            expect(mockSend.mock.calls).toEqual([
              [{ name: "QueryCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
            expect(mockedQueryCommand.mock.calls).toEqual([
              [
                {
                  TableName: "mock-table",
                  KeyConditionExpression: "#PK = :PK2",
                  ExpressionAttributeNames: {
                    "#PK": "PK",
                    "#Type": "Type"
                  },
                  ExpressionAttributeValues: {
                    ":PK2": "ContactInformation#123",
                    ":Type1": "ContactInformation"
                  },
                  FilterExpression: "#Type IN (:Type1)",
                  ConsistentRead: true
                }
              ]
            ]);
            // Don't get customer because its being deleted
            expect(mockTransactGetCommand.mock.calls).toEqual([]);
            expect(mockTransactWriteCommand.mock.calls).toEqual([
              [
                {
                  TransactItems: [
                    // Update the ContactInformation and remove the foreign key
                    {
                      Update: {
                        TableName: "mock-table",
                        Key: {
                          PK: "ContactInformation#123",
                          SK: "ContactInformation"
                        },
                        UpdateExpression:
                          "SET #Email = :Email, #UpdatedAt = :UpdatedAt REMOVE #CustomerId",
                        ConditionExpression: "attribute_exists(PK)",
                        ExpressionAttributeNames: {
                          "#CustomerId": "CustomerId",
                          "#Email": "Email",
                          "#UpdatedAt": "UpdatedAt"
                        },
                        ExpressionAttributeValues: {
                          ":Email": "new-email@example.com",
                          ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                        }
                      }
                    },
                    // Delete the denormalized record to Customer from the ContactInformation partition
                    {
                      Delete: {
                        TableName: "mock-table",
                        Key: { PK: "ContactInformation#123", SK: "Customer" }
                      }
                    },
                    // Delete the denormalized record to ContactInformation from the customer partition
                    {
                      Delete: {
                        TableName: "mock-table",
                        Key: { PK: "Customer#001", SK: "ContactInformation" }
                      }
                    }
                  ]
                }
              ]
            ]);
          };

          test("static method", async () => {
            expect.assertions(5);

            expect(
              await ContactInformation.update("123", {
                email: "new-email@example.com",
                customerId: null
              })
            ).toBeUndefined();
            dbOperationAssertions();
          });

          test("instance method", async () => {
            expect.assertions(7);

            const updatedInstance = await instance.update({
              email: "new-email@example.com",
              customerId: null
            });

            expect(updatedInstance).toEqual({
              ...instance,
              email: "new-email@example.com",
              customerId: undefined,
              updatedAt: new Date("2023-10-16T03:31:35.918Z")
            });
            expect(updatedInstance).toBeInstanceOf(ContactInformation);
            // Original instance is not mutated
            expect(instance).toEqual({
              pk: contactInformation.PK as PartitionKey,
              sk: contactInformation.SK as SortKey,
              id: contactInformation.Id,
              type: contactInformation.Type,
              customerId: contactInformation.CustomerId,
              email: contactInformation.Email,
              phone: contactInformation.Phone,
              createdAt: new Date(contactInformation.CreatedAt),
              updatedAt: new Date(contactInformation.UpdatedAt)
            });

            dbOperationAssertions();
          });
        });

        describe("will throw an error if it fails to delete the old denormalized records", () => {
          beforeEach(() => {
            mockSend
              // Query
              .mockResolvedValueOnce(undefined)
              // TransactWrite
              .mockImplementationOnce(() => {
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
          });

          const operationSharedAssertions = (e: any): void => {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                'ConditionalCheckFailed: Failed to delete denormalized record with keys: {"PK":"ContactInformation#123","SK":"Customer"}'
              ),
              new ConditionalCheckFailedError(
                'ConditionalCheckFailed: Failed to delete denormalized record with keys: {"PK":"Customer#001","SK":"ContactInformation"}'
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "QueryCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
          };

          test("static method", async () => {
            expect.assertions(3);

            try {
              await ContactInformation.update("123", {
                email: "new-email@example.com",
                customerId: null
              });
            } catch (e) {
              operationSharedAssertions(e);
            }
          });

          test("instance method", async () => {
            expect.assertions(3);

            try {
              await instance.update({
                email: "new-email@example.com",
                customerId: null
              });
            } catch (e) {
              operationSharedAssertions(e);
            }
          });
        });
      });
    });
  });

  describe("an entity which BelongsTo an entity who HasMany of it", () => {
    describe("when the entity does not already belong to another entity", () => {
      const pet: MockTableEntityTableItem<Pet> = {
        PK: "Pet#123",
        SK: "Pet",
        Id: "123",
        Type: "Pet",
        Name: "Mock Pet",
        OwnerId: undefined, // Does not already belong to person
        CreatedAt: "2023-01-01T00:00:00.000Z",
        UpdatedAt: "2023-01-02T00:00:00.000Z"
      };

      const instance = createInstance(Pet, {
        pk: "Pet#123" as PartitionKey,
        sk: "Pet" as SortKey,
        id: "123",
        type: "Pet",
        name: "Mock Pet",
        ownerId: undefined,
        createdAt: new Date("2023-01-01"),
        updatedAt: new Date("2023-01-02")
      });

      beforeEach(() => {
        const person: MockTableEntityTableItem<Person> = {
          PK: "Person#456",
          SK: "Person",
          Id: "456",
          Type: "Person",
          Name: "Mock Person",
          CreatedAt: "2023-01-01T00:00:00.000Z",
          UpdatedAt: "2023-01-02T00:00:00.000Z"
        };

        mockQuery.mockResolvedValue({
          Items: [pet]
        });
        mockTransactGetItems.mockResolvedValue({
          Responses: [{ Item: person }]
        });

        vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      });

      afterEach(() => {
        mockSend.mockReset();
        mockQuery.mockReset();
        mockTransactGetItems.mockReset();
      });

      describe("will update the entity and its denormalized records", () => {
        const dbOperationAssertions = (): void => {
          expect(mockSend.mock.calls).toEqual([
            [{ name: "QueryCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockedQueryCommand.mock.calls).toEqual([
            [
              {
                TableName: "mock-table",
                KeyConditionExpression: "#PK = :PK2",
                ExpressionAttributeNames: {
                  "#PK": "PK",
                  "#Type": "Type"
                },
                ExpressionAttributeValues: {
                  ":PK2": "Pet#123",
                  ":Type1": "Pet"
                },
                FilterExpression: "#Type IN (:Type1)",
                ConsistentRead: true
              }
            ]
          ]);
          expect(mockTransactGetCommand.mock.calls).toEqual([]);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [
              {
                TransactItems: [
                  {
                    Update: {
                      TableName: "mock-table",
                      Key: {
                        PK: "Pet#123",
                        SK: "Pet"
                      },
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#Name": "Name",
                        "#UpdatedAt": "UpdatedAt"
                      },
                      ExpressionAttributeValues: {
                        ":Name": "Fido",
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      },
                      UpdateExpression:
                        "SET #Name = :Name, #UpdatedAt = :UpdatedAt"
                    }
                  }
                ]
              }
            ]
          ]);
        };

        test("static method", async () => {
          expect.assertions(5);

          expect(
            await Pet.update("123", {
              name: "Fido"
            })
          ).toBeUndefined();

          dbOperationAssertions();
        });

        test("instance method", async () => {
          expect.assertions(7);

          const updatedInstance = await instance.update({
            name: "Fido"
          });

          expect(updatedInstance).toEqual({
            ...instance,
            name: "Fido",
            updatedAt: new Date("2023-10-16T03:31:35.918Z")
          });
          expect(updatedInstance).toBeInstanceOf(Pet);
          // Original instance is not mutated
          expect(instance).toEqual({
            pk: pet.PK,
            sk: pet.SK,
            id: pet.Id,
            type: pet.Type,
            name: pet.Name,
            ownerId: undefined,
            createdAt: new Date(pet.CreatedAt),
            updatedAt: new Date(pet.UpdatedAt)
          });

          dbOperationAssertions();
        });
      });

      describe("when a foreign key is updated", () => {
        describe("will update the foreign key if the entity being associated with exists", () => {
          const dbOperationAssertions = (): void => {
            expect(mockSend.mock.calls).toEqual([
              [{ name: "TransactGetCommand" }],
              [{ name: "QueryCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
            expect(mockedQueryCommand.mock.calls).toEqual([
              [
                {
                  TableName: "mock-table",
                  KeyConditionExpression: "#PK = :PK2",
                  ExpressionAttributeNames: {
                    "#PK": "PK",
                    "#Type": "Type"
                  },
                  ExpressionAttributeValues: {
                    ":PK2": "Pet#123",
                    ":Type1": "Pet"
                  },
                  FilterExpression: "#Type IN (:Type1)",
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
                        Key: { PK: "Person#456", SK: "Person" }
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
                    // Update the pet and add owner id
                    {
                      Update: {
                        TableName: "mock-table",
                        Key: {
                          PK: "Pet#123",
                          SK: "Pet"
                        },
                        UpdateExpression:
                          "SET #Name = :Name, #OwnerId = :OwnerId, #UpdatedAt = :UpdatedAt",
                        ConditionExpression: "attribute_exists(PK)",
                        ExpressionAttributeNames: {
                          "#Name": "Name",
                          "#OwnerId": "OwnerId",
                          "#UpdatedAt": "UpdatedAt"
                        },
                        ExpressionAttributeValues: {
                          ":Name": "Fido",
                          ":OwnerId": "456",
                          ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                        }
                      }
                    },
                    // Check that the Person (owner) entity exists
                    {
                      ConditionCheck: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_exists(PK)",
                        Key: {
                          PK: "Person#456",
                          SK: "Person"
                        }
                      }
                    },
                    // Denormalize the Pet to Person partition
                    {
                      Put: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_not_exists(PK)",
                        Item: {
                          PK: "Person#456",
                          SK: "Pet#123",
                          Id: "123",
                          Type: "Pet",
                          AdoptedDate: undefined,
                          Name: "Fido",
                          OwnerId: "456",
                          CreatedAt: "2023-01-01T00:00:00.000Z",
                          UpdatedAt: "2023-10-16T03:31:35.918Z"
                        }
                      }
                    },
                    // Denormalize the Person to Pet partition
                    {
                      Put: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_not_exists(PK)",
                        Item: {
                          PK: "Pet#123",
                          SK: "Person",
                          Id: "456",
                          Type: "Person",
                          Name: "Mock Person",
                          CreatedAt: "2023-01-01T00:00:00.000Z",
                          UpdatedAt: "2023-01-02T00:00:00.000Z"
                        }
                      }
                    }
                  ]
                }
              ]
            ]);
          };

          test("static method", async () => {
            expect.assertions(5);

            expect(
              await Pet.update("123", {
                name: "Fido",
                ownerId: "456"
              })
            ).toBeUndefined();

            dbOperationAssertions();
          });

          test("instance method", async () => {
            expect.assertions(7);

            const updatedInstance = await instance.update({
              name: "Fido",
              ownerId: "456"
            });

            expect(updatedInstance).toEqual({
              ...instance,
              name: "Fido",
              ownerId: "456",
              updatedAt: new Date("2023-10-16T03:31:35.918Z")
            });
            expect(updatedInstance).toBeInstanceOf(Pet);
            // Original instance is not mutated
            expect(instance).toEqual({
              pk: pet.PK,
              sk: pet.SK,
              id: pet.Id,
              type: pet.Type,
              name: pet.Name,
              ownerId: undefined,
              createdAt: new Date(pet.CreatedAt),
              updatedAt: new Date(pet.UpdatedAt)
            });

            dbOperationAssertions();
          });
        });

        describe("will throw an error if the entity being updated does not exist at pre fetch", () => {
          const operationSharedAssertions = (e: any): void => {
            expect(e).toEqual(new NotFoundError("Pet does not exist: 123"));
            expect(mockSend.mock.calls).toEqual([
              [{ name: "TransactGetCommand" }],
              [{ name: "QueryCommand" }]
            ]);
          };

          beforeEach(() => {
            mockQuery.mockResolvedValueOnce({ Items: [] });
            mockSend
              // TransactGet
              .mockResolvedValueOnce(undefined)
              // Query
              .mockResolvedValueOnce(undefined)
              // TransactWrite
              .mockImplementationOnce(() => {
                throw new TransactionCanceledException({
                  message: "MockMessage",
                  CancellationReasons: [
                    { Code: "ConditionalCheckFailed" },
                    { Code: "None" },
                    { Code: "None" },
                    { Code: "None" }
                  ],
                  $metadata: {}
                });
              });
          });

          test("static method", async () => {
            expect.assertions(2);

            try {
              await Pet.update("123", {
                name: "Fido",
                ownerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });

          test("instance method", async () => {
            expect.assertions(2);

            try {
              await instance.update({
                name: "Fido",
                ownerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });
        });

        describe("will throw an error if the entity being updated existed at pre fetch but was deleted before the transaction was committed", () => {
          const operationSharedAssertions = (e: any): void => {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: Pet with ID '123' does not exist"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "TransactGetCommand" }],
              [{ name: "QueryCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
          };

          beforeEach(() => {
            mockSend
              // TransactGet
              .mockResolvedValueOnce(undefined)
              // Query
              .mockResolvedValueOnce(undefined)
              // TransactWrite
              .mockImplementationOnce(() => {
                throw new TransactionCanceledException({
                  message: "MockMessage",
                  CancellationReasons: [
                    { Code: "ConditionalCheckFailed" },
                    { Code: "None" },
                    { Code: "None" },
                    { Code: "None" }
                  ],
                  $metadata: {}
                });
              });
          });

          test("static method", async () => {
            expect.assertions(3);

            try {
              await Pet.update("123", {
                name: "Fido",
                ownerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });

          test("instance method", async () => {
            expect.assertions(3);

            try {
              await instance.update({
                name: "Fido",
                ownerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });
        });

        describe("will throw an error if the entity being associated with does not exist at pre fetch", () => {
          const operationSharedAssertions = (e: any): void => {
            expect(e).toEqual(new NotFoundError("Person does not exist: 456"));
            expect(mockSend.mock.calls).toEqual([
              [{ name: "TransactGetCommand" }],
              [{ name: "QueryCommand" }]
            ]);
          };

          beforeEach(() => {
            mockTransactGetItems.mockResolvedValueOnce({ Responses: [] }); // Entity does not exist at pre fetch

            mockSend
              .mockResolvedValueOnce(undefined)
              .mockReturnValueOnce(undefined)
              .mockImplementationOnce(() => {
                throw new TransactionCanceledException({
                  message: "MockMessage",
                  CancellationReasons: [
                    { Code: "None" },
                    { Code: "ConditionalCheckFailed" },
                    { Code: "None" },
                    { Code: "None" }
                  ],
                  $metadata: {}
                });
              });
          });

          test("static method", async () => {
            expect.assertions(2);

            try {
              await Pet.update("123", {
                name: "Fido",
                ownerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });

          test("instance method", async () => {
            expect.assertions(2);

            try {
              await instance.update({
                name: "Fido",
                ownerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });
        });

        describe("will throw an error if the entity being associated with existed when preFetched but was deleted before the transaction was committed (causing transaction error)", () => {
          const operationSharedAssertions = (e: any): void => {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: Person with ID '456' does not exist"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "TransactGetCommand" }],
              [{ name: "QueryCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
          };

          beforeEach(() => {
            mockSend
              .mockResolvedValueOnce(undefined)
              .mockReturnValueOnce(undefined)
              .mockImplementationOnce(() => {
                throw new TransactionCanceledException({
                  message: "MockMessage",
                  CancellationReasons: [
                    { Code: "None" },
                    { Code: "ConditionalCheckFailed" },
                    { Code: "None" },
                    { Code: "None" }
                  ],
                  $metadata: {}
                });
              });
          });

          test("static method", async () => {
            expect.assertions(3);

            try {
              await Pet.update("123", {
                name: "Fido",
                ownerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });

          test("instance method", async () => {
            expect.assertions(3);

            try {
              await instance.update({
                name: "Fido",
                ownerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });
        });

        describe("will remove a nullable foreign key and delete the links for the associated entity", () => {
          const dbOperationAssertions = (): void => {
            expect(mockSend.mock.calls).toEqual([
              [{ name: "QueryCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
            expect(mockedQueryCommand.mock.calls).toEqual([
              [
                {
                  TableName: "mock-table",
                  KeyConditionExpression: "#PK = :PK2",
                  ExpressionAttributeNames: {
                    "#PK": "PK",
                    "#Type": "Type"
                  },
                  ExpressionAttributeValues: {
                    ":PK2": "Pet#123",
                    ":Type1": "Pet"
                  },
                  FilterExpression: "#Type IN (:Type1)",
                  ConsistentRead: true
                }
              ]
            ]);
            // Don't get owner (Person) because its being deleted
            expect(mockTransactGetCommand.mock.calls).toEqual([]);
            // Does not include removing a denormalized link because it doesn't exist
            expect(mockTransactWriteCommand.mock.calls).toEqual([
              [
                {
                  TransactItems: [
                    {
                      Update: {
                        TableName: "mock-table",
                        Key: {
                          PK: "Pet#123",
                          SK: "Pet"
                        },
                        ConditionExpression: "attribute_exists(PK)",
                        ExpressionAttributeNames: {
                          "#Name": "Name",
                          "#OwnerId": "OwnerId",
                          "#UpdatedAt": "UpdatedAt"
                        },
                        ExpressionAttributeValues: {
                          ":Name": "New Name",
                          ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                        },
                        UpdateExpression:
                          "SET #Name = :Name, #UpdatedAt = :UpdatedAt REMOVE #OwnerId"
                      }
                    }
                  ]
                }
              ]
            ]);
          };

          it("static method", async () => {
            expect.assertions(5);

            expect(
              await Pet.update("123", {
                name: "New Name",
                ownerId: null
              })
            ).toBeUndefined();

            dbOperationAssertions();
          });

          it("instance method", async () => {
            expect.assertions(7);

            const updatedInstance = await instance.update({
              name: "New Name",
              ownerId: null
            });

            expect(updatedInstance).toEqual({
              ...instance,
              name: "New Name",
              ownerId: undefined,
              updatedAt: new Date("2023-10-16T03:31:35.918Z")
            });
            expect(updatedInstance).toBeInstanceOf(Pet);
            expect(instance).toEqual({
              pk: pet.PK,
              sk: pet.SK,
              id: pet.Id,
              type: pet.Type,
              name: pet.Name,
              ownerId: undefined,
              createdAt: new Date(pet.CreatedAt),
              updatedAt: new Date(pet.UpdatedAt)
            });

            dbOperationAssertions();
          });
        });
      });
    });

    describe("when the entity belongs to another another entity (Adds delete transaction for deleting denormalized records from previous related entities partition)", () => {
      const pet: MockTableEntityTableItem<Pet> = {
        PK: "Pet#123",
        SK: "Pet",
        Id: "123",
        Type: "Pet",
        Name: "Mock Pet",
        OwnerId: "001", // Already belongs to Person entity
        CreatedAt: "2023-01-01T00:00:00.000Z",
        UpdatedAt: "2023-01-02T00:00:00.000Z"
      };

      const instance = createInstance(Pet, {
        pk: "Pet#123" as PartitionKey,
        sk: "Pet" as SortKey,
        id: "123",
        type: "Pet",
        name: "Mock Pet",
        ownerId: pet.OwnerId as NullableForeignKey<Person>,
        createdAt: new Date("2023-01-01"),
        updatedAt: new Date("2023-01-02")
      });

      beforeEach(() => {
        const person: MockTableEntityTableItem<Person> = {
          PK: "Person#456",
          SK: "Person",
          Id: "456",
          Type: "Person",
          Name: "Mock Person",
          CreatedAt: "2023-01-01T00:00:00.000Z",
          UpdatedAt: "2023-01-02T00:00:00.000Z"
        };

        mockQuery.mockResolvedValue({
          Items: [pet]
        });
        mockTransactGetItems.mockResolvedValue({
          Responses: [{ Item: person }]
        });

        vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      });

      afterEach(() => {
        mockSend.mockReset();
        mockQuery.mockReset();
        mockTransactGetItems.mockReset();
      });

      describe("will update the entity and its denormalized records", () => {
        const dbOperationAssertions = (): void => {
          expect(mockSend.mock.calls).toEqual([
            [{ name: "QueryCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockedQueryCommand.mock.calls).toEqual([
            [
              {
                TableName: "mock-table",
                KeyConditionExpression: "#PK = :PK2",
                ExpressionAttributeNames: {
                  "#PK": "PK",
                  "#Type": "Type"
                },
                ExpressionAttributeValues: {
                  ":PK2": "Pet#123",
                  ":Type1": "Pet"
                },
                FilterExpression: "#Type IN (:Type1)",
                ConsistentRead: true
              }
            ]
          ]);
          expect(mockTransactGetCommand.mock.calls).toEqual([]);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [
              {
                TransactItems: [
                  {
                    // Update the Pet
                    Update: {
                      TableName: "mock-table",
                      Key: {
                        PK: "Pet#123",
                        SK: "Pet"
                      },
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#Name": "Name",
                        "#UpdatedAt": "UpdatedAt"
                      },
                      ExpressionAttributeValues: {
                        ":Name": "Fido",
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      },
                      UpdateExpression:
                        "SET #Name = :Name, #UpdatedAt = :UpdatedAt"
                    }
                  },
                  {
                    // Update the Pet's denormalized records in associated partition
                    Update: {
                      TableName: "mock-table",
                      Key: {
                        PK: "Person#001",
                        SK: "Pet#123"
                      },
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#Name": "Name",
                        "#UpdatedAt": "UpdatedAt"
                      },
                      ExpressionAttributeValues: {
                        ":Name": "Fido",
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      },
                      UpdateExpression:
                        "SET #Name = :Name, #UpdatedAt = :UpdatedAt"
                    }
                  }
                ]
              }
            ]
          ]);
        };

        test("static method", async () => {
          expect.assertions(5);

          expect(
            await Pet.update("123", {
              name: "Fido"
            })
          ).toBeUndefined();

          dbOperationAssertions();
        });

        test("instance method", async () => {
          expect.assertions(7);

          const updatedInstance = await instance.update({
            name: "Fido"
          });

          expect(updatedInstance).toEqual({
            ...instance,
            name: "Fido",
            updatedAt: new Date("2023-10-16T03:31:35.918Z")
          });
          expect(updatedInstance).toBeInstanceOf(Pet);
          // Original instance is not mutated
          expect(instance).toEqual({
            pk: pet.PK,
            sk: pet.SK,
            id: pet.Id,
            type: pet.Type,
            name: pet.Name,
            ownerId: "001",
            createdAt: new Date(pet.CreatedAt),
            updatedAt: new Date(pet.UpdatedAt)
          });

          dbOperationAssertions();
        });
      });

      describe("when a foreign key is updated", () => {
        describe("will update the foreign key, delete the old denormalized link and create a new one if the entity being associated with exists", () => {
          const dbOperationAssertions = (): void => {
            expect(mockSend.mock.calls).toEqual([
              [{ name: "TransactGetCommand" }],
              [{ name: "QueryCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
            expect(mockedQueryCommand.mock.calls).toEqual([
              [
                {
                  TableName: "mock-table",
                  KeyConditionExpression: "#PK = :PK2",
                  ExpressionAttributeNames: {
                    "#PK": "PK",
                    "#Type": "Type"
                  },
                  ExpressionAttributeValues: {
                    ":PK2": "Pet#123",
                    ":Type1": "Pet"
                  },
                  FilterExpression: "#Type IN (:Type1)",
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
                        Key: { PK: "Person#456", SK: "Person" }
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
                      // Update the Pet including the foreign key
                      Update: {
                        TableName: "mock-table",
                        Key: {
                          PK: "Pet#123",
                          SK: "Pet"
                        },
                        UpdateExpression:
                          "SET #Name = :Name, #OwnerId = :OwnerId, #UpdatedAt = :UpdatedAt",
                        ConditionExpression: "attribute_exists(PK)",
                        ExpressionAttributeNames: {
                          "#Name": "Name",
                          "#OwnerId": "OwnerId",
                          "#UpdatedAt": "UpdatedAt"
                        },
                        ExpressionAttributeValues: {
                          ":Name": "Fido",
                          ":OwnerId": "456",
                          ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                        }
                      }
                    },
                    // Delete the denormalized link to the previous Person (owner)
                    {
                      Delete: {
                        TableName: "mock-table",
                        Key: {
                          PK: "Person#001",
                          SK: "Pet#123"
                        }
                      }
                    },
                    // Check that the new Person (owner) being associated with exists
                    {
                      ConditionCheck: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_exists(PK)",
                        Key: {
                          PK: "Person#456",
                          SK: "Person"
                        }
                      }
                    },
                    // Denormalize a link of the Pet to the new Persons's (owners) partition
                    {
                      Put: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_not_exists(PK)",
                        Item: {
                          PK: "Person#456",
                          SK: "Pet#123",
                          Id: "123",
                          Type: "Pet",
                          AdoptedDate: undefined,
                          Name: "Fido",
                          OwnerId: "456",
                          CreatedAt: "2023-01-01T00:00:00.000Z",
                          UpdatedAt: "2023-10-16T03:31:35.918Z"
                        }
                      }
                    },
                    // Overwrite the existing denormalized link to the Person in the Pets's partition
                    {
                      Put: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_exists(PK)",
                        Item: {
                          PK: "Pet#123",
                          SK: "Person",
                          Id: "456",
                          Type: "Person",
                          Name: "Mock Person",
                          CreatedAt: "2023-01-01T00:00:00.000Z",
                          UpdatedAt: "2023-01-02T00:00:00.000Z"
                        }
                      }
                    }
                  ]
                }
              ]
            ]);
          };

          test("static method", async () => {
            expect.assertions(5);

            expect(
              await Pet.update("123", {
                name: "Fido",
                ownerId: "456"
              })
            ).toBeUndefined();

            dbOperationAssertions();
          });

          test("instance method", async () => {
            expect.assertions(7);

            const updatedInstance = await instance.update({
              name: "Fido",
              ownerId: "456"
            });

            expect(updatedInstance).toEqual({
              ...instance,
              name: "Fido",
              ownerId: "456",
              updatedAt: new Date("2023-10-16T03:31:35.918Z")
            });
            expect(updatedInstance).toBeInstanceOf(Pet);
            // Original instance is not mutated
            expect(instance).toEqual({
              pk: pet.PK,
              sk: pet.SK,
              id: pet.Id,
              type: pet.Type,
              name: pet.Name,
              ownerId: pet.OwnerId,
              createdAt: new Date(pet.CreatedAt),
              updatedAt: new Date(pet.UpdatedAt)
            });

            dbOperationAssertions();
          });
        });

        describe("will throw an error if the entity being updated does not exist at preFetch", () => {
          const operationSharedAssertions = (e: any): void => {
            expect(e).toEqual(new NotFoundError("Pet does not exist: 123"));
            expect(mockSend.mock.calls).toEqual([
              [{ name: "TransactGetCommand" }],
              [{ name: "QueryCommand" }]
            ]);
          };

          beforeEach(() => {
            mockQuery.mockResolvedValueOnce({ Items: [] }); // Entity does not exist but will fail in transaction

            mockSend
              // TransactGet
              .mockResolvedValueOnce(undefined)
              // Query
              .mockResolvedValueOnce(undefined)
              // TransactWrite
              .mockImplementationOnce(() => {
                throw new TransactionCanceledException({
                  message: "MockMessage",
                  CancellationReasons: [
                    { Code: "ConditionalCheckFailed" },
                    { Code: "None" },
                    { Code: "None" },
                    { Code: "None" },
                    { Code: "None" }
                  ],
                  $metadata: {}
                });
              });
          });

          test("static method", async () => {
            expect.assertions(2);

            try {
              await Pet.update("123", {
                name: "Fido",
                ownerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });

          test("instance method", async () => {
            expect.assertions(2);

            try {
              await instance.update({
                name: "Fido",
                ownerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });
        });

        describe("will throw an error if the entity being updated existed at preFetch but was deleted before the transaction was committed", () => {
          const operationSharedAssertions = (e: any): void => {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: Pet with ID '123' does not exist"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "TransactGetCommand" }],
              [{ name: "QueryCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
          };

          beforeEach(() => {
            mockSend
              // TransactGet
              .mockResolvedValueOnce(undefined)
              // Query
              .mockResolvedValueOnce(undefined)
              // TransactWrite
              .mockImplementationOnce(() => {
                throw new TransactionCanceledException({
                  message: "MockMessage",
                  CancellationReasons: [
                    { Code: "ConditionalCheckFailed" },
                    { Code: "None" },
                    { Code: "None" },
                    { Code: "None" },
                    { Code: "None" }
                  ],
                  $metadata: {}
                });
              });
          });

          test("static method", async () => {
            expect.assertions(3);

            try {
              await Pet.update("123", {
                name: "Fido",
                ownerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });

          test("instance method", async () => {
            expect.assertions(3);

            try {
              await instance.update({
                name: "Fido",
                ownerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });
        });

        describe("will throw an error if the entity being associated with does not exist at preFetch", () => {
          const operationSharedAssertions = (e: any): void => {
            expect(e).toEqual(new NotFoundError("Person does not exist: 456"));
            expect(mockSend.mock.calls).toEqual([
              [{ name: "TransactGetCommand" }],
              [{ name: "QueryCommand" }]
            ]);
          };

          beforeEach(() => {
            mockTransactGetItems.mockResolvedValueOnce({ Responses: [] }); // Entity does not exist but will fail in transaction

            mockSend
              // TransactGet
              .mockResolvedValueOnce(undefined)
              // Query
              .mockResolvedValueOnce(undefined)
              // TransactWrite
              .mockImplementationOnce(() => {
                throw new TransactionCanceledException({
                  message: "MockMessage",
                  CancellationReasons: [
                    { Code: "None" },
                    { Code: "None" },
                    { Code: "ConditionalCheckFailed" },
                    { Code: "None" },
                    { Code: "None" }
                  ],
                  $metadata: {}
                });
              });
          });

          test("static method", async () => {
            expect.assertions(2);

            try {
              await Pet.update("123", {
                name: "Fido",
                ownerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });

          test("instance method", async () => {
            expect.assertions(2);

            try {
              await instance.update({
                name: "Fido",
                ownerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });
        });

        describe("will throw an error if the associated entity existed at preFetch but was deleted before the transaction was committed", () => {
          const operationSharedAssertions = (e: any): void => {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: Person with ID '456' does not exist"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "TransactGetCommand" }],
              [{ name: "QueryCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
          };

          beforeEach(() => {
            mockSend
              // TransactGet
              .mockResolvedValueOnce(undefined)
              // Query
              .mockResolvedValueOnce(undefined)
              // TransactWrite
              .mockImplementationOnce(() => {
                throw new TransactionCanceledException({
                  message: "MockMessage",
                  CancellationReasons: [
                    { Code: "None" },
                    { Code: "None" },
                    { Code: "ConditionalCheckFailed" },
                    { Code: "None" },
                    { Code: "None" }
                  ],
                  $metadata: {}
                });
              });
          });

          test("static method", async () => {
            expect.assertions(3);

            try {
              await Pet.update("123", {
                name: "Fido",
                ownerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });

          test("instance method", async () => {
            expect.assertions(3);

            try {
              await instance.update({
                name: "Fido",
                ownerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });
        });

        describe("will throw an error if the entity is already associated with the requested entity", () => {
          const operationSharedAssertions = (e: any): void => {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: Person with id: 456 already has an associated Pet"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "TransactGetCommand" }],
              [{ name: "QueryCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
          };

          beforeEach(() => {
            mockSend
              // TransactGet
              .mockResolvedValueOnce(undefined)
              // Query
              .mockResolvedValueOnce(undefined)
              // TransactWrite
              .mockImplementationOnce(() => {
                throw new TransactionCanceledException({
                  message: "MockMessage",
                  CancellationReasons: [
                    { Code: "None" },
                    { Code: "None" },
                    { Code: "None" },
                    { Code: "ConditionalCheckFailed" },
                    { Code: "None" }
                  ],
                  $metadata: {}
                });
              });
          });

          test("static method", async () => {
            expect.assertions(3);

            try {
              await Pet.update("123", {
                name: "Fido",
                ownerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });

          test("instance method", async () => {
            expect.assertions(3);

            try {
              await instance.update({
                name: "Fido",
                ownerId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });
        });

        describe("will remove a nullable foreign key and delete the denormalized records for the associated entity", () => {
          const dbOperationAssertions = (): void => {
            expect(mockSend.mock.calls).toEqual([
              [{ name: "QueryCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
            expect(mockedQueryCommand.mock.calls).toEqual([
              [
                {
                  TableName: "mock-table",
                  KeyConditionExpression: "#PK = :PK2",
                  ExpressionAttributeNames: {
                    "#PK": "PK",
                    "#Type": "Type"
                  },
                  ExpressionAttributeValues: {
                    ":PK2": "Pet#123",
                    ":Type1": "Pet"
                  },
                  FilterExpression: "#Type IN (:Type1)",
                  ConsistentRead: true
                }
              ]
            ]);
            // Don't get customer because its being deleted
            expect(mockTransactGetCommand.mock.calls).toEqual([]);
            expect(mockTransactWriteCommand.mock.calls).toEqual([
              [
                {
                  TransactItems: [
                    // Update the Pet and remove the foreign key
                    {
                      Update: {
                        TableName: "mock-table",
                        Key: {
                          PK: "Pet#123",
                          SK: "Pet"
                        },
                        UpdateExpression:
                          "SET #Name = :Name, #UpdatedAt = :UpdatedAt REMOVE #OwnerId",
                        ConditionExpression: "attribute_exists(PK)",
                        ExpressionAttributeNames: {
                          "#Name": "Name",
                          "#OwnerId": "OwnerId",
                          "#UpdatedAt": "UpdatedAt"
                        },
                        ExpressionAttributeValues: {
                          ":Name": "New Name",
                          ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                        }
                      }
                    },
                    // Delete the denormalized record to Person from the Pet partition
                    {
                      Delete: {
                        TableName: "mock-table",
                        Key: {
                          PK: "Pet#123",
                          SK: "Person"
                        }
                      }
                    },
                    // Delete the denormalized record to Pet from the Person partition
                    {
                      Delete: {
                        TableName: "mock-table",
                        Key: {
                          PK: "Person#001",
                          SK: "Pet#123"
                        }
                      }
                    }
                  ]
                }
              ]
            ]);
          };

          test("static method", async () => {
            expect.assertions(5);

            expect(
              await Pet.update("123", {
                name: "New Name",
                ownerId: null
              })
            ).toBeUndefined();

            dbOperationAssertions();
          });

          test("instance method", async () => {
            expect.assertions(7);

            const updatedInstance = await instance.update({
              name: "New Name",
              ownerId: null
            });

            expect(updatedInstance).toEqual({
              ...instance,
              name: "New Name",
              ownerId: undefined,
              updatedAt: new Date("2023-10-16T03:31:35.918Z")
            });
            expect(updatedInstance).toBeInstanceOf(Pet);
            // Original instance is not mutated
            expect(instance).toEqual({
              pk: pet.PK,
              sk: pet.SK,
              id: pet.Id,
              type: pet.Type,
              name: pet.Name,
              ownerId: pet.OwnerId,
              createdAt: new Date(pet.CreatedAt),
              updatedAt: new Date(pet.UpdatedAt)
            });

            dbOperationAssertions();
          });
        });

        describe("will throw an error if it fails to delete the old denormalized records", () => {
          beforeEach(() => {
            mockSend
              // Query
              .mockResolvedValueOnce(undefined)
              // TransactWrite
              .mockImplementationOnce(() => {
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
          });

          const operationSharedAssertions = (e: any): void => {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                'ConditionalCheckFailed: Failed to delete denormalized record with keys: {"PK":"Pet#123","SK":"Person"}'
              ),
              new ConditionalCheckFailedError(
                'ConditionalCheckFailed: Failed to delete denormalized record with keys: {"PK":"Person#001","SK":"Pet#123"}'
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "QueryCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
          };

          test("static method", async () => {
            expect.assertions(3);

            try {
              await Pet.update("123", {
                name: "New Name",
                ownerId: null
              });
            } catch (e) {
              operationSharedAssertions(e);
            }
          });

          test("instance method", async () => {
            expect.assertions(3);

            try {
              await instance.update({
                name: "New Name",
                ownerId: null
              });
            } catch (e) {
              operationSharedAssertions(e);
            }
          });
        });
      });
    });
  });

  describe("an entity which BelongsTo an entity who HasMany of it in a unidirectional relationships", () => {
    describe("when the entity does not already belong to another entity", () => {
      const employee: MockTableEntityTableItem<Employee> = {
        PK: "Employee#123",
        SK: "Employee",
        Id: "123",
        Type: "Employee",
        Name: "Mock Employee",
        OrganizationId: undefined, // Does not already belong to person
        CreatedAt: "2023-01-01T00:00:00.000Z",
        UpdatedAt: "2023-01-02T00:00:00.000Z"
      };

      const instance = createInstance(Employee, {
        pk: employee.PK as PartitionKey,
        sk: employee.SK as SortKey,
        id: employee.Id,
        type: employee.Type,
        name: employee.Name,
        organizationId:
          employee.OrganizationId as NullableForeignKey<Organization>,
        createdAt: new Date(employee.CreatedAt),
        updatedAt: new Date(employee.UpdatedAt)
      });

      beforeEach(() => {
        mockQuery.mockResolvedValue({
          Items: [employee]
        });

        vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      });

      afterEach(() => {
        mockSend.mockReset();
        mockQuery.mockReset();
        mockTransactGetItems.mockReset();
      });

      describe("will update the entity and its denormalized records", () => {
        const dbOperationAssertions = (): void => {
          expect(mockSend.mock.calls).toEqual([
            [{ name: "QueryCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockedQueryCommand.mock.calls).toEqual([
            [
              {
                TableName: "mock-table",
                KeyConditionExpression: "#PK = :PK2",
                ExpressionAttributeNames: {
                  "#PK": "PK",
                  "#Type": "Type"
                },
                ExpressionAttributeValues: {
                  ":PK2": "Employee#123",
                  ":Type1": "Employee"
                },
                FilterExpression: "#Type IN (:Type1)",
                ConsistentRead: true
              }
            ]
          ]);
          expect(mockTransactGetCommand.mock.calls).toEqual([]);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [
              {
                TransactItems: [
                  {
                    Update: {
                      TableName: "mock-table",
                      Key: {
                        PK: "Employee#123",
                        SK: "Employee"
                      },
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#Name": "Name",
                        "#UpdatedAt": "UpdatedAt"
                      },
                      ExpressionAttributeValues: {
                        ":Name": "Testing",
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      },
                      UpdateExpression:
                        "SET #Name = :Name, #UpdatedAt = :UpdatedAt"
                    }
                  }
                ]
              }
            ]
          ]);
        };

        test("static method", async () => {
          expect.assertions(5);

          expect(
            await Employee.update("123", {
              name: "Testing"
            })
          ).toBeUndefined();

          dbOperationAssertions();
        });

        test("instance method", async () => {
          expect.assertions(7);

          const updatedInstance = await instance.update({
            name: "Testing"
          });

          expect(updatedInstance).toEqual({
            ...instance,
            name: "Testing",
            updatedAt: new Date("2023-10-16T03:31:35.918Z")
          });
          expect(updatedInstance).toBeInstanceOf(Employee);
          // Original instance is not mutated
          expect(instance).toEqual({
            pk: employee.PK,
            sk: employee.SK,
            id: employee.Id,
            type: employee.Type,
            name: employee.Name,
            ownerId: undefined,
            createdAt: new Date(employee.CreatedAt),
            updatedAt: new Date(employee.UpdatedAt)
          });

          dbOperationAssertions();
        });
      });

      describe("when a foreign key is updated", () => {
        describe("will update the foreign key if the entity being associated with exists", () => {
          const dbOperationAssertions = (): void => {
            expect(mockSend.mock.calls).toEqual([
              [{ name: "QueryCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
            expect(mockedQueryCommand.mock.calls).toEqual([
              [
                {
                  TableName: "mock-table",
                  KeyConditionExpression: "#PK = :PK2",
                  ExpressionAttributeNames: {
                    "#PK": "PK",
                    "#Type": "Type"
                  },
                  ExpressionAttributeValues: {
                    ":PK2": "Employee#123",
                    ":Type1": "Employee"
                  },
                  FilterExpression: "#Type IN (:Type1)",
                  ConsistentRead: true
                }
              ]
            ]);
            expect(mockTransactGetCommand.mock.calls).toEqual([]);
            expect(mockTransactWriteCommand.mock.calls).toEqual([
              [
                {
                  TransactItems: [
                    // Update the Employee and add owner id
                    {
                      Update: {
                        TableName: "mock-table",
                        Key: {
                          PK: "Employee#123",
                          SK: "Employee"
                        },
                        UpdateExpression:
                          "SET #Name = :Name, #OrganizationId = :OrganizationId, #UpdatedAt = :UpdatedAt",
                        ConditionExpression: "attribute_exists(PK)",
                        ExpressionAttributeNames: {
                          "#Name": "Name",
                          "#OrganizationId": "OrganizationId",
                          "#UpdatedAt": "UpdatedAt"
                        },
                        ExpressionAttributeValues: {
                          ":Name": "Testing",
                          ":OrganizationId": "456",
                          ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                        }
                      }
                    },
                    // Check that the Organization (owner) entity exists
                    {
                      ConditionCheck: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_exists(PK)",
                        Key: {
                          PK: "Organization#456",
                          SK: "Organization"
                        }
                      }
                    },
                    // Denormalize the Employee to Organization partition
                    {
                      Put: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_not_exists(PK)",
                        Item: {
                          PK: "Organization#456",
                          SK: "Employee#123",
                          Id: "123",
                          Type: "Employee",
                          AdoptedDate: undefined,
                          Name: "Testing",
                          OrganizationId: "456",
                          CreatedAt: "2023-01-01T00:00:00.000Z",
                          UpdatedAt: "2023-10-16T03:31:35.918Z"
                        }
                      }
                    }
                  ]
                }
              ]
            ]);
          };

          test("static method", async () => {
            expect.assertions(5);

            expect(
              await Employee.update("123", {
                name: "Testing",
                organizationId: "456"
              })
            ).toBeUndefined();

            dbOperationAssertions();
          });

          test("instance method", async () => {
            expect.assertions(7);

            const updatedInstance = await instance.update({
              name: "Testing",
              organizationId: "456"
            });

            expect(updatedInstance).toEqual({
              ...instance,
              name: "Testing",
              organizationId: "456",
              updatedAt: new Date("2023-10-16T03:31:35.918Z")
            });
            expect(updatedInstance).toBeInstanceOf(Employee);
            // Original instance is not mutated
            expect(instance).toEqual({
              pk: employee.PK,
              sk: employee.SK,
              id: employee.Id,
              type: employee.Type,
              name: employee.Name,
              ownerId: undefined,
              createdAt: new Date(employee.CreatedAt),
              updatedAt: new Date(employee.UpdatedAt)
            });

            dbOperationAssertions();
          });
        });

        describe("will throw an error if the entity being updated does not exist at pre fetch", () => {
          const operationSharedAssertions = (e: any): void => {
            expect(e).toEqual(
              new NotFoundError("Employee does not exist: 123")
            );
            expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
          };

          beforeEach(() => {
            mockQuery.mockResolvedValueOnce({ Items: [] });
            mockSend
              // Query
              .mockResolvedValueOnce(undefined)
              // TransactWrite
              .mockImplementationOnce(() => {
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
          });

          test("static method", async () => {
            expect.assertions(2);

            try {
              await Employee.update("123", {
                name: "Testing",
                organizationId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });

          test("instance method", async () => {
            expect.assertions(2);

            try {
              await instance.update({
                name: "Testing",
                organizationId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });
        });

        describe("will throw an error if the entity being updated existed at pre fetch but was deleted before the transaction was committed", () => {
          const operationSharedAssertions = (e: any): void => {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: Employee with ID '123' does not exist"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "QueryCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
          };

          beforeEach(() => {
            mockSend
              // Query
              .mockResolvedValueOnce(undefined)
              // TransactWrite
              .mockImplementationOnce(() => {
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
          });

          test("static method", async () => {
            expect.assertions(3);

            try {
              await Employee.update("123", {
                name: "Testing",
                organizationId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });

          test("instance method", async () => {
            expect.assertions(3);

            try {
              await instance.update({
                name: "Testing",
                organizationId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });
        });

        describe("will throw an error if the entity being associated with does not exist", () => {
          const operationSharedAssertions = (e: any): void => {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: Organization with ID '456' does not exist"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "QueryCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
          };

          beforeEach(() => {
            mockSend
              .mockReturnValueOnce(undefined)
              .mockImplementationOnce(() => {
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
          });

          test("static method", async () => {
            expect.assertions(3);

            try {
              await Employee.update("123", {
                name: "Testing",
                organizationId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });

          test("instance method", async () => {
            expect.assertions(3);

            try {
              await instance.update({
                name: "Testing",
                organizationId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });
        });

        describe("will remove a nullable foreign key and delete the links for the associated entity", () => {
          const dbOperationAssertions = (): void => {
            expect(mockSend.mock.calls).toEqual([
              [{ name: "QueryCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
            expect(mockedQueryCommand.mock.calls).toEqual([
              [
                {
                  TableName: "mock-table",
                  KeyConditionExpression: "#PK = :PK2",
                  ExpressionAttributeNames: {
                    "#PK": "PK",
                    "#Type": "Type"
                  },
                  ExpressionAttributeValues: {
                    ":PK2": "Employee#123",
                    ":Type1": "Employee"
                  },
                  FilterExpression: "#Type IN (:Type1)",
                  ConsistentRead: true
                }
              ]
            ]);
            // Don't get owner (Organization) because its a unidirectional relationship
            expect(mockTransactGetCommand.mock.calls).toEqual([]);
            // Does not include removing a denormalized link because it doesn't exist
            expect(mockTransactWriteCommand.mock.calls).toEqual([
              [
                {
                  TransactItems: [
                    {
                      Update: {
                        TableName: "mock-table",
                        Key: {
                          PK: "Employee#123",
                          SK: "Employee"
                        },
                        ConditionExpression: "attribute_exists(PK)",
                        ExpressionAttributeNames: {
                          "#Name": "Name",
                          "#OrganizationId": "OrganizationId",
                          "#UpdatedAt": "UpdatedAt"
                        },
                        ExpressionAttributeValues: {
                          ":Name": "New Name",
                          ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                        },
                        UpdateExpression:
                          "SET #Name = :Name, #UpdatedAt = :UpdatedAt REMOVE #OrganizationId"
                      }
                    }
                  ]
                }
              ]
            ]);
          };

          test("static method", async () => {
            expect.assertions(5);

            expect(
              await Employee.update("123", {
                name: "New Name",
                organizationId: null
              })
            ).toBeUndefined();

            dbOperationAssertions();
          });

          test("instance method", async () => {
            expect.assertions(7);

            const updatedInstance = await instance.update({
              name: "New Name",
              organizationId: null
            });

            expect(updatedInstance).toEqual({
              ...instance,
              name: "New Name",
              organizationId: undefined,
              updatedAt: new Date("2023-10-16T03:31:35.918Z")
            });
            expect(updatedInstance).toBeInstanceOf(Employee);
            expect(instance).toEqual({
              pk: employee.PK,
              sk: employee.SK,
              id: employee.Id,
              type: employee.Type,
              name: employee.Name,
              ownerId: undefined,
              createdAt: new Date(employee.CreatedAt),
              updatedAt: new Date(employee.UpdatedAt)
            });

            dbOperationAssertions();
          });
        });
      });
    });

    describe("when the entity belongs to another another entity (Adds delete transaction for deleting denormalized records from previous related entities partition)", () => {
      const employee: MockTableEntityTableItem<Employee> = {
        PK: "Employee#123",
        SK: "Employee",
        Id: "123",
        Type: "Employee",
        Name: "Mock Employee",
        OrganizationId: "001", // Already belongs to Organization entity
        CreatedAt: "2023-01-01T00:00:00.000Z",
        UpdatedAt: "2023-01-02T00:00:00.000Z"
      };

      const instance = createInstance(Employee, {
        pk: employee.PK as PartitionKey,
        sk: employee.SK as SortKey,
        id: employee.Id,
        type: employee.Type,
        name: employee.Name,
        organizationId:
          employee.OrganizationId as NullableForeignKey<Organization>,
        createdAt: new Date(employee.CreatedAt),
        updatedAt: new Date(employee.UpdatedAt)
      });

      beforeEach(() => {
        mockQuery.mockResolvedValue({
          Items: [employee]
        });

        vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      });

      afterEach(() => {
        mockSend.mockReset();
        mockQuery.mockReset();
        mockTransactGetItems.mockReset();
      });

      describe("will update the entity and its denormalized records", () => {
        const dbOperationAssertions = (): void => {
          expect(mockSend.mock.calls).toEqual([
            [{ name: "QueryCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockedQueryCommand.mock.calls).toEqual([
            [
              {
                TableName: "mock-table",
                KeyConditionExpression: "#PK = :PK2",
                ExpressionAttributeNames: {
                  "#PK": "PK",
                  "#Type": "Type"
                },
                ExpressionAttributeValues: {
                  ":PK2": "Employee#123",
                  ":Type1": "Employee"
                },
                FilterExpression: "#Type IN (:Type1)",
                ConsistentRead: true
              }
            ]
          ]);
          expect(mockTransactGetCommand.mock.calls).toEqual([]);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [
              {
                TransactItems: [
                  {
                    // Update the Employee
                    Update: {
                      TableName: "mock-table",
                      Key: {
                        PK: "Employee#123",
                        SK: "Employee"
                      },
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#Name": "Name",
                        "#UpdatedAt": "UpdatedAt"
                      },
                      ExpressionAttributeValues: {
                        ":Name": "Testing",
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      },
                      UpdateExpression:
                        "SET #Name = :Name, #UpdatedAt = :UpdatedAt"
                    }
                  },
                  {
                    // Update the Employee's denormalized records in associated partition
                    Update: {
                      TableName: "mock-table",
                      Key: {
                        PK: "Organization#001",
                        SK: "Employee#123"
                      },
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#Name": "Name",
                        "#UpdatedAt": "UpdatedAt"
                      },
                      ExpressionAttributeValues: {
                        ":Name": "Testing",
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      },
                      UpdateExpression:
                        "SET #Name = :Name, #UpdatedAt = :UpdatedAt"
                    }
                  }
                ]
              }
            ]
          ]);
        };

        test("static method", async () => {
          expect.assertions(5);

          expect(
            await Employee.update("123", {
              name: "Testing"
            })
          ).toBeUndefined();

          dbOperationAssertions();
        });

        test("instance method", async () => {
          expect.assertions(7);

          const updatedInstance = await instance.update({
            name: "Testing"
          });

          expect(updatedInstance).toEqual({
            ...instance,
            name: "Testing",
            updatedAt: new Date("2023-10-16T03:31:35.918Z")
          });
          expect(updatedInstance).toBeInstanceOf(Employee);
          // Original instance is not mutated
          expect(instance).toEqual({
            pk: employee.PK,
            sk: employee.SK,
            id: employee.Id,
            type: employee.Type,
            name: employee.Name,
            organizationId: "001",
            createdAt: new Date(employee.CreatedAt),
            updatedAt: new Date(employee.UpdatedAt)
          });

          dbOperationAssertions();
        });
      });

      describe("when a foreign key is updated", () => {
        describe("will update the foreign key, delete the old denormalized link and create a new one if the entity being associated with exists", () => {
          const dbOperationAssertions = (): void => {
            expect(mockSend.mock.calls).toEqual([
              [{ name: "QueryCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
            expect(mockedQueryCommand.mock.calls).toEqual([
              [
                {
                  TableName: "mock-table",
                  KeyConditionExpression: "#PK = :PK2",
                  ExpressionAttributeNames: {
                    "#PK": "PK",
                    "#Type": "Type"
                  },
                  ExpressionAttributeValues: {
                    ":PK2": "Employee#123",
                    ":Type1": "Employee"
                  },
                  FilterExpression: "#Type IN (:Type1)",
                  ConsistentRead: true
                }
              ]
            ]);
            expect(mockTransactGetCommand.mock.calls).toEqual([]);
            expect(mockTransactWriteCommand.mock.calls).toEqual([
              [
                {
                  TransactItems: [
                    {
                      // Update the Employee including the foreign key
                      Update: {
                        TableName: "mock-table",
                        Key: {
                          PK: "Employee#123",
                          SK: "Employee"
                        },
                        UpdateExpression:
                          "SET #Name = :Name, #OrganizationId = :OrganizationId, #UpdatedAt = :UpdatedAt",
                        ConditionExpression: "attribute_exists(PK)",
                        ExpressionAttributeNames: {
                          "#Name": "Name",
                          "#OrganizationId": "OrganizationId",
                          "#UpdatedAt": "UpdatedAt"
                        },
                        ExpressionAttributeValues: {
                          ":Name": "Testing",
                          ":OrganizationId": "456",
                          ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                        }
                      }
                    },
                    // Delete the denormalized link to the previous Organization (owner)
                    {
                      Delete: {
                        TableName: "mock-table",
                        Key: {
                          PK: "Organization#001",
                          SK: "Employee#123"
                        }
                      }
                    },
                    // Check that the new Organization (owner) being associated with exists
                    {
                      ConditionCheck: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_exists(PK)",
                        Key: {
                          PK: "Organization#456",
                          SK: "Organization"
                        }
                      }
                    },
                    // Denormalize a link of the Employee to the new Organizations's (owners) partition
                    {
                      Put: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_not_exists(PK)",
                        Item: {
                          PK: "Organization#456",
                          SK: "Employee#123",
                          Id: "123",
                          Type: "Employee",
                          AdoptedDate: undefined,
                          Name: "Testing",
                          OrganizationId: "456",
                          CreatedAt: "2023-01-01T00:00:00.000Z",
                          UpdatedAt: "2023-10-16T03:31:35.918Z"
                        }
                      }
                    }
                  ]
                }
              ]
            ]);
          };

          test("static method", async () => {
            expect.assertions(5);

            expect(
              await Employee.update("123", {
                name: "Testing",
                organizationId: "456"
              })
            ).toBeUndefined();

            dbOperationAssertions();
          });

          test("instance method", async () => {
            expect.assertions(7);

            const updatedInstance = await instance.update({
              name: "Testing",
              organizationId: "456"
            });

            expect(updatedInstance).toEqual({
              ...instance,
              name: "Testing",
              organizationId: "456",
              updatedAt: new Date("2023-10-16T03:31:35.918Z")
            });
            expect(updatedInstance).toBeInstanceOf(Employee);
            // Original instance is not mutated
            expect(instance).toEqual({
              pk: employee.PK,
              sk: employee.SK,
              id: employee.Id,
              type: employee.Type,
              name: employee.Name,
              organizationId: employee.OrganizationId,
              createdAt: new Date(employee.CreatedAt),
              updatedAt: new Date(employee.UpdatedAt)
            });

            dbOperationAssertions();
          });
        });

        describe("will throw an error if the entity being updated does not exist at preFetch", () => {
          const operationSharedAssertions = (e: any): void => {
            expect(e).toEqual(
              new NotFoundError("Employee does not exist: 123")
            );
            expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
          };

          beforeEach(() => {
            mockQuery.mockResolvedValueOnce({ Items: [] }); // Entity does not exist but will fail in transaction

            mockSend
              // Query
              .mockResolvedValueOnce(undefined)
              // TransactWrite
              .mockImplementationOnce(() => {
                throw new TransactionCanceledException({
                  message: "MockMessage",
                  CancellationReasons: [
                    { Code: "ConditionalCheckFailed" },
                    { Code: "None" },
                    { Code: "None" },
                    { Code: "None" }
                  ],
                  $metadata: {}
                });
              });
          });

          test("static method", async () => {
            expect.assertions(2);

            try {
              await Employee.update("123", {
                name: "Testing",
                organizationId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });

          test("instance method", async () => {
            expect.assertions(2);

            try {
              await instance.update({
                name: "Testing",
                organizationId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });
        });

        describe("will throw an error if the entity being updated existed at preFetch but was deleted before the transaction was committed", () => {
          const operationSharedAssertions = (e: any): void => {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: Employee with ID '123' does not exist"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "QueryCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
          };

          beforeEach(() => {
            mockSend
              // Query
              .mockResolvedValueOnce(undefined)
              // TransactWrite
              .mockImplementationOnce(() => {
                throw new TransactionCanceledException({
                  message: "MockMessage",
                  CancellationReasons: [
                    { Code: "ConditionalCheckFailed" },
                    { Code: "None" },
                    { Code: "None" },
                    { Code: "None" }
                  ],
                  $metadata: {}
                });
              });
          });

          test("static method", async () => {
            expect.assertions(3);

            try {
              await Employee.update("123", {
                name: "Testing",
                organizationId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });

          test("instance method", async () => {
            expect.assertions(3);

            try {
              await instance.update({
                name: "Testing",
                organizationId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });
        });

        describe("will throw an error if the associated entity does not exist", () => {
          const operationSharedAssertions = (e: any): void => {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: Organization with ID '456' does not exist"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "QueryCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
          };

          beforeEach(() => {
            mockSend
              // Query
              .mockResolvedValueOnce(undefined)
              // TransactWrite
              .mockImplementationOnce(() => {
                throw new TransactionCanceledException({
                  message: "MockMessage",
                  CancellationReasons: [
                    { Code: "None" },
                    { Code: "None" },
                    { Code: "ConditionalCheckFailed" },
                    { Code: "None" }
                  ],
                  $metadata: {}
                });
              });
          });

          test("static method", async () => {
            expect.assertions(3);

            try {
              await Employee.update("123", {
                name: "Testing",
                organizationId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });

          test("instance method", async () => {
            expect.assertions(3);

            try {
              await instance.update({
                name: "Testing",
                organizationId: "456"
              });
            } catch (e: any) {
              operationSharedAssertions(e);
            }
          });
        });
      });

      describe("will throw an error if the entity is already associated with the requested entity", () => {
        const operationSharedAssertions = (e: any): void => {
          expect(e.constructor.name).toEqual("TransactionWriteFailedError");
          expect(e.errors).toEqual([
            new ConditionalCheckFailedError(
              "ConditionalCheckFailed: Organization with id: 456 already has an associated Employee"
            )
          ]);
          expect(mockSend.mock.calls).toEqual([
            [{ name: "QueryCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
        };

        beforeEach(() => {
          mockSend
            // Query
            .mockResolvedValueOnce(undefined)
            // TransactWrite
            .mockImplementationOnce(() => {
              throw new TransactionCanceledException({
                message: "MockMessage",
                CancellationReasons: [
                  { Code: "None" },
                  { Code: "None" },
                  { Code: "None" },
                  { Code: "ConditionalCheckFailed" }
                ],
                $metadata: {}
              });
            });
        });

        test("static method", async () => {
          expect.assertions(3);

          try {
            await Employee.update("123", {
              name: "Testing",
              organizationId: "456"
            });
          } catch (e: any) {
            operationSharedAssertions(e);
          }
        });

        test("instance method", async () => {
          expect.assertions(3);

          try {
            await instance.update({
              name: "Testing",
              organizationId: "456"
            });
          } catch (e: any) {
            operationSharedAssertions(e);
          }
        });
      });

      describe("will remove a nullable foreign key and delete the denormalized records for the associated entity", () => {
        const dbOperationAssertions = (): void => {
          expect(mockSend.mock.calls).toEqual([
            [{ name: "QueryCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockedQueryCommand.mock.calls).toEqual([
            [
              {
                TableName: "mock-table",
                KeyConditionExpression: "#PK = :PK2",
                ExpressionAttributeNames: {
                  "#PK": "PK",
                  "#Type": "Type"
                },
                ExpressionAttributeValues: {
                  ":PK2": "Employee#123",
                  ":Type1": "Employee"
                },
                FilterExpression: "#Type IN (:Type1)",
                ConsistentRead: true
              }
            ]
          ]);
          // Don't get customer because its being deleted
          expect(mockTransactGetCommand.mock.calls).toEqual([]);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [
              {
                TransactItems: [
                  // Update the Employee and remove the foreign key
                  {
                    Update: {
                      TableName: "mock-table",
                      Key: {
                        PK: "Employee#123",
                        SK: "Employee"
                      },
                      UpdateExpression:
                        "SET #Name = :Name, #UpdatedAt = :UpdatedAt REMOVE #OrganizationId",
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#Name": "Name",
                        "#OrganizationId": "OrganizationId",
                        "#UpdatedAt": "UpdatedAt"
                      },
                      ExpressionAttributeValues: {
                        ":Name": "New Name",
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      }
                    }
                  },
                  // Delete the denormalized record to Employee from the Organization partition
                  {
                    Delete: {
                      TableName: "mock-table",
                      Key: {
                        PK: "Organization#001",
                        SK: "Employee#123"
                      }
                    }
                  }
                ]
              }
            ]
          ]);
        };

        test("static method", async () => {
          expect.assertions(5);

          expect(
            await Employee.update("123", {
              name: "New Name",
              organizationId: null
            })
          ).toBeUndefined();

          dbOperationAssertions();
        });

        test("instance method", async () => {
          expect.assertions(7);

          const updatedInstance = await instance.update({
            name: "New Name",
            organizationId: null
          });

          expect(updatedInstance).toEqual({
            ...instance,
            name: "New Name",
            organizationId: undefined,
            updatedAt: new Date("2023-10-16T03:31:35.918Z")
          });
          expect(updatedInstance).toBeInstanceOf(Employee);
          // Original instance is not mutated
          expect(instance).toEqual({
            pk: employee.PK,
            sk: employee.SK,
            id: employee.Id,
            type: employee.Type,
            name: employee.Name,
            organizationId: employee.OrganizationId,
            createdAt: new Date(employee.CreatedAt),
            updatedAt: new Date(employee.UpdatedAt)
          });

          dbOperationAssertions();
        });
      });

      describe("will throw an error if it fails to delete the old denormalized records", () => {
        beforeEach(() => {
          mockSend
            // Query
            .mockResolvedValueOnce(undefined)
            // TransactWrite
            .mockImplementationOnce(() => {
              throw new TransactionCanceledException({
                message: "MockMessage",
                CancellationReasons: [
                  { Code: "None" },
                  { Code: "ConditionalCheckFailed" }
                ],
                $metadata: {}
              });
            });
        });

        const operationSharedAssertions = (e: any): void => {
          expect(e.constructor.name).toEqual("TransactionWriteFailedError");
          expect(e.errors).toEqual([
            new ConditionalCheckFailedError(
              'ConditionalCheckFailed: Failed to delete denormalized record with keys: {"PK":"Organization#001","SK":"Employee#123"}'
            )
          ]);
          expect(mockSend.mock.calls).toEqual([
            [{ name: "QueryCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
        };

        test("static method", async () => {
          expect.assertions(3);

          try {
            await Employee.update("123", {
              name: "New Name",
              organizationId: null
            });
          } catch (e) {
            operationSharedAssertions(e);
          }
        });

        test("instance method", async () => {
          expect.assertions(3);

          try {
            await instance.update({
              name: "New Name",
              organizationId: null
            });
          } catch (e) {
            operationSharedAssertions(e);
          }
        });
      });
    });
  });

  describe("an entity which has many of a uni directional relationship is updated", () => {
    const organization: MockTableEntityTableItem<Organization> = {
      PK: "Organization#123",
      SK: "Organization",
      Id: "123",
      Type: "Organization",
      Name: "Mock Organization",
      CreatedAt: "2023-01-01T00:00:00.000Z",
      UpdatedAt: "2023-01-02T00:00:00.000Z"
    };

    const instance = createInstance(Organization, {
      pk: organization.PK as PartitionKey,
      sk: organization.SK as SortKey,
      id: organization.Id,
      type: organization.Type,
      name: organization.Name,
      createdAt: new Date(organization.CreatedAt),
      updatedAt: new Date(organization.UpdatedAt)
    });

    beforeEach(() => {
      mockQuery.mockResolvedValue({
        Items: [organization]
      });
    });

    describe("will update the entity but not any denormalized links on the uni directional relationship", () => {
      const dbOperationAssertions = (): void => {
        expect(mockSend.mock.calls).toEqual([
          [{ name: "QueryCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
        // Does not prefetch unidirectional relationships
        expect(mockedQueryCommand.mock.calls).toEqual([
          [
            {
              TableName: "mock-table",
              KeyConditionExpression: "#PK = :PK3",
              ExpressionAttributeNames: {
                "#PK": "PK",
                "#Type": "Type"
              },
              ExpressionAttributeValues: {
                ":PK3": "Organization#123",
                ":Type1": "Organization",
                ":Type2": "User"
              },
              FilterExpression: "#Type IN (:Type1,:Type2)",
              ConsistentRead: true
            }
          ]
        ]);
        expect(mockTransactGetCommand.mock.calls).toEqual([]);
        // Does not update uni-directional relationships
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                {
                  Update: {
                    TableName: "mock-table",
                    Key: { PK: "Organization#123", SK: "Organization" },
                    UpdateExpression:
                      "SET #Name = :Name, #UpdatedAt = :UpdatedAt",
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeNames: {
                      "#Name": "Name",
                      "#UpdatedAt": "UpdatedAt"
                    },
                    ExpressionAttributeValues: {
                      ":Name": "New Name",
                      ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                    }
                  }
                }
              ]
            }
          ]
        ]);
      };

      test("static method", async () => {
        expect.assertions(5);

        expect(
          await Organization.update("123", {
            name: "New Name"
          })
        ).toBeUndefined();
        dbOperationAssertions();
      });

      test("instance method", async () => {
        expect.assertions(7);

        const updatedInstance = await instance.update({
          name: "New Name"
        });

        expect(updatedInstance).toEqual({
          ...instance,
          name: "New Name",
          updatedAt: new Date("2023-10-16T03:31:35.918Z")
        });
        expect(updatedInstance).toBeInstanceOf(Organization);
        // Original instance is not mutated
        expect(instance).toEqual({
          pk: instance.pk,
          sk: instance.sk,
          id: instance.id,
          type: instance.type,
          name: instance.name,
          createdAt: instance.createdAt,
          updatedAt: instance.updatedAt
        });

        dbOperationAssertions();
      });
    });
  });

  describe("A model is updating multiple ForeignKeys of different relationship types", () => {
    @Entity
    class Model1 extends MockTable {
      declare readonly type: "Model1";

      @StringAttribute({ alias: "SomeAttr" })
      public someAttr: string;

      @HasOne(() => Model3, { foreignKey: "model1Id" })
      public model3: Model3;
    }

    @Entity
    class Model2 extends MockTable {
      declare readonly type: "Model2";

      @StringAttribute({ alias: "OtherAttr" })
      public otherAttr: string;

      @HasMany(() => Model3, { foreignKey: "model2Id" })
      public model3: Model3[];
    }

    @Entity
    class Model3 extends MockTable {
      declare readonly type: "Model3";

      @StringAttribute({ alias: "Name" })
      public name: string;

      @ForeignKeyAttribute(() => Model1, { alias: "Model1Id", nullable: true })
      public model1Id?: NullableForeignKey<Model1>;

      @ForeignKeyAttribute(() => Model2, { alias: "Model2Id", nullable: true })
      public model2Id?: NullableForeignKey<Model2>;

      @BelongsTo(() => Model1, { foreignKey: "model1Id" })
      public model1: Model1;

      @BelongsTo(() => Model2, { foreignKey: "model2Id" })
      public model2: Model2;
    }

    beforeEach(() => {
      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
    });

    afterEach(() => {
      mockSend.mockReset();
      mockQuery.mockReset();
      mockTransactGetItems.mockReset();
    });

    describe("can add (for entity that is not associated) foreign keys for an entity that belongs to entities as both HasMany and HasOne relationships", () => {
      const dbOperationAssertions = (): void => {
        expect(mockSend.mock.calls).toEqual([
          [{ name: "TransactGetCommand" }],
          [{ name: "QueryCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockedQueryCommand.mock.calls).toEqual([
          [
            {
              TableName: "mock-table",
              KeyConditionExpression: "#PK = :PK2",
              ExpressionAttributeNames: {
                "#PK": "PK",
                "#Type": "Type"
              },
              ExpressionAttributeValues: {
                ":PK2": "Model3#123",
                ":Type1": "Model3"
              },
              FilterExpression: "#Type IN (:Type1)",
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
                    Key: { PK: "Model1#456", SK: "Model1" }
                  }
                },
                {
                  Get: {
                    TableName: "mock-table",
                    Key: { PK: "Model2#789", SK: "Model2" }
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
                // Update the Model3 entity
                {
                  Update: {
                    TableName: "mock-table",
                    Key: {
                      PK: "Model3#123",
                      SK: "Model3"
                    },
                    UpdateExpression:
                      "SET #Name = :Name, #Model1Id = :Model1Id, #Model2Id = :Model2Id, #UpdatedAt = :UpdatedAt",
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeNames: {
                      "#Model1Id": "Model1Id",
                      "#Model2Id": "Model2Id",
                      "#Name": "Name",
                      "#UpdatedAt": "UpdatedAt"
                    },
                    ExpressionAttributeValues: {
                      ":Model1Id": "456",
                      ":Model2Id": "789",
                      ":Name": "newName",
                      ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                    }
                  }
                },
                // Check that Model1 entity being associated with exists
                {
                  ConditionCheck: {
                    TableName: "mock-table",
                    ConditionExpression: "attribute_exists(PK)",
                    Key: {
                      PK: "Model1#456",
                      SK: "Model1"
                    }
                  }
                },
                // Denormalize Model3 entity being updated to Model1 partition
                {
                  Put: {
                    TableName: "mock-table",
                    ConditionExpression: "attribute_not_exists(PK)",
                    Item: {
                      PK: "Model1#456",
                      SK: "Model3",
                      Id: "123",
                      Type: "Model3",
                      Model1Id: "456",
                      Model2Id: "789",
                      Name: "newName",
                      CreatedAt: "2023-01-01T00:00:00.000Z",
                      UpdatedAt: "2023-10-16T03:31:35.918Z"
                    }
                  }
                },
                // Denormalize Model1 entity to the Model3 partition that is being updated
                {
                  Put: {
                    TableName: "mock-table",
                    ConditionExpression: "attribute_not_exists(PK)",
                    Item: {
                      PK: "Model3#123",
                      SK: "Model1",
                      Id: "456",
                      Type: "Model1",
                      SomeAttr: "someVal",
                      CreatedAt: "2023-01-03T00:00:00.000Z",
                      UpdatedAt: "2023-01-04T00:00:00.000Z"
                    }
                  }
                },
                // Check that Model2 entity being associated with exists
                {
                  ConditionCheck: {
                    TableName: "mock-table",
                    ConditionExpression: "attribute_exists(PK)",
                    Key: {
                      PK: "Model2#789",
                      SK: "Model2"
                    }
                  }
                },
                // Denormalize Model3 entity being updated to Model2 partition
                {
                  Put: {
                    TableName: "mock-table",
                    ConditionExpression: "attribute_not_exists(PK)",
                    Item: {
                      PK: "Model2#789",
                      SK: "Model3#123",
                      Id: "123",
                      Type: "Model3",
                      Model1Id: "456",
                      Model2Id: "789",
                      Name: "newName",
                      CreatedAt: "2023-01-01T00:00:00.000Z",
                      UpdatedAt: "2023-10-16T03:31:35.918Z"
                    }
                  }
                },
                // Denormalize Model2 entity to the Model3 partition that is being updated
                {
                  Put: {
                    TableName: "mock-table",
                    ConditionExpression: "attribute_not_exists(PK)",
                    Item: {
                      PK: "Model3#123",
                      SK: "Model2",
                      Id: "789",
                      Type: "Model2",
                      OtherAttr: "otherVal",
                      CreatedAt: "2023-01-05T00:00:00.000Z",
                      UpdatedAt: "2023-01-06T00:00:00.000Z"
                    }
                  }
                }
              ]
            }
          ]
        ]);
      };

      const model3Item: MockTableEntityTableItem<Model3> = {
        PK: "Model3#123",
        SK: "Model3",
        Id: "123",
        Type: "Model3",
        Name: "originalName",
        Model1Id: undefined, // Does not already have an associated entity
        Model2Id: undefined, // Does not already have an associated entity
        CreatedAt: "2023-01-01T00:00:00.000Z",
        UpdatedAt: "2023-01-02T00:00:00.000Z"
      };

      const instance = createInstance(Model3, {
        pk: "Model3#123" as PartitionKey,
        sk: "Model3" as SortKey,
        id: "123",
        type: "Model3",
        name: "originalName",
        model1Id: undefined, // Does not already have an associated entity
        model2Id: undefined, // Does not already have an associated entity
        createdAt: new Date("2023-01-01T00:00:00.000Z"),
        updatedAt: new Date("2023-01-02T00:00:00.000Z")
      });

      beforeEach(() => {
        const model1Item: MockTableEntityTableItem<Model1> = {
          PK: "Model1#456",
          SK: "Model1",
          Id: "456",
          Type: "Model1",
          SomeAttr: "someVal",
          CreatedAt: "2023-01-03T00:00:00.000Z",
          UpdatedAt: "2023-01-04T00:00:00.000Z"
        };

        const model2Item: MockTableEntityTableItem<Model2> = {
          PK: "Model2#789",
          SK: "Model2",
          Id: "789",
          Type: "Model2",
          OtherAttr: "otherVal",
          CreatedAt: "2023-01-05T00:00:00.000Z",
          UpdatedAt: "2023-01-06T00:00:00.000Z"
        };

        mockQuery.mockResolvedValue({
          Items: [model3Item]
        });
        mockTransactGetItems.mockResolvedValue({
          Responses: [{ Item: model1Item }, { Item: model2Item }]
        });
      });

      test("static method", async () => {
        expect.assertions(5);

        expect(
          await Model3.update("123", {
            name: "newName",
            model1Id: "456",
            model2Id: "789"
          })
        ).toBeUndefined();

        dbOperationAssertions();
      });

      test("instance method", async () => {
        expect.assertions(7);

        const updatedInstance = await instance.update({
          name: "newName",
          model1Id: "456",
          model2Id: "789"
        });

        expect(updatedInstance).toEqual({
          ...instance,
          name: "newName",
          model1Id: "456",
          model2Id: "789",
          updatedAt: new Date("2023-10-16T03:31:35.918Z")
        });
        expect(updatedInstance).toBeInstanceOf(Model3);
        // Original instance is not mutated
        expect(instance).toEqual({
          pk: instance.pk,
          sk: instance.sk,
          id: instance.id,
          type: instance.type,
          name: instance.name,
          model1Id: instance.model1Id,
          model2Id: instance.model2Id,
          createdAt: instance.createdAt,
          updatedAt: instance.updatedAt
        });

        dbOperationAssertions();
      });
    });

    describe("can update (for entity that is already associated) foreign keys for an entity that belongs to entities as both HasMany and HasOne relationships", () => {
      const dbOperationAssertions = (): void => {
        expect(mockSend.mock.calls).toEqual([
          [{ name: "TransactGetCommand" }],
          [{ name: "QueryCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockedQueryCommand.mock.calls).toEqual([
          [
            {
              TableName: "mock-table",
              KeyConditionExpression: "#PK = :PK2",
              ExpressionAttributeNames: {
                "#PK": "PK",
                "#Type": "Type"
              },
              ExpressionAttributeValues: {
                ":PK2": "Model3#123",
                ":Type1": "Model3"
              },
              FilterExpression: "#Type IN (:Type1)",
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
                    Key: { PK: "Model1#456", SK: "Model1" }
                  }
                },
                {
                  Get: {
                    TableName: "mock-table",
                    Key: { PK: "Model2#789", SK: "Model2" }
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
                // Update the Model3 entity
                {
                  Update: {
                    TableName: "mock-table",
                    Key: {
                      PK: "Model3#123",
                      SK: "Model3"
                    },
                    UpdateExpression:
                      "SET #Name = :Name, #Model1Id = :Model1Id, #Model2Id = :Model2Id, #UpdatedAt = :UpdatedAt",
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeNames: {
                      "#Model1Id": "Model1Id",
                      "#Model2Id": "Model2Id",
                      "#Name": "Name",
                      "#UpdatedAt": "UpdatedAt"
                    },
                    ExpressionAttributeValues: {
                      ":Model1Id": "456",
                      ":Model2Id": "789",
                      ":Name": "newName",
                      ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                    }
                  }
                },
                // Delete the link to the old Model1 item
                {
                  Delete: {
                    TableName: "mock-table",
                    Key: { PK: "Model1#001", SK: "Model3" }
                  }
                },
                // Check that Model1 entity being associated with exists
                {
                  ConditionCheck: {
                    TableName: "mock-table",
                    ConditionExpression: "attribute_exists(PK)",
                    Key: {
                      PK: "Model1#456",
                      SK: "Model1"
                    }
                  }
                },
                // Denormalize Model3 entity being updated to Model1 partition
                {
                  Put: {
                    TableName: "mock-table",
                    ConditionExpression: "attribute_not_exists(PK)",
                    Item: {
                      PK: "Model1#456",
                      SK: "Model3",
                      Id: "123",
                      Type: "Model3",
                      Model1Id: "456",
                      Model2Id: "789",
                      Name: "newName",
                      CreatedAt: "2023-01-01T00:00:00.000Z",
                      UpdatedAt: "2023-10-16T03:31:35.918Z"
                    }
                  }
                },
                // Denormalize Model1 entity to the Model3 partition that is being updated
                {
                  Put: {
                    TableName: "mock-table",
                    ConditionExpression: "attribute_exists(PK)",
                    Item: {
                      PK: "Model3#123",
                      SK: "Model1",
                      Id: "456",
                      Type: "Model1",
                      SomeAttr: "someVal",
                      CreatedAt: "2023-01-03T00:00:00.000Z",
                      UpdatedAt: "2023-01-04T00:00:00.000Z"
                    }
                  }
                },
                // Delete the link to the old Model2 item
                {
                  Delete: {
                    TableName: "mock-table",
                    Key: { PK: "Model2#002", SK: "Model3#123" }
                  }
                },
                // Check that Model2 entity being associated with exists
                {
                  ConditionCheck: {
                    TableName: "mock-table",
                    ConditionExpression: "attribute_exists(PK)",
                    Key: {
                      PK: "Model2#789",
                      SK: "Model2"
                    }
                  }
                },
                // Denormalize Model3 entity being updated to Model2 partition
                {
                  Put: {
                    TableName: "mock-table",
                    ConditionExpression: "attribute_not_exists(PK)",
                    Item: {
                      PK: "Model2#789",
                      SK: "Model3#123",
                      Id: "123",
                      Type: "Model3",
                      Model1Id: "456",
                      Model2Id: "789",
                      Name: "newName",
                      CreatedAt: "2023-01-01T00:00:00.000Z",
                      UpdatedAt: "2023-10-16T03:31:35.918Z"
                    }
                  }
                },
                // Denormalize Model2 entity to the Model3 partition that is being updated
                {
                  Put: {
                    TableName: "mock-table",
                    ConditionExpression: "attribute_exists(PK)",
                    Item: {
                      PK: "Model3#123",
                      SK: "Model2",
                      Id: "789",
                      Type: "Model2",
                      OtherAttr: "otherVal",
                      CreatedAt: "2023-01-05T00:00:00.000Z",
                      UpdatedAt: "2023-01-06T00:00:00.000Z"
                    }
                  }
                }
              ]
            }
          ]
        ]);
      };

      const model3Item: MockTableEntityTableItem<Model3> = {
        PK: "Model3#123",
        SK: "Model3",
        Id: "123",
        Type: "Model3",
        Name: "originalName",
        Model1Id: "001", // Already has an associated entity
        Model2Id: "002", // Already has an associated entity
        CreatedAt: "2023-01-01T00:00:00.000Z",
        UpdatedAt: "2023-01-02T00:00:00.000Z"
      };

      const instance = createInstance(Model3, {
        pk: "Model3#123" as PartitionKey,
        sk: "Model3" as SortKey,
        id: "123",
        type: "Model3",
        name: "originalName",
        model1Id: "001" as NullableForeignKey<Model1>, // Already has an associated entity
        model2Id: "002" as NullableForeignKey<Model2>, // Already has an associated entity
        createdAt: new Date("2023-01-01T00:00:00.000Z"),
        updatedAt: new Date("2023-01-02T00:00:00.000Z")
      });

      beforeEach(() => {
        const model1Item: MockTableEntityTableItem<Model1> = {
          PK: "Model1#456",
          SK: "Model1",
          Id: "456",
          Type: "Model1",
          SomeAttr: "someVal",
          CreatedAt: "2023-01-03T00:00:00.000Z",
          UpdatedAt: "2023-01-04T00:00:00.000Z"
        };

        const model2Item: MockTableEntityTableItem<Model2> = {
          PK: "Model2#789",
          SK: "Model2",
          Id: "789",
          Type: "Model2",
          OtherAttr: "otherVal",
          CreatedAt: "2023-01-05T00:00:00.000Z",
          UpdatedAt: "2023-01-06T00:00:00.000Z"
        };

        mockQuery.mockResolvedValue({
          Items: [model3Item]
        });
        mockTransactGetItems.mockResolvedValue({
          Responses: [{ Item: model1Item }, { Item: model2Item }]
        });
      });

      test("static method", async () => {
        expect.assertions(5);

        expect(
          await Model3.update("123", {
            name: "newName",
            model1Id: "456",
            model2Id: "789"
          })
        ).toBeUndefined();
        dbOperationAssertions();
      });

      test("instance method", async () => {
        expect.assertions(7);

        const updatedInstance = await instance.update({
          name: "newName",
          model1Id: "456",
          model2Id: "789"
        });

        expect(updatedInstance).toEqual({
          ...instance,
          name: "newName",
          model1Id: "456",
          model2Id: "789",
          updatedAt: new Date("2023-10-16T03:31:35.918Z")
        });
        expect(updatedInstance).toBeInstanceOf(Model3);
        // Original instance is not mutated
        expect(instance).toEqual({
          pk: instance.pk,
          sk: instance.sk,
          id: instance.id,
          type: instance.type,
          name: instance.name,
          model1Id: instance.model1Id,
          model2Id: instance.model2Id,
          createdAt: instance.createdAt,
          updatedAt: instance.updatedAt
        });

        dbOperationAssertions();
      });
    });

    describe("alternate table (different alias/keys) - can update foreign keys for an entity that includes both HasMany and Belongs to relationships", () => {
      const dbOperationAssertions = (): void => {
        expect(mockSend.mock.calls).toEqual([
          [{ name: "TransactGetCommand" }],
          [{ name: "QueryCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockedQueryCommand.mock.calls).toEqual([
          [
            {
              TableName: "other-table",
              KeyConditionExpression: "#myPk = :myPk2",
              ExpressionAttributeNames: {
                "#myPk": "myPk",
                "#type": "type"
              },
              ExpressionAttributeValues: {
                ":myPk2": "Grade|123",
                ":type1": "Grade"
              },
              FilterExpression: "#type IN (:type1)",
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
                    TableName: "other-table",
                    Key: { myPk: "Assignment|456", mySk: "Assignment" }
                  }
                },
                {
                  Get: {
                    TableName: "other-table",
                    Key: { myPk: "Student|789", mySk: "Student" }
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
                // Update the Grade entity
                {
                  Update: {
                    TableName: "other-table",
                    Key: {
                      myPk: "Grade|123",
                      mySk: "Grade"
                    },
                    UpdateExpression:
                      "SET #LetterValue = :LetterValue, #assignmentId = :assignmentId, #studentId = :studentId, #updatedAt = :updatedAt",
                    ConditionExpression: "attribute_exists(myPk)",
                    ExpressionAttributeNames: {
                      "#LetterValue": "LetterValue",
                      "#assignmentId": "assignmentId",
                      "#studentId": "studentId",
                      "#updatedAt": "updatedAt"
                    },
                    ExpressionAttributeValues: {
                      ":LetterValue": "B",
                      ":assignmentId": "456",
                      ":studentId": "789",
                      ":updatedAt": "2023-10-16T03:31:35.918Z"
                    }
                  }
                },
                // Delete the link to the old Assignment item
                {
                  Delete: {
                    TableName: "other-table",
                    Key: {
                      myPk: "Assignment|001",
                      mySk: "Grade"
                    }
                  }
                },
                // Check that new Assignment entity being associated with exists
                {
                  ConditionCheck: {
                    TableName: "other-table",
                    ConditionExpression: "attribute_exists(myPk)",
                    Key: {
                      myPk: "Assignment|456",
                      mySk: "Assignment"
                    }
                  }
                },
                // Denormalize Grade entity being updated to Assignment partition
                {
                  Put: {
                    TableName: "other-table",
                    ConditionExpression: "attribute_not_exists(myPk)",
                    Item: {
                      myPk: "Assignment|456",
                      mySk: "Grade",
                      id: "123",
                      type: "Grade",
                      LetterValue: "B",
                      assignmentId: "456",
                      studentId: "789",
                      createdAt: "2023-10-01T03:31:35.918Z",
                      updatedAt: "2023-10-16T03:31:35.918Z"
                    }
                  }
                },
                // Denormalize Assignment entity to the Grade partition that is being updated
                {
                  Put: {
                    TableName: "other-table",
                    ConditionExpression: "attribute_exists(myPk)",
                    Item: {
                      myPk: "Grade|123",
                      mySk: "Assignment",
                      id: "456",
                      type: "Assignment",
                      courseId: "courseId",
                      title: "titleVal",
                      createdAt: "2023-10-03T03:31:35.918Z",
                      updatedAt: "2023-10-04T03:31:35.918Z"
                    }
                  }
                },
                // Delete the link to the old Student item
                {
                  Delete: {
                    TableName: "other-table",
                    Key: {
                      myPk: "Student|002",
                      mySk: "Grade|123"
                    }
                  }
                },
                // Check that the new Student entity being associated with exists
                {
                  ConditionCheck: {
                    TableName: "other-table",
                    ConditionExpression: "attribute_exists(myPk)",
                    Key: {
                      myPk: "Student|789",
                      mySk: "Student"
                    }
                  }
                },
                // Denormalize Grade entity being updated to Student partition
                {
                  Put: {
                    TableName: "other-table",
                    ConditionExpression: "attribute_not_exists(myPk)",
                    Item: {
                      myPk: "Student|789",
                      mySk: "Grade|123",
                      id: "123",
                      type: "Grade",
                      LetterValue: "B",
                      assignmentId: "456",
                      studentId: "789",
                      createdAt: "2023-10-01T03:31:35.918Z",
                      updatedAt: "2023-10-16T03:31:35.918Z"
                    }
                  }
                },
                // Denormalize Student entity to the Grade partition that is being updated
                {
                  Put: {
                    TableName: "other-table",
                    ConditionExpression: "attribute_exists(myPk)",
                    Item: {
                      myPk: "Grade|123",
                      mySk: "Student",
                      id: "789",
                      type: "Student",
                      name: "nameVal",
                      createdAt: "2023-10-05T03:31:35.918Z",
                      updatedAt: "2023-10-06T03:31:35.918Z"
                    }
                  }
                }
              ]
            }
          ]
        ]);
      };

      const grade: OtherTableEntityTableItem<Grade> = {
        myPk: "Grade|123",
        mySk: "Grade",
        id: "123",
        type: "Grade",
        gradeValue: "A+",
        assignmentId: "001", // Already has an associated entity
        studentId: "002", // Already has an associated entity
        createdAt: "2023-10-01T03:31:35.918Z",
        updatedAt: "2023-10-02T03:31:35.918Z"
      };

      const instance = createInstance(Grade, {
        myPk: "Grade|123" as PartitionKey,
        mySk: "Grade" as SortKey,
        id: "123",
        type: "Grade",
        gradeValue: "A+",
        assignmentId: "001" as ForeignKey<Assignment>, // Already has an associated entity
        studentId: "002" as ForeignKey<Student>, // Already has an associated entity
        createdAt: new Date("2023-10-01T03:31:35.918Z"),
        updatedAt: new Date("2023-10-02T03:31:35.918Z")
      });

      beforeEach(() => {
        const assignment: OtherTableEntityTableItem<Assignment> = {
          myPk: "Assignment|456",
          mySk: "Assignment",
          id: "456",
          type: "Assignment",
          title: "titleVal",
          courseId: "courseId",
          createdAt: "2023-10-03T03:31:35.918Z",
          updatedAt: "2023-10-04T03:31:35.918Z"
        };

        const student: OtherTableEntityTableItem<Student> = {
          myPk: "Student|789",
          mySk: "Student",
          id: "789",
          type: "Student",
          name: "nameVal",
          createdAt: "2023-10-05T03:31:35.918Z",
          updatedAt: "2023-10-06T03:31:35.918Z"
        };

        mockQuery.mockResolvedValue({
          Items: [grade]
        });
        mockTransactGetItems.mockResolvedValue({
          Responses: [{ Item: assignment }, { Item: student }]
        });
      });

      test("static method", async () => {
        expect.assertions(5);

        expect(
          await Grade.update("123", {
            gradeValue: "B",
            assignmentId: "456",
            studentId: "789"
          })
        ).toBeUndefined();
        dbOperationAssertions();
      });

      test("instance method", async () => {
        expect.assertions(7);

        const updatedInstance = await instance.update({
          gradeValue: "B",
          assignmentId: "456",
          studentId: "789"
        });

        expect(updatedInstance).toEqual({
          ...instance,
          gradeValue: "B",
          assignmentId: "456",
          studentId: "789",
          updatedAt: new Date("2023-10-16T03:31:35.918Z")
        });
        expect(updatedInstance).toBeInstanceOf(Grade);
        // Original instance is not mutated
        expect(instance).toEqual({
          myPk: instance.myPk,
          mySk: instance.mySk,
          id: instance.id,
          type: instance.type,
          gradeValue: instance.gradeValue,
          assignmentId: instance.assignmentId,
          studentId: instance.studentId,
          createdAt: instance.createdAt,
          updatedAt: instance.updatedAt
        });

        dbOperationAssertions();
      });
    });
  });

  describe("A model who HasMany of a relationship is updated", () => {
    const phoneBook: MockTableEntityTableItem<PhoneBook> = {
      PK: "PhoneBook#123",
      SK: "PhoneBook",
      Id: "123",
      Type: "PhoneBook",
      Edition: "1",
      CreatedAt: "2023-01-01T00:00:00.000Z",
      UpdatedAt: "2023-01-02T00:00:00.000Z"
    };

    const instance = createInstance(PhoneBook, {
      pk: "PhoneBook#123" as PartitionKey,
      sk: "PhoneBook" as SortKey,
      id: "123",
      type: "PhoneBook",
      edition: "1",
      createdAt: new Date("2023-01-01T00:00:00.000Z"),
      updatedAt: new Date("2023-01-02T00:00:00.000Z")
    });

    beforeEach(() => {
      // Address record denormalized to PhoneBook partition
      const linkedAddress1: MockTableEntityTableItem<Address> = {
        PK: phoneBook.PK, // Linked record in PhoneBook partition
        SK: "Address#456",
        Id: "456",
        Type: "Address",
        PhoneBookId: phoneBook.Id,
        State: "CO",
        HomeId: "001",
        CreatedAt: "2023-01-03T00:00:00.000Z",
        UpdatedAt: "2023-01-04T00:00:00.000Z"
      };

      // Address record denormalized to PhoneBook partition
      const linkedAddress2: MockTableEntityTableItem<Address> = {
        PK: phoneBook.PK, // Linked record in PhoneBook partition
        SK: "Address#789",
        Id: "789",
        Type: "Address",
        PhoneBookId: phoneBook.Id,
        State: "AZ",
        HomeId: "002",
        CreatedAt: "2023-01-05T00:00:00.000Z",
        UpdatedAt: "2023-01-06T00:00:00.000Z"
      };

      mockQuery.mockResolvedValue({
        Items: [phoneBook, linkedAddress1, linkedAddress2]
      });
    });

    describe("will update the entity and the denormalized link records for its associated entities", () => {
      const dbOperationAssertions = (): void => {
        expect(mockSend.mock.calls).toEqual([
          [{ name: "QueryCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockedQueryCommand.mock.calls).toEqual([
          [
            {
              TableName: "mock-table",
              KeyConditionExpression: "#PK = :PK3",
              ExpressionAttributeNames: {
                "#PK": "PK",
                "#Type": "Type"
              },
              ExpressionAttributeValues: {
                ":PK3": "PhoneBook#123",
                ":Type1": "PhoneBook",
                ":Type2": "Address"
              },
              FilterExpression: "#Type IN (:Type1,:Type2)",
              ConsistentRead: true
            }
          ]
        ]);
        expect(mockTransactGetCommand.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                // Update the PhoneBook attributes
                {
                  Update: {
                    TableName: "mock-table",
                    Key: {
                      PK: "PhoneBook#123",
                      SK: "PhoneBook"
                    },
                    UpdateExpression:
                      "SET #Edition = :Edition, #UpdatedAt = :UpdatedAt",
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeNames: {
                      "#Edition": "Edition",
                      "#UpdatedAt": "UpdatedAt"
                    },
                    ExpressionAttributeValues: {
                      ":Edition": "2",
                      ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                    }
                  }
                },
                // Update the PhoneBook records that are denormalized to the the associated Address partition
                {
                  Update: {
                    TableName: "mock-table",
                    Key: {
                      PK: "Address#456",
                      SK: "PhoneBook"
                    },
                    UpdateExpression:
                      "SET #Edition = :Edition, #UpdatedAt = :UpdatedAt",
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeNames: {
                      "#Edition": "Edition",
                      "#UpdatedAt": "UpdatedAt"
                    },
                    ExpressionAttributeValues: {
                      ":Edition": "2",
                      ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                    }
                  }
                },
                // Update the PhoneBook records that are denormalized to the the associated Address partition
                {
                  Update: {
                    TableName: "mock-table",
                    Key: {
                      PK: "Address#789",
                      SK: "PhoneBook"
                    },
                    UpdateExpression:
                      "SET #Edition = :Edition, #UpdatedAt = :UpdatedAt",
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeNames: {
                      "#Edition": "Edition",
                      "#UpdatedAt": "UpdatedAt"
                    },
                    ExpressionAttributeValues: {
                      ":Edition": "2",
                      ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                    }
                  }
                }
              ]
            }
          ]
        ]);
      };

      test("static method", async () => {
        expect.assertions(5);

        expect(
          await PhoneBook.update("123", {
            edition: "2"
          })
        ).toBeUndefined();
        dbOperationAssertions();
      });

      test("instance method", async () => {
        expect.assertions(7);

        const updatedInstance = await instance.update({
          edition: "2"
        });

        expect(updatedInstance).toEqual({
          ...instance,
          edition: "2",
          updatedAt: new Date("2023-10-16T03:31:35.918Z")
        });
        expect(updatedInstance).toBeInstanceOf(PhoneBook);
        // Original instance is not mutated
        expect(instance).toEqual({
          pk: instance.pk,
          sk: instance.sk,
          id: instance.id,
          type: instance.type,
          edition: instance.edition,
          createdAt: instance.createdAt,
          updatedAt: instance.updatedAt
        });

        dbOperationAssertions();
      });
    });

    describe("will throw an error if it fails update denormalized records for its associated entities", () => {
      const operationSharedAssertions = (e: any): void => {
        expect(e.constructor.name).toEqual("TransactionWriteFailedError");
        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Address (456) is not associated with PhoneBook (123)"
          ),
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Address (789) is not associated with PhoneBook (123)"
          )
        ]);
        expect(mockSend.mock.calls).toEqual([
          [{ name: "QueryCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
      };

      beforeEach(() => {
        mockSend
          // Query
          .mockResolvedValueOnce(undefined)
          // TransactWrite
          .mockImplementationOnce(() => {
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
      });

      test("static method", async () => {
        expect.assertions(3);

        try {
          await PhoneBook.update("123", {
            edition: "2"
          });
        } catch (e) {
          operationSharedAssertions(e);
        }
      });

      test("instance method", async () => {
        expect.assertions(3);

        try {
          await instance.update({
            edition: "2"
          });
        } catch (e) {
          operationSharedAssertions(e);
        }
      });
    });
  });

  describe("A model who HasOne of a relationship is updated", () => {
    const desk: MockTableEntityTableItem<Desk> = {
      PK: "Desk#123",
      SK: "Desk",
      Id: "123",
      Type: "Desk",
      Num: 1,
      CreatedAt: "2023-01-01T00:00:00.000Z",
      UpdatedAt: "2023-01-02T00:00:00.000Z"
    };

    const instance = createInstance(Desk, {
      pk: "Desk#123" as PartitionKey,
      sk: "Desk" as SortKey,
      id: "123",
      type: "Desk",
      num: 1,
      createdAt: new Date("2023-01-01T00:00:00.000Z"),
      updatedAt: new Date("2023-01-02T00:00:00.000Z")
    });

    beforeEach(() => {
      // User record denormalized to Desk partition
      const linkedUser: MockTableEntityTableItem<User> = {
        PK: desk.PK, // Linked record in Desk partition
        SK: "User",
        Id: "456",
        Type: "User",
        DeskId: desk.Id,
        Name: "MockUser",
        Email: "test@test.com",
        CreatedAt: "2023-01-03T00:00:00.000Z",
        UpdatedAt: "2023-01-04T00:00:00.000Z"
      };

      mockQuery.mockResolvedValue({
        Items: [desk, linkedUser]
      });
    });

    describe("will update the entity and the denormalized link records for its associated entities", () => {
      const dbOperationAssertions = (): void => {
        expect(mockSend.mock.calls).toEqual([
          [{ name: "QueryCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockedQueryCommand.mock.calls).toEqual([
          [
            {
              TableName: "mock-table",
              KeyConditionExpression: "#PK = :PK3",
              ExpressionAttributeNames: {
                "#PK": "PK",
                "#Type": "Type"
              },
              ExpressionAttributeValues: {
                ":PK3": "Desk#123",
                ":Type1": "Desk",
                ":Type2": "User"
              },
              FilterExpression: "#Type IN (:Type1,:Type2)",
              ConsistentRead: true
            }
          ]
        ]);
        expect(mockTransactGetCommand.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                {
                  // Update the Desk attributes
                  Update: {
                    TableName: "mock-table",
                    Key: {
                      PK: "Desk#123",
                      SK: "Desk"
                    },
                    UpdateExpression:
                      "SET #Num = :Num, #UpdatedAt = :UpdatedAt",
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeNames: {
                      "#Num": "Num",
                      "#UpdatedAt": "UpdatedAt"
                    },
                    ExpressionAttributeValues: {
                      ":Num": 2,
                      ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                    }
                  }
                },
                {
                  // Update the Desk record that are denormalized to the the associated User partition
                  Update: {
                    TableName: "mock-table",
                    Key: {
                      PK: "User#456",
                      SK: "Desk"
                    },
                    UpdateExpression:
                      "SET #Num = :Num, #UpdatedAt = :UpdatedAt",
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeNames: {
                      "#Num": "Num",
                      "#UpdatedAt": "UpdatedAt"
                    },
                    ExpressionAttributeValues: {
                      ":Num": 2,
                      ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                    }
                  }
                }
              ]
            }
          ]
        ]);
      };

      test("static method", async () => {
        expect.assertions(5);

        expect(
          await Desk.update("123", {
            num: 2
          })
        ).toBeUndefined();
        dbOperationAssertions();
      });

      test("instance method", async () => {
        expect.assertions(7);

        const updatedInstance = await instance.update({ num: 2 });

        expect(updatedInstance).toEqual({
          ...instance,
          num: 2,
          updatedAt: new Date("2023-10-16T03:31:35.918Z")
        });
        expect(updatedInstance).toBeInstanceOf(Desk);
        // Original instance is not mutated
        expect(instance).toEqual({
          pk: instance.pk,
          sk: instance.sk,
          id: instance.id,
          type: instance.type,
          num: instance.num,
          createdAt: instance.createdAt,
          updatedAt: instance.updatedAt
        });
        dbOperationAssertions();
      });
    });

    describe("will throw an error if it fails update denormalized records for its associated entities", () => {
      const operationSharedAssertions = (e: any): void => {
        expect(e.constructor.name).toEqual("TransactionWriteFailedError");
        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: User (456) is not associated with Desk (123)"
          )
        ]);
        expect(mockSend.mock.calls).toEqual([
          [{ name: "QueryCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
      };

      beforeEach(() => {
        mockSend
          // Query
          .mockResolvedValueOnce(undefined)
          // TransactWrite
          .mockImplementationOnce(() => {
            throw new TransactionCanceledException({
              message: "MockMessage",
              CancellationReasons: [
                { Code: "None" },
                { Code: "ConditionalCheckFailed" }
              ],
              $metadata: {}
            });
          });
      });

      test("static method", async () => {
        expect.assertions(3);

        try {
          await Desk.update("123", {
            num: 2
          });
        } catch (e) {
          operationSharedAssertions(e);
        }
      });

      test("instance method", async () => {
        expect.assertions(3);

        try {
          await instance.update({ num: 2 });
        } catch (e) {
          operationSharedAssertions(e);
        }
      });
    });
  });

  describe("A model who HasAndBelongsToMany of a relationship is updated", () => {
    const website: MockTableEntityTableItem<Website> = {
      PK: "Website#123",
      SK: "Website",
      Id: "123",
      Type: "Website",
      Name: "https://dyna-record.com/",
      CreatedAt: "2023-01-01T00:00:00.000Z",
      UpdatedAt: "2023-01-02T00:00:00.000Z"
    };

    const instance = createInstance(Website, {
      pk: "Website#123" as PartitionKey,
      sk: "Website" as SortKey,
      id: "123",
      type: "Website",
      name: "https://dyna-record.com/",
      createdAt: new Date("2023-01-01T00:00:00.000Z"),
      updatedAt: new Date("2023-01-02T00:00:00.000Z")
    });

    beforeEach(() => {
      // User record denormalized to Website partition
      const linkedUser1: MockTableEntityTableItem<User> = {
        PK: website.PK, // Linked record in Website partition
        SK: "User#456",
        Id: "456",
        Type: "User",
        Name: "MockUser1",
        Email: "test-1@test.com",
        CreatedAt: "2023-01-03T00:00:00.000Z",
        UpdatedAt: "2023-01-04T00:00:00.000Z"
      };

      // User record denormalized to Website partition
      const linkedUser2: MockTableEntityTableItem<User> = {
        PK: website.PK, // Linked record in Website partition
        SK: "User#789",
        Id: "789",
        Type: "User",
        Name: "MockUser2",
        Email: "test-2@test.com",
        CreatedAt: "2023-01-05T00:00:00.000Z",
        UpdatedAt: "2023-01-06T00:00:00.000Z"
      };

      mockQuery.mockResolvedValue({
        Items: [website, linkedUser1, linkedUser2]
      });
    });

    describe("will update the entity and the denormalized link records for its associated entities", () => {
      const dbOperationAssertions = (): void => {
        expect(mockSend.mock.calls).toEqual([
          [{ name: "QueryCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockedQueryCommand.mock.calls).toEqual([
          [
            {
              TableName: "mock-table",
              KeyConditionExpression: "#PK = :PK3",
              ExpressionAttributeNames: {
                "#PK": "PK",
                "#Type": "Type"
              },
              ExpressionAttributeValues: {
                ":PK3": "Website#123",
                ":Type1": "Website",
                ":Type2": "User"
              },
              FilterExpression: "#Type IN (:Type1,:Type2)",
              ConsistentRead: true
            }
          ]
        ]);
        expect(mockTransactGetCommand.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                {
                  // Update the Website attributes
                  Update: {
                    TableName: "mock-table",
                    Key: {
                      PK: "Website#123",
                      SK: "Website"
                    },
                    UpdateExpression:
                      "SET #Name = :Name, #UpdatedAt = :UpdatedAt",
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeNames: {
                      "#Name": "Name",
                      "#UpdatedAt": "UpdatedAt"
                    },
                    ExpressionAttributeValues: {
                      ":Name": "testing.com",
                      ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                    }
                  }
                },
                {
                  // Update the Website records that are denormalized to the the associated User partition
                  Update: {
                    TableName: "mock-table",
                    Key: {
                      PK: "User#456",
                      SK: "Website#123"
                    },
                    UpdateExpression:
                      "SET #Name = :Name, #UpdatedAt = :UpdatedAt",
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeNames: {
                      "#Name": "Name",
                      "#UpdatedAt": "UpdatedAt"
                    },
                    ExpressionAttributeValues: {
                      ":Name": "testing.com",
                      ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                    }
                  }
                },
                {
                  // Update the Website records that are denormalized to the the associated User partition
                  Update: {
                    TableName: "mock-table",
                    Key: {
                      PK: "User#789",
                      SK: "Website#123"
                    },
                    UpdateExpression:
                      "SET #Name = :Name, #UpdatedAt = :UpdatedAt",
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeNames: {
                      "#Name": "Name",
                      "#UpdatedAt": "UpdatedAt"
                    },
                    ExpressionAttributeValues: {
                      ":Name": "testing.com",
                      ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                    }
                  }
                }
              ]
            }
          ]
        ]);
      };

      test("static method", async () => {
        expect.assertions(5);

        expect(
          await Website.update("123", {
            name: "testing.com"
          })
        ).toBeUndefined();
        dbOperationAssertions();
      });

      test("instance method", async () => {
        expect.assertions(7);

        const updatedInstance = await instance.update({
          name: "testing.com"
        });

        expect(updatedInstance).toEqual({
          ...instance,
          name: "testing.com",
          updatedAt: new Date("2023-10-16T03:31:35.918Z")
        });
        expect(updatedInstance).toBeInstanceOf(Website);
        // Original instance is not mutated
        expect(instance).toEqual({
          pk: instance.pk,
          sk: instance.sk,
          id: instance.id,
          type: instance.type,
          name: instance.name,
          createdAt: instance.createdAt,
          updatedAt: instance.updatedAt
        });
        dbOperationAssertions();
      });
    });

    describe("will throw an error if it fails update denormalized records for its associated entities", () => {
      const operationSharedAssertions = (e: any): void => {
        expect(e.constructor.name).toEqual("TransactionWriteFailedError");
        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: User (456) is not associated with Website (123)"
          ),
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: User (789) is not associated with Website (123)"
          )
        ]);
        expect(mockSend.mock.calls).toEqual([
          [{ name: "QueryCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
      };

      beforeEach(() => {
        mockSend
          // Query
          .mockResolvedValueOnce(undefined)
          // TransactWrite
          .mockImplementationOnce(() => {
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
      });

      test("static method", async () => {
        expect.assertions(3);

        try {
          await Website.update("123", {
            name: "testing.com"
          });
        } catch (e) {
          operationSharedAssertions(e);
        }
      });

      test("instance method", async () => {
        expect.assertions(3);

        try {
          await instance.update({
            name: "testing.com"
          });
        } catch (e) {
          operationSharedAssertions(e);
        }
      });
    });
  });

  describe("A model who HasMany of a relationship is updated with an ObjectAttribute", () => {
    const warehouse: MockTableEntityTableItem<Warehouse> = {
      PK: "Warehouse#123",
      SK: "Warehouse",
      Id: "123",
      Type: "Warehouse",
      Name: "Main Warehouse",
      Location: { city: "Springfield", state: "IL" },
      CreatedAt: "2023-01-01T00:00:00.000Z",
      UpdatedAt: "2023-01-02T00:00:00.000Z"
    };

    const instance = createInstance(Warehouse, {
      pk: "Warehouse#123" as PartitionKey,
      sk: "Warehouse" as SortKey,
      id: "123",
      type: "Warehouse",
      name: "Main Warehouse",
      location: { city: "Springfield", state: "IL" },
      createdAt: new Date("2023-01-01T00:00:00.000Z"),
      updatedAt: new Date("2023-01-02T00:00:00.000Z")
    });

    beforeEach(() => {
      // Shipment record denormalized to Warehouse partition
      const linkedShipment: MockTableEntityTableItem<Shipment> = {
        PK: warehouse.PK, // Linked record in Warehouse partition
        SK: "Shipment#456",
        Id: "456",
        Type: "Shipment",
        Destination: "Chicago",
        Dimensions: { weight: 50, unit: "kg" },
        WarehouseId: warehouse.Id,
        CreatedAt: "2023-01-03T00:00:00.000Z",
        UpdatedAt: "2023-01-04T00:00:00.000Z"
      };

      mockQuery.mockResolvedValue({
        Items: [warehouse, linkedShipment]
      });

      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
    });

    afterEach(() => {
      mockSend.mockReset();
      mockQuery.mockReset();
      mockTransactGetItems.mockReset();
    });

    describe("will update the entity and its denormalized records including the ObjectAttribute", () => {
      const dbOperationAssertions = (): void => {
        expect(mockSend.mock.calls).toEqual([
          [{ name: "QueryCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockedQueryCommand.mock.calls).toEqual([
          [
            {
              TableName: "mock-table",
              KeyConditionExpression: "#PK = :PK3",
              ExpressionAttributeNames: {
                "#PK": "PK",
                "#Type": "Type"
              },
              ExpressionAttributeValues: {
                ":PK3": "Warehouse#123",
                ":Type1": "Warehouse",
                ":Type2": "Shipment"
              },
              FilterExpression: "#Type IN (:Type1,:Type2)",
              ConsistentRead: true
            }
          ]
        ]);
        expect(mockTransactGetCommand.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                // Update the Warehouse attributes including the ObjectAttribute
                {
                  Update: {
                    TableName: "mock-table",
                    Key: {
                      PK: "Warehouse#123",
                      SK: "Warehouse"
                    },
                    UpdateExpression:
                      "SET #UpdatedAt = :UpdatedAt, #Location.#city = :Location_city, #Location.#state = :Location_state",
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeNames: {
                      "#Location": "Location",
                      "#UpdatedAt": "UpdatedAt",
                      "#city": "city",
                      "#state": "state"
                    },
                    ExpressionAttributeValues: {
                      ":Location_city": "Chicago",
                      ":Location_state": "IL",
                      ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                    }
                  }
                },
                // Update the Warehouse denormalized record in the Shipment partition
                {
                  Update: {
                    TableName: "mock-table",
                    Key: {
                      PK: "Shipment#456",
                      SK: "Warehouse"
                    },
                    UpdateExpression:
                      "SET #UpdatedAt = :UpdatedAt, #Location.#city = :Location_city, #Location.#state = :Location_state",
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeNames: {
                      "#Location": "Location",
                      "#UpdatedAt": "UpdatedAt",
                      "#city": "city",
                      "#state": "state"
                    },
                    ExpressionAttributeValues: {
                      ":Location_city": "Chicago",
                      ":Location_state": "IL",
                      ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                    }
                  }
                }
              ]
            }
          ]
        ]);
      };

      test("static method", async () => {
        expect.assertions(5);

        expect(
          await Warehouse.update("123", {
            location: { city: "Chicago", state: "IL" }
          })
        ).toBeUndefined();
        dbOperationAssertions();
      });

      test("instance method", async () => {
        expect.assertions(7);

        const updatedInstance = await instance.update({
          location: { city: "Chicago", state: "IL" }
        });

        expect(updatedInstance).toEqual({
          ...instance,
          location: { city: "Chicago", state: "IL" },
          updatedAt: new Date("2023-10-16T03:31:35.918Z")
        });
        expect(updatedInstance).toBeInstanceOf(Warehouse);
        // Original instance is not mutated
        expect(instance).toEqual({
          pk: instance.pk,
          sk: instance.sk,
          id: instance.id,
          type: instance.type,
          name: instance.name,
          location: { city: "Springfield", state: "IL" },
          createdAt: instance.createdAt,
          updatedAt: instance.updatedAt
        });

        dbOperationAssertions();
      });
    });
  });

  describe("partial ObjectAttribute updates propagate to denormalized records", () => {
    describe("HasMany - partial update propagates to related entity partitions", () => {
      const warehouse: MockTableEntityTableItem<Warehouse> = {
        PK: "Warehouse#123",
        SK: "Warehouse",
        Id: "123",
        Type: "Warehouse",
        Name: "Main Warehouse",
        Location: { city: "Springfield", state: "IL", zip: 62704 },
        CreatedAt: "2023-01-01T00:00:00.000Z",
        UpdatedAt: "2023-01-02T00:00:00.000Z"
      };

      const instance = createInstance(Warehouse, {
        pk: "Warehouse#123" as PartitionKey,
        sk: "Warehouse" as SortKey,
        id: "123",
        type: "Warehouse",
        name: "Main Warehouse",
        location: { city: "Springfield", state: "IL", zip: 62704 },
        createdAt: new Date("2023-01-01T00:00:00.000Z"),
        updatedAt: new Date("2023-01-02T00:00:00.000Z")
      });

      beforeEach(() => {
        const linkedShipment: MockTableEntityTableItem<Shipment> = {
          PK: warehouse.PK,
          SK: "Shipment#456",
          Id: "456",
          Type: "Shipment",
          Destination: "Chicago",
          Dimensions: { weight: 50, unit: "kg" },
          WarehouseId: warehouse.Id,
          CreatedAt: "2023-01-03T00:00:00.000Z",
          UpdatedAt: "2023-01-04T00:00:00.000Z"
        };

        mockQuery.mockResolvedValue({
          Items: [warehouse, linkedShipment]
        });

        vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      });

      afterEach(() => {
        mockSend.mockReset();
        mockQuery.mockReset();
        mockTransactGetItems.mockReset();
      });

      describe("partial SET propagates to related partitions", () => {
        const dbOperationAssertions = (): void => {
          expect(mockSend.mock.calls).toEqual([
            [{ name: "QueryCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [
              {
                TransactItems: [
                  {
                    Update: {
                      TableName: "mock-table",
                      Key: {
                        PK: "Warehouse#123",
                        SK: "Warehouse"
                      },
                      UpdateExpression:
                        "SET #UpdatedAt = :UpdatedAt, #Location.#city = :Location_city",
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#Location": "Location",
                        "#UpdatedAt": "UpdatedAt",
                        "#city": "city"
                      },
                      ExpressionAttributeValues: {
                        ":Location_city": "Chicago",
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      }
                    }
                  },
                  {
                    // Denormalized Warehouse in Shipment partition gets the same expression
                    Update: {
                      TableName: "mock-table",
                      Key: {
                        PK: "Shipment#456",
                        SK: "Warehouse"
                      },
                      UpdateExpression:
                        "SET #UpdatedAt = :UpdatedAt, #Location.#city = :Location_city",
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#Location": "Location",
                        "#UpdatedAt": "UpdatedAt",
                        "#city": "city"
                      },
                      ExpressionAttributeValues: {
                        ":Location_city": "Chicago",
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      }
                    }
                  }
                ]
              }
            ]
          ]);
        };

        test("static method", async () => {
          expect.assertions(3);

          expect(
            await Warehouse.update("123", {
              location: { city: "Chicago" }
            })
          ).toBeUndefined();
          dbOperationAssertions();
        });

        test("instance method", async () => {
          expect.assertions(3);

          const updatedInstance = await instance.update({
            location: { city: "Chicago" }
          });

          expect(updatedInstance).toEqual({
            ...instance,
            location: { city: "Chicago", state: "IL", zip: 62704 },
            updatedAt: new Date("2023-10-16T03:31:35.918Z")
          });
          dbOperationAssertions();
        });
      });

      describe("REMOVE of nullable field propagates to related partitions", () => {
        const dbOperationAssertions = (): void => {
          expect(mockSend.mock.calls).toEqual([
            [{ name: "QueryCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [
              {
                TransactItems: [
                  {
                    Update: {
                      TableName: "mock-table",
                      Key: {
                        PK: "Warehouse#123",
                        SK: "Warehouse"
                      },
                      UpdateExpression:
                        "SET #UpdatedAt = :UpdatedAt REMOVE #Location.#zip",
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#Location": "Location",
                        "#UpdatedAt": "UpdatedAt",
                        "#zip": "zip"
                      },
                      ExpressionAttributeValues: {
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      }
                    }
                  },
                  {
                    // Denormalized Warehouse in Shipment partition gets the same REMOVE expression
                    Update: {
                      TableName: "mock-table",
                      Key: {
                        PK: "Shipment#456",
                        SK: "Warehouse"
                      },
                      UpdateExpression:
                        "SET #UpdatedAt = :UpdatedAt REMOVE #Location.#zip",
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#Location": "Location",
                        "#UpdatedAt": "UpdatedAt",
                        "#zip": "zip"
                      },
                      ExpressionAttributeValues: {
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      }
                    }
                  }
                ]
              }
            ]
          ]);
        };

        test("static method", async () => {
          expect.assertions(3);

          expect(
            await Warehouse.update("123", {
              location: { zip: null }
            })
          ).toBeUndefined();
          dbOperationAssertions();
        });

        test("instance method", async () => {
          expect.assertions(3);

          const updatedInstance = await instance.update({
            location: { zip: null }
          });

          expect(updatedInstance).toEqual({
            ...instance,
            location: { city: "Springfield", state: "IL" },
            updatedAt: new Date("2023-10-16T03:31:35.918Z")
          });
          dbOperationAssertions();
        });
      });
    });

    describe("BelongsTo - partial update propagates to foreign entity partition", () => {
      const shipment: MockTableEntityTableItem<Shipment> = {
        PK: "Shipment#456",
        SK: "Shipment",
        Id: "456",
        Type: "Shipment",
        Destination: "Chicago",
        Dimensions: { weight: 50, unit: "kg", label: "Heavy" },
        WarehouseId: "W123",
        CreatedAt: "2023-01-01T00:00:00.000Z",
        UpdatedAt: "2023-01-02T00:00:00.000Z"
      };

      const instance = createInstance(Shipment, {
        pk: "Shipment#456" as PartitionKey,
        sk: "Shipment" as SortKey,
        id: "456",
        type: "Shipment",
        destination: "Chicago",
        dimensions: { weight: 50, unit: "kg", label: "Heavy" },
        warehouseId: "W123" as ForeignKey<Warehouse>,
        createdAt: new Date("2023-01-01T00:00:00.000Z"),
        updatedAt: new Date("2023-01-02T00:00:00.000Z")
      });

      beforeEach(() => {
        mockQuery.mockResolvedValue({
          Items: [shipment]
        });

        vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      });

      afterEach(() => {
        mockSend.mockReset();
        mockQuery.mockReset();
        mockTransactGetItems.mockReset();
      });

      describe("partial SET propagates to foreign entity partition", () => {
        const dbOperationAssertions = (): void => {
          expect(mockSend.mock.calls).toEqual([
            [{ name: "QueryCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockedQueryCommand.mock.calls).toEqual([
            [
              {
                TableName: "mock-table",
                KeyConditionExpression: "#PK = :PK2",
                ExpressionAttributeNames: {
                  "#PK": "PK",
                  "#Type": "Type"
                },
                ExpressionAttributeValues: {
                  ":PK2": "Shipment#456",
                  ":Type1": "Shipment"
                },
                FilterExpression: "#Type IN (:Type1)",
                ConsistentRead: true
              }
            ]
          ]);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [
              {
                TransactItems: [
                  {
                    // Update the Shipment main record
                    Update: {
                      TableName: "mock-table",
                      Key: {
                        PK: "Shipment#456",
                        SK: "Shipment"
                      },
                      UpdateExpression:
                        "SET #UpdatedAt = :UpdatedAt, #Dimensions.#weight = :Dimensions_weight",
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#Dimensions": "Dimensions",
                        "#UpdatedAt": "UpdatedAt",
                        "#weight": "weight"
                      },
                      ExpressionAttributeValues: {
                        ":Dimensions_weight": 100,
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      }
                    }
                  },
                  {
                    // Denormalized Shipment in Warehouse partition gets the same expression
                    Update: {
                      TableName: "mock-table",
                      Key: {
                        PK: "Warehouse#W123",
                        SK: "Shipment#456"
                      },
                      UpdateExpression:
                        "SET #UpdatedAt = :UpdatedAt, #Dimensions.#weight = :Dimensions_weight",
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#Dimensions": "Dimensions",
                        "#UpdatedAt": "UpdatedAt",
                        "#weight": "weight"
                      },
                      ExpressionAttributeValues: {
                        ":Dimensions_weight": 100,
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      }
                    }
                  }
                ]
              }
            ]
          ]);
        };

        test("static method", async () => {
          expect.assertions(4);

          expect(
            await Shipment.update("456", {
              dimensions: { weight: 100 }
            })
          ).toBeUndefined();
          dbOperationAssertions();
        });

        test("instance method", async () => {
          expect.assertions(4);

          const updatedInstance = await instance.update({
            dimensions: { weight: 100 }
          });

          expect(updatedInstance).toEqual({
            ...instance,
            dimensions: { weight: 100, unit: "kg", label: "Heavy" },
            updatedAt: new Date("2023-10-16T03:31:35.918Z")
          });
          dbOperationAssertions();
        });
      });

      describe("REMOVE of nullable field propagates to foreign entity partition", () => {
        const dbOperationAssertions = (): void => {
          expect(mockSend.mock.calls).toEqual([
            [{ name: "QueryCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [
              {
                TransactItems: [
                  {
                    Update: {
                      TableName: "mock-table",
                      Key: {
                        PK: "Shipment#456",
                        SK: "Shipment"
                      },
                      UpdateExpression:
                        "SET #UpdatedAt = :UpdatedAt REMOVE #Dimensions.#label",
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#Dimensions": "Dimensions",
                        "#UpdatedAt": "UpdatedAt",
                        "#label": "label"
                      },
                      ExpressionAttributeValues: {
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      }
                    }
                  },
                  {
                    // Denormalized Shipment in Warehouse partition gets the same REMOVE expression
                    Update: {
                      TableName: "mock-table",
                      Key: {
                        PK: "Warehouse#W123",
                        SK: "Shipment#456"
                      },
                      UpdateExpression:
                        "SET #UpdatedAt = :UpdatedAt REMOVE #Dimensions.#label",
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#Dimensions": "Dimensions",
                        "#UpdatedAt": "UpdatedAt",
                        "#label": "label"
                      },
                      ExpressionAttributeValues: {
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      }
                    }
                  }
                ]
              }
            ]
          ]);
        };

        test("static method", async () => {
          expect.assertions(3);

          expect(
            await Shipment.update("456", {
              dimensions: { label: null }
            })
          ).toBeUndefined();
          dbOperationAssertions();
        });

        test("instance method", async () => {
          expect.assertions(3);

          const updatedInstance = await instance.update({
            dimensions: { label: null }
          });

          expect(updatedInstance).toEqual({
            ...instance,
            dimensions: { weight: 50, unit: "kg" },
            updatedAt: new Date("2023-10-16T03:31:35.918Z")
          });
          dbOperationAssertions();
        });
      });
    });

    describe("HasOne - partial update propagates to related entity partition", () => {
      const catalog: MockTableEntityTableItem<Catalog> = {
        PK: "Catalog#123",
        SK: "Catalog",
        Id: "123",
        Type: "Catalog",
        Name: "Spring Collection",
        Inventory: { quantity: 100, location: "Aisle 3", notes: "Fragile" },
        CreatedAt: "2023-01-01T00:00:00.000Z",
        UpdatedAt: "2023-01-02T00:00:00.000Z"
      };

      const instance = createInstance(Catalog, {
        pk: "Catalog#123" as PartitionKey,
        sk: "Catalog" as SortKey,
        id: "123",
        type: "Catalog",
        name: "Spring Collection",
        inventory: { quantity: 100, location: "Aisle 3", notes: "Fragile" },
        createdAt: new Date("2023-01-01T00:00:00.000Z"),
        updatedAt: new Date("2023-01-02T00:00:00.000Z")
      });

      beforeEach(() => {
        const linkedCatalogItem: MockTableEntityTableItem<CatalogItem> = {
          PK: catalog.PK,
          SK: "CatalogItem",
          Id: "456",
          Type: "CatalogItem",
          Description: "Blue Widget",
          CatalogId: catalog.Id,
          CreatedAt: "2023-01-03T00:00:00.000Z",
          UpdatedAt: "2023-01-04T00:00:00.000Z"
        };

        mockQuery.mockResolvedValue({
          Items: [catalog, linkedCatalogItem]
        });

        vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      });

      afterEach(() => {
        mockSend.mockReset();
        mockQuery.mockReset();
        mockTransactGetItems.mockReset();
      });

      describe("partial SET propagates to related partition", () => {
        const dbOperationAssertions = (): void => {
          expect(mockSend.mock.calls).toEqual([
            [{ name: "QueryCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [
              {
                TransactItems: [
                  {
                    Update: {
                      TableName: "mock-table",
                      Key: {
                        PK: "Catalog#123",
                        SK: "Catalog"
                      },
                      UpdateExpression:
                        "SET #UpdatedAt = :UpdatedAt, #Inventory.#quantity = :Inventory_quantity",
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#Inventory": "Inventory",
                        "#UpdatedAt": "UpdatedAt",
                        "#quantity": "quantity"
                      },
                      ExpressionAttributeValues: {
                        ":Inventory_quantity": 200,
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      }
                    }
                  },
                  {
                    // Denormalized Catalog in CatalogItem partition gets the same expression (HasOne SK = "Catalog")
                    Update: {
                      TableName: "mock-table",
                      Key: {
                        PK: "CatalogItem#456",
                        SK: "Catalog"
                      },
                      UpdateExpression:
                        "SET #UpdatedAt = :UpdatedAt, #Inventory.#quantity = :Inventory_quantity",
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#Inventory": "Inventory",
                        "#UpdatedAt": "UpdatedAt",
                        "#quantity": "quantity"
                      },
                      ExpressionAttributeValues: {
                        ":Inventory_quantity": 200,
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      }
                    }
                  }
                ]
              }
            ]
          ]);
        };

        test("static method", async () => {
          expect.assertions(3);

          expect(
            await Catalog.update("123", {
              inventory: { quantity: 200 }
            })
          ).toBeUndefined();
          dbOperationAssertions();
        });

        test("instance method", async () => {
          expect.assertions(3);

          const updatedInstance = await instance.update({
            inventory: { quantity: 200 }
          });

          expect(updatedInstance).toEqual({
            ...instance,
            inventory: { quantity: 200, location: "Aisle 3", notes: "Fragile" },
            updatedAt: new Date("2023-10-16T03:31:35.918Z")
          });
          dbOperationAssertions();
        });
      });

      describe("REMOVE of nullable field propagates to related partition", () => {
        const dbOperationAssertions = (): void => {
          expect(mockSend.mock.calls).toEqual([
            [{ name: "QueryCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [
              {
                TransactItems: [
                  {
                    Update: {
                      TableName: "mock-table",
                      Key: {
                        PK: "Catalog#123",
                        SK: "Catalog"
                      },
                      UpdateExpression:
                        "SET #UpdatedAt = :UpdatedAt REMOVE #Inventory.#notes",
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#Inventory": "Inventory",
                        "#UpdatedAt": "UpdatedAt",
                        "#notes": "notes"
                      },
                      ExpressionAttributeValues: {
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      }
                    }
                  },
                  {
                    // Denormalized Catalog in CatalogItem partition gets the same REMOVE expression
                    Update: {
                      TableName: "mock-table",
                      Key: {
                        PK: "CatalogItem#456",
                        SK: "Catalog"
                      },
                      UpdateExpression:
                        "SET #UpdatedAt = :UpdatedAt REMOVE #Inventory.#notes",
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#Inventory": "Inventory",
                        "#UpdatedAt": "UpdatedAt",
                        "#notes": "notes"
                      },
                      ExpressionAttributeValues: {
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      }
                    }
                  }
                ]
              }
            ]
          ]);
        };

        test("static method", async () => {
          expect.assertions(3);

          expect(
            await Catalog.update("123", {
              inventory: { notes: null }
            })
          ).toBeUndefined();
          dbOperationAssertions();
        });

        test("instance method", async () => {
          expect.assertions(3);

          const updatedInstance = await instance.update({
            inventory: { notes: null }
          });

          expect(updatedInstance).toEqual({
            ...instance,
            inventory: { quantity: 100, location: "Aisle 3" },
            updatedAt: new Date("2023-10-16T03:31:35.918Z")
          });
          dbOperationAssertions();
        });
      });
    });

    describe("HasAndBelongsToMany - partial update propagates to related entity partitions", () => {
      const sponsor: MockTableEntityTableItem<Sponsor> = {
        PK: "Sponsor#123",
        SK: "Sponsor",
        Id: "123",
        Type: "Sponsor",
        Name: "Acme Corp",
        Inventory: { quantity: 500, location: "Booth A", notes: "Premium" },
        CreatedAt: "2023-01-01T00:00:00.000Z",
        UpdatedAt: "2023-01-02T00:00:00.000Z"
      };

      const instance = createInstance(Sponsor, {
        pk: "Sponsor#123" as PartitionKey,
        sk: "Sponsor" as SortKey,
        id: "123",
        type: "Sponsor",
        name: "Acme Corp",
        inventory: { quantity: 500, location: "Booth A", notes: "Premium" },
        createdAt: new Date("2023-01-01T00:00:00.000Z"),
        updatedAt: new Date("2023-01-02T00:00:00.000Z")
      });

      beforeEach(() => {
        const linkedFestival1: MockTableEntityTableItem<Festival> = {
          PK: sponsor.PK,
          SK: "Festival#456",
          Id: "456",
          Type: "Festival",
          Name: "Summer Fest",
          CreatedAt: "2023-01-03T00:00:00.000Z",
          UpdatedAt: "2023-01-04T00:00:00.000Z"
        };

        const linkedFestival2: MockTableEntityTableItem<Festival> = {
          PK: sponsor.PK,
          SK: "Festival#789",
          Id: "789",
          Type: "Festival",
          Name: "Winter Gala",
          CreatedAt: "2023-01-05T00:00:00.000Z",
          UpdatedAt: "2023-01-06T00:00:00.000Z"
        };

        mockQuery.mockResolvedValue({
          Items: [sponsor, linkedFestival1, linkedFestival2]
        });

        vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      });

      afterEach(() => {
        mockSend.mockReset();
        mockQuery.mockReset();
        mockTransactGetItems.mockReset();
      });

      describe("partial SET propagates to related partitions", () => {
        const dbOperationAssertions = (): void => {
          expect(mockSend.mock.calls).toEqual([
            [{ name: "QueryCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [
              {
                TransactItems: [
                  {
                    Update: {
                      TableName: "mock-table",
                      Key: {
                        PK: "Sponsor#123",
                        SK: "Sponsor"
                      },
                      UpdateExpression:
                        "SET #UpdatedAt = :UpdatedAt, #Inventory.#quantity = :Inventory_quantity",
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#Inventory": "Inventory",
                        "#UpdatedAt": "UpdatedAt",
                        "#quantity": "quantity"
                      },
                      ExpressionAttributeValues: {
                        ":Inventory_quantity": 1000,
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      }
                    }
                  },
                  {
                    // Denormalized Sponsor in Festival#456 partition (HABTM SK = "Sponsor#123")
                    Update: {
                      TableName: "mock-table",
                      Key: {
                        PK: "Festival#456",
                        SK: "Sponsor#123"
                      },
                      UpdateExpression:
                        "SET #UpdatedAt = :UpdatedAt, #Inventory.#quantity = :Inventory_quantity",
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#Inventory": "Inventory",
                        "#UpdatedAt": "UpdatedAt",
                        "#quantity": "quantity"
                      },
                      ExpressionAttributeValues: {
                        ":Inventory_quantity": 1000,
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      }
                    }
                  },
                  {
                    // Denormalized Sponsor in Festival#789 partition (HABTM SK = "Sponsor#123")
                    Update: {
                      TableName: "mock-table",
                      Key: {
                        PK: "Festival#789",
                        SK: "Sponsor#123"
                      },
                      UpdateExpression:
                        "SET #UpdatedAt = :UpdatedAt, #Inventory.#quantity = :Inventory_quantity",
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#Inventory": "Inventory",
                        "#UpdatedAt": "UpdatedAt",
                        "#quantity": "quantity"
                      },
                      ExpressionAttributeValues: {
                        ":Inventory_quantity": 1000,
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      }
                    }
                  }
                ]
              }
            ]
          ]);
        };

        test("static method", async () => {
          expect.assertions(3);

          expect(
            await Sponsor.update("123", {
              inventory: { quantity: 1000 }
            })
          ).toBeUndefined();
          dbOperationAssertions();
        });

        test("instance method", async () => {
          expect.assertions(3);

          const updatedInstance = await instance.update({
            inventory: { quantity: 1000 }
          });

          expect(updatedInstance).toEqual({
            ...instance,
            inventory: {
              quantity: 1000,
              location: "Booth A",
              notes: "Premium"
            },
            updatedAt: new Date("2023-10-16T03:31:35.918Z")
          });
          dbOperationAssertions();
        });
      });

      describe("REMOVE of nullable field propagates to related partitions", () => {
        const dbOperationAssertions = (): void => {
          expect(mockSend.mock.calls).toEqual([
            [{ name: "QueryCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [
              {
                TransactItems: [
                  {
                    Update: {
                      TableName: "mock-table",
                      Key: {
                        PK: "Sponsor#123",
                        SK: "Sponsor"
                      },
                      UpdateExpression:
                        "SET #UpdatedAt = :UpdatedAt REMOVE #Inventory.#notes",
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#Inventory": "Inventory",
                        "#UpdatedAt": "UpdatedAt",
                        "#notes": "notes"
                      },
                      ExpressionAttributeValues: {
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      }
                    }
                  },
                  {
                    // Denormalized Sponsor in Festival#456 partition
                    Update: {
                      TableName: "mock-table",
                      Key: {
                        PK: "Festival#456",
                        SK: "Sponsor#123"
                      },
                      UpdateExpression:
                        "SET #UpdatedAt = :UpdatedAt REMOVE #Inventory.#notes",
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#Inventory": "Inventory",
                        "#UpdatedAt": "UpdatedAt",
                        "#notes": "notes"
                      },
                      ExpressionAttributeValues: {
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      }
                    }
                  },
                  {
                    // Denormalized Sponsor in Festival#789 partition
                    Update: {
                      TableName: "mock-table",
                      Key: {
                        PK: "Festival#789",
                        SK: "Sponsor#123"
                      },
                      UpdateExpression:
                        "SET #UpdatedAt = :UpdatedAt REMOVE #Inventory.#notes",
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#Inventory": "Inventory",
                        "#UpdatedAt": "UpdatedAt",
                        "#notes": "notes"
                      },
                      ExpressionAttributeValues: {
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      }
                    }
                  }
                ]
              }
            ]
          ]);
        };

        test("static method", async () => {
          expect.assertions(3);

          expect(
            await Sponsor.update("123", {
              inventory: { notes: null }
            })
          ).toBeUndefined();
          dbOperationAssertions();
        });

        test("instance method", async () => {
          expect.assertions(3);

          const updatedInstance = await instance.update({
            inventory: { notes: null }
          });

          expect(updatedInstance).toEqual({
            ...instance,
            inventory: { quantity: 500, location: "Booth A" },
            updatedAt: new Date("2023-10-16T03:31:35.918Z")
          });
          dbOperationAssertions();
        });
      });
    });
  });

  describe("partial ObjectAttribute updates", () => {
    beforeEach(() => {
      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
    });

    describe("partial update of non-nullable ObjectAttribute - only provide some fields", () => {
      const dbOperationAssertions = (): void => {
        expect(mockSend.mock.calls).toEqual([
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockedQueryCommand.mock.calls).toEqual([]);
        expect(mockTransactGetCommand.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                {
                  Update: {
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeNames: {
                      "#UpdatedAt": "UpdatedAt",
                      "#objectAttribute": "objectAttribute",
                      "#name": "name",
                      "#email": "email"
                    },
                    ExpressionAttributeValues: {
                      ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                      ":objectAttribute_name": "NewName",
                      ":objectAttribute_email": "new@example.com"
                    },
                    Key: {
                      PK: "MyClassWithAllAttributeTypes#123",
                      SK: "MyClassWithAllAttributeTypes"
                    },
                    TableName: "mock-table",
                    UpdateExpression:
                      "SET #UpdatedAt = :UpdatedAt, #objectAttribute.#name = :objectAttribute_name, #objectAttribute.#email = :objectAttribute_email"
                  }
                }
              ]
            }
          ]
        ]);
      };

      test("static method", async () => {
        expect.assertions(5);

        expect(
          await MyClassWithAllAttributeTypes.update("123", {
            objectAttribute: {
              name: "NewName",
              email: "new@example.com"
            }
          })
        ).toBeUndefined();
        dbOperationAssertions();
      });

      test("instance method", async () => {
        expect.assertions(7);

        const instance = createInstance(MyClassWithAllAttributeTypes, {
          pk: "MyClassWithAllAttributeTypes#123" as PartitionKey,
          sk: "MyClassWithAllAttributeTypes" as SortKey,
          id: "123",
          type: "MyClassWithAllAttributeTypes",
          stringAttribute: "1",
          dateAttribute: new Date("2023-01-02"),
          foreignKeyAttribute: "11111" as ForeignKey<Customer>,
          boolAttribute: false,
          numberAttribute: 9,
          enumAttribute: "val-2",
          objectAttribute: {
            name: "Old",
            email: "old@example.com",
            tags: ["old-tag"],
            status: "active",
            createdDate: new Date("2023-01-01")
          },
          addressAttribute: {
            street: "123 Main St",
            city: "Springfield",
            geo: { lat: 1, lng: 2, accuracy: "precise" as const },
            scores: [95]
          },
          createdAt: new Date("2023-10-01"),
          updatedAt: new Date("2023-10-02")
        });

        const updatedInstance = await instance.update({
          objectAttribute: {
            name: "NewName",
            email: "new@example.com"
          }
        });

        expect(updatedInstance).toBeInstanceOf(MyClassWithAllAttributeTypes);

        // Full instance: non-ObjectAttribute fields unchanged, ObjectAttribute deep merged
        expect(updatedInstance).toEqual({
          pk: "MyClassWithAllAttributeTypes#123",
          sk: "MyClassWithAllAttributeTypes",
          id: "123",
          type: "MyClassWithAllAttributeTypes",
          stringAttribute: "1",
          dateAttribute: new Date("2023-01-02"),
          foreignKeyAttribute: "11111",
          boolAttribute: false,
          numberAttribute: 9,
          enumAttribute: "val-2",
          objectAttribute: {
            name: "NewName",
            email: "new@example.com",
            tags: ["old-tag"],
            status: "active",
            createdDate: new Date("2023-01-01")
          },
          addressAttribute: {
            street: "123 Main St",
            city: "Springfield",
            geo: { lat: 1, lng: 2, accuracy: "precise" },
            scores: [95]
          },
          createdAt: new Date("2023-10-01"),
          updatedAt: new Date("2023-10-16T03:31:35.918Z")
        });

        // Original instance is not mutated
        expect(instance.objectAttribute).toEqual({
          name: "Old",
          email: "old@example.com",
          tags: ["old-tag"],
          status: "active",
          createdDate: new Date("2023-01-01")
        });
        dbOperationAssertions();
      });
    });

    describe("partial update of nullable ObjectAttribute", () => {
      test("static method", async () => {
        expect.assertions(4);

        await MyClassWithAllAttributeTypes.update("123", {
          addressAttribute: {
            street: "New Street"
          }
        });

        expect(mockSend.mock.calls).toEqual([
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockedQueryCommand.mock.calls).toEqual([]);
        expect(mockTransactGetCommand.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                {
                  Update: {
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeNames: {
                      "#UpdatedAt": "UpdatedAt",
                      "#addressAttribute": "addressAttribute",
                      "#street": "street"
                    },
                    ExpressionAttributeValues: {
                      ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                      ":addressAttribute_street": "New Street"
                    },
                    Key: {
                      PK: "MyClassWithAllAttributeTypes#123",
                      SK: "MyClassWithAllAttributeTypes"
                    },
                    TableName: "mock-table",
                    UpdateExpression:
                      "SET #UpdatedAt = :UpdatedAt, #addressAttribute.#street = :addressAttribute_street"
                  }
                }
              ]
            }
          ]
        ]);
      });
    });

    describe("setting nullable field within ObjectAttribute to null generates REMOVE", () => {
      test("static method", async () => {
        expect.assertions(4);

        await MyClassWithAllAttributeTypes.update("123", {
          addressAttribute: {
            street: "123 Main St",
            zip: null,
            category: null
          }
        });

        expect(mockSend.mock.calls).toEqual([
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockedQueryCommand.mock.calls).toEqual([]);
        expect(mockTransactGetCommand.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                {
                  Update: {
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeNames: {
                      "#UpdatedAt": "UpdatedAt",
                      "#addressAttribute": "addressAttribute",
                      "#street": "street",
                      "#zip": "zip",
                      "#category": "category"
                    },
                    ExpressionAttributeValues: {
                      ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                      ":addressAttribute_street": "123 Main St"
                    },
                    Key: {
                      PK: "MyClassWithAllAttributeTypes#123",
                      SK: "MyClassWithAllAttributeTypes"
                    },
                    TableName: "mock-table",
                    UpdateExpression:
                      "SET #UpdatedAt = :UpdatedAt, #addressAttribute.#street = :addressAttribute_street REMOVE #addressAttribute.#zip, #addressAttribute.#category"
                  }
                }
              ]
            }
          ]
        ]);
      });
    });

    describe("non-nullable field within ObjectAttribute cannot be set to null", () => {
      test("static method", async () => {
        expect.assertions(3);

        try {
          await MyClassWithAllAttributeTypes.update("123", {
            addressAttribute: {
              street: null
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
              path: ["addressAttribute", "street"]
            }
          ]);
        }
      });
    });

    describe("nested object partial update generates deep document paths", () => {
      test("static method", async () => {
        expect.assertions(4);

        await MyClassWithAllAttributeTypes.update("123", {
          addressAttribute: {
            geo: {
              lat: 42
            }
          }
        });

        expect(mockSend.mock.calls).toEqual([
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockedQueryCommand.mock.calls).toEqual([]);
        expect(mockTransactGetCommand.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                {
                  Update: {
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeNames: {
                      "#UpdatedAt": "UpdatedAt",
                      "#addressAttribute": "addressAttribute",
                      "#geo": "geo",
                      "#lat": "lat"
                    },
                    ExpressionAttributeValues: {
                      ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                      ":addressAttribute_geo_lat": 42
                    },
                    Key: {
                      PK: "MyClassWithAllAttributeTypes#123",
                      SK: "MyClassWithAllAttributeTypes"
                    },
                    TableName: "mock-table",
                    UpdateExpression:
                      "SET #UpdatedAt = :UpdatedAt, #addressAttribute.#geo.#lat = :addressAttribute_geo_lat"
                  }
                }
              ]
            }
          ]
        ]);
      });
    });

    describe("array field within ObjectAttribute is full replacement", () => {
      test("static method", async () => {
        expect.assertions(4);

        await MyClassWithAllAttributeTypes.update("123", {
          addressAttribute: {
            scores: [100, 200, 300]
          }
        });

        expect(mockSend.mock.calls).toEqual([
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockedQueryCommand.mock.calls).toEqual([]);
        expect(mockTransactGetCommand.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                {
                  Update: {
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeNames: {
                      "#UpdatedAt": "UpdatedAt",
                      "#addressAttribute": "addressAttribute",
                      "#scores": "scores"
                    },
                    ExpressionAttributeValues: {
                      ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                      ":addressAttribute_scores": [100, 200, 300]
                    },
                    Key: {
                      PK: "MyClassWithAllAttributeTypes#123",
                      SK: "MyClassWithAllAttributeTypes"
                    },
                    TableName: "mock-table",
                    UpdateExpression:
                      "SET #UpdatedAt = :UpdatedAt, #addressAttribute.#scores = :addressAttribute_scores"
                  }
                }
              ]
            }
          ]
        ]);
      });
    });

    describe("setting non-nullable ObjectAttribute to null throws ValidationError", () => {
      test("static method", async () => {
        expect.assertions(3);

        try {
          await MyClassWithAllAttributeTypes.update("123", {
            objectAttribute: null
          } as any);
        } catch (e: any) {
          expect(e).toBeInstanceOf(ValidationError);
          expect(e.message).toEqual("Validation errors");
          expect(e.cause).toEqual([
            {
              code: "invalid_type",
              expected: "object",
              path: ["objectAttribute"],
              message: "Invalid input: expected object, received null"
            }
          ]);
        }
      });
    });

    describe("date field within ObjectAttribute is serialized to ISO string", () => {
      test("static method", async () => {
        expect.assertions(4);

        await MyClassWithAllAttributeTypes.update("123", {
          objectAttribute: {
            createdDate: new Date("2024-06-15T10:00:00.000Z")
          }
        });

        expect(mockSend.mock.calls).toEqual([
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockedQueryCommand.mock.calls).toEqual([]);
        expect(mockTransactGetCommand.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                {
                  Update: {
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeNames: {
                      "#UpdatedAt": "UpdatedAt",
                      "#objectAttribute": "objectAttribute",
                      "#createdDate": "createdDate"
                    },
                    ExpressionAttributeValues: {
                      ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                      ":objectAttribute_createdDate": "2024-06-15T10:00:00.000Z"
                    },
                    Key: {
                      PK: "MyClassWithAllAttributeTypes#123",
                      SK: "MyClassWithAllAttributeTypes"
                    },
                    TableName: "mock-table",
                    UpdateExpression:
                      "SET #UpdatedAt = :UpdatedAt, #objectAttribute.#createdDate = :objectAttribute_createdDate"
                  }
                }
              ]
            }
          ]
        ]);
      });
    });

    describe("enum field within ObjectAttribute is validated", () => {
      test("static method - invalid enum throws ValidationError", async () => {
        expect.assertions(3);

        try {
          await MyClassWithAllAttributeTypes.update("123", {
            addressAttribute: {
              geo: {
                accuracy: "bad-value"
              }
            }
          } as any);
        } catch (e: any) {
          expect(e).toBeInstanceOf(ValidationError);
          expect(e.message).toEqual("Validation errors");
          expect(e.cause).toEqual([
            {
              code: "invalid_value",
              message:
                'Invalid option: expected one of "precise"|"approximate"',
              values: ["precise", "approximate"],
              path: ["addressAttribute", "geo", "accuracy"]
            }
          ]);
        }
      });
    });

    describe("deeply nested enum field update generates correct document path", () => {
      test("static method", async () => {
        expect.assertions(4);

        await MyClassWithAllAttributeTypes.update("123", {
          addressAttribute: {
            geo: {
              accuracy: "approximate"
            }
          }
        });

        expect(mockSend.mock.calls).toEqual([
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockedQueryCommand.mock.calls).toEqual([]);
        expect(mockTransactGetCommand.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                {
                  Update: {
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeNames: {
                      "#UpdatedAt": "UpdatedAt",
                      "#addressAttribute": "addressAttribute",
                      "#geo": "geo",
                      "#accuracy": "accuracy"
                    },
                    ExpressionAttributeValues: {
                      ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                      ":addressAttribute_geo_accuracy": "approximate"
                    },
                    Key: {
                      PK: "MyClassWithAllAttributeTypes#123",
                      SK: "MyClassWithAllAttributeTypes"
                    },
                    TableName: "mock-table",
                    UpdateExpression:
                      "SET #UpdatedAt = :UpdatedAt, #addressAttribute.#geo.#accuracy = :addressAttribute_geo_accuracy"
                  }
                }
              ]
            }
          ]
        ]);
      });
    });

    describe("wrong field types within ObjectAttribute throw ValidationError", () => {
      test("static method", async () => {
        expect.assertions(3);

        try {
          await MyClassWithAllAttributeTypes.update("123", {
            addressAttribute: {
              street: 123
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
            }
          ]);
        }
      });
    });

    describe("mixed SET and REMOVE across root-level and nested nullable attributes", () => {
      const dbOperationAssertions = (): void => {
        expect(mockSend.mock.calls).toEqual([
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockedQueryCommand.mock.calls).toEqual([]);
        expect(mockTransactGetCommand.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                {
                  Update: {
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeNames: {
                      "#UpdatedAt": "UpdatedAt",
                      "#stringAttribute": "stringAttribute",
                      "#nullableStringAttribute": "nullableStringAttribute",
                      "#addressAttribute": "addressAttribute",
                      "#street": "street",
                      "#zip": "zip",
                      "#category": "category"
                    },
                    ExpressionAttributeValues: {
                      ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                      ":stringAttribute": "updated-val",
                      ":addressAttribute_street": "New Street"
                    },
                    Key: {
                      PK: "MyClassWithAllAttributeTypes#123",
                      SK: "MyClassWithAllAttributeTypes"
                    },
                    TableName: "mock-table",
                    UpdateExpression:
                      "SET #stringAttribute = :stringAttribute, #UpdatedAt = :UpdatedAt, " +
                      "#addressAttribute.#street = :addressAttribute_street " +
                      "REMOVE #nullableStringAttribute, " +
                      "#addressAttribute.#zip, #addressAttribute.#category"
                  }
                }
              ]
            }
          ]
        ]);
      };

      test("static method", async () => {
        expect.assertions(4);

        await MyClassWithAllAttributeTypes.update("123", {
          stringAttribute: "updated-val",
          nullableStringAttribute: null,
          addressAttribute: {
            street: "New Street",
            zip: null,
            category: null
          }
        });

        dbOperationAssertions();
      });

      test("instance method", async () => {
        expect.assertions(4);

        const instance = createInstance(MyClassWithAllAttributeTypes, {
          pk: "MyClassWithAllAttributeTypes#123" as PartitionKey,
          sk: "MyClassWithAllAttributeTypes" as SortKey,
          id: "123",
          type: "MyClassWithAllAttributeTypes",
          stringAttribute: "old-val",
          dateAttribute: new Date("2023-01-02"),
          foreignKeyAttribute: "11111" as ForeignKey<Customer>,
          boolAttribute: false,
          numberAttribute: 9,
          enumAttribute: "val-2",
          objectAttribute: {
            name: "Test",
            email: "test@example.com",
            tags: ["tag"],
            status: "active",
            createdDate: new Date("2023-01-01")
          },
          nullableStringAttribute: "will-be-removed",
          addressAttribute: {
            street: "Old Street",
            city: "Old City",
            zip: 12345,
            geo: { lat: 1, lng: 2, accuracy: "precise" as const },
            scores: [10],
            category: "home" as const
          },
          createdAt: new Date("2023-10-01"),
          updatedAt: new Date("2023-10-02")
        });

        await instance.update({
          stringAttribute: "updated-val",
          nullableStringAttribute: null,
          addressAttribute: {
            street: "New Street",
            zip: null,
            category: null
          }
        });

        dbOperationAssertions();
      });
    });

    describe("duplicate field names across nested objects and root attribute", () => {
      test("generates unique document path expressions for each nested path", async () => {
        expect.assertions(5);

        await DuplicateFieldEntity.update("123", {
          name: "root-name",
          duplicateFieldObj: {
            name: "top-level-obj-name",
            nested1: { name: "nested1-name", value: 10 },
            nested2: { name: "nested2-name", value: 20 }
          }
        });

        expect(mockSend.mock.calls).toEqual([
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockedQueryCommand.mock.calls).toEqual([]);
        expect(mockTransactGetCommand.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                {
                  Update: {
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeNames: {
                      "#Name": "Name",
                      "#UpdatedAt": "UpdatedAt",
                      "#DuplicateFieldObj": "DuplicateFieldObj",
                      "#name": "name",
                      "#nested1": "nested1",
                      "#nested2": "nested2",
                      "#value": "value"
                    },
                    ExpressionAttributeValues: {
                      ":Name": "root-name",
                      ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                      ":DuplicateFieldObj_name": "top-level-obj-name",
                      ":DuplicateFieldObj_nested1_name": "nested1-name",
                      ":DuplicateFieldObj_nested1_value": 10,
                      ":DuplicateFieldObj_nested2_name": "nested2-name",
                      ":DuplicateFieldObj_nested2_value": 20
                    },
                    Key: {
                      PK: "DuplicateFieldEntity#123",
                      SK: "DuplicateFieldEntity"
                    },
                    TableName: "mock-table",
                    UpdateExpression:
                      "SET #Name = :Name, #UpdatedAt = :UpdatedAt, " +
                      "#DuplicateFieldObj.#name = :DuplicateFieldObj_name, " +
                      "#DuplicateFieldObj.#nested1.#name = :DuplicateFieldObj_nested1_name, " +
                      "#DuplicateFieldObj.#nested1.#value = :DuplicateFieldObj_nested1_value, " +
                      "#DuplicateFieldObj.#nested2.#name = :DuplicateFieldObj_nested2_name, " +
                      "#DuplicateFieldObj.#nested2.#value = :DuplicateFieldObj_nested2_value"
                  }
                }
              ]
            }
          ]
        ]);

        const updateCmd =
          mockTransactWriteCommand.mock.calls[0]?.[0]?.TransactItems?.[0]
            ?.Update;
        expect(
          updateCmd?.ExpressionAttributeValues?.[
            ":DuplicateFieldObj_nested1_name"
          ]
        ).not.toEqual(
          updateCmd?.ExpressionAttributeValues?.[
            ":DuplicateFieldObj_nested2_name"
          ]
        );
      });
    });

    describe("instance method deep merges ObjectAttribute values", () => {
      test("preserves existing fields when updating a subset", async () => {
        expect.assertions(4);

        const instance = createInstance(MyClassWithAllAttributeTypes, {
          pk: "MyClassWithAllAttributeTypes#123" as PartitionKey,
          sk: "MyClassWithAllAttributeTypes" as SortKey,
          id: "123",
          type: "MyClassWithAllAttributeTypes",
          stringAttribute: "1",
          dateAttribute: new Date("2023-01-02"),
          foreignKeyAttribute: "11111" as ForeignKey<Customer>,
          boolAttribute: false,
          numberAttribute: 9,
          enumAttribute: "val-2",
          objectAttribute: {
            name: "Old",
            email: "old@example.com",
            tags: ["old-tag"],
            status: "active",
            createdDate: new Date("2023-01-01")
          },
          addressAttribute: {
            street: "Old Street",
            city: "Old City",
            zip: 12345,
            geo: { lat: 1, lng: 2, accuracy: "precise" as const },
            scores: [10, 20]
          },
          createdAt: new Date("2023-10-01"),
          updatedAt: new Date("2023-10-02")
        });

        const updatedInstance = await instance.update({
          addressAttribute: {
            street: "New Street",
            zip: null
          }
        });

        // Deep merge: street updated, zip removed, other fields preserved
        expect(updatedInstance.addressAttribute).toEqual({
          street: "New Street",
          city: "Old City",
          geo: { lat: 1, lng: 2, accuracy: "precise" },
          scores: [10, 20]
        });
        expect(updatedInstance).toBeInstanceOf(MyClassWithAllAttributeTypes);

        // Original instance is not mutated
        expect(instance.addressAttribute).toEqual({
          street: "Old Street",
          city: "Old City",
          zip: 12345,
          geo: { lat: 1, lng: 2, accuracy: "precise" },
          scores: [10, 20]
        });

        // Nested object deep merge
        const updatedInstance2 = await instance.update({
          addressAttribute: {
            geo: { lat: 99 }
          }
        });

        expect(updatedInstance2.addressAttribute).toEqual({
          street: "Old Street",
          city: "Old City",
          zip: 12345,
          geo: { lat: 99, lng: 2, accuracy: "precise" },
          scores: [10, 20]
        });
      });
    });

    describe("removing all nullable fields from deeply nested object leaves nested objects as empty objects", () => {
      test("static method", async () => {
        expect.assertions(4);

        await DeepNestedEntity.update("123", {
          data: {
            level1: {
              value: null,
              tag: null,
              level2: {
                score: null,
                note: null,
                level3: {
                  flag: null,
                  detail: null
                }
              }
            }
          }
        });

        expect(mockSend.mock.calls).toEqual([
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockedQueryCommand.mock.calls).toEqual([]);
        expect(mockTransactGetCommand.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                {
                  Update: {
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeNames: {
                      "#UpdatedAt": "UpdatedAt",
                      "#Data": "Data",
                      "#level1": "level1",
                      "#value": "value",
                      "#tag": "tag",
                      "#level2": "level2",
                      "#score": "score",
                      "#note": "note",
                      "#level3": "level3",
                      "#flag": "flag",
                      "#detail": "detail"
                    },
                    ExpressionAttributeValues: {
                      ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                    },
                    Key: {
                      PK: "DeepNestedEntity#123",
                      SK: "DeepNestedEntity"
                    },
                    TableName: "mock-table",
                    UpdateExpression:
                      "SET #UpdatedAt = :UpdatedAt " +
                      "REMOVE #Data.#level1.#value, #Data.#level1.#tag, " +
                      "#Data.#level1.#level2.#score, #Data.#level1.#level2.#note, " +
                      "#Data.#level1.#level2.#level3.#flag, #Data.#level1.#level2.#level3.#detail"
                  }
                }
              ]
            }
          ]
        ]);
      });
    });

    describe("updating deeply nested object with nullable fields omitted", () => {
      test("static method - partial update with only required label", async () => {
        expect.assertions(4);

        await DeepNestedEntity.update("123", {
          data: {
            label: "updated-label"
          }
        });

        expect(mockSend.mock.calls).toEqual([
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockedQueryCommand.mock.calls).toEqual([]);
        expect(mockTransactGetCommand.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                {
                  Update: {
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeNames: {
                      "#UpdatedAt": "UpdatedAt",
                      "#Data": "Data",
                      "#label": "label"
                    },
                    ExpressionAttributeValues: {
                      ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                      ":Data_label": "updated-label"
                    },
                    Key: {
                      PK: "DeepNestedEntity#123",
                      SK: "DeepNestedEntity"
                    },
                    TableName: "mock-table",
                    UpdateExpression:
                      "SET #UpdatedAt = :UpdatedAt, #Data.#label = :Data_label"
                  }
                }
              ]
            }
          ]
        ]);
      });
    });

    describe("array of objects full replacement on update", () => {
      test("replaces entire array of objects with new array", async () => {
        expect.assertions(4);

        await ArrayOfObjectsEntity.update("123", {
          data: {
            entries: [{ sku: "C3", price: 30 }]
          }
        });

        expect(mockSend.mock.calls).toEqual([
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockedQueryCommand.mock.calls).toEqual([]);
        expect(mockTransactGetCommand.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                {
                  Update: {
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeNames: {
                      "#UpdatedAt": "UpdatedAt",
                      "#Data": "Data",
                      "#entries": "entries"
                    },
                    ExpressionAttributeValues: {
                      ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                      ":Data_entries": [{ sku: "C3", price: 30 }]
                    },
                    Key: {
                      PK: "ArrayOfObjectsEntity#123",
                      SK: "ArrayOfObjectsEntity"
                    },
                    TableName: "mock-table",
                    UpdateExpression:
                      "SET #UpdatedAt = :UpdatedAt, #Data.#entries = :Data_entries"
                  }
                }
              ]
            }
          ]
        ]);
      });
    });

    describe("nullable array of objects can be removed via null", () => {
      test("generates REMOVE for nullable array field set to null", async () => {
        expect.assertions(4);

        await ArrayOfObjectsEntity.update("123", {
          data: {
            backup: null
          }
        });

        expect(mockSend.mock.calls).toEqual([
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockedQueryCommand.mock.calls).toEqual([]);
        expect(mockTransactGetCommand.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                {
                  Update: {
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeNames: {
                      "#UpdatedAt": "UpdatedAt",
                      "#Data": "Data",
                      "#backup": "backup"
                    },
                    ExpressionAttributeValues: {
                      ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                    },
                    Key: {
                      PK: "ArrayOfObjectsEntity#123",
                      SK: "ArrayOfObjectsEntity"
                    },
                    TableName: "mock-table",
                    UpdateExpression:
                      "SET #UpdatedAt = :UpdatedAt REMOVE #Data.#backup"
                  }
                }
              ]
            }
          ]
        ]);
      });
    });
  });

  describe("referentialIntegrityCheck option", () => {
    describe("with referentialIntegrityCheck: false", () => {
      describe("can update all attribute types", () => {
        const dbOperationAssertions = (): void => {
          expect(mockSend.mock.calls).toEqual([
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockedQueryCommand.mock.calls).toEqual([]);
          expect(mockTransactGetCommand.mock.calls).toEqual([]);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [
              {
                TransactItems: [
                  {
                    Update: {
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#UpdatedAt": "UpdatedAt",
                        "#boolAttribute": "boolAttribute",
                        "#createdDate": "createdDate",
                        "#dateAttribute": "dateAttribute",
                        "#email": "email",
                        "#enumAttribute": "enumAttribute",
                        "#foreignKeyAttribute": "foreignKeyAttribute",
                        "#name": "name",
                        "#nullableBoolAttribute": "nullableBoolAttribute",
                        "#nullableDateAttribute": "nullableDateAttribute",
                        "#nullableEnumAttribute": "nullableEnumAttribute",
                        "#nullableForeignKeyAttribute":
                          "nullableForeignKeyAttribute",
                        "#nullableNumberAttribute": "nullableNumberAttribute",
                        "#nullableStringAttribute": "nullableStringAttribute",
                        "#numberAttribute": "numberAttribute",
                        "#objectAttribute": "objectAttribute",
                        "#status": "status",
                        "#stringAttribute": "stringAttribute",
                        "#tags": "tags"
                      },
                      ExpressionAttributeValues: {
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                        ":boolAttribute": true,
                        ":dateAttribute": "2023-10-16T03:31:35.918Z",
                        ":enumAttribute": "val-1",
                        ":foreignKeyAttribute": "1111",
                        ":nullableBoolAttribute": false,
                        ":nullableDateAttribute": "2023-10-16T03:31:35.918Z",
                        ":nullableEnumAttribute": "val-2",
                        ":nullableForeignKeyAttribute": "22222",
                        ":nullableNumberAttribute": 10,
                        ":nullableStringAttribute": "2",
                        ":numberAttribute": 9,
                        ":objectAttribute_createdDate":
                          "2023-10-16T03:31:35.918Z",
                        ":objectAttribute_email": "john@example.com",
                        ":objectAttribute_name": "John",
                        ":objectAttribute_status": "active",
                        ":objectAttribute_tags": ["work", "vip"],
                        ":stringAttribute": "1"
                      },
                      Key: {
                        PK: "MyClassWithAllAttributeTypes#123",
                        SK: "MyClassWithAllAttributeTypes"
                      },
                      TableName: "mock-table",
                      UpdateExpression:
                        "SET #stringAttribute = :stringAttribute, #nullableStringAttribute = :nullableStringAttribute, #dateAttribute = :dateAttribute, #nullableDateAttribute = :nullableDateAttribute, #boolAttribute = :boolAttribute, #nullableBoolAttribute = :nullableBoolAttribute, #numberAttribute = :numberAttribute, #nullableNumberAttribute = :nullableNumberAttribute, #foreignKeyAttribute = :foreignKeyAttribute, #nullableForeignKeyAttribute = :nullableForeignKeyAttribute, #enumAttribute = :enumAttribute, #nullableEnumAttribute = :nullableEnumAttribute, #UpdatedAt = :UpdatedAt, #objectAttribute.#name = :objectAttribute_name, #objectAttribute.#email = :objectAttribute_email, #objectAttribute.#tags = :objectAttribute_tags, #objectAttribute.#status = :objectAttribute_status, #objectAttribute.#createdDate = :objectAttribute_createdDate"
                    }
                  }
                ]
              }
            ]
          ]);
        };

        beforeEach(() => {
          vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
        });

        test("static method", async () => {
          expect.assertions(5);

          expect(
            await MyClassWithAllAttributeTypes.update(
              "123",
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
                }
              },
              { referentialIntegrityCheck: false }
            )
          ).toBeUndefined();
          dbOperationAssertions();
        });

        test("instance method", async () => {
          expect.assertions(7);

          const instance = createInstance(MyClassWithAllAttributeTypes, {
            pk: "MyClassWithAllAttributeTypes#123" as PartitionKey,
            sk: "MyClassWithAllAttributeTypes" as SortKey,
            id: "123",
            type: "MyClassWithAllAttributeTypes",
            stringAttribute: "old-1",
            nullableStringAttribute: "old-2",
            dateAttribute: new Date("2023-01-02"),
            nullableDateAttribute: new Date(),
            foreignKeyAttribute: "old-1111" as ForeignKey<Customer>,
            nullableForeignKeyAttribute:
              "old-2222" as NullableForeignKey<Customer>,
            boolAttribute: false,
            nullableBoolAttribute: true,
            numberAttribute: 9,
            nullableNumberAttribute: 8,
            enumAttribute: "val-2",
            nullableEnumAttribute: "val-1",
            objectAttribute: {
              name: "Old",
              email: "old@example.com",
              tags: ["old-tag"],
              status: "active",
              createdDate: new Date()
            },
            addressAttribute: {
              street: "123 Main St",
              city: "Springfield",
              geo: { lat: 1, lng: 2, accuracy: "precise" as const },
              scores: [95]
            },
            createdAt: new Date("2023-10-01"),
            updatedAt: new Date("2023-10-02")
          });

          const updatedInstance = await instance.update(
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
              }
            },
            { referentialIntegrityCheck: false }
          );

          expect(updatedInstance).toEqual({
            ...instance,
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
            updatedAt: new Date("2023-10-16T03:31:35.918Z")
          });
          expect(updatedInstance).toBeInstanceOf(MyClassWithAllAttributeTypes);
          // Assert original instance is not mutated
          expect(instance).toEqual({
            pk: "MyClassWithAllAttributeTypes#123",
            sk: "MyClassWithAllAttributeTypes",
            id: "123",
            type: "MyClassWithAllAttributeTypes",
            stringAttribute: "old-1",
            nullableStringAttribute: "old-2",
            dateAttribute: new Date("2023-01-02"),
            nullableDateAttribute: new Date(),
            foreignKeyAttribute: "old-1111",
            nullableForeignKeyAttribute: "old-2222",
            boolAttribute: false,
            nullableBoolAttribute: true,
            numberAttribute: 9,
            nullableNumberAttribute: 8,
            enumAttribute: "val-2",
            nullableEnumAttribute: "val-1",
            objectAttribute: {
              name: "Old",
              email: "old@example.com",
              tags: ["old-tag"],
              status: "active",
              createdDate: new Date()
            },
            addressAttribute: {
              street: "123 Main St",
              city: "Springfield",
              geo: { lat: 1, lng: 2, accuracy: "precise" },
              scores: [95]
            },
            createdAt: new Date("2023-10-01"),
            updatedAt: new Date("2023-10-02")
          });
          dbOperationAssertions();
        });
      });
    });
  });

  describe("types", () => {
    beforeAll(() => {
      // For type tests mock the operations to nothing because we are just testing for the type interface
      mockQuery.mockResolvedValue({
        Items: []
      });

      mockTransactGetItems.mockResolvedValue({
        Responses: []
      });
    });

    afterAll(() => {
      mockSend.mockReset();
      mockQuery.mockReset();
      mockTransactGetItems.mockReset();
    });

    describe("static method", () => {
      it("will not accept relationship attributes on update", async () => {
        await Order.update("123", {
          orderDate: new Date(),
          paymentMethodId: "123",
          customerId: "456",
          // @ts-expect-error relationship attributes are not allowed
          customer: new Customer()
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("will not accept function attributes on update", async () => {
        @Entity
        class MyModel extends MockTable {
          declare readonly type: "MyModel";

          @StringAttribute({ alias: "MyAttribute" })
          public myAttribute: string;

          public someMethod(): string {
            return "abc123";
          }
        }

        // check that built in instance method is not allowed
        await MyModel.update("123", {
          myAttribute: "someVal",
          // @ts-expect-error function attributes are not allowed
          update: () => "123"
        });

        // check that custom instance method is not allowed
        await MyModel.update("123", {
          myAttribute: "someVal",
          // @ts-expect-error function attributes are not allowed
          someMethod: () => "123"
        });
      });

      it("will allow ForeignKey attributes to be passed at their inferred type without casting to type ForeignKey", async () => {
        await Order.update("123", {
          orderDate: new Date(),
          // @ts-expect-no-error ForeignKey is of type string so it can be passed as such without casing to ForeignKey
          paymentMethodId: "123",
          // @ts-expect-no-error ForeignKey is of type string so it can be passed as such without casing to ForeignKey
          customerId: "456"
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("will not accept DefaultFields on update because they are managed by dyna-record", async () => {
        await Order.update("123", {
          // @ts-expect-error default fields are not accepted on update, they are managed by dyna-record
          id: "123"
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Order.update("123", {
          // @ts-expect-error default fields are not accepted on update, they are managed by dyna-record
          type: "456"
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Order.update("123", {
          // @ts-expect-error default fields are not accepted on update, they are managed by dyna-record
          createdAt: new Date()
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Order.update("123", {
          // @ts-expect-error default fields are not accepted on update, they are managed by dyna-record
          updatedAt: new Date()
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("will not accept partition and sort keys on update because they are managed by dyna-record", async () => {
        await Order.update("123", {
          // @ts-expect-error primary key fields are not accepted on update, they are managed by dyna-record
          pk: "123"
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Order.update("123", {
          // @ts-expect-error sort key fields are not accepted on update, they are managed by dyna-record
          sk: "456"
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("does not require all of an entity attributes to be passed", async () => {
        await Order.update("123", {
          // @ts-expect-no-error ForeignKey is of type string so it can be passed as such without casing to ForeignKey
          paymentMethodId: "123",
          // @ts-expect-no-error ForeignKey is of type string so it can be passed as such without casing to ForeignKey
          customerId: "456"
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("will not allow non nullable attributes to be removed (set to null)", async () => {
        expect.assertions(3);

        // Tests that the type system does not allow null, and also that if types are ignored the value is checked at runtime
        await Order.update("123", {
          // @ts-expect-error non-nullable fields cannot be removed (set to null)
          paymentMethodId: null
        }).catch(e => {
          expect(e).toBeInstanceOf(ValidationError);
          expect(e.message).toEqual("Validation errors");
          expect(e.cause).toEqual([
            {
              code: "invalid_type",
              expected: "string",
              message: "Invalid input: expected string, received null",
              path: ["paymentMethodId"]
            }
          ]);
        });
      });

      it("will allow nullable attributes to be removed (set to null)", async () => {
        await MyModelNullableAttribute.update("123", {
          // @ts-expect-no-error non-nullable fields can be removed (set to null)
          myAttribute: null
        });
      });

      it("will accept referentialIntegrityCheck option", async () => {
        await Order.update(
          "123",
          {
            orderDate: new Date(),
            paymentMethodId: "123",
            customerId: "456"
          },
          // @ts-expect-no-error referentialIntegrityCheck option is accepted
          { referentialIntegrityCheck: false }
        ).catch(() => {
          Logger.log("Testing types");
        });

        await Order.update(
          "123",
          {
            orderDate: new Date(),
            paymentMethodId: "123",
            customerId: "456"
          },
          // @ts-expect-no-error referentialIntegrityCheck option is optional
          { referentialIntegrityCheck: true }
        ).catch(() => {
          Logger.log("Testing types");
        });

        await Order.update(
          "123",
          {
            orderDate: new Date(),
            paymentMethodId: "123",
            customerId: "456"
          }
          // @ts-expect-no-error options parameter is optional
        ).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("will not accept invalid options", async () => {
        await Order.update(
          "123",
          {
            orderDate: new Date(),
            paymentMethodId: "123",
            customerId: "456"
          },
          {
            // @ts-expect-error invalid option property
            invalidOption: true
          }
        ).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("objectAttribute accepts the correct shape", async () => {
        await MyClassWithAllAttributeTypes.update("123", {
          // @ts-expect-no-error: correct object shape is accepted
          objectAttribute: {
            name: "John",
            email: "john@example.com",
            tags: ["work"],
            status: "active",
            createdDate: new Date()
          }
        });
      });

      it("objectAttribute does not accept wrong types for string fields", async () => {
        await MyClassWithAllAttributeTypes.update("123", {
          objectAttribute: {
            // @ts-expect-error: name must be a string, not number
            name: 123,
            email: "john@example.com",
            tags: ["work"],
            status: "active",
            createdDate: new Date()
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("objectAttribute does not accept wrong types for array fields", async () => {
        await MyClassWithAllAttributeTypes.update("123", {
          objectAttribute: {
            name: "John",
            email: "john@example.com",
            // @ts-expect-error: tags must be string[], not string
            tags: "not-array",
            createdDate: new Date()
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("objectAttribute does not accept wrong item types in arrays", async () => {
        await MyClassWithAllAttributeTypes.update("123", {
          objectAttribute: {
            name: "John",
            email: "john@example.com",
            // @ts-expect-error: tags must be string[], not number[]
            tags: [123, 456],
            createdDate: new Date()
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("objectAttribute accepts partial fields for updates", async () => {
        await MyClassWithAllAttributeTypes.update("123", {
          // @ts-expect-no-error: partial updates allow omitting required fields
          objectAttribute: {
            name: "John"
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("objectAttribute does not accept extra fields", async () => {
        await MyClassWithAllAttributeTypes.update("123", {
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

      it("addressAttribute accepts correct nested object shape", async () => {
        await MyClassWithAllAttributeTypes.update("123", {
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
        await MyClassWithAllAttributeTypes.update("123", {
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
        await MyClassWithAllAttributeTypes.update("123", {
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
        await MyClassWithAllAttributeTypes.update("123", {
          // @ts-expect-no-error: zip is nullable so it can be omitted
          addressAttribute: {
            zip: undefined,
            street: "123 Main St",
            city: "Springfield",
            geo: { lat: 1, lng: 2, accuracy: "precise" },
            scores: [95]
          }
        });
      });

      it("addressAttribute allows nullable fields to be null for updates", async () => {
        await MyClassWithAllAttributeTypes.update("123", {
          addressAttribute: {
            street: "123 Main St",
            city: "Springfield",
            // @ts-expect-no-error: zip is nullable, null is allowed for updates (consistent with root-level nullable attributes)
            zip: null,
            geo: { lat: 1, lng: 2, accuracy: "precise" },
            scores: [95]
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("addressAttribute does not allow non-nullable fields to be null", async () => {
        await MyClassWithAllAttributeTypes.update("123", {
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

      it("addressAttribute accepts partial nested fields for updates", async () => {
        await MyClassWithAllAttributeTypes.update("123", {
          addressAttribute: {
            street: "123 Main St",
            city: "Springfield",
            // @ts-expect-no-error: partial updates allow omitting nested required fields
            geo: { lat: 1 },
            scores: [95]
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });
      describe("a nullable field inside a list element", () => {
        it("can be null, like a nullable field anywhere else in an update", async () => {
          await MyClassWithAllAttributeTypes.update("123", {
            objectAttribute: {
              history: [
                {
                  at: new Date(),
                  actor: "buyer",
                  // @ts-expect-no-error: note is nullable, null is allowed for updates (the element is stored without it)
                  note: null
                }
              ]
            }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("can be null in a list inside a nested object, in an object inside the element and in a list inside the element", async () => {
          await NestedListsEntity.update("123", {
            layout: {
              section: {
                entries: [
                  {
                    sku: "sku-1",
                    // @ts-expect-no-error: note is nullable, null is allowed in a list nested in an object
                    note: null,
                    // @ts-expect-no-error: bin is nullable, null is allowed in an object inside a list element
                    placement: { aisle: "A1", bin: null },
                    // @ts-expect-no-error: note is nullable, null is allowed in a list inside a list element
                    restocks: [{ at: new Date(), note: null }]
                  }
                ]
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("can be null in a discriminated union variant inside a list", async () => {
          await ArrayOfUnionsEntity.update("123", {
            dashboard: {
              widgets: [
                {
                  type: "metric-card",
                  label: "Revenue",
                  value: 500,
                  format: "currency",
                  // @ts-expect-no-error: trend is nullable in the metric-card variant, null is allowed
                  trend: null
                },
                {
                  type: "date-marker",
                  date: new Date(),
                  // @ts-expect-no-error: label is nullable in the date-marker variant, null is allowed
                  label: null
                }
              ]
            }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("does not allow a non-nullable field inside a list element to be null", async () => {
          await MyClassWithAllAttributeTypes.update("123", {
            objectAttribute: {
              history: [
                {
                  at: new Date(),
                  // @ts-expect-error: actor is non-nullable, cannot be null
                  actor: null
                }
              ]
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await NestedListsEntity.update("123", {
            layout: {
              section: {
                entries: [
                  {
                    // @ts-expect-error: sku is non-nullable, cannot be null
                    sku: null,
                    // @ts-expect-error: aisle is non-nullable, cannot be null
                    placement: { aisle: null },
                    // @ts-expect-error: at is non-nullable, cannot be null
                    restocks: [{ at: null }]
                  }
                ]
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await ArrayOfUnionsEntity.update("123", {
            dashboard: {
              widgets: [
                {
                  type: "metric-card",
                  label: "Revenue",
                  // @ts-expect-error: value is non-nullable in the metric-card variant, cannot be null
                  value: null,
                  format: "currency"
                }
              ]
            }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("does not allow the element itself to be null", async () => {
          await MyClassWithAllAttributeTypes.update("123", {
            objectAttribute: {
              // @ts-expect-error: list elements are not nullable
              history: [null]
            }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("does not accept wrong types for a nullable field inside a list element", async () => {
          await MyClassWithAllAttributeTypes.update("123", {
            objectAttribute: {
              history: [
                {
                  at: new Date(),
                  actor: "buyer",
                  // @ts-expect-error: note is a string
                  note: 1
                }
              ]
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await NestedListsEntity.update("123", {
            layout: {
              section: {
                entries: [
                  {
                    sku: "sku-1",
                    // @ts-expect-error: bin is a string
                    placement: { aisle: "A1", bin: 2 },
                    // @ts-expect-error: note is a string
                    restocks: [{ at: new Date(), note: false }]
                  }
                ]
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await ArrayOfUnionsEntity.update("123", {
            dashboard: {
              widgets: [
                {
                  type: "metric-card",
                  label: "Revenue",
                  value: 500,
                  format: "currency",
                  // @ts-expect-error: "sideways" is not a trend value
                  trend: "sideways"
                }
              ]
            }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("still requires every non-nullable field of an element, since a list is replaced whole", async () => {
          await MyClassWithAllAttributeTypes.update("123", {
            objectAttribute: {
              // @ts-expect-error: at is required in each element (lists are replaced whole, never merged)
              history: [{ actor: "buyer", note: null }]
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await NestedListsEntity.update("123", {
            layout: {
              section: {
                entries: [
                  {
                    sku: "sku-1",
                    // @ts-expect-error: aisle is required in an object inside an element
                    placement: { bin: null },
                    restocks: []
                  }
                ]
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });
      });
    });

    describe("instance method", () => {
      it("will not accept relationship attributes on update", async () => {
        const instance = new Order();

        await instance
          .update({
            orderDate: new Date(),
            paymentMethodId: "123",
            customerId: "456",
            // @ts-expect-error relationship attributes are not allowed
            customer: new Customer()
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("will not accept function attributes on update", async () => {
        @Entity
        class MyModel extends MockTable {
          declare readonly type: "MyModel";

          @StringAttribute({ alias: "MyAttribute" })
          public myAttribute: string;

          public someMethod(): string {
            return "abc123";
          }
        }

        const instance = new MyModel();

        // check that built in instance method is not allowed
        await instance.update({
          myAttribute: "someVal",
          // @ts-expect-error function attributes are not allowed
          update: () => "123"
        });

        // check that custom instance method is not allowed
        await instance.update({
          myAttribute: "someVal",
          // @ts-expect-error function attributes are not allowed
          someMethod: () => "123"
        });
      });

      it("will allow ForeignKey attributes to be passed at their inferred type without casting to type ForeignKey", async () => {
        const instance = new Order();

        await instance
          .update({
            orderDate: new Date(),
            // @ts-expect-no-error ForeignKey is of type string so it can be passed as such without casing to ForeignKey
            paymentMethodId: "123",
            // @ts-expect-no-error ForeignKey is of type string so it can be passed as such without casing to ForeignKey
            customerId: "456"
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("will not accept DefaultFields on update because they are managed by dyna-record", async () => {
        const instance = new Order();

        await instance
          .update({
            // @ts-expect-error default fields are not accepted on update, they are managed by dyna-record
            id: "123"
          })
          .catch(() => {
            Logger.log("Testing types");
          });

        await instance
          .update({
            // @ts-expect-error default fields are not accepted on update, they are managed by dyna-record
            type: "456"
          })
          .catch(() => {
            Logger.log("Testing types");
          });

        await instance
          .update({
            // @ts-expect-error default fields are not accepted on update, they are managed by dyna-record
            createdAt: new Date()
          })
          .catch(() => {
            Logger.log("Testing types");
          });

        await instance
          .update({
            // @ts-expect-error default fields are not accepted on update, they are managed by dyna-record
            updatedAt: new Date()
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("will not accept partition and sort keys on update because they are managed by dyna-record", async () => {
        const instance = new Order();

        await instance
          .update({
            // @ts-expect-error primary key fields are not accepted on update, they are managed by dyna-record
            pk: "123"
          })
          .catch(() => {
            Logger.log("Testing types");
          });

        await instance
          .update({
            // @ts-expect-error sort key fields are not accepted on update, they are managed by dyna-record
            sk: "456"
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("does not require all of an entity attributes to be passed", async () => {
        const instance = new Order();

        await instance
          .update({
            // @ts-expect-no-error ForeignKey is of type string so it can be passed as such without casing to ForeignKey
            paymentMethodId: "123",
            // @ts-expect-no-error ForeignKey is of type string so it can be passed as such without casing to ForeignKey
            customerId: "456"
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("will not allow non nullable attributes to be removed (set to null)", async () => {
        expect.assertions(3);

        const instance = new Order();

        // Tests that the type system does not allow null, and also that if types are ignored the value is checked at runtime
        await instance
          .update({
            // @ts-expect-error non-nullable fields cannot be removed (set to null)
            paymentMethodId: null
          })
          .catch(e => {
            expect(e).toBeInstanceOf(ValidationError);
            expect(e.message).toEqual("Validation errors");
            expect(e.cause).toEqual([
              {
                code: "invalid_type",
                expected: "string",
                message: "Invalid input: expected string, received null",
                path: ["paymentMethodId"]
              }
            ]);
          });
      });

      it("will allow nullable attributes to be removed (set to null)", async () => {
        const instance = new MyModelNullableAttribute();

        await instance.update({
          // @ts-expect-no-error non-nullable fields can be removed (set to null)
          myAttribute: null
        });
      });

      it("will only infer attribute types and not included relationships on the returned object", async () => {
        const instance = new PaymentMethod();

        // We use .then() to test the type of the resolved value without needing runtime success
        await instance
          .update({ lastFour: "9999" })
          .then(result => {
            // @ts-expect-no-error: Attributes are allowed
            Logger.log(result.id);

            // @ts-expect-no-error: Attributes are allowed
            Logger.log(result.lastFour);

            // @ts-expect-error: Relationship properties are not allowed
            Logger.log(result.customer);

            // @ts-expect-error: Relationship properties are not allowed
            Logger.log(result.orders);

            // @ts-expect-error: Relationship properties are not allowed
            Logger.log(result.paymentMethodProvider);
          })
          .catch(() => {
            // Runtime errors are expected with uninitialized instance, we're only testing types
            Logger.log("Testing types");
          });
      });

      it("results have entity functions", async () => {
        const instance = new PaymentMethod();

        // We use .then() to test the type of the resolved value without needing runtime success
        await instance
          .update({ lastFour: "9999" })
          .then(result => {
            // @ts-expect-no-error: Functions are allowed
            const updateFn = result.update;
            Logger.log(updateFn);
          })
          .catch(() => {
            // Runtime errors are expected with uninitialized instance, we're only testing types
            Logger.log("Testing types");
          });
      });

      it("return value includes objectAttribute with correct nested types", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({
            objectAttribute: {
              name: "John",
              email: "john@example.com",
              tags: ["work"],
              status: "active",
              createdDate: new Date()
            }
          })
          .then(result => {
            // @ts-expect-no-error: objectAttribute is accessible on return value
            Logger.log(result.objectAttribute);

            // @ts-expect-no-error: nested string field is accessible
            Logger.log(result.objectAttribute.name);

            // @ts-expect-no-error: nested string field is accessible
            Logger.log(result.objectAttribute.email);

            // @ts-expect-no-error: nested array field is accessible
            Logger.log(result.objectAttribute.tags);

            // @ts-expect-no-error: array item is a string
            Logger.log(result.objectAttribute.tags[0]);
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("return value objectAttribute fields have correct types (rejects wrong type assignments)", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({
            objectAttribute: {
              name: "John",
              email: "john@example.com",
              tags: ["work"],
              status: "active",
              createdDate: new Date()
            }
          })
          .then(result => {
            // @ts-expect-error: name is string, not number
            const nameAsNum: number = result.objectAttribute.name;
            Logger.log(nameAsNum);

            // @ts-expect-error: tags is string[], not number[]
            const tagsAsNums: number[] = result.objectAttribute.tags;
            Logger.log(tagsAsNums);

            // @ts-expect-error: nonExistent is not in the schema
            Logger.log(result.objectAttribute.nonExistent);
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("return value addressAttribute nested fields have correct types (rejects wrong assignments)", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({ stringAttribute: "val" })
          .then(result => {
            if (result.addressAttribute !== undefined) {
              // @ts-expect-error: city is string, not number
              const cityAsNum: number = result.addressAttribute.city;
              Logger.log(cityAsNum);

              // @ts-expect-error: geo.lat is number, not string
              const latAsStr: string = result.addressAttribute.geo.lat;
              Logger.log(latAsStr);

              // @ts-expect-error: scores is number[], not string[]
              const scoresAsStrs: string[] = result.addressAttribute.scores;
              Logger.log(scoresAsStrs);

              // @ts-expect-error: nonExistent is not in the schema
              Logger.log(result.addressAttribute.nonExistent);
            }
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("will accept referentialIntegrityCheck option", async () => {
        const instance = new Order();

        await instance
          .update(
            {
              orderDate: new Date(),
              paymentMethodId: "123",
              customerId: "456"
            },
            // @ts-expect-no-error referentialIntegrityCheck option is accepted
            { referentialIntegrityCheck: false }
          )
          .catch(() => {
            Logger.log("Testing types");
          });

        await instance
          .update(
            {
              orderDate: new Date(),
              paymentMethodId: "123",
              customerId: "456"
            },
            // @ts-expect-no-error referentialIntegrityCheck option is optional
            { referentialIntegrityCheck: true }
          )
          .catch(() => {
            Logger.log("Testing types");
          });

        await instance
          .update({
            orderDate: new Date(),
            paymentMethodId: "123",
            customerId: "456"
          })
          // @ts-expect-no-error options parameter is optional
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("will not accept invalid options", async () => {
        const instance = new Order();

        await instance
          .update(
            {
              orderDate: new Date(),
              paymentMethodId: "123",
              customerId: "456"
            },
            {
              // @ts-expect-error invalid option property
              invalidOption: true
            }
          )
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("objectAttribute accepts the correct shape", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance.update({
          // @ts-expect-no-error: correct object shape is accepted
          objectAttribute: {
            name: "John",
            email: "john@example.com",
            tags: ["work"],
            status: "active",
            createdDate: new Date()
          }
        });
      });

      it("objectAttribute does not accept wrong types for string fields", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({
            objectAttribute: {
              // @ts-expect-error: name must be a string, not number
              name: 123,
              email: "john@example.com",
              tags: ["work"],
              status: "active",
              createdDate: new Date()
            }
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("objectAttribute does not accept wrong types for array fields", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({
            objectAttribute: {
              name: "John",
              email: "john@example.com",
              // @ts-expect-error: tags must be string[], not string
              tags: "not-array",
              createdDate: new Date()
            }
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("objectAttribute does not accept wrong item types in arrays", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({
            objectAttribute: {
              name: "John",
              email: "john@example.com",
              // @ts-expect-error: tags must be string[], not number[]
              tags: [123, 456],
              createdDate: new Date()
            }
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("objectAttribute accepts partial fields for updates", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({
            // @ts-expect-no-error: partial updates allow omitting required fields
            objectAttribute: {
              name: "John"
            }
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("objectAttribute does not accept extra fields", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({
            objectAttribute: {
              name: "John",
              email: "john@example.com",
              tags: ["work"],
              status: "active",
              createdDate: new Date(),
              // @ts-expect-error: extra is not in the schema
              extra: "not-allowed"
            }
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("addressAttribute accepts correct nested object shape", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance.update({
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
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({
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
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("addressAttribute does not accept wrong item types in arrays", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({
            addressAttribute: {
              street: "123 Main St",
              city: "Springfield",
              geo: { lat: 1, lng: 2, accuracy: "precise" },
              // @ts-expect-error: scores must be number[], not string[]
              scores: ["bad"]
            }
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("addressAttribute allows nullable fields to be omitted", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance.update({
          // @ts-expect-no-error: zip is nullable so it can be omitted
          addressAttribute: {
            street: "123 Main St",
            city: "Springfield",
            geo: { lat: 1, lng: 2, accuracy: "precise" },
            scores: [95]
          }
        });
      });

      it("addressAttribute allows nullable fields to be null for updates", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({
            addressAttribute: {
              street: "123 Main St",
              city: "Springfield",
              // @ts-expect-no-error: zip is nullable, null is allowed for updates (consistent with root-level nullable attributes)
              zip: null,
              geo: { lat: 1, lng: 2, accuracy: "precise" },
              scores: [95]
            }
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("addressAttribute does not allow non-nullable fields to be null", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({
            addressAttribute: {
              // @ts-expect-error: street is non-nullable, cannot be null
              street: null,
              city: "Springfield",
              geo: { lat: 1, lng: 2, accuracy: "precise" },
              scores: [95]
            }
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("addressAttribute accepts partial nested fields for updates", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({
            addressAttribute: {
              street: "123 Main St",
              city: "Springfield",
              // @ts-expect-no-error: partial updates allow omitting nested required fields
              geo: { lat: 1 },
              scores: [95]
            }
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("root-level enumAttribute rejects invalid literal on static update input", async () => {
        await MyClassWithAllAttributeTypes.update("123", {
          // @ts-expect-error: "val-3" is not a valid enum value for enumAttribute ("val-1" | "val-2")
          enumAttribute: "val-3"
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("root-level nullableEnumAttribute rejects invalid literal on static update input", async () => {
        await MyClassWithAllAttributeTypes.update("123", {
          // @ts-expect-error: "val-3" is not a valid enum value for nullableEnumAttribute ("val-1" | "val-2")
          nullableEnumAttribute: "val-3"
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("root-level enumAttribute rejects invalid literal on instance update input", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({
            // @ts-expect-error: "val-3" is not a valid enum value for enumAttribute ("val-1" | "val-2")
            enumAttribute: "val-3"
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("root-level nullableEnumAttribute rejects invalid literal on instance update input", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({
            // @ts-expect-error: "val-3" is not a valid enum value for nullableEnumAttribute ("val-1" | "val-2")
            nullableEnumAttribute: "val-3"
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("return value root-level enumAttribute is typed as literal union", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({ stringAttribute: "val" })
          .then(result => {
            // @ts-expect-no-error: enumAttribute is "val-1" | "val-2"
            const val: "val-1" | "val-2" = result.enumAttribute;
            Logger.log(val);

            // @ts-expect-error: enumAttribute is "val-1" | "val-2", not number
            const valAsNum: number = result.enumAttribute;
            Logger.log(valAsNum);
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("return value root-level nullableEnumAttribute is typed as literal union or undefined", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({ stringAttribute: "val" })
          .then(result => {
            // @ts-expect-no-error: nullableEnumAttribute is "val-1" | "val-2" | undefined
            const val: "val-1" | "val-2" | undefined =
              result.nullableEnumAttribute;
            Logger.log(val);

            // @ts-expect-error: nullableEnumAttribute is not number
            const valAsNum: number = result.nullableEnumAttribute;
            Logger.log(valAsNum);
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("objectAttribute nested enum accuracy rejects invalid literal on update input", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({
            addressAttribute: {
              geo: {
                // @ts-expect-error: "bad-value" is not a valid enum value for accuracy ("precise" | "approximate")
                accuracy: "bad-value"
              }
            }
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("objectAttribute nullable enum category rejects invalid literal on update input", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({
            addressAttribute: {
              // @ts-expect-error: "bad-value" is not a valid enum value for category ("home" | "work" | "other")
              category: "bad-value"
            }
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("return value objectAttribute enum field is typed as union of values", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({
            objectAttribute: {
              name: "John",
              email: "john@example.com",
              tags: ["work"],
              status: "active",
              createdDate: new Date()
            }
          })
          .then(result => {
            // @ts-expect-no-error: status is "active" | "inactive"
            const status: "active" | "inactive" = result.objectAttribute.status;
            Logger.log(status);

            // @ts-expect-error: status is "active" | "inactive", not number
            const statusAsNum: number = result.objectAttribute.status;
            Logger.log(statusAsNum);
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("objectAttribute rejects wrong enum value on update", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({
            objectAttribute: {
              name: "John",
              email: "john@example.com",
              tags: ["work"],
              createdDate: new Date(),
              // @ts-expect-error: "bad-value" is not a valid enum value
              status: "bad-value"
            }
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("return value nested objectAttribute enum field is typed correctly", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({ stringAttribute: "val" })
          .then(result => {
            // @ts-expect-no-error: accuracy is accessible on geo via optional chaining
            Logger.log(result.addressAttribute?.geo.accuracy);

            if (result.addressAttribute !== undefined) {
              // @ts-expect-no-error: accuracy is "precise" | "approximate"
              const acc: "precise" | "approximate" =
                result.addressAttribute.geo.accuracy;
              Logger.log(acc);

              // @ts-expect-error: accuracy is "precise" | "approximate", not number
              const accAsNum: number = result.addressAttribute.geo.accuracy;
              Logger.log(accAsNum);
            }
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("addressAttribute nullable enum field supports undefined", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({ stringAttribute: "val" })
          .then(result => {
            // @ts-expect-no-error: nullable enum field can be accessed with optional chaining
            Logger.log(result.addressAttribute?.category);

            if (result.addressAttribute !== undefined) {
              // @ts-expect-no-error: category is "home" | "work" | "other" | undefined
              const cat: "home" | "work" | "other" | undefined =
                result.addressAttribute.category;
              Logger.log(cat);
            }
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });
      describe("a nullable field inside a list element", () => {
        it("can be null, like a nullable field anywhere else in an update", async () => {
          const instance = new MyClassWithAllAttributeTypes();

          await instance
            .update({
              objectAttribute: {
                history: [
                  {
                    at: new Date(),
                    actor: "buyer",
                    // @ts-expect-no-error: note is nullable, null is allowed for updates (the element is stored without it)
                    note: null
                  }
                ]
              }
            })
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("can be null in a list inside a nested object, in an object inside the element and in a list inside the element", async () => {
          const instance = new NestedListsEntity();

          await instance
            .update({
              layout: {
                section: {
                  entries: [
                    {
                      sku: "sku-1",
                      // @ts-expect-no-error: note is nullable, null is allowed in a list nested in an object
                      note: null,
                      // @ts-expect-no-error: bin is nullable, null is allowed in an object inside a list element
                      placement: { aisle: "A1", bin: null },
                      // @ts-expect-no-error: note is nullable, null is allowed in a list inside a list element
                      restocks: [{ at: new Date(), note: null }]
                    }
                  ]
                }
              }
            })
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("can be null in a discriminated union variant inside a list", async () => {
          const instance = new ArrayOfUnionsEntity();

          await instance
            .update({
              dashboard: {
                widgets: [
                  {
                    type: "metric-card",
                    label: "Revenue",
                    value: 500,
                    format: "currency",
                    // @ts-expect-no-error: trend is nullable in the metric-card variant, null is allowed
                    trend: null
                  },
                  {
                    type: "date-marker",
                    date: new Date(),
                    // @ts-expect-no-error: label is nullable in the date-marker variant, null is allowed
                    label: null
                  }
                ]
              }
            })
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("does not allow a non-nullable field inside a list element to be null", async () => {
          const instance = new NestedListsEntity();

          await instance
            .update({
              layout: {
                section: {
                  entries: [
                    {
                      // @ts-expect-error: sku is non-nullable, cannot be null
                      sku: null,
                      // @ts-expect-error: aisle is non-nullable, cannot be null
                      placement: { aisle: null },
                      // @ts-expect-error: at is non-nullable, cannot be null
                      restocks: [{ at: null }]
                    }
                  ]
                }
              }
            })
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("does not accept wrong types for a nullable field inside a list element", async () => {
          const instance = new ArrayOfUnionsEntity();

          await instance
            .update({
              dashboard: {
                widgets: [
                  {
                    type: "date-marker",
                    date: new Date(),
                    // @ts-expect-error: label is a string
                    label: 3
                  }
                ]
              }
            })
            .catch(() => {
              Logger.log("Testing types");
            });
        });
      });
    });

    describe("write conditions", () => {
      describe("static method", () => {
        it("accepts every attribute kind with each operator it allows", async () => {
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              // @ts-expect-no-error: each attribute takes the operators its kind supports
              condition: {
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
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("accepts dot paths and list-index paths into object attributes", async () => {
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-no-error: a dot path names a nested object field
                "objectAttribute.name": { $contains: "Jane" },
                // @ts-expect-no-error: an array field takes $contains on its items
                "objectAttribute.tags": { $contains: "vip" },
                // @ts-expect-no-error: a list of dates takes a Date element, converted to the ISO string it is stored as
                "objectAttribute.contactedAt": {
                  $contains: new Date("2026-01-01")
                },
                // @ts-expect-no-error: a list of enums takes one of its members
                "objectAttribute.roles": { $contains: "owner" },
                // @ts-expect-no-error: a list of objects takes a whole element, named as declared
                "objectAttribute.history": {
                  $contains: { at: new Date("2026-01-01"), actor: "ann" }
                },
                // @ts-expect-no-error: dot paths reach nested objects at any depth
                "addressAttribute.geo.lat": { $lt: 41 },
                // @ts-expect-no-error: a list-index path names one array item
                "addressAttribute.scores[0]": 5
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses a $contains element the list cannot hold", async () => {
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: admin is not a member of the roles enum
                "objectAttribute.roles": { $contains: "admin" },
                // @ts-expect-error: actor is declared as a string
                "objectAttribute.history": {
                  $contains: { at: new Date("2026-01-01"), actor: 1 }
                }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                "objectAttribute.history": {
                  $contains: {
                    at: new Date("2026-01-01"),
                    actor: "ann",
                    // @ts-expect-error: an element has no actorId, so no element can equal this one
                    actorId: "a-1"
                  }
                }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses an attribute the entity does not declare", async () => {
          await Order.update(
            "123",
            { orderDate: new Date() },
            {
              condition: {
                // @ts-expect-error: name is a Customer attribute, not an Order one
                name: "Jane"
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses type, which the write already fixes", async () => {
          await Order.update(
            "123",
            { orderDate: new Date() },
            {
              condition: {
                // @ts-expect-error: type is not a condition key
                type: "Order"
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses an operator the attribute cannot take", async () => {
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: a boolean has no prefix
                boolAttribute: { $beginsWith: "t" },
                // @ts-expect-error: a number has no substring
                numberAttribute: { $contains: 1 }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("accepts null on a nullable attribute, at any depth and inside $or", async () => {
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-no-error: null means "not set" on a nullable attribute
                nullableStringAttribute: null,
                nullableDateAttribute: null,
                nullableBoolAttribute: null,
                nullableNumberAttribute: null,
                nullableEnumAttribute: null,
                nullableForeignKeyAttribute: null,
                // @ts-expect-no-error: a nullable nested field takes null
                "addressAttribute.zip": null,
                "objectAttribute.deletedAt": null,
                // @ts-expect-no-error: a $or branch takes null on a nullable field
                $or: [
                  { "addressAttribute.category": null },
                  { nullableStringAttribute: null }
                ]
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses null on a non-nullable attribute, at any depth", async () => {
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: stringAttribute is not nullable
                stringAttribute: null,
                // @ts-expect-error: city is not nullable
                "addressAttribute.city": null,
                // @ts-expect-error: foreignKeyAttribute is not nullable
                $or: [{ foreignKeyAttribute: null }]
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses null inside an IN array, nullable attribute or not", async () => {
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: an IN list holds values; null is not one
                enumAttribute: ["val-1", null],
                // @ts-expect-error: null means "not set", which IN cannot express
                nullableEnumAttribute: ["val-1", null]
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("accepts $or blocks on the entity's own attributes", async () => {
          await Order.update(
            "123",
            { orderDate: new Date() },
            {
              condition: {
                // @ts-expect-no-error: each branch is a condition on this row
                $or: [
                  { orderDate: { $lt: new Date() } },
                  { customerId: "customer-1", paymentMethodId: "pm-1" }
                ]
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses a relationship key inside $or (AE6)", async () => {
          await Order.update(
            "123",
            { orderDate: new Date() },
            {
              condition: {
                $or: [
                  { orderDate: new Date() },
                  // @ts-expect-error: $or branches take the entity's own attributes only
                  { customer: { name: "Jane" } }
                ]
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses target inside $or", async () => {
          await Founder.update(
            "123",
            { name: "Jane" },
            {
              condition: {
                // @ts-expect-error: $or branches hold conditions on this row only
                $or: [{ organizationId: { target: { name: "Acme" } } }]
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("takes a target condition on a BelongsTo and a HasOne", async () => {
          await Order.update(
            "123",
            { orderDate: new Date() },
            {
              condition: {
                // @ts-expect-no-error: a BelongsTo takes a condition on the related row, $or included
                customer: {
                  name: "Jane",
                  $or: [{ address: "A" }, { address: "B" }]
                },
                // @ts-expect-no-error: an empty target condition requires the target to exist
                paymentMethod: {}
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await Customer.update(
            "123",
            { name: "Jane" },
            {
              condition: {
                // @ts-expect-no-error: a HasOne takes a target condition, null on its nullable attributes
                contactInformation: { phone: null, email: { $contains: "@" } }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("takes { id, condition } entries on a HasMany, a HasAndBelongsToMany and the parent side of a one-way HasMany", async () => {
          await Customer.update(
            "123",
            { name: "Jane" },
            {
              condition: {
                // @ts-expect-no-error: a HasMany names each child it guards by id
                orders: [
                  {
                    id: "order-1",
                    condition: { orderDate: { $gte: new Date() } }
                  },
                  { id: "order-2", condition: {} }
                ]
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await Book.update(
            "123",
            { name: "Dune" },
            {
              condition: {
                // @ts-expect-no-error: a HasAndBelongsToMany names each linked row by id
                authors: [{ id: "author-1", condition: { name: "Jane" } }]
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await Organization.update(
            "123",
            { name: "Acme" },
            {
              condition: {
                // @ts-expect-no-error: a one-way HasMany is guarded from its parent side
                employees: [{ id: "employee-1", condition: { name: "Jane" } }],
                founders: [{ id: "founder-1", condition: {} }]
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses { id, condition } on a single-valued relationship", async () => {
          await Order.update(
            "123",
            { orderDate: new Date() },
            {
              condition: {
                // @ts-expect-error: the library resolves a BelongsTo target itself
                customer: { id: "customer-1", condition: { name: "Jane" } }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses a plain condition on an array relationship", async () => {
          await Customer.update(
            "123",
            { name: "Jane" },
            {
              condition: {
                // @ts-expect-error: a HasMany takes { id, condition } entries
                orders: { orderDate: new Date() }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses an attribute the related entity does not declare", async () => {
          await Order.update(
            "123",
            { orderDate: new Date() },
            {
              condition: {
                // @ts-expect-error: orderDate is an Order attribute, not a Customer one
                customer: { orderDate: new Date() }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await Customer.update(
            "123",
            { name: "Jane" },
            {
              condition: {
                orders: [
                  // @ts-expect-error: name is a Customer attribute, not an Order one
                  { id: "order-1", condition: { name: "Jane" } }
                ]
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses a relationship key inside a target condition", async () => {
          await Order.update(
            "123",
            { orderDate: new Date() },
            {
              condition: {
                // @ts-expect-error: a target condition names the related row's own attributes
                customer: { orders: [{ id: "order-1", condition: {} }] }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await Customer.update(
            "123",
            { name: "Jane" },
            {
              condition: {
                orders: [
                  // @ts-expect-error: nor the related entity's own relationships
                  { id: "order-1", condition: { paymentMethod: {} } }
                ]
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses a target guard inside a target condition", async () => {
          await Organization.update(
            "123",
            { name: "Acme" },
            {
              condition: {
                founders: [
                  {
                    id: "founder-1",
                    // @ts-expect-error: the related row's foreign key takes its own value only
                    condition: { organizationId: { target: { name: "Acme" } } }
                  }
                ]
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses a malformed { id, condition } entry", async () => {
          await Customer.update(
            "123",
            { name: "Jane" },
            {
              condition: {
                orders: [
                  // @ts-expect-error: the entry names its related entity by id
                  { condition: {} },
                  // @ts-expect-error: the entry carries the condition to check
                  { id: "order-2" },
                  // @ts-expect-error: an entry holds id and condition only
                  { id: "order-3", condition: {}, orderDate: new Date() }
                ]
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("takes target on a typed standalone foreign key", async () => {
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-no-error: a ForeignKey<Customer> guards its Customer
                foreignKeyAttribute: { target: { name: "Jane" } },
                // @ts-expect-no-error: a NullableForeignKey<Customer> guards its Customer
                nullableForeignKeyAttribute: { target: {} }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await Profile.update(
            "123",
            { lastLogin: new Date() },
            {
              condition: {
                // @ts-expect-no-error: the target condition is typed from the referenced entity
                userId: { target: { name: { $beginsWith: "J" } } }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("takes target on the child side of a one-way HasMany", async () => {
          await Founder.update(
            "123",
            { name: "Jane" },
            {
              condition: {
                // @ts-expect-no-error: no BelongsTo backs the key, so it guards its target
                organizationId: { target: { name: "Acme" } }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await Employee.update(
            "123",
            { name: "Jane" },
            {
              condition: {
                // @ts-expect-no-error: a nullable child-side key guards its target too
                organizationId: { target: { name: "Acme" } }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("keeps a value condition on the key, with the guard's value in $or", async () => {
          await Founder.update(
            "123",
            { name: "Jane" },
            {
              condition: {
                // @ts-expect-no-error: the key still takes a value condition
                organizationId: "org-1"
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await Founder.update(
            "123",
            { name: "Jane" },
            {
              condition: {
                // @ts-expect-no-error: the guard sits on the key
                organizationId: { target: { name: "Acme" } },
                // @ts-expect-no-error: and the value condition moves into $or
                $or: [{ organizationId: "org-1" }, { name: "Jane" }]
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses target on a bare foreign key (AE18)", async () => {
          @Entity
          class LooseOrder extends MockTable {
            declare readonly type: "LooseOrder";

            @DateAttribute({ alias: "OrderDate" })
            public readonly orderDate: Date;

            // Widening the target to DynaRecord is what leaves the key bare:
            // the decorator otherwise requires ForeignKey<Customer>
            @ForeignKeyAttribute((): EntityClass<DynaRecord> => Customer, {
              alias: "CustomerId"
            })
            public readonly customerId: ForeignKey;

            @BelongsTo(() => Customer, { foreignKey: "customerId" })
            public readonly customer: Customer;
          }

          await LooseOrder.update(
            "123",
            { orderDate: new Date() },
            {
              condition: {
                // @ts-expect-error: customerId needs its target type to guard it
                customerId: { target: { name: "Jane" } }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses target on a foreign key backing a BelongsTo", async () => {
          await Order.update(
            "123",
            { orderDate: new Date() },
            {
              condition: {
                // @ts-expect-error: guard the Customer under the customer key
                customerId: { target: { name: "Jane" } }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses a value condition and target on the same key (R33)", async () => {
          await Founder.update(
            "123",
            { name: "Jane" },
            {
              condition: {
                // @ts-expect-error: a value condition alongside a guard goes in $or
                organizationId: { target: { name: "Acme" }, $beginsWith: "org" }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses a target attribute the referenced entity does not declare", async () => {
          await Founder.update(
            "123",
            { name: "Jane" },
            {
              condition: {
                // @ts-expect-error: lastFour is a PaymentMethod attribute
                organizationId: { target: { lastFour: "1234" } }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("misclassifies a typed foreign key beside a HasOne to the same entity", async () => {
          // Known limit: the types tell a BelongsTo from a HasOne only by whether
          // a typed foreign key to the same entity exists. Here one does, so
          // paymentMethod reads as a BelongsTo backed by backupPaymentMethodId
          // and the key's target guard is refused. The condition compiler reads
          // the relationship metadata and throws a FilterError for the shapes
          // the types get wrong
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

          await Kiosk.update(
            "123",
            { name: "Lobby" },
            {
              condition: {
                // @ts-expect-error: known limit — read as backing a BelongsTo; the compiler decides at run time
                backupPaymentMethodId: { target: { lastFour: "1234" } }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("takes condition beside referentialIntegrityCheck and forceEmbed", async () => {
          await Order.update(
            "123",
            { orderDate: new Date() },
            {
              referentialIntegrityCheck: false,
              forceEmbed: true,
              // @ts-expect-no-error: condition sits beside update's existing options
              condition: { orderDate: { $lt: new Date() }, customer: {} }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses an option update does not take", async () => {
          await Order.update(
            "123",
            { orderDate: new Date() },
            {
              condition: { orderDate: new Date() },
              // @ts-expect-error: update has no such option
              conditions: { orderDate: new Date() }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("accepts each operator a nested field's type allows", async () => {
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-no-error: a nested date takes a Date comparison
                "objectAttribute.createdDate": { $gte: new Date("2026-01-01") },
                // @ts-expect-no-error: a nested enum takes an IN list of its values
                "objectAttribute.status": ["active", "inactive"],
                // @ts-expect-no-error: a nested number takes $between
                "addressAttribute.geo.lat": { $between: [40, 42] },
                // @ts-expect-no-error: a nested enum is stored as a string, so it takes a prefix
                "addressAttribute.geo.accuracy": { $beginsWith: "pre" }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-no-error: a nested date is stored as an ISO string, so it takes a prefix
                "objectAttribute.createdDate": { $beginsWith: "2026" }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await ArrayOfObjectsEntity.update(
            "123",
            { name: "Inventory" },
            {
              condition: {
                // @ts-expect-no-error: a field below a list index resolves to the element's field
                "data.entries[0].price": { $lt: 10 }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await DeepNestedEntity.update(
            "123",
            { name: "Settings" },
            {
              condition: {
                // @ts-expect-no-error: the deepest field takes its own type
                "data.level1.level2.level3.flag": false,
                // @ts-expect-no-error: a nullable field deep in the schema takes null
                "data.level1.tag": null
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses a dot path naming no declared field, at each depth", async () => {
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: objectAttribute declares no such field
                "objectAttribute.nope": 1
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: geo declares lat, lng and accuracy, not this
                "addressAttribute.geo.nope": 1
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await ArrayOfObjectsEntity.update(
            "123",
            { name: "Inventory" },
            {
              condition: {
                // @ts-expect-error: an entries element declares sku and price, not this
                "data.entries[0].nope": 1
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await DeepNestedEntity.update(
            "123",
            { name: "Settings" },
            {
              condition: {
                // @ts-expect-error: level3 declares flag and detail, not this
                "data.level1.level2.level3.nope": 1
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses a list index on a field that is not a list, and a dot path into an attribute that is not an object", async () => {
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: name is a string, not a list
                "objectAttribute.name[0]": "J"
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: geo is an object, not a list
                "addressAttribute.geo[0]": 1
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: stringAttribute is not an object attribute
                "stringAttribute.x": "a"
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: numberAttribute is not a list
                "numberAttribute[0]": 1
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses a value a nested field cannot hold", async () => {
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: name is a string
                "objectAttribute.name": 1
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: geo.lat is a number
                "addressAttribute.geo.lat": "41"
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: a scores item is a number
                "addressAttribute.scores[0]": "5"
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: tags holds strings
                "objectAttribute.tags": { $contains: 1 }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: createdDate is a Date
                "objectAttribute.createdDate": "2026-01-01"
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: status takes active or inactive
                "objectAttribute.status": "archived"
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await ArrayOfObjectsEntity.update(
            "123",
            { name: "Inventory" },
            {
              condition: {
                // @ts-expect-error: price is a number
                "data.entries[0].price": "10"
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await DeepNestedEntity.update(
            "123",
            { name: "Settings" },
            {
              condition: {
                // @ts-expect-error: score is a number
                "data.level1.level2.score": "5"
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses an operator a nested field cannot take", async () => {
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: a number has no prefix
                "addressAttribute.geo.lat": { $beginsWith: "4" }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: a number has no substring
                "addressAttribute.zip": { $contains: 1 }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: a list has no ordering
                "objectAttribute.tags": { $gt: "a" }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: a list has no prefix
                "objectAttribute.tags": { $beginsWith: "v" }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await DeepNestedEntity.update(
            "123",
            { name: "Settings" },
            {
              condition: {
                // @ts-expect-error: a boolean has no substring
                "data.level1.level2.level3.flag": { $contains: true }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await DeepNestedEntity.update(
            "123",
            { name: "Settings" },
            {
              condition: {
                // @ts-expect-error: a boolean has no ordering
                "data.level1.level2.level3.flag": { $gt: true }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses a wrong operand for $between and comparisons at a nested path", async () => {
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: both bounds are numbers
                "addressAttribute.geo.lat": { $between: [1, "2"] }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: $between takes a pair
                "addressAttribute.geo.lat": { $between: [1] }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: geo.lat compares against a number
                "addressAttribute.geo.lat": { $gt: "40" }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: createdDate compares against a Date
                "objectAttribute.createdDate": { $gte: "2026-01-01" }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await ArrayOfObjectsEntity.update(
            "123",
            { name: "Inventory" },
            {
              condition: {
                // @ts-expect-error: price compares against a number
                "data.entries[0].price": { $lt: "10" }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("accepts every operator each attribute kind's stored form allows", async () => {
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-no-error: comparisons compose with AND on a string
                stringAttribute: { $gt: "a", $lte: "m" },
                // @ts-expect-no-error: and on a number
                numberAttribute: { $gte: 1, $lt: 10 },
                // @ts-expect-no-error: a date is stored as an ISO string, so it takes a prefix
                dateAttribute: { $beginsWith: "2026" },
                // @ts-expect-no-error: an enum is stored as a string, so it takes a prefix
                enumAttribute: { $beginsWith: "val" },
                // @ts-expect-no-error: a foreign key is stored as a string, so it takes a prefix
                foreignKeyAttribute: { $beginsWith: "customer-" },
                // @ts-expect-no-error: a boolean takes an IN list
                boolAttribute: [true, false],
                // @ts-expect-no-error: a nullable date takes a Date comparison
                nullableDateAttribute: { $lt: new Date() }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-no-error: a string takes $between
                stringAttribute: { $between: ["a", "m"] },
                // @ts-expect-no-error: a number takes equality
                numberAttribute: 5,
                // @ts-expect-no-error: a date takes a substring of its stored form
                dateAttribute: { $contains: "-01-" },
                // @ts-expect-no-error: an enum takes a substring
                enumAttribute: { $contains: "1" },
                // @ts-expect-no-error: a foreign key takes a comparison
                foreignKeyAttribute: { $gt: "customer-1" },
                // @ts-expect-no-error: a nullable boolean takes equality
                nullableBoolAttribute: false,
                // @ts-expect-no-error: a nullable enum takes one of its values
                nullableEnumAttribute: "val-1"
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-no-error: a string takes an IN list
                stringAttribute: ["a", "b"],
                // @ts-expect-no-error: a number takes an IN list
                numberAttribute: [1, 2],
                // @ts-expect-no-error: a date takes $between with Date bounds
                dateAttribute: {
                  $between: [new Date("2026-01-01"), new Date("2026-12-31")]
                },
                // @ts-expect-no-error: an enum takes a comparison against its values
                enumAttribute: { $gte: "val-1" },
                // @ts-expect-no-error: a foreign key takes an IN list
                foreignKeyAttribute: ["customer-1", "customer-2"],
                // @ts-expect-no-error: a nullable foreign key takes a prefix
                nullableForeignKeyAttribute: { $beginsWith: "customer-" },
                // @ts-expect-no-error: a nullable number takes an IN list
                nullableNumberAttribute: [1, 2]
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-no-error: a string takes equality
                stringAttribute: "a",
                // @ts-expect-no-error: a date takes equality with a Date
                dateAttribute: new Date("2026-01-01")
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-no-error: a date takes an IN list of Dates
                dateAttribute: [new Date("2026-01-01"), new Date("2026-02-01")],
                // @ts-expect-no-error: a date takes composed Date comparisons
                nullableDateAttribute: {
                  $gte: new Date("2026-01-01"),
                  $lt: new Date("2026-02-01")
                }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses each operator and operand a string attribute cannot take", async () => {
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: stringAttribute is a string
                stringAttribute: 1
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: an IN list holds strings
                stringAttribute: ["a", 1]
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: a string compares against a string
                stringAttribute: { $gt: 1 }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: a Date is not a string operand
                stringAttribute: { $gte: new Date() }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: both bounds are strings
                stringAttribute: { $between: ["a", 1] }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: a prefix is a string
                stringAttribute: { $beginsWith: 1 }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: a substring is a scalar, not a Date
                stringAttribute: { $contains: new Date() }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses each operator and operand a number attribute cannot take", async () => {
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: numberAttribute is a number
                numberAttribute: "5"
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: an IN list holds numbers
                numberAttribute: [1, "2"]
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: a number compares against a number
                numberAttribute: { $gt: "5" }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: a Date is not a number operand
                numberAttribute: { $lte: new Date() }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: both bounds are numbers
                numberAttribute: { $between: [1, "10"] }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: $between takes a pair
                numberAttribute: { $between: [1] }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: a number has no prefix
                numberAttribute: { $beginsWith: "1" }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: an operator object needs at least one operator
                numberAttribute: {}
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses each operator and operand a boolean attribute cannot take", async () => {
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: boolAttribute is a boolean
                boolAttribute: "true"
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: an IN list holds booleans
                boolAttribute: [true, "false"]
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: a boolean has no substring
                boolAttribute: { $contains: true }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: a boolean has no ordering
                boolAttribute: { $gt: false }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: a boolean has no range
                boolAttribute: { $between: [false, true] }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses each operator and operand a date attribute cannot take", async () => {
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: dateAttribute is compared as a Date
                dateAttribute: "2026-01-01"
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: an IN list holds Dates
                dateAttribute: ["2026-01-01"]
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: a date compares against a Date
                dateAttribute: { $gte: "2026-01-01" }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: a date compares against a Date, not a number
                dateAttribute: { $gt: 1 }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: both bounds are Dates
                dateAttribute: { $between: [new Date(), "2026-12-31"] }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: a prefix is a fragment of the stored string, not a Date
                dateAttribute: { $beginsWith: new Date() }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses each operator and operand an enum attribute cannot take", async () => {
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: val-3 is not one of the enum's values
                enumAttribute: "val-3"
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: an IN list holds the enum's values
                enumAttribute: ["val-1", "val-3"]
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: a comparison operand is one of the enum's values
                enumAttribute: { $gt: "val-3" }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: both bounds are the enum's values
                enumAttribute: { $between: ["val-1", "val-3"] }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: an enum compares against its values, not a number
                enumAttribute: { $gte: 1 }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: a prefix is a string
                enumAttribute: { $beginsWith: 1 }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("accepts an enum range across two of its members", async () => {
          // An enum is stored as a string, which DynamoDB orders
          // lexicographically, so any two members bound a range
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-no-error: both bounds are members of the enum
                enumAttribute: { $between: ["val-1", "val-2"] },
                // @ts-expect-no-error: a nullable enum ranges across its members
                nullableEnumAttribute: { $between: ["val-1", "val-2"] },
                // @ts-expect-no-error: a nested enum ranges across its members
                "objectAttribute.status": { $between: ["active", "inactive"] }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-no-error: composed comparisons may name different members
                enumAttribute: { $gte: "val-1", $lte: "val-2" },
                // @ts-expect-no-error: and composes across them
                nullableEnumAttribute: { $gt: "val-1", $lt: "val-2" },
                // @ts-expect-no-error: a nullable nested enum composes across its members
                "addressAttribute.category": { $gte: "home", $lte: "work" }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-no-error: both bounds may be the same member
                enumAttribute: { $between: ["val-1", "val-1"] }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses an enum range bound the enum cannot hold", async () => {
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: val-3 is not one of the enum's values, composed or not
                enumAttribute: { $gte: "val-1", $lte: "val-3" }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: archived is not one of the nested enum's values
                "objectAttribute.status": { $between: ["active", "archived"] }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: an enum is ranged by its values, not a number
                enumAttribute: { $between: ["val-1", 2] }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: a range bound is never null, nullable enum or not
                nullableEnumAttribute: { $between: [null, "val-2"] }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: null means not set, which no ordering can compare
                nullableEnumAttribute: { $gte: "val-1", $lte: null }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: a boolean is not one of the enum's values
                enumAttribute: { $between: ["val-1", true] }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses each operator and operand a foreign key attribute cannot take", async () => {
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: a foreign key is a string
                foreignKeyAttribute: 1
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: an IN list holds strings
                foreignKeyAttribute: [1]
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: a foreign key compares against a string
                foreignKeyAttribute: { $gt: 1 }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: both bounds are strings
                foreignKeyAttribute: { $between: ["a", 1] }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: a prefix is a string
                foreignKeyAttribute: { $beginsWith: 1 }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await Founder.update(
            "123",
            { name: "Jane" },
            {
              condition: {
                // @ts-expect-error: the key's value is a string
                organizationId: 1
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses each operator and operand a nullable attribute cannot take", async () => {
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: nullableStringAttribute is a string
                nullableStringAttribute: 1
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: null means not set, which no ordering can compare
                nullableStringAttribute: { $gt: null }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: a number has no prefix, nullable or not
                nullableNumberAttribute: { $beginsWith: "1" }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: a range bound is never null
                nullableNumberAttribute: { $between: [null, 5] }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: a boolean has no ordering, nullable or not
                nullableBoolAttribute: { $gt: true }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: a nullable date compares against a Date
                nullableDateAttribute: { $gte: "2026" }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: val-3 is not one of the enum's values
                nullableEnumAttribute: "val-3"
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: a nullable foreign key is a string
                nullableForeignKeyAttribute: 1
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: null means not set, which no ordering can compare
                nullableForeignKeyAttribute: { $gt: null }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("audits a BelongsTo target condition like the entity's own", async () => {
          await Shipment.update(
            "123",
            { destination: "Dock 4" },
            {
              condition: {
                // @ts-expect-no-error: the target condition resolves the related row's dot paths
                warehouse: {
                  "location.city": { $beginsWith: "Spring" },
                  "location.zip": null,
                  $or: [{ "location.state": "IL" }, { name: "Central" }]
                }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await Shipment.update(
            "123",
            { destination: "Dock 4" },
            {
              condition: {
                warehouse: {
                  // @ts-expect-error: city is a string
                  "location.city": 1
                }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await Shipment.update(
            "123",
            { destination: "Dock 4" },
            {
              condition: {
                warehouse: {
                  // @ts-expect-error: a number has no prefix
                  "location.zip": { $beginsWith: "9" }
                }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await Shipment.update(
            "123",
            { destination: "Dock 4" },
            {
              condition: {
                warehouse: {
                  // @ts-expect-error: location declares no such field
                  "location.nope": "x"
                }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await Shipment.update(
            "123",
            { destination: "Dock 4" },
            {
              condition: {
                warehouse: {
                  // @ts-expect-error: a string compares against a string
                  name: { $gt: 1 }
                }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("audits a { id, condition } entry's condition like the entity's own", async () => {
          await Warehouse.update(
            "123",
            { name: "Central" },
            {
              condition: {
                // @ts-expect-no-error: an entry's condition resolves the related row's dot paths
                shipments: [
                  {
                    id: "shipment-1",
                    condition: {
                      "dimensions.weight": { $between: [1, 10] },
                      "dimensions.label": null
                    }
                  }
                ]
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await Warehouse.update(
            "123",
            { name: "Central" },
            {
              condition: {
                shipments: [
                  {
                    id: "shipment-1",
                    condition: {
                      // @ts-expect-error: weight is a number
                      "dimensions.weight": "5"
                    }
                  }
                ]
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await Warehouse.update(
            "123",
            { name: "Central" },
            {
              condition: {
                shipments: [
                  {
                    id: "shipment-1",
                    condition: {
                      // @ts-expect-error: a number has no substring
                      "dimensions.weight": { $contains: 1 }
                    }
                  }
                ]
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await Warehouse.update(
            "123",
            { name: "Central" },
            {
              condition: {
                shipments: [
                  {
                    id: "shipment-1",
                    condition: {
                      // @ts-expect-error: dimensions declares no such field
                      "dimensions.nope": 1
                    }
                  }
                ]
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await Warehouse.update(
            "123",
            { name: "Central" },
            {
              condition: {
                shipments: [
                  {
                    id: "shipment-1",
                    condition: {
                      // @ts-expect-error: a string compares against a string
                      destination: { $gt: 1 }
                    }
                  }
                ]
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("audits a target guard's condition like the entity's own", async () => {
          // A standalone foreign key to an entity with an object attribute, so the
          // guard's target condition has dot paths to resolve
          @Entity
          class Delivery extends MockTable {
            declare readonly type: "Delivery";

            @StringAttribute({ alias: "Name" })
            public readonly name: string;

            @ForeignKeyAttribute(() => Warehouse, { alias: "WarehouseId" })
            public readonly warehouseId: ForeignKey<Warehouse>;
          }

          await Delivery.update(
            "123",
            { name: "Morning run" },
            {
              condition: {
                // @ts-expect-no-error: the guard's condition resolves the referenced row's dot paths
                warehouseId: {
                  target: {
                    "location.city": "Springfield",
                    "location.zip": { $gte: 60000 }
                  }
                }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await Delivery.update(
            "123",
            { name: "Morning run" },
            {
              condition: {
                // @ts-expect-error: the guard's condition is typed from Warehouse: city is a string
                warehouseId: {
                  target: {
                    "location.city": 1
                  }
                }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await Delivery.update(
            "123",
            { name: "Morning run" },
            {
              condition: {
                // @ts-expect-error: the guard's condition is typed from Warehouse: a number has no prefix
                warehouseId: {
                  target: {
                    "location.zip": { $beginsWith: "6" }
                  }
                }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await Delivery.update(
            "123",
            { name: "Morning run" },
            {
              condition: {
                warehouseId: {
                  target: {
                    // @ts-expect-error: location declares no such field
                    "location.nope": "x"
                  }
                }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await Delivery.update(
            "123",
            { name: "Morning run" },
            {
              condition: {
                // @ts-expect-error: the guard's condition is typed from Warehouse: both bounds are strings
                warehouseId: {
                  target: {
                    name: { $between: ["a", 1] }
                  }
                }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses a value an attribute cannot hold inside $or", async () => {
          await Order.update(
            "123",
            { orderDate: new Date() },
            {
              condition: {
                $or: [
                  // @ts-expect-error: orderDate is compared as a Date
                  { orderDate: "2026-01-01" }
                ]
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses on a HasOne what it refuses on a BelongsTo", async () => {
          await Customer.update(
            "123",
            { name: "Jane" },
            {
              condition: {
                // @ts-expect-error: email and phone are ContactInformation attributes; name is not
                contactInformation: { name: "Jane" }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await Customer.update(
            "123",
            { name: "Jane" },
            {
              condition: {
                // @ts-expect-error: the library resolves a HasOne target itself
                contactInformation: { id: "contact-1", condition: {} }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses on a HasAndBelongsToMany and a one-way HasMany what it refuses on a HasMany", async () => {
          await Book.update(
            "123",
            { name: "Dune" },
            {
              condition: {
                // @ts-expect-error: a HasAndBelongsToMany takes { id, condition } entries
                authors: { name: "Jane" }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await Book.update(
            "123",
            { name: "Dune" },
            {
              condition: {
                authors: [
                  // @ts-expect-error: numPages is a Book attribute, not an Author one
                  { id: "author-1", condition: { numPages: 100 } }
                ]
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await Organization.update(
            "123",
            { name: "Acme" },
            {
              condition: {
                // @ts-expect-error: a one-way HasMany takes { id, condition } entries
                employees: { name: "Jane" }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses a target attribute the referenced entity does not declare, on every typed key", async () => {
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "val" },
            {
              condition: {
                // @ts-expect-error: lastFour is a PaymentMethod attribute, and the key references a Customer
                nullableForeignKeyAttribute: { target: { lastFour: "1234" } }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await Employee.update(
            "123",
            { name: "Jane" },
            {
              condition: {
                // @ts-expect-error: lastFour is a PaymentMethod attribute, and the key references an Organization
                organizationId: { target: { lastFour: "1234" } }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses an option value of the wrong type", async () => {
          await Order.update(
            "123",
            { orderDate: new Date() },
            {
              // @ts-expect-error: referentialIntegrityCheck is a boolean
              referentialIntegrityCheck: "no"
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await Order.update(
            "123",
            { orderDate: new Date() },
            {
              // @ts-expect-error: forceEmbed is a boolean
              forceEmbed: "yes"
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await Order.update(
            "123",
            { orderDate: new Date() },
            {
              // @ts-expect-error: condition is an object of conditions
              condition: "orderDate"
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });
      });

      describe("instance method", () => {
        it("accepts every attribute kind with each operator it allows", async () => {
          const instance = new MyClassWithAllAttributeTypes();

          await instance
            .update(
              { stringAttribute: "val" },
              {
                // @ts-expect-no-error: each attribute takes the operators its kind supports
                condition: {
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
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("accepts dot paths and list-index paths into object attributes", async () => {
          const instance = new MyClassWithAllAttributeTypes();

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-no-error: a dot path names a nested object field
                  "objectAttribute.name": { $contains: "Jane" },
                  // @ts-expect-no-error: an array field takes $contains on its items
                  "objectAttribute.tags": { $contains: "vip" },
                  // @ts-expect-no-error: a list of dates takes a Date element, converted to the ISO string it is stored as
                  "objectAttribute.contactedAt": {
                    $contains: new Date("2026-01-01")
                  },
                  // @ts-expect-no-error: a list of enums takes one of its members
                  "objectAttribute.roles": { $contains: "owner" },
                  // @ts-expect-no-error: a list of objects takes a whole element, named as declared
                  "objectAttribute.history": {
                    $contains: { at: new Date("2026-01-01"), actor: "ann" }
                  },
                  // @ts-expect-no-error: dot paths reach nested objects at any depth
                  "addressAttribute.geo.lat": { $lt: 41 },
                  // @ts-expect-no-error: a list-index path names one array item
                  "addressAttribute.scores[0]": 5
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses an attribute the entity does not declare", async () => {
          const order = new Order();

          await order
            .update(
              { orderDate: new Date() },
              {
                condition: {
                  // @ts-expect-error: name is a Customer attribute, not an Order one
                  name: "Jane"
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses type, which the write already fixes", async () => {
          const order = new Order();

          await order
            .update(
              { orderDate: new Date() },
              {
                condition: {
                  // @ts-expect-error: type is not a condition key
                  type: "Order"
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses an operator the attribute cannot take", async () => {
          const instance = new MyClassWithAllAttributeTypes();

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: a boolean has no prefix
                  boolAttribute: { $beginsWith: "t" },
                  // @ts-expect-error: a number has no substring
                  numberAttribute: { $contains: 1 }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("accepts null on a nullable attribute, at any depth and inside $or", async () => {
          const instance = new MyClassWithAllAttributeTypes();

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-no-error: null means "not set" on a nullable attribute
                  nullableStringAttribute: null,
                  nullableDateAttribute: null,
                  nullableBoolAttribute: null,
                  nullableNumberAttribute: null,
                  nullableEnumAttribute: null,
                  nullableForeignKeyAttribute: null,
                  // @ts-expect-no-error: a nullable nested field takes null
                  "addressAttribute.zip": null,
                  "objectAttribute.deletedAt": null,
                  // @ts-expect-no-error: a $or branch takes null on a nullable field
                  $or: [
                    { "addressAttribute.category": null },
                    { nullableStringAttribute: null }
                  ]
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses null on a non-nullable attribute, at any depth", async () => {
          const instance = new MyClassWithAllAttributeTypes();

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: stringAttribute is not nullable
                  stringAttribute: null,
                  // @ts-expect-error: city is not nullable
                  "addressAttribute.city": null,
                  // @ts-expect-error: foreignKeyAttribute is not nullable
                  $or: [{ foreignKeyAttribute: null }]
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses null inside an IN array, nullable attribute or not", async () => {
          const instance = new MyClassWithAllAttributeTypes();

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: an IN list holds values; null is not one
                  enumAttribute: ["val-1", null],
                  // @ts-expect-error: null means "not set", which IN cannot express
                  nullableEnumAttribute: ["val-1", null]
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("accepts $or blocks on the entity's own attributes", async () => {
          const order = new Order();

          await order
            .update(
              { orderDate: new Date() },
              {
                condition: {
                  // @ts-expect-no-error: each branch is a condition on this row
                  $or: [
                    { orderDate: { $lt: new Date() } },
                    { customerId: "customer-1", paymentMethodId: "pm-1" }
                  ]
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses a relationship key inside $or (AE6)", async () => {
          const order = new Order();

          await order
            .update(
              { orderDate: new Date() },
              {
                condition: {
                  $or: [
                    { orderDate: new Date() },
                    // @ts-expect-error: $or branches take the entity's own attributes only
                    { customer: { name: "Jane" } }
                  ]
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses target inside $or", async () => {
          const founder = new Founder();

          await founder
            .update(
              { name: "Jane" },
              {
                condition: {
                  // @ts-expect-error: $or branches hold conditions on this row only
                  $or: [{ organizationId: { target: { name: "Acme" } } }]
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("takes a target condition on a BelongsTo and a HasOne", async () => {
          const order = new Order();

          await order
            .update(
              { orderDate: new Date() },
              {
                condition: {
                  // @ts-expect-no-error: a BelongsTo takes a condition on the related row, $or included
                  customer: {
                    name: "Jane",
                    $or: [{ address: "A" }, { address: "B" }]
                  },
                  // @ts-expect-no-error: an empty target condition requires the target to exist
                  paymentMethod: {}
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          const customer = new Customer();

          await customer
            .update(
              { name: "Jane" },
              {
                condition: {
                  // @ts-expect-no-error: a HasOne takes a target condition, null on its nullable attributes
                  contactInformation: { phone: null, email: { $contains: "@" } }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("takes { id, condition } entries on a HasMany, a HasAndBelongsToMany and the parent side of a one-way HasMany", async () => {
          const customer = new Customer();

          await customer
            .update(
              { name: "Jane" },
              {
                condition: {
                  // @ts-expect-no-error: a HasMany names each child it guards by id
                  orders: [
                    {
                      id: "order-1",
                      condition: { orderDate: { $gte: new Date() } }
                    },
                    { id: "order-2", condition: {} }
                  ]
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          const book = new Book();

          await book
            .update(
              { name: "Dune" },
              {
                condition: {
                  // @ts-expect-no-error: a HasAndBelongsToMany names each linked row by id
                  authors: [{ id: "author-1", condition: { name: "Jane" } }]
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          const organization = new Organization();

          await organization
            .update(
              { name: "Acme" },
              {
                condition: {
                  // @ts-expect-no-error: a one-way HasMany is guarded from its parent side
                  employees: [
                    { id: "employee-1", condition: { name: "Jane" } }
                  ],
                  founders: [{ id: "founder-1", condition: {} }]
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses { id, condition } on a single-valued relationship", async () => {
          const order = new Order();

          await order
            .update(
              { orderDate: new Date() },
              {
                condition: {
                  // @ts-expect-error: the library resolves a BelongsTo target itself
                  customer: { id: "customer-1", condition: { name: "Jane" } }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses a plain condition on an array relationship", async () => {
          const customer = new Customer();

          await customer
            .update(
              { name: "Jane" },
              {
                condition: {
                  // @ts-expect-error: a HasMany takes { id, condition } entries
                  orders: { orderDate: new Date() }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses an attribute the related entity does not declare", async () => {
          const order = new Order();

          await order
            .update(
              { orderDate: new Date() },
              {
                condition: {
                  // @ts-expect-error: orderDate is an Order attribute, not a Customer one
                  customer: { orderDate: new Date() }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          const customer = new Customer();

          await customer
            .update(
              { name: "Jane" },
              {
                condition: {
                  orders: [
                    // @ts-expect-error: name is a Customer attribute, not an Order one
                    { id: "order-1", condition: { name: "Jane" } }
                  ]
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses a relationship key inside a target condition", async () => {
          const order = new Order();

          await order
            .update(
              { orderDate: new Date() },
              {
                condition: {
                  // @ts-expect-error: a target condition names the related row's own attributes
                  customer: { orders: [{ id: "order-1", condition: {} }] }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          const customer = new Customer();

          await customer
            .update(
              { name: "Jane" },
              {
                condition: {
                  orders: [
                    // @ts-expect-error: nor the related entity's own relationships
                    { id: "order-1", condition: { paymentMethod: {} } }
                  ]
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses a target guard inside a target condition", async () => {
          const organization = new Organization();

          await organization
            .update(
              { name: "Acme" },
              {
                condition: {
                  founders: [
                    {
                      id: "founder-1",
                      condition: {
                        // @ts-expect-error: the related row's foreign key takes its own value only
                        organizationId: { target: { name: "Acme" } }
                      }
                    }
                  ]
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses a malformed { id, condition } entry", async () => {
          const customer = new Customer();

          await customer
            .update(
              { name: "Jane" },
              {
                condition: {
                  orders: [
                    // @ts-expect-error: the entry names its related entity by id
                    { condition: {} },
                    // @ts-expect-error: the entry carries the condition to check
                    { id: "order-2" },
                    // @ts-expect-error: an entry holds id and condition only
                    { id: "order-3", condition: {}, orderDate: new Date() }
                  ]
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("takes target on a typed standalone foreign key", async () => {
          const instance = new MyClassWithAllAttributeTypes();

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-no-error: a ForeignKey<Customer> guards its Customer
                  foreignKeyAttribute: { target: { name: "Jane" } },
                  // @ts-expect-no-error: a NullableForeignKey<Customer> guards its Customer
                  nullableForeignKeyAttribute: { target: {} }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          const profile = new Profile();

          await profile
            .update(
              { lastLogin: new Date() },
              {
                condition: {
                  // @ts-expect-no-error: the target condition is typed from the referenced entity
                  userId: { target: { name: { $beginsWith: "J" } } }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("takes target on the child side of a one-way HasMany", async () => {
          const founder = new Founder();

          await founder
            .update(
              { name: "Jane" },
              {
                condition: {
                  // @ts-expect-no-error: no BelongsTo backs the key, so it guards its target
                  organizationId: { target: { name: "Acme" } }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          const employee = new Employee();

          await employee
            .update(
              { name: "Jane" },
              {
                condition: {
                  // @ts-expect-no-error: a nullable child-side key guards its target too
                  organizationId: { target: { name: "Acme" } }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("keeps a value condition on the key, with the guard's value in $or", async () => {
          const founder = new Founder();

          await founder
            .update(
              { name: "Jane" },
              {
                condition: {
                  // @ts-expect-no-error: the key still takes a value condition
                  organizationId: "org-1"
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await founder
            .update(
              { name: "Jane" },
              {
                condition: {
                  // @ts-expect-no-error: the guard sits on the key
                  organizationId: { target: { name: "Acme" } },
                  // @ts-expect-no-error: and the value condition moves into $or
                  $or: [{ organizationId: "org-1" }, { name: "Jane" }]
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses target on a bare foreign key (AE18)", async () => {
          @Entity
          class LooseOrder extends MockTable {
            declare readonly type: "LooseOrder";

            @DateAttribute({ alias: "OrderDate" })
            public readonly orderDate: Date;

            // Widening the target to DynaRecord is what leaves the key bare:
            // the decorator otherwise requires ForeignKey<Customer>
            @ForeignKeyAttribute((): EntityClass<DynaRecord> => Customer, {
              alias: "CustomerId"
            })
            public readonly customerId: ForeignKey;

            @BelongsTo(() => Customer, { foreignKey: "customerId" })
            public readonly customer: Customer;
          }

          const looseOrder = new LooseOrder();

          await looseOrder
            .update(
              { orderDate: new Date() },
              {
                condition: {
                  // @ts-expect-error: customerId needs its target type to guard it
                  customerId: { target: { name: "Jane" } }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses target on a foreign key backing a BelongsTo", async () => {
          const order = new Order();

          await order
            .update(
              { orderDate: new Date() },
              {
                condition: {
                  // @ts-expect-error: guard the Customer under the customer key
                  customerId: { target: { name: "Jane" } }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses a value condition and target on the same key (R33)", async () => {
          const founder = new Founder();

          await founder
            .update(
              { name: "Jane" },
              {
                condition: {
                  organizationId: {
                    // @ts-expect-error: a value condition alongside a guard goes in $or
                    target: { name: "Acme" },
                    $beginsWith: "org"
                  }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses a target attribute the referenced entity does not declare", async () => {
          const founder = new Founder();

          await founder
            .update(
              { name: "Jane" },
              {
                condition: {
                  // @ts-expect-error: lastFour is a PaymentMethod attribute
                  organizationId: { target: { lastFour: "1234" } }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("misclassifies a typed foreign key beside a HasOne to the same entity", async () => {
          // Known limit: the types tell a BelongsTo from a HasOne only by whether
          // a typed foreign key to the same entity exists. Here one does, so
          // paymentMethod reads as a BelongsTo backed by backupPaymentMethodId
          // and the key's target guard is refused. The condition compiler reads
          // the relationship metadata and throws a FilterError for the shapes
          // the types get wrong
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

          const kiosk = new Kiosk();

          await kiosk
            .update(
              { name: "Lobby" },
              {
                condition: {
                  // @ts-expect-error: known limit — read as backing a BelongsTo; the compiler decides at run time
                  backupPaymentMethodId: { target: { lastFour: "1234" } }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("takes condition beside referentialIntegrityCheck and forceEmbed", async () => {
          const order = new Order();

          await order
            .update(
              { orderDate: new Date() },
              {
                referentialIntegrityCheck: false,
                forceEmbed: true,
                // @ts-expect-no-error: condition sits beside update's existing options
                condition: { orderDate: { $lt: new Date() }, customer: {} }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses an option update does not take", async () => {
          const order = new Order();

          await order
            .update(
              { orderDate: new Date() },
              {
                condition: { orderDate: new Date() },
                // @ts-expect-error: update has no such option
                conditions: { orderDate: new Date() }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("types the condition from the instance's own class", async () => {
          const order = new Order();
          const customer = new Customer();

          await order
            .update(
              { orderDate: new Date() },
              {
                condition: {
                  // @ts-expect-error: name is a Customer attribute, and this instance is an Order
                  name: "Jane"
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await customer
            .update(
              { name: "Jane" },
              {
                // @ts-expect-no-error: the same key is accepted on a Customer instance
                condition: { name: "Jane" }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("accepts each operator a nested field's type allows", async () => {
          const instance = new MyClassWithAllAttributeTypes();

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-no-error: a nested date takes a Date comparison
                  "objectAttribute.createdDate": {
                    $gte: new Date("2026-01-01")
                  },
                  // @ts-expect-no-error: a nested enum takes an IN list of its values
                  "objectAttribute.status": ["active", "inactive"],
                  // @ts-expect-no-error: a nested number takes $between
                  "addressAttribute.geo.lat": { $between: [40, 42] },
                  // @ts-expect-no-error: a nested enum is stored as a string, so it takes a prefix
                  "addressAttribute.geo.accuracy": { $beginsWith: "pre" }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-no-error: a nested date is stored as an ISO string, so it takes a prefix
                  "objectAttribute.createdDate": { $beginsWith: "2026" }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          const arrayOfObjectsEntity = new ArrayOfObjectsEntity();

          await arrayOfObjectsEntity
            .update(
              { name: "Inventory" },
              {
                condition: {
                  // @ts-expect-no-error: a field below a list index resolves to the element's field
                  "data.entries[0].price": { $lt: 10 }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          const deepNestedEntity = new DeepNestedEntity();

          await deepNestedEntity
            .update(
              { name: "Settings" },
              {
                condition: {
                  // @ts-expect-no-error: the deepest field takes its own type
                  "data.level1.level2.level3.flag": false,
                  // @ts-expect-no-error: a nullable field deep in the schema takes null
                  "data.level1.tag": null
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses a dot path naming no declared field, at each depth", async () => {
          const instance = new MyClassWithAllAttributeTypes();

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: objectAttribute declares no such field
                  "objectAttribute.nope": 1
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: geo declares lat, lng and accuracy, not this
                  "addressAttribute.geo.nope": 1
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          const arrayOfObjectsEntity = new ArrayOfObjectsEntity();

          await arrayOfObjectsEntity
            .update(
              { name: "Inventory" },
              {
                condition: {
                  // @ts-expect-error: an entries element declares sku and price, not this
                  "data.entries[0].nope": 1
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          const deepNestedEntity = new DeepNestedEntity();

          await deepNestedEntity
            .update(
              { name: "Settings" },
              {
                condition: {
                  // @ts-expect-error: level3 declares flag and detail, not this
                  "data.level1.level2.level3.nope": 1
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses a list index on a field that is not a list, and a dot path into an attribute that is not an object", async () => {
          const instance = new MyClassWithAllAttributeTypes();

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: name is a string, not a list
                  "objectAttribute.name[0]": "J"
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: geo is an object, not a list
                  "addressAttribute.geo[0]": 1
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: stringAttribute is not an object attribute
                  "stringAttribute.x": "a"
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: numberAttribute is not a list
                  "numberAttribute[0]": 1
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses a value a nested field cannot hold", async () => {
          const instance = new MyClassWithAllAttributeTypes();

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: name is a string
                  "objectAttribute.name": 1
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: geo.lat is a number
                  "addressAttribute.geo.lat": "41"
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: a scores item is a number
                  "addressAttribute.scores[0]": "5"
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: tags holds strings
                  "objectAttribute.tags": { $contains: 1 }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: createdDate is a Date
                  "objectAttribute.createdDate": "2026-01-01"
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: status takes active or inactive
                  "objectAttribute.status": "archived"
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          const arrayOfObjectsEntity = new ArrayOfObjectsEntity();

          await arrayOfObjectsEntity
            .update(
              { name: "Inventory" },
              {
                condition: {
                  // @ts-expect-error: price is a number
                  "data.entries[0].price": "10"
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          const deepNestedEntity = new DeepNestedEntity();

          await deepNestedEntity
            .update(
              { name: "Settings" },
              {
                condition: {
                  // @ts-expect-error: score is a number
                  "data.level1.level2.score": "5"
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses an operator a nested field cannot take", async () => {
          const instance = new MyClassWithAllAttributeTypes();

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: a number has no prefix
                  "addressAttribute.geo.lat": { $beginsWith: "4" }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: a number has no substring
                  "addressAttribute.zip": { $contains: 1 }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: a list has no ordering
                  "objectAttribute.tags": { $gt: "a" }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: a list has no prefix
                  "objectAttribute.tags": { $beginsWith: "v" }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          const deepNestedEntity = new DeepNestedEntity();

          await deepNestedEntity
            .update(
              { name: "Settings" },
              {
                condition: {
                  // @ts-expect-error: a boolean has no substring
                  "data.level1.level2.level3.flag": { $contains: true }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await deepNestedEntity
            .update(
              { name: "Settings" },
              {
                condition: {
                  // @ts-expect-error: a boolean has no ordering
                  "data.level1.level2.level3.flag": { $gt: true }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses a wrong operand for $between and comparisons at a nested path", async () => {
          const instance = new MyClassWithAllAttributeTypes();

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: both bounds are numbers
                  "addressAttribute.geo.lat": { $between: [1, "2"] }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: $between takes a pair
                  "addressAttribute.geo.lat": { $between: [1] }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: geo.lat compares against a number
                  "addressAttribute.geo.lat": { $gt: "40" }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: createdDate compares against a Date
                  "objectAttribute.createdDate": { $gte: "2026-01-01" }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          const arrayOfObjectsEntity = new ArrayOfObjectsEntity();

          await arrayOfObjectsEntity
            .update(
              { name: "Inventory" },
              {
                condition: {
                  // @ts-expect-error: price compares against a number
                  "data.entries[0].price": { $lt: "10" }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("accepts every operator each attribute kind's stored form allows", async () => {
          const instance = new MyClassWithAllAttributeTypes();

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-no-error: comparisons compose with AND on a string
                  stringAttribute: { $gt: "a", $lte: "m" },
                  // @ts-expect-no-error: and on a number
                  numberAttribute: { $gte: 1, $lt: 10 },
                  // @ts-expect-no-error: a date is stored as an ISO string, so it takes a prefix
                  dateAttribute: { $beginsWith: "2026" },
                  // @ts-expect-no-error: an enum is stored as a string, so it takes a prefix
                  enumAttribute: { $beginsWith: "val" },
                  // @ts-expect-no-error: a foreign key is stored as a string, so it takes a prefix
                  foreignKeyAttribute: { $beginsWith: "customer-" },
                  // @ts-expect-no-error: a boolean takes an IN list
                  boolAttribute: [true, false],
                  // @ts-expect-no-error: a nullable date takes a Date comparison
                  nullableDateAttribute: { $lt: new Date() }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-no-error: a string takes $between
                  stringAttribute: { $between: ["a", "m"] },
                  // @ts-expect-no-error: a number takes equality
                  numberAttribute: 5,
                  // @ts-expect-no-error: a date takes a substring of its stored form
                  dateAttribute: { $contains: "-01-" },
                  // @ts-expect-no-error: an enum takes a substring
                  enumAttribute: { $contains: "1" },
                  // @ts-expect-no-error: a foreign key takes a comparison
                  foreignKeyAttribute: { $gt: "customer-1" },
                  // @ts-expect-no-error: a nullable boolean takes equality
                  nullableBoolAttribute: false,
                  // @ts-expect-no-error: a nullable enum takes one of its values
                  nullableEnumAttribute: "val-1"
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-no-error: a string takes an IN list
                  stringAttribute: ["a", "b"],
                  // @ts-expect-no-error: a number takes an IN list
                  numberAttribute: [1, 2],
                  // @ts-expect-no-error: a date takes $between with Date bounds
                  dateAttribute: {
                    $between: [new Date("2026-01-01"), new Date("2026-12-31")]
                  },
                  // @ts-expect-no-error: an enum takes a comparison against its values
                  enumAttribute: { $gte: "val-1" },
                  // @ts-expect-no-error: a foreign key takes an IN list
                  foreignKeyAttribute: ["customer-1", "customer-2"],
                  // @ts-expect-no-error: a nullable foreign key takes a prefix
                  nullableForeignKeyAttribute: { $beginsWith: "customer-" },
                  // @ts-expect-no-error: a nullable number takes an IN list
                  nullableNumberAttribute: [1, 2]
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-no-error: a string takes equality
                  stringAttribute: "a",
                  // @ts-expect-no-error: a date takes equality with a Date
                  dateAttribute: new Date("2026-01-01")
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-no-error: a date takes an IN list of Dates
                  dateAttribute: [
                    new Date("2026-01-01"),
                    new Date("2026-02-01")
                  ],
                  // @ts-expect-no-error: a date takes composed Date comparisons
                  nullableDateAttribute: {
                    $gte: new Date("2026-01-01"),
                    $lt: new Date("2026-02-01")
                  }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses each operator and operand a string attribute cannot take", async () => {
          const instance = new MyClassWithAllAttributeTypes();

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: stringAttribute is a string
                  stringAttribute: 1
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: an IN list holds strings
                  stringAttribute: ["a", 1]
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: a string compares against a string
                  stringAttribute: { $gt: 1 }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: a Date is not a string operand
                  stringAttribute: { $gte: new Date() }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: both bounds are strings
                  stringAttribute: { $between: ["a", 1] }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: a prefix is a string
                  stringAttribute: { $beginsWith: 1 }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: a substring is a scalar, not a Date
                  stringAttribute: { $contains: new Date() }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses each operator and operand a number attribute cannot take", async () => {
          const instance = new MyClassWithAllAttributeTypes();

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: numberAttribute is a number
                  numberAttribute: "5"
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: an IN list holds numbers
                  numberAttribute: [1, "2"]
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: a number compares against a number
                  numberAttribute: { $gt: "5" }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: a Date is not a number operand
                  numberAttribute: { $lte: new Date() }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: both bounds are numbers
                  numberAttribute: { $between: [1, "10"] }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: $between takes a pair
                  numberAttribute: { $between: [1] }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: a number has no prefix
                  numberAttribute: { $beginsWith: "1" }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: an operator object needs at least one operator
                  numberAttribute: {}
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses each operator and operand a boolean attribute cannot take", async () => {
          const instance = new MyClassWithAllAttributeTypes();

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: boolAttribute is a boolean
                  boolAttribute: "true"
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: an IN list holds booleans
                  boolAttribute: [true, "false"]
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: a boolean has no substring
                  boolAttribute: { $contains: true }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: a boolean has no ordering
                  boolAttribute: { $gt: false }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: a boolean has no range
                  boolAttribute: { $between: [false, true] }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses each operator and operand a date attribute cannot take", async () => {
          const instance = new MyClassWithAllAttributeTypes();

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: dateAttribute is compared as a Date
                  dateAttribute: "2026-01-01"
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: an IN list holds Dates
                  dateAttribute: ["2026-01-01"]
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: a date compares against a Date
                  dateAttribute: { $gte: "2026-01-01" }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: a date compares against a Date, not a number
                  dateAttribute: { $gt: 1 }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: both bounds are Dates
                  dateAttribute: { $between: [new Date(), "2026-12-31"] }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: a prefix is a fragment of the stored string, not a Date
                  dateAttribute: { $beginsWith: new Date() }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses each operator and operand an enum attribute cannot take", async () => {
          const instance = new MyClassWithAllAttributeTypes();

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: val-3 is not one of the enum's values
                  enumAttribute: "val-3"
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: an IN list holds the enum's values
                  enumAttribute: ["val-1", "val-3"]
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: a comparison operand is one of the enum's values
                  enumAttribute: { $gt: "val-3" }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: both bounds are the enum's values
                  enumAttribute: { $between: ["val-1", "val-3"] }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: an enum compares against its values, not a number
                  enumAttribute: { $gte: 1 }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: a prefix is a string
                  enumAttribute: { $beginsWith: 1 }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("accepts an enum range across two of its members", async () => {
          const instance = new MyClassWithAllAttributeTypes();

          // An enum is stored as a string, which DynamoDB orders
          // lexicographically, so any two members bound a range
          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-no-error: both bounds are members of the enum
                  enumAttribute: { $between: ["val-1", "val-2"] },
                  // @ts-expect-no-error: a nullable enum ranges across its members
                  nullableEnumAttribute: { $between: ["val-1", "val-2"] },
                  // @ts-expect-no-error: a nested enum ranges across its members
                  "objectAttribute.status": { $between: ["active", "inactive"] }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-no-error: composed comparisons may name different members
                  enumAttribute: { $gte: "val-1", $lte: "val-2" },
                  // @ts-expect-no-error: and composes across them
                  nullableEnumAttribute: { $gt: "val-1", $lt: "val-2" },
                  // @ts-expect-no-error: a nullable nested enum composes across its members
                  "addressAttribute.category": { $gte: "home", $lte: "work" }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-no-error: both bounds may be the same member
                  enumAttribute: { $between: ["val-1", "val-1"] }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses an enum range bound the enum cannot hold", async () => {
          const instance = new MyClassWithAllAttributeTypes();

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: val-3 is not one of the enum's values, composed or not
                  enumAttribute: { $gte: "val-1", $lte: "val-3" }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: archived is not one of the nested enum's values
                  "objectAttribute.status": { $between: ["active", "archived"] }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: an enum is ranged by its values, not a number
                  enumAttribute: { $between: ["val-1", 2] }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: a range bound is never null, nullable enum or not
                  nullableEnumAttribute: { $between: [null, "val-2"] }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: null means not set, which no ordering can compare
                  nullableEnumAttribute: { $gte: "val-1", $lte: null }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: a boolean is not one of the enum's values
                  enumAttribute: { $between: ["val-1", true] }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses each operator and operand a foreign key attribute cannot take", async () => {
          const instance = new MyClassWithAllAttributeTypes();

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: a foreign key is a string
                  foreignKeyAttribute: 1
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: an IN list holds strings
                  foreignKeyAttribute: [1]
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: a foreign key compares against a string
                  foreignKeyAttribute: { $gt: 1 }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: both bounds are strings
                  foreignKeyAttribute: { $between: ["a", 1] }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: a prefix is a string
                  foreignKeyAttribute: { $beginsWith: 1 }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          const founder = new Founder();

          await founder
            .update(
              { name: "Jane" },
              {
                condition: {
                  // @ts-expect-error: the key's value is a string
                  organizationId: 1
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses each operator and operand a nullable attribute cannot take", async () => {
          const instance = new MyClassWithAllAttributeTypes();

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: nullableStringAttribute is a string
                  nullableStringAttribute: 1
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: null means not set, which no ordering can compare
                  nullableStringAttribute: { $gt: null }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: a number has no prefix, nullable or not
                  nullableNumberAttribute: { $beginsWith: "1" }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: a range bound is never null
                  nullableNumberAttribute: { $between: [null, 5] }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: a boolean has no ordering, nullable or not
                  nullableBoolAttribute: { $gt: true }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: a nullable date compares against a Date
                  nullableDateAttribute: { $gte: "2026" }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: val-3 is not one of the enum's values
                  nullableEnumAttribute: "val-3"
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: a nullable foreign key is a string
                  nullableForeignKeyAttribute: 1
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: null means not set, which no ordering can compare
                  nullableForeignKeyAttribute: { $gt: null }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("audits a BelongsTo target condition like the entity's own", async () => {
          const shipment = new Shipment();

          await shipment
            .update(
              { destination: "Dock 4" },
              {
                condition: {
                  // @ts-expect-no-error: the target condition resolves the related row's dot paths
                  warehouse: {
                    "location.city": { $beginsWith: "Spring" },
                    "location.zip": null,
                    $or: [{ "location.state": "IL" }, { name: "Central" }]
                  }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await shipment
            .update(
              { destination: "Dock 4" },
              {
                condition: {
                  warehouse: {
                    // @ts-expect-error: city is a string
                    "location.city": 1
                  }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await shipment
            .update(
              { destination: "Dock 4" },
              {
                condition: {
                  warehouse: {
                    // @ts-expect-error: a number has no prefix
                    "location.zip": { $beginsWith: "9" }
                  }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await shipment
            .update(
              { destination: "Dock 4" },
              {
                condition: {
                  warehouse: {
                    // @ts-expect-error: location declares no such field
                    "location.nope": "x"
                  }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await shipment
            .update(
              { destination: "Dock 4" },
              {
                condition: {
                  warehouse: {
                    // @ts-expect-error: a string compares against a string
                    name: { $gt: 1 }
                  }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("audits a { id, condition } entry's condition like the entity's own", async () => {
          const warehouse = new Warehouse();

          await warehouse
            .update(
              { name: "Central" },
              {
                condition: {
                  // @ts-expect-no-error: an entry's condition resolves the related row's dot paths
                  shipments: [
                    {
                      id: "shipment-1",
                      condition: {
                        "dimensions.weight": { $between: [1, 10] },
                        "dimensions.label": null
                      }
                    }
                  ]
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await warehouse
            .update(
              { name: "Central" },
              {
                condition: {
                  shipments: [
                    {
                      id: "shipment-1",
                      condition: {
                        // @ts-expect-error: weight is a number
                        "dimensions.weight": "5"
                      }
                    }
                  ]
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await warehouse
            .update(
              { name: "Central" },
              {
                condition: {
                  shipments: [
                    {
                      id: "shipment-1",
                      condition: {
                        // @ts-expect-error: a number has no substring
                        "dimensions.weight": { $contains: 1 }
                      }
                    }
                  ]
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await warehouse
            .update(
              { name: "Central" },
              {
                condition: {
                  shipments: [
                    {
                      id: "shipment-1",
                      condition: {
                        // @ts-expect-error: dimensions declares no such field
                        "dimensions.nope": 1
                      }
                    }
                  ]
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await warehouse
            .update(
              { name: "Central" },
              {
                condition: {
                  shipments: [
                    {
                      id: "shipment-1",
                      condition: {
                        // @ts-expect-error: a string compares against a string
                        destination: { $gt: 1 }
                      }
                    }
                  ]
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("audits a target guard's condition like the entity's own", async () => {
          // A standalone foreign key to an entity with an object attribute, so the
          // guard's target condition has dot paths to resolve
          @Entity
          class Delivery extends MockTable {
            declare readonly type: "Delivery";

            @StringAttribute({ alias: "Name" })
            public readonly name: string;

            @ForeignKeyAttribute(() => Warehouse, { alias: "WarehouseId" })
            public readonly warehouseId: ForeignKey<Warehouse>;
          }

          const delivery = new Delivery();

          await delivery
            .update(
              { name: "Morning run" },
              {
                condition: {
                  // @ts-expect-no-error: the guard's condition resolves the referenced row's dot paths
                  warehouseId: {
                    target: {
                      "location.city": "Springfield",
                      "location.zip": { $gte: 60000 }
                    }
                  }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await delivery
            .update(
              { name: "Morning run" },
              {
                condition: {
                  // @ts-expect-error: the guard's condition is typed from Warehouse: city is a string
                  warehouseId: {
                    target: {
                      "location.city": 1
                    }
                  }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await delivery
            .update(
              { name: "Morning run" },
              {
                condition: {
                  // @ts-expect-error: the guard's condition is typed from Warehouse: a number has no prefix
                  warehouseId: {
                    target: {
                      "location.zip": { $beginsWith: "6" }
                    }
                  }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await delivery
            .update(
              { name: "Morning run" },
              {
                condition: {
                  warehouseId: {
                    target: {
                      // @ts-expect-error: location declares no such field
                      "location.nope": "x"
                    }
                  }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await delivery
            .update(
              { name: "Morning run" },
              {
                condition: {
                  // @ts-expect-error: the guard's condition is typed from Warehouse: both bounds are strings
                  warehouseId: {
                    target: {
                      name: { $between: ["a", 1] }
                    }
                  }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses a value an attribute cannot hold inside $or", async () => {
          const order = new Order();

          await order
            .update(
              { orderDate: new Date() },
              {
                condition: {
                  $or: [
                    // @ts-expect-error: orderDate is compared as a Date
                    { orderDate: "2026-01-01" }
                  ]
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses on a HasOne what it refuses on a BelongsTo", async () => {
          const customer = new Customer();

          await customer
            .update(
              { name: "Jane" },
              {
                condition: {
                  // @ts-expect-error: email and phone are ContactInformation attributes; name is not
                  contactInformation: { name: "Jane" }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await customer
            .update(
              { name: "Jane" },
              {
                condition: {
                  // @ts-expect-error: the library resolves a HasOne target itself
                  contactInformation: { id: "contact-1", condition: {} }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses on a HasAndBelongsToMany and a one-way HasMany what it refuses on a HasMany", async () => {
          const book = new Book();

          await book
            .update(
              { name: "Dune" },
              {
                condition: {
                  // @ts-expect-error: a HasAndBelongsToMany takes { id, condition } entries
                  authors: { name: "Jane" }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await book
            .update(
              { name: "Dune" },
              {
                condition: {
                  authors: [
                    // @ts-expect-error: numPages is a Book attribute, not an Author one
                    { id: "author-1", condition: { numPages: 100 } }
                  ]
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          const organization = new Organization();

          await organization
            .update(
              { name: "Acme" },
              {
                condition: {
                  // @ts-expect-error: a one-way HasMany takes { id, condition } entries
                  employees: { name: "Jane" }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses a target attribute the referenced entity does not declare, on every typed key", async () => {
          const instance = new MyClassWithAllAttributeTypes();

          await instance
            .update(
              { stringAttribute: "val" },
              {
                condition: {
                  // @ts-expect-error: lastFour is a PaymentMethod attribute, and the key references a Customer
                  nullableForeignKeyAttribute: { target: { lastFour: "1234" } }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          const employee = new Employee();

          await employee
            .update(
              { name: "Jane" },
              {
                condition: {
                  // @ts-expect-error: lastFour is a PaymentMethod attribute, and the key references an Organization
                  organizationId: { target: { lastFour: "1234" } }
                }
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });

        it("refuses an option value of the wrong type", async () => {
          const order = new Order();

          await order
            .update(
              { orderDate: new Date() },
              {
                // @ts-expect-error: referentialIntegrityCheck is a boolean
                referentialIntegrityCheck: "no"
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await order
            .update(
              { orderDate: new Date() },
              {
                // @ts-expect-error: forceEmbed is a boolean
                forceEmbed: "yes"
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });

          await order
            .update(
              { orderDate: new Date() },
              {
                // @ts-expect-error: condition is an object of conditions
                condition: "orderDate"
              }
            )
            .catch(() => {
              Logger.log("Testing types");
            });
        });
      });
    });
  });

  describe("discriminated union attributes", () => {
    beforeEach(() => {
      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
    });

    it("updates a discriminated union field with full replacement", async () => {
      expect.assertions(2);

      const testDate = new Date("2024-06-15T12:00:00.000Z");

      expect(
        await DiscriminatedUnionEntity.update("du-id-1", {
          payment: {
            method: {
              type: "creditCard",
              cardNumber: "4111",
              expiry: "12/25",
              expiryDate: testDate
            },
            amount: 200
          }
        })
      ).toBeUndefined();

      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#UpdatedAt": "UpdatedAt",
                    "#Payment": "Payment",
                    "#amount": "amount",
                    "#method": "method"
                  },
                  ExpressionAttributeValues: {
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                    ":Payment_amount": 200,
                    ":Payment_method": {
                      type: "creditCard",
                      cardNumber: "4111",
                      expiry: "12/25",
                      expiryDate: "2024-06-15T12:00:00.000Z"
                    }
                  },
                  Key: {
                    PK: "DiscriminatedUnionEntity#du-id-1",
                    SK: "DiscriminatedUnionEntity"
                  },
                  TableName: "mock-table",
                  UpdateExpression:
                    "SET #UpdatedAt = :UpdatedAt, #Payment.#method = :Payment_method, #Payment.#amount = :Payment_amount"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("can switch discriminated union variants on update", async () => {
      expect.assertions(2);

      expect(
        await DiscriminatedUnionEntity.update("du-id-2", {
          payment: {
            method: {
              type: "crypto",
              walletAddress: "0xdef456",
              network: "bitcoin"
            }
          }
        })
      ).toBeUndefined();

      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#UpdatedAt": "UpdatedAt",
                    "#Payment": "Payment",
                    "#method": "method"
                  },
                  ExpressionAttributeValues: {
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                    ":Payment_method": {
                      type: "crypto",
                      walletAddress: "0xdef456",
                      network: "bitcoin"
                    }
                  },
                  Key: {
                    PK: "DiscriminatedUnionEntity#du-id-2",
                    SK: "DiscriminatedUnionEntity"
                  },
                  TableName: "mock-table",
                  UpdateExpression:
                    "SET #UpdatedAt = :UpdatedAt, #Payment.#method = :Payment_method"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("can update nullable discriminated union to null", async () => {
      expect.assertions(2);

      expect(
        await DiscriminatedUnionEntity.update("du-id-3", {
          nullableUnion: {
            preference: null
          }
        })
      ).toBeUndefined();

      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#UpdatedAt": "UpdatedAt",
                    "#NullableUnion": "NullableUnion",
                    "#preference": "preference"
                  },
                  ExpressionAttributeValues: {
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                  },
                  Key: {
                    PK: "DiscriminatedUnionEntity#du-id-3",
                    SK: "DiscriminatedUnionEntity"
                  },
                  TableName: "mock-table",
                  UpdateExpression:
                    "SET #UpdatedAt = :UpdatedAt REMOVE #NullableUnion.#preference"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("can re-populate nullable discriminated union from null back to a value", async () => {
      expect.assertions(2);

      expect(
        await DiscriminatedUnionEntity.update("du-id-4", {
          nullableUnion: {
            preference: {
              channel: "email",
              address: "restored@example.com"
            }
          }
        })
      ).toBeUndefined();

      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#UpdatedAt": "UpdatedAt",
                    "#NullableUnion": "NullableUnion",
                    "#preference": "preference"
                  },
                  ExpressionAttributeValues: {
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                    ":NullableUnion_preference": {
                      channel: "email",
                      address: "restored@example.com"
                    }
                  },
                  Key: {
                    PK: "DiscriminatedUnionEntity#du-id-4",
                    SK: "DiscriminatedUnionEntity"
                  },
                  TableName: "mock-table",
                  UpdateExpression:
                    "SET #UpdatedAt = :UpdatedAt, #NullableUnion.#preference = :NullableUnion_preference"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("updates only non-union fields without touching the union field", async () => {
      expect.assertions(2);

      expect(
        await DiscriminatedUnionEntity.update("du-id-4", {
          payment: {
            amount: 500,
            note: "updated note"
          }
        })
      ).toBeUndefined();

      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#UpdatedAt": "UpdatedAt",
                    "#Payment": "Payment",
                    "#amount": "amount",
                    "#note": "note"
                  },
                  ExpressionAttributeValues: {
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                    ":Payment_amount": 500,
                    ":Payment_note": "updated note"
                  },
                  Key: {
                    PK: "DiscriminatedUnionEntity#du-id-4",
                    SK: "DiscriminatedUnionEntity"
                  },
                  TableName: "mock-table",
                  UpdateExpression:
                    "SET #UpdatedAt = :UpdatedAt, #Payment.#amount = :Payment_amount, #Payment.#note = :Payment_note"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("removes a nullable non-union field within the same schema as a union field", async () => {
      expect.assertions(2);

      expect(
        await DiscriminatedUnionEntity.update("du-id-5", {
          payment: {
            note: null
          }
        })
      ).toBeUndefined();

      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#UpdatedAt": "UpdatedAt",
                    "#Payment": "Payment",
                    "#note": "note"
                  },
                  ExpressionAttributeValues: {
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                  },
                  Key: {
                    PK: "DiscriminatedUnionEntity#du-id-5",
                    SK: "DiscriminatedUnionEntity"
                  },
                  TableName: "mock-table",
                  UpdateExpression:
                    "SET #UpdatedAt = :UpdatedAt REMOVE #Payment.#note"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("accepts a valid complete variant on update", async () => {
      // @ts-expect-no-error: full creditCard variant is valid on update
      await DiscriminatedUnionEntity.update("du-id-type", {
        payment: {
          method: {
            type: "creditCard",
            cardNumber: "4111",
            expiry: "12/25",
            expiryDate: new Date()
          }
        }
      });
    });

    it("rejects invalid discriminator value on update", async () => {
      await DiscriminatedUnionEntity.update("du-id-type", {
        payment: {
          // @ts-expect-error: "paypal" is not a valid discriminator value
          method: { type: "paypal", email: "a@b.com" }
        }
      }).catch(() => {});
    });

    it("rejects wrong fields for variant on update", async () => {
      await DiscriminatedUnionEntity.update("du-id-type", {
        payment: {
          method: {
            type: "creditCard",
            // @ts-expect-error: walletAddress does not exist on creditCard variant
            walletAddress: "0xabc"
          }
        }
      }).catch(() => {});
    });

    it("will error if discriminated union variant is missing required fields", async () => {
      expect.assertions(5);

      try {
        await DiscriminatedUnionEntity.update("du-id-val", {
          payment: {
            method: {
              type: "creditCard"
            } as never
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
        await DiscriminatedUnionEntity.update("du-id-val", {
          payment: {
            method: {
              type: "paypal",
              email: "a@b.com"
            } as never
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
        await DiscriminatedUnionEntity.update("du-id-val", {
          payment: {
            method: {
              type: "creditCard",
              bankName: "Chase",
              accountNumber: "123"
            } as never
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
        await DiscriminatedUnionEntity.update("du-id-val", {
          payment: {
            method: {
              cardNumber: "4111",
              expiry: "12/25",
              expiryDate: new Date()
            } as never
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
    beforeEach(() => {
      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
    });

    it("updates an array of discriminated union items with full replacement", async () => {
      expect.assertions(2);

      const testDate = new Date("2024-06-15T12:00:00.000Z");

      expect(
        await ArrayOfUnionsEntity.update("aou-id-1", {
          dashboard: {
            widgets: [
              {
                type: "metric-card",
                label: "Revenue",
                value: 500,
                format: "currency",
                trend: "up"
              },
              {
                type: "date-marker",
                date: testDate,
                label: "Q2 Start"
              }
            ]
          }
        })
      ).toBeUndefined();

      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#UpdatedAt": "UpdatedAt",
                    "#Dashboard": "Dashboard",
                    "#widgets": "widgets"
                  },
                  ExpressionAttributeValues: {
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                    ":Dashboard_widgets": [
                      {
                        type: "metric-card",
                        label: "Revenue",
                        value: 500,
                        format: "currency",
                        trend: "up"
                      },
                      {
                        type: "date-marker",
                        date: "2024-06-15T12:00:00.000Z",
                        label: "Q2 Start"
                      }
                    ]
                  },
                  Key: {
                    PK: "ArrayOfUnionsEntity#aou-id-1",
                    SK: "ArrayOfUnionsEntity"
                  },
                  TableName: "mock-table",
                  UpdateExpression:
                    "SET #UpdatedAt = :UpdatedAt, #Dashboard.#widgets = :Dashboard_widgets"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("can update to an empty array of union items", async () => {
      expect.assertions(2);

      expect(
        await ArrayOfUnionsEntity.update("aou-id-2", {
          dashboard: {
            widgets: []
          }
        })
      ).toBeUndefined();

      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#UpdatedAt": "UpdatedAt",
                    "#Dashboard": "Dashboard",
                    "#widgets": "widgets"
                  },
                  ExpressionAttributeValues: {
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                    ":Dashboard_widgets": []
                  },
                  Key: {
                    PK: "ArrayOfUnionsEntity#aou-id-2",
                    SK: "ArrayOfUnionsEntity"
                  },
                  TableName: "mock-table",
                  UpdateExpression:
                    "SET #UpdatedAt = :UpdatedAt, #Dashboard.#widgets = :Dashboard_widgets"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("can update non-array fields without touching the union array", async () => {
      expect.assertions(2);

      expect(
        await ArrayOfUnionsEntity.update("aou-id-3", {
          dashboard: {
            title: "Updated Title"
          }
        })
      ).toBeUndefined();

      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#UpdatedAt": "UpdatedAt",
                    "#Dashboard": "Dashboard",
                    "#title": "title"
                  },
                  ExpressionAttributeValues: {
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                    ":Dashboard_title": "Updated Title"
                  },
                  Key: {
                    PK: "ArrayOfUnionsEntity#aou-id-3",
                    SK: "ArrayOfUnionsEntity"
                  },
                  TableName: "mock-table",
                  UpdateExpression:
                    "SET #UpdatedAt = :UpdatedAt, #Dashboard.#title = :Dashboard_title"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("accepts valid mixed variants in array on update", async () => {
      // @ts-expect-no-error: mixed valid variants on update
      await ArrayOfUnionsEntity.update("aou-id-type", {
        dashboard: {
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

    it("rejects invalid discriminator value in array item on update", async () => {
      await ArrayOfUnionsEntity.update("aou-id-type", {
        dashboard: {
          widgets: [
            // @ts-expect-error: "chart" is not a valid discriminator value
            { type: "chart", data: [1, 2, 3] }
          ]
        }
      }).catch(() => {});
    });

    it("rejects wrong fields for variant in array item on update", async () => {
      await ArrayOfUnionsEntity.update("aou-id-type", {
        dashboard: {
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

    it("will error if array union item is missing required fields on update", async () => {
      expect.assertions(5);

      try {
        await ArrayOfUnionsEntity.update("aou-id-val", {
          dashboard: {
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

    it("will error if array union item has an invalid discriminator value on update", async () => {
      expect.assertions(5);

      try {
        await ArrayOfUnionsEntity.update("aou-id-val", {
          dashboard: {
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

    it("will error if array union item is missing the discriminator key on update", async () => {
      expect.assertions(5);

      try {
        await ArrayOfUnionsEntity.update("aou-id-val", {
          dashboard: {
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
    it("can update an attribute inherited from an abstract base class", async () => {
      expect.assertions(5);

      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

      expect(await Car.update("123", { make: "Honda" })).toBeUndefined();

      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockedQueryCommand.mock.calls).toEqual([]);
      expect(mockTransactGetCommand.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  TableName: "mock-table",
                  Key: {
                    PK: "Car#123",
                    SK: "Car"
                  },
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#Make": "Make",
                    "#UpdatedAt": "UpdatedAt"
                  },
                  ExpressionAttributeValues: {
                    ":Make": "Honda",
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                  },
                  UpdateExpression: "SET #Make = :Make, #UpdatedAt = :UpdatedAt"
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
        await Car.update("123", { make: 123 } as any);
      } catch (e: any) {
        expect(e).toBeInstanceOf(ValidationError);
        expect(e.message).toEqual("Validation errors");
        expect(e.cause).toEqual([
          {
            code: "invalid_type",
            expected: "string",
            message: "Invalid input: expected string, received number",
            path: ["make"]
          }
        ]);
        expect(mockSend.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([]);
      }
    });
  });
  describe("Update an entity whose HasOne child shares its id", () => {
    // A three-entity chain covering the case where a HasOne child's own id IS
    // its parent's id (`@IdAttribute` on the foreign key). The child denormalizes
    // into its parent's partition under a different sort key but the SAME `Id`,
    // so an update's prefetch of that partition sees two rows whose `id` is the
    // id being updated. `PlanGroup` gives `GroupedPlan` an owning partition, so a
    // prefetch that mistakes the lock for the plan is observable as a missing
    // denormalization write rather than only as a lost related-entity update.
    @Entity
    class PlanGroup extends MockTable {
      declare readonly type: "PlanGroup";

      @StringAttribute({ alias: "Label" })
      public readonly label: string;

      @HasMany(() => GroupedPlan, {
        foreignKey: "planGroupId",
        uniDirectional: true
      })
      public readonly plans: GroupedPlan[];
    }

    @Entity
    class GroupedPlan extends MockTable {
      declare readonly type: "GroupedPlan";

      @ForeignKeyAttribute(() => PlanGroup, { alias: "PlanGroupId" })
      public readonly planGroupId: ForeignKey<PlanGroup>;

      @StringAttribute({ alias: "Status" })
      public readonly status: string;

      @HasOne(() => PlanLock, { foreignKey: "groupedPlanId" })
      public readonly lock?: PlanLock;
    }

    @Entity
    class PlanLock extends MockTable {
      declare readonly type: "PlanLock";

      @IdAttribute
      @ForeignKeyAttribute(() => GroupedPlan, { alias: "GroupedPlanId" })
      public readonly groupedPlanId: ForeignKey<GroupedPlan>;

      @DateAttribute({ alias: "AcquiredAt" })
      public readonly acquiredAt: Date;

      @BelongsTo(() => GroupedPlan, { foreignKey: "groupedPlanId" })
      public readonly groupedPlan: GroupedPlan;
    }

    beforeEach(() => {
      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
    });

    afterEach(() => {
      mockSend.mockReset();
      mockQuery.mockReset();
      mockTransactGetItems.mockReset();
    });

    // A HasOne child declared with `@IdAttribute` on its foreign key has its
    // parent's id as its OWN id, so the prefetch of the parent's partition
    // returns two rows whose `Id` is the id being updated. The row being updated
    // must still be identified as the parent — picking the child strands the
    // parent's foreign key and silently drops every denormalization write from
    // the transaction, leaving the copies permanently behind the canonical row.
    it("denormalizes to every copy while the child row is present", async () => {
      expect.assertions(2);

      const plan: MockTableEntityTableItem<GroupedPlan> = {
        PK: "GroupedPlan#plan-1",
        SK: "GroupedPlan",
        Id: "plan-1",
        Type: "GroupedPlan",
        PlanGroupId: "group-1",
        Status: "active",
        CreatedAt: "2023-01-01T00:00:00.000Z",
        UpdatedAt: "2023-01-02T00:00:00.000Z"
      };

      // Sorts AFTER the plan row ("GroupedPlan" < "PlanLock"), so a last-write-wins
      // match on `Id` alone resolves to this row rather than the plan
      const lockLink: MockTableEntityTableItem<PlanLock> = {
        PK: "GroupedPlan#plan-1",
        SK: "PlanLock",
        Id: "plan-1",
        Type: "PlanLock",
        GroupedPlanId: "plan-1",
        AcquiredAt: "2023-10-16T03:31:30.000Z",
        CreatedAt: "2023-10-16T03:31:30.000Z",
        UpdatedAt: "2023-10-16T03:31:30.000Z"
      };

      mockQuery.mockResolvedValueOnce({ Items: [plan, lockLink] });

      expect(
        await GroupedPlan.update("plan-1", { status: "archived" })
      ).toBeUndefined();

      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  TableName: "mock-table",
                  Key: { PK: "GroupedPlan#plan-1", SK: "GroupedPlan" },
                  UpdateExpression:
                    "SET #Status = :Status, #UpdatedAt = :UpdatedAt",
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#Status": "Status",
                    "#UpdatedAt": "UpdatedAt"
                  },
                  ExpressionAttributeValues: {
                    ":Status": "archived",
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                  }
                }
              },
              {
                // Denormalized GroupedPlan in the PlanLock partition
                Update: {
                  TableName: "mock-table",
                  Key: { PK: "PlanLock#plan-1", SK: "GroupedPlan" },
                  UpdateExpression:
                    "SET #Status = :Status, #UpdatedAt = :UpdatedAt",
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#Status": "Status",
                    "#UpdatedAt": "UpdatedAt"
                  },
                  ExpressionAttributeValues: {
                    ":Status": "archived",
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                  }
                }
              },
              {
                // Denormalized GroupedPlan in the owning PlanGroup partition
                Update: {
                  TableName: "mock-table",
                  Key: { PK: "PlanGroup#group-1", SK: "GroupedPlan#plan-1" },
                  UpdateExpression:
                    "SET #Status = :Status, #UpdatedAt = :UpdatedAt",
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#Status": "Status",
                    "#UpdatedAt": "UpdatedAt"
                  },
                  ExpressionAttributeValues: {
                    ":Status": "archived",
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                  }
                }
              }
            ]
          }
        ]
      ]);
    });
  });

  // The `Vendor` / `Discovery` pair predates this fix: `Discovery` declares
  // `@IdAttribute` on its foreign key, so its id IS its parent's id and it
  // denormalizes into the parent's partition carrying that id. No update test
  // had ever exercised the pair, which is how the id-only match survived. This
  // covers the related-entity half of the defect on the existing fixtures; the
  // owning-partition half needs a parent that itself belongs to something, which
  // `Vendor` does not — see the PlanGroup chain above.
  describe("Update an entity whose HasOne child shares its id (existing fixtures)", () => {
    beforeEach(() => {
      vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
    });

    afterEach(() => {
      mockSend.mockReset();
      mockQuery.mockReset();
      mockTransactGetItems.mockReset();
    });

    it("updates the denormalized copy in the child's partition", async () => {
      expect.assertions(2);

      const vendor: MockTableEntityTableItem<Vendor> = {
        PK: "Vendor#v-1",
        SK: "Vendor",
        Id: "v-1",
        Type: "Vendor",
        Name: "Old Name",
        CreatedAt: "2023-01-01T00:00:00.000Z",
        UpdatedAt: "2023-01-02T00:00:00.000Z"
      };

      // Same `Id` as the vendor, and "Discovery" sorts BEFORE "Vendor" here — the
      // clobber depends only on the child being seen, not on a particular order
      const discoveryLink: MockTableEntityTableItem<Discovery> = {
        PK: "Vendor#v-1",
        SK: "Discovery",
        Id: "v-1",
        Type: "Discovery",
        VendorId: "v-1",
        Details: "some details",
        CreatedAt: "2023-01-01T00:00:00.000Z",
        UpdatedAt: "2023-01-02T00:00:00.000Z"
      };

      mockQuery.mockResolvedValueOnce({ Items: [vendor, discoveryLink] });

      expect(await Vendor.update("v-1", { name: "New Name" })).toBeUndefined();

      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  TableName: "mock-table",
                  Key: { PK: "Vendor#v-1", SK: "Vendor" },
                  UpdateExpression:
                    "SET #Name = :Name, #UpdatedAt = :UpdatedAt",
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#Name": "Name",
                    "#UpdatedAt": "UpdatedAt"
                  },
                  ExpressionAttributeValues: {
                    ":Name": "New Name",
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                  }
                }
              },
              {
                // Denormalized Vendor in the Discovery partition
                Update: {
                  TableName: "mock-table",
                  Key: { PK: "Discovery#v-1", SK: "Vendor" },
                  UpdateExpression:
                    "SET #Name = :Name, #UpdatedAt = :UpdatedAt",
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#Name": "Name",
                    "#UpdatedAt": "UpdatedAt"
                  },
                  ExpressionAttributeValues: {
                    ":Name": "New Name",
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                  }
                }
              }
            ]
          }
        ]
      ]);
    });
  });
});

@Table({
  name: "search-parent-table",
  defaultFields: {
    id: { alias: "Id" },
    type: { alias: "Type" },
    createdAt: { alias: "CreatedAt" },
    updatedAt: { alias: "UpdatedAt" }
  }
})
abstract class SearchParentTable extends DynaRecord {
  @PartitionKeyAttribute({ alias: "PK" })
  public readonly pk: PartitionKey;

  @SortKeyAttribute({ alias: "SK" })
  public readonly sk: SortKey;
}

// A searchable entity with "has" relationships, so its updates fan the shared
// expression out to denormalized copies in related partitions
@Entity
class SearchParent extends SearchParentTable {
  declare readonly type: "SearchParent";

  @Searchable()
  @StringAttribute({ alias: "Description" })
  public readonly description: SearchableText;

  // Independently nullable non-searchable attribute: nulling it alongside a
  // searchable change exercises the vector SET merge into an expression that
  // already carries a REMOVE clause
  @StringAttribute({ alias: "Notes", nullable: true })
  public readonly notes?: string;

  @HasMany(() => SearchChild, { foreignKey: "parentId" })
  public readonly children: SearchChild[];
}

@Entity
class SearchChild extends SearchParentTable {
  declare readonly type: "SearchChild";

  @ForeignKeyAttribute(() => SearchParent, { alias: "ParentId" })
  public readonly parentId: ForeignKey<SearchParent>;

  @BelongsTo(() => SearchParent, { foreignKey: "parentId" })
  public readonly parent: SearchParent;
}

SearchParentTable.vectorIndexes({
  parentSearchIndex: {
    name: "parent-search-index",
    vectorAttribute: "__dyna_vector",
    model: TitanTextEmbedV2,
    provider: mockEmbeddingProvider,
    members: [() => SearchParent]
  }
});

describe("Update searchable entities (vector write path)", () => {
  const expectedTitanVector = new Array<number>(1024).fill(0.1);
  // The article index's provider fills a distinguishable value
  const expectedArticleVector = new Array<number>(1024).fill(0.7);

  const listingTableItem = {
    PK: "Listing#123",
    SK: "Listing",
    Id: "123",
    Type: "Listing",
    Description: "The very same description",
    Category: "Mugs",
    StoreId: "456",
    __dyna_vector: [0.5, 0.5],
    CreatedAt: "2023-10-01T00:00:00.000Z",
    UpdatedAt: "2023-10-02T00:00:00.000Z"
  };

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
    mockEmbeddingProviderCalls.length = 0;
  });

  it("will not call the provider or write vector clauses when the payload does not touch the searchable attribute", async () => {
    expect.assertions(3);

    mockQuery.mockResolvedValueOnce({ Items: [listingTableItem] });

    await Listing.update("123", { category: "Ceramics" });

    const expression = {
      UpdateExpression: "SET #Category = :Category, #UpdatedAt = :UpdatedAt",
      ExpressionAttributeNames: {
        "#Category": "Category",
        "#UpdatedAt": "UpdatedAt"
      },
      ExpressionAttributeValues: {
        ":Category": "Ceramics",
        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
      }
    };

    expect(mockEmbeddingProviderCalls).toEqual([]);
    expect(mockSend.mock.calls).toEqual([
      [{ name: "QueryCommand" }],
      [{ name: "TransactWriteCommand" }]
    ]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Update: {
                TableName: "search-table",
                Key: { PK: "Listing#123", SK: "Listing" },
                ConditionExpression: "attribute_exists(PK)",
                ...expression
              }
            },
            {
              // Denormalized link in the Store partition gets the same
              // vector-free expression
              Update: {
                TableName: "search-table",
                Key: { PK: "Store#456", SK: "Listing#123" },
                ConditionExpression: "attribute_exists(PK)",
                ...expression
              }
            }
          ]
        }
      ]
    ]);
  });

  it("will not re-embed when the searchable value is unchanged", async () => {
    expect.assertions(2);

    mockQuery.mockResolvedValueOnce({ Items: [listingTableItem] });

    await Listing.update("123", {
      description: "The very same description"
    });

    const expression = {
      UpdateExpression:
        "SET #Description = :Description, #UpdatedAt = :UpdatedAt",
      ExpressionAttributeNames: {
        "#Description": "Description",
        "#UpdatedAt": "UpdatedAt"
      },
      ExpressionAttributeValues: {
        ":Description": "The very same description",
        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
      }
    };

    // The stored value matches, so no provider call and no vector write
    // occur. Note what the expression does NOT carry: Listing's table
    // declares a second index, and the skip returns before the vector
    // clauses are built, so the sibling REMOVE is absent too — convergence
    // rides on writes that actually embed or clear (documented in the
    // migration notes). The canonical row's condition pins the searchable
    // value the skip was decided on — a concurrent clear committing in the
    // prefetch-to-commit window fails the write instead of leaving the row
    // silently missing from the index. The pin reuses the SET's own
    // expression name and value, adding no request bytes
    expect(mockEmbeddingProviderCalls).toEqual([]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Update: {
                TableName: "search-table",
                Key: { PK: "Listing#123", SK: "Listing" },
                ConditionExpression:
                  "attribute_exists(PK) AND #Description = :Description",
                ...expression
              }
            },
            {
              // The denormalized copy keeps the plain expression — no pin,
              // no vector clauses
              Update: {
                TableName: "search-table",
                Key: { PK: "Store#456", SK: "Listing#123" },
                ConditionExpression: "attribute_exists(PK)",
                ...expression
              }
            }
          ]
        }
      ]
    ]);
  });

  it("will embed on an unchanged searchable value when forceEmbed is passed", async () => {
    expect.assertions(2);

    mockQuery.mockResolvedValueOnce({ Items: [listingTableItem] });

    await Listing.update(
      "123",
      { description: "The very same description" },
      { forceEmbed: true }
    );

    // forceEmbed overrides the unchanged-value skip — the affordance for
    // indexing rows that predate searchability and for re-embedding after
    // an embedding model change
    expect(mockEmbeddingProviderCalls).toEqual(["The very same description"]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Update: {
                TableName: "search-table",
                Key: { PK: "Listing#123", SK: "Listing" },
                ConditionExpression: "attribute_exists(PK)",
                UpdateExpression:
                  "SET #Description = :Description, #UpdatedAt = :UpdatedAt, #__dyna_vector = :__dyna_vector REMOVE #__dyna_vector_articles",
                ExpressionAttributeNames: {
                  "#Description": "Description",
                  "#UpdatedAt": "UpdatedAt",
                  "#__dyna_vector": "__dyna_vector",
                  "#__dyna_vector_articles": "__dyna_vector_articles"
                },
                ExpressionAttributeValues: {
                  ":Description": "The very same description",
                  ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                  ":__dyna_vector": expectedTitanVector
                }
              }
            },
            {
              // The denormalized copy stays vector-free
              Update: {
                TableName: "search-table",
                Key: { PK: "Store#456", SK: "Listing#123" },
                ConditionExpression: "attribute_exists(PK)",
                UpdateExpression:
                  "SET #Description = :Description, #UpdatedAt = :UpdatedAt",
                ExpressionAttributeNames: {
                  "#Description": "Description",
                  "#UpdatedAt": "UpdatedAt"
                },
                ExpressionAttributeValues: {
                  ":Description": "The very same description",
                  ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                }
              }
            }
          ]
        }
      ]
    ]);
  });

  it("fails loudly with a retryable error when the pinned stored hash was cleared by a concurrent write", async () => {
    expect.assertions(2);

    mockQuery.mockResolvedValueOnce({ Items: [listingTableItem] });

    // The prefetch query passes through; the transaction is canceled because
    // the canonical row's pinned hash condition no longer holds — a
    // concurrent write cleared the searchable value in the window
    mockSend
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new TransactionCanceledException({
          message: "MockMessage",
          CancellationReasons: [
            { Code: "ConditionalCheckFailed" },
            { Code: "None" }
          ],
          $metadata: {}
        });
      });

    try {
      await Listing.update("123", {
        description: "The very same description"
      });
    } catch (e: any) {
      expect(e.constructor.name).toEqual("TransactionWriteFailedError");
      expect(e.errors).toEqual([
        new ConditionalCheckFailedError(
          "ConditionalCheckFailed: Listing with ID '123' does not exist or its searchable value was changed by a concurrent write — retry the update"
        )
      ]);
    }
  });

  it("will embed a changed searchable value and append the vector write to the canonical row only", async () => {
    expect.assertions(2);

    mockQuery.mockResolvedValueOnce({ Items: [listingTableItem] });

    await Listing.update("123", {
      description: "An updated listing description"
    });

    expect(mockEmbeddingProviderCalls).toEqual([
      "An updated listing description"
    ]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              // Canonical row carries the vector SET clauses
              Update: {
                TableName: "search-table",
                Key: { PK: "Listing#123", SK: "Listing" },
                ConditionExpression: "attribute_exists(PK)",
                UpdateExpression:
                  "SET #Description = :Description, #UpdatedAt = :UpdatedAt, #__dyna_vector = :__dyna_vector REMOVE #__dyna_vector_articles",
                ExpressionAttributeNames: {
                  "#Description": "Description",
                  "#UpdatedAt": "UpdatedAt",
                  "#__dyna_vector": "__dyna_vector",
                  "#__dyna_vector_articles": "__dyna_vector_articles"
                },
                ExpressionAttributeValues: {
                  ":Description": "An updated listing description",
                  ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                  ":__dyna_vector": expectedTitanVector
                }
              }
            },
            {
              // The denormalized link's expression maps stay vector-free —
              // the canonical row received fresh map copies before the vector
              // clauses were appended
              Update: {
                TableName: "search-table",
                Key: { PK: "Store#456", SK: "Listing#123" },
                ConditionExpression: "attribute_exists(PK)",
                UpdateExpression:
                  "SET #Description = :Description, #UpdatedAt = :UpdatedAt",
                ExpressionAttributeNames: {
                  "#Description": "Description",
                  "#UpdatedAt": "UpdatedAt"
                },
                ExpressionAttributeValues: {
                  ":Description": "An updated listing description",
                  ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                }
              }
            }
          ]
        }
      ]
    ]);
  });

  it("will remove the vector and hash from the canonical row when the searchable value is set to null", async () => {
    expect.assertions(3);

    await Article.update("123", { content: null });

    expect(mockEmbeddingProviderCalls).toEqual([]);
    // Relationship-free entity: no prefetch query, one transaction
    expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Update: {
                TableName: "search-table",
                Key: { PK: "Article#123", SK: "Article" },
                ConditionExpression: "attribute_exists(PK)",
                UpdateExpression:
                  "SET #UpdatedAt = :UpdatedAt REMOVE #Content, #__dyna_vector_articles, #__dyna_vector",
                ExpressionAttributeNames: {
                  "#Content": "Content",
                  "#UpdatedAt": "UpdatedAt",
                  "#__dyna_vector_articles": "__dyna_vector_articles",
                  "#__dyna_vector": "__dyna_vector"
                },
                ExpressionAttributeValues: {
                  ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                }
              }
            }
          ]
        }
      ]
    ]);
  });

  it("will remove the vector and hash without calling the provider when the searchable value is an empty string", async () => {
    expect.assertions(2);

    await Article.update("123", { content: "" });

    // Empty text never reaches the provider
    expect(mockEmbeddingProviderCalls).toEqual([]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Update: {
                TableName: "search-table",
                Key: { PK: "Article#123", SK: "Article" },
                ConditionExpression: "attribute_exists(PK)",
                UpdateExpression:
                  "SET #Content = :Content, #UpdatedAt = :UpdatedAt REMOVE #__dyna_vector_articles, #__dyna_vector",
                ExpressionAttributeNames: {
                  "#Content": "Content",
                  "#UpdatedAt": "UpdatedAt",
                  "#__dyna_vector_articles": "__dyna_vector_articles",
                  "#__dyna_vector": "__dyna_vector"
                },
                ExpressionAttributeValues: {
                  ":Content": "",
                  ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                }
              }
            }
          ]
        }
      ]
    ]);
  });

  it("will embed unconditionally for a relationship-free entity when the payload carries the searchable attribute", async () => {
    expect.assertions(4);

    await Article.update("123", { content: "Fresh article content" });

    // No prefetch exists to supply a stored hash, so the value embeds even
    // if unchanged — rather than forcing a new read
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
              Update: {
                TableName: "search-table",
                Key: { PK: "Article#123", SK: "Article" },
                ConditionExpression: "attribute_exists(PK)",
                UpdateExpression:
                  "SET #Content = :Content, #UpdatedAt = :UpdatedAt, #__dyna_vector_articles = :__dyna_vector_articles REMOVE #__dyna_vector",
                ExpressionAttributeNames: {
                  "#Content": "Content",
                  "#UpdatedAt": "UpdatedAt",
                  "#__dyna_vector_articles": "__dyna_vector_articles",
                  "#__dyna_vector": "__dyna_vector"
                },
                ExpressionAttributeValues: {
                  ":Content": "Fresh article content",
                  ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                  ":__dyna_vector_articles": expectedArticleVector
                }
              }
            }
          ]
        }
      ]
    ]);
  });

  it("will keep denormalized copy updates in related partitions vector-free when embedding", async () => {
    expect.assertions(2);

    const parent = {
      PK: "SearchParent#p1",
      SK: "SearchParent",
      Id: "p1",
      Type: "SearchParent",
      Description: "Old description",
      CreatedAt: "2023-10-01T00:00:00.000Z",
      UpdatedAt: "2023-10-02T00:00:00.000Z"
    };

    // Denormalized child copy in the parent's partition
    const childCopy = {
      PK: "SearchParent#p1",
      SK: "SearchChild#c1",
      Id: "c1",
      Type: "SearchChild",
      ParentId: "p1",
      CreatedAt: "2023-10-03T00:00:00.000Z",
      UpdatedAt: "2023-10-04T00:00:00.000Z"
    };

    mockQuery.mockResolvedValueOnce({ Items: [parent, childCopy] });

    await SearchParent.update("p1", {
      description: "Updated parent description"
    });

    expect(mockEmbeddingProviderCalls).toEqual(["Updated parent description"]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              // Canonical row carries the vector SET clauses
              Update: {
                TableName: "search-parent-table",
                Key: { PK: "SearchParent#p1", SK: "SearchParent" },
                ConditionExpression: "attribute_exists(PK)",
                UpdateExpression:
                  "SET #Description = :Description, #UpdatedAt = :UpdatedAt, #__dyna_vector = :__dyna_vector",
                ExpressionAttributeNames: {
                  "#Description": "Description",
                  "#UpdatedAt": "UpdatedAt",
                  "#__dyna_vector": "__dyna_vector"
                },
                ExpressionAttributeValues: {
                  ":Description": "Updated parent description",
                  ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                  ":__dyna_vector": expectedTitanVector
                }
              }
            },
            {
              // The parent's denormalized copy in the child's partition gets
              // the vector-free expression
              Update: {
                TableName: "search-parent-table",
                Key: { PK: "SearchChild#c1", SK: "SearchParent" },
                ConditionExpression: "attribute_exists(PK)",
                UpdateExpression:
                  "SET #Description = :Description, #UpdatedAt = :UpdatedAt",
                ExpressionAttributeNames: {
                  "#Description": "Description",
                  "#UpdatedAt": "UpdatedAt"
                },
                ExpressionAttributeValues: {
                  ":Description": "Updated parent description",
                  ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                }
              }
            }
          ]
        }
      ]
    ]);
  });

  it("will merge the vector SET clause into an expression that already carries a REMOVE clause", async () => {
    expect.assertions(2);

    const parent = {
      PK: "SearchParent#p1",
      SK: "SearchParent",
      Id: "p1",
      Type: "SearchParent",
      Description: "Old description",
      Notes: "to be removed",
      CreatedAt: "2023-10-01T00:00:00.000Z",
      UpdatedAt: "2023-10-02T00:00:00.000Z"
    };
    const childCopy = {
      PK: "SearchParent#p1",
      SK: "SearchChild#c1",
      Id: "c1",
      Type: "SearchChild",
      ParentId: "p1",
      CreatedAt: "2023-10-03T00:00:00.000Z",
      UpdatedAt: "2023-10-04T00:00:00.000Z"
    };

    mockQuery.mockResolvedValueOnce({ Items: [parent, childCopy] });

    // Changing the searchable value while nulling another attribute in the
    // same call: the shared expression already ends in a REMOVE clause, so
    // the vector SET must splice in ahead of it on the canonical row only
    await SearchParent.update("p1", {
      description: "Updated parent description",
      notes: null
    });

    expect(mockEmbeddingProviderCalls).toEqual(["Updated parent description"]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Update: {
                TableName: "search-parent-table",
                Key: { PK: "SearchParent#p1", SK: "SearchParent" },
                ConditionExpression: "attribute_exists(PK)",
                UpdateExpression:
                  "SET #Description = :Description, #UpdatedAt = :UpdatedAt, #__dyna_vector = :__dyna_vector REMOVE #Notes",
                ExpressionAttributeNames: {
                  "#Description": "Description",
                  "#Notes": "Notes",
                  "#UpdatedAt": "UpdatedAt",
                  "#__dyna_vector": "__dyna_vector"
                },
                ExpressionAttributeValues: {
                  ":Description": "Updated parent description",
                  ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                  ":__dyna_vector": expectedTitanVector
                }
              }
            },
            {
              // The copy keeps the SET + REMOVE expression with no vector
              Update: {
                TableName: "search-parent-table",
                Key: { PK: "SearchChild#c1", SK: "SearchParent" },
                ConditionExpression: "attribute_exists(PK)",
                UpdateExpression:
                  "SET #Description = :Description, #UpdatedAt = :UpdatedAt REMOVE #Notes",
                ExpressionAttributeNames: {
                  "#Description": "Description",
                  "#Notes": "Notes",
                  "#UpdatedAt": "UpdatedAt"
                },
                ExpressionAttributeValues: {
                  ":Description": "Updated parent description",
                  ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                }
              }
            }
          ]
        }
      ]
    ]);
  });

  it("will keep Put-based denormalized copies vector-free when updating a foreign key on a searchable entity", async () => {
    expect.assertions(2);

    const newStore = {
      PK: "Store#789",
      SK: "Store",
      Id: "789",
      Type: "Store",
      Name: "New Store",
      CreatedAt: "2024-01-01T00:00:00.000Z",
      UpdatedAt: "2024-01-02T00:00:00.000Z"
    };

    mockTransactGetItems.mockResolvedValueOnce({
      Responses: [{ Item: newStore }]
    });
    mockQuery.mockResolvedValueOnce({ Items: [listingTableItem] });

    await Listing.update("123", { storeId: "789" });

    expect(mockEmbeddingProviderCalls).toEqual([]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Update: {
                TableName: "search-table",
                Key: { PK: "Listing#123", SK: "Listing" },
                ConditionExpression: "attribute_exists(PK)",
                UpdateExpression:
                  "SET #StoreId = :StoreId, #UpdatedAt = :UpdatedAt",
                ExpressionAttributeNames: {
                  "#StoreId": "StoreId",
                  "#UpdatedAt": "UpdatedAt"
                },
                ExpressionAttributeValues: {
                  ":StoreId": "789",
                  ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                }
              }
            },
            {
              // Delete the old link from the previous store's partition
              Delete: {
                TableName: "search-table",
                Key: { PK: "Store#456", SK: "Listing#123" }
              }
            },
            {
              // Check that the new Store exists
              ConditionCheck: {
                ConditionExpression: "attribute_exists(PK)",
                Key: { PK: "Store#789", SK: "Store" },
                TableName: "search-table"
              }
            },
            {
              // Denormalized Listing in the new Store partition: built from
              // the serialized entity, which emits neither the unregistered
              // vector nor the content hash — copies carry no vector-search
              // bookkeeping
              Put: {
                TableName: "search-table",
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "Store#789",
                  SK: "Listing#123",
                  Id: "123",
                  Type: "Listing",
                  Description: "The very same description",
                  Category: "Mugs",
                  StoreId: "789",
                  CreatedAt: "2023-10-01T00:00:00.000Z",
                  UpdatedAt: "2023-10-16T03:31:35.918Z"
                }
              }
            },
            {
              // Denormalized new Store in the Listing partition
              Put: {
                TableName: "search-table",
                ConditionExpression: "attribute_exists(PK)",
                Item: {
                  PK: "Listing#123",
                  SK: "Store",
                  Id: "789",
                  Type: "Store",
                  Name: "New Store",
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
});

// Two attributes whose aliases collide with each other's numbered value
// placeholders: the update binds `:Line` and `:Line1`, so a condition on `line`
// must not bind `:Line1`
@Entity
class ShippingLabel extends MockTable {
  declare readonly type: "ShippingLabel";

  @StringAttribute({ alias: "Line" })
  public readonly line: string;

  @StringAttribute({ alias: "Line1" })
  public readonly line1: string;
}

describe("Update with write conditions", () => {
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
   * Runs an update expected to fail and returns its error
   */
  const failureOf = async (update: () => Promise<unknown>): Promise<any> => {
    try {
      await update();
    } catch (e: unknown) {
      return e;
    }
    throw new Error("Expected the update to fail");
  };

  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.setSystemTime(new Date(now));
  });

  afterEach(() => {
    mockSend.mockReset();
    mockQuery.mockReset();
    mockTransactGetItems.mockReset();
    vi.clearAllMocks();
    mockEmbeddingProviderCalls.length = 0;
  });

  describe("a condition on the entity's own row", () => {
    const guardedUpdate = {
      Update: {
        TableName: "mock-table",
        Key: { PK: "MockInformation#123", SK: "MockInformation" },
        UpdateExpression: "SET #Email = :Email, #UpdatedAt = :UpdatedAt",
        ConditionExpression: "attribute_exists(PK) AND (#State = :wc1_State1)",
        ExpressionAttributeNames: {
          "#Email": "Email",
          "#State": "State",
          "#UpdatedAt": "UpdatedAt"
        },
        ExpressionAttributeValues: {
          ":Email": "new@example.com",
          ":UpdatedAt": now,
          ":wc1_State1": "CO"
        },
        ReturnValuesOnConditionCheckFailure: "ALL_OLD"
      }
    };

    it("ANDs the condition onto the canonical update in parentheses", async () => {
      expect.assertions(3);

      await MockInformation.update(
        "123",
        { email: "new@example.com" },
        { condition: { state: "CO" } }
      );

      // An entity without relationships reads nothing for a self condition
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockedQueryCommand.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [{ TransactItems: [guardedUpdate] }]
      ]);
    });

    it("reports a failed condition as a WriteConditionFailedError naming the self row (AE1)", async () => {
      expect.assertions(5);

      cancelTransactWrite([
        {
          Code: "ConditionalCheckFailed",
          Item: {
            PK: { S: "MockInformation#123" },
            SK: { S: "MockInformation" },
            Email: { S: "old@example.com" },
            State: { S: "NY" }
          }
        }
      ]);

      const e = await failureOf(
        async () =>
          await MockInformation.update(
            "123",
            { email: "new@example.com" },
            { condition: { state: "CO" } }
          )
      );

      expect(e).toBeInstanceOf(TransactionWriteFailedError);
      expect(e.errors).toEqual([
        new WriteConditionFailedError(
          "ConditionalCheckFailed: Write condition failed on MockInformation with ID '123': its own row",
          { entity: "MockInformation", id: "123", guards: [{ kind: "self" }] }
        )
      ]);
      expect(e.errors[0]).toBeInstanceOf(WriteConditionFailedError);
      expect({
        entity: e.errors[0].entity,
        id: e.errors[0].id,
        guards: e.errors[0].guards
      }).toEqual({
        entity: "MockInformation",
        id: "123",
        guards: [{ kind: "self" }]
      });
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [{ TransactItems: [guardedUpdate] }]
      ]);
    });

    it("passes a TransactionConflict-only cancellation through unchanged (AE1)", async () => {
      expect.assertions(3);

      cancelTransactWrite([{ Code: "TransactionConflict" }]);

      const e = await failureOf(
        async () =>
          await MockInformation.update(
            "123",
            { email: "new@example.com" },
            { condition: { state: "CO" } }
          )
      );

      expect(e).toBeInstanceOf(TransactionCanceledException);
      expect(e.CancellationReasons).toEqual([{ Code: "TransactionConflict" }]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [{ TransactItems: [guardedUpdate] }]
      ]);
    });

    it("reports a missing row as not-found, not as a failed condition (AE10)", async () => {
      expect.assertions(3);

      cancelTransactWrite([{ Code: "ConditionalCheckFailed" }]);

      const e = await failureOf(
        async () =>
          await MockInformation.update(
            "123",
            { email: "new@example.com" },
            { condition: { state: "CO" } }
          )
      );

      expect(e.errors).toEqual([
        new ConditionalCheckFailedError(
          "ConditionalCheckFailed: MockInformation with ID '123' does not exist"
        )
      ]);
      expect(e.errors[0]).not.toBeInstanceOf(WriteConditionFailedError);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [{ TransactItems: [guardedUpdate] }]
      ]);
    });

    it("keeps a $or inside its own parentheses after the existence check", async () => {
      expect.assertions(1);

      await MockInformation.update(
        "123",
        { email: "new@example.com" },
        { condition: { $or: [{ state: "CO" }, { phone: "555-0100" }] } }
      );

      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  TableName: "mock-table",
                  Key: { PK: "MockInformation#123", SK: "MockInformation" },
                  UpdateExpression:
                    "SET #Email = :Email, #UpdatedAt = :UpdatedAt",
                  ConditionExpression:
                    "attribute_exists(PK) AND (#State = :wc1_State1 OR #Phone = :wc1_Phone2)",
                  ExpressionAttributeNames: {
                    "#Email": "Email",
                    "#Phone": "Phone",
                    "#State": "State",
                    "#UpdatedAt": "UpdatedAt"
                  },
                  ExpressionAttributeValues: {
                    ":Email": "new@example.com",
                    ":UpdatedAt": now,
                    ":wc1_Phone2": "555-0100",
                    ":wc1_State1": "CO"
                  },
                  ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("sends a $or of one block naming two attributes in one pair of parentheses", async () => {
      expect.assertions(2);

      // A second pair, `attribute_exists(PK) AND ((… AND …))`, is rejected by
      // DynamoDB: "The expression has redundant parentheses"
      await MockInformation.update(
        "123",
        { email: "new@example.com" },
        { condition: { $or: [{ state: "CO", phone: "555-0100" }] } }
      );

      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  TableName: "mock-table",
                  Key: { PK: "MockInformation#123", SK: "MockInformation" },
                  UpdateExpression:
                    "SET #Email = :Email, #UpdatedAt = :UpdatedAt",
                  ConditionExpression:
                    "attribute_exists(PK) AND (#State = :wc1_State1 AND #Phone = :wc1_Phone2)",
                  ExpressionAttributeNames: {
                    "#Email": "Email",
                    "#Phone": "Phone",
                    "#State": "State",
                    "#UpdatedAt": "UpdatedAt"
                  },
                  ExpressionAttributeValues: {
                    ":Email": "new@example.com",
                    ":UpdatedAt": now,
                    ":wc1_Phone2": "555-0100",
                    ":wc1_State1": "CO"
                  },
                  ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                }
              }
            ]
          }
        ]
      ]);
    });

    describe("a claim guarded by null as 'not set' or an expired date (AE11)", () => {
      const claim = async (): Promise<void> => {
        await MockInformation.update(
          "123",
          { state: "CO" },
          {
            condition: {
              $or: [{ phone: null }, { someDate: { $lt: new Date(now) } }]
            }
          }
        );
      };

      const claimCommand = [
        {
          TransactItems: [
            {
              Update: {
                TableName: "mock-table",
                Key: { PK: "MockInformation#123", SK: "MockInformation" },
                UpdateExpression:
                  "SET #State = :State, #UpdatedAt = :UpdatedAt",
                ConditionExpression:
                  "attribute_exists(PK) AND (attribute_not_exists(#Phone) OR #someDate < :wc1_someDate1)",
                ExpressionAttributeNames: {
                  "#Phone": "Phone",
                  "#State": "State",
                  "#UpdatedAt": "UpdatedAt",
                  "#someDate": "someDate"
                },
                ExpressionAttributeValues: {
                  ":State": "CO",
                  ":UpdatedAt": now,
                  ":wc1_someDate1": now
                },
                ReturnValuesOnConditionCheckFailure: "ALL_OLD"
              }
            }
          ]
        }
      ];

      it("compiles null and the date comparison into one guarded update", async () => {
        expect.assertions(1);

        await claim();

        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [claimCommand[0]]
        ]);
      });

      it("attributes a lost claim to the self condition", async () => {
        expect.assertions(2);

        cancelTransactWrite([
          {
            Code: "ConditionalCheckFailed",
            Item: {
              PK: { S: "MockInformation#123" },
              SK: { S: "MockInformation" },
              Phone: { S: "555-0100" },
              someDate: { S: "2023-10-17T00:00:00.000Z" }
            }
          }
        ]);

        const e = await failureOf(claim);

        expect(e.errors).toEqual([
          new WriteConditionFailedError(
            "ConditionalCheckFailed: Write condition failed on MockInformation with ID '123': its own row",
            {
              entity: "MockInformation",
              id: "123",
              guards: [{ kind: "self" }]
            }
          )
        ]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [claimCommand[0]]
        ]);
      });
    });

    it("sends a guarded touch that bumps updatedAt when the payload is empty", async () => {
      expect.assertions(1);

      await MockInformation.update(
        "123",
        {},
        { condition: { email: "old@example.com" } }
      );

      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  TableName: "mock-table",
                  Key: { PK: "MockInformation#123", SK: "MockInformation" },
                  UpdateExpression: "SET #UpdatedAt = :UpdatedAt",
                  ConditionExpression:
                    "attribute_exists(PK) AND (#Email = :wc1_Email1)",
                  ExpressionAttributeNames: {
                    "#Email": "Email",
                    "#UpdatedAt": "UpdatedAt"
                  },
                  ExpressionAttributeValues: {
                    ":UpdatedAt": now,
                    ":wc1_Email1": "old@example.com"
                  },
                  ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("keeps update and condition placeholders distinct when aliases collide", async () => {
      expect.assertions(1);

      await ShippingLabel.update(
        "123",
        { line: "1 Main St", line1: "Suite 2" },
        { condition: { line: "9 Old Rd" } }
      );

      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  TableName: "mock-table",
                  Key: { PK: "ShippingLabel#123", SK: "ShippingLabel" },
                  UpdateExpression:
                    "SET #Line = :Line, #Line1 = :Line1, #UpdatedAt = :UpdatedAt",
                  ConditionExpression:
                    "attribute_exists(PK) AND (#Line = :wc1_Line1)",
                  ExpressionAttributeNames: {
                    "#Line": "Line",
                    "#Line1": "Line1",
                    "#UpdatedAt": "UpdatedAt"
                  },
                  ExpressionAttributeValues: {
                    ":Line": "1 Main St",
                    ":Line1": "Suite 2",
                    ":UpdatedAt": now,
                    ":wc1_Line1": "9 Old Rd"
                  },
                  ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                }
              }
            ]
          }
        ]
      ]);
    });

    describe("instance method", () => {
      const instance = createInstance(MockInformation, {
        pk: "MockInformation#123" as PartitionKey,
        sk: "MockInformation" as SortKey,
        id: "123",
        type: "MockInformation",
        address: "11 Some St",
        email: "old@example.com",
        state: "CO",
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });

      it("passes the condition through and returns the updated instance", async () => {
        expect.assertions(2);

        const updated = await instance.update(
          { email: "new@example.com" },
          { condition: { state: "CO" } }
        );

        expect(updated).toEqual({
          ...instance,
          email: "new@example.com",
          updatedAt: new Date(now)
        });
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [{ TransactItems: [guardedUpdate] }]
        ]);
      });

      it("leaves the instance unmodified when the condition fails", async () => {
        expect.assertions(3);

        cancelTransactWrite([
          {
            Code: "ConditionalCheckFailed",
            Item: {
              PK: { S: "MockInformation#123" },
              SK: { S: "MockInformation" },
              State: { S: "NY" }
            }
          }
        ]);

        const e = await failureOf(
          async () =>
            await instance.update(
              { email: "new@example.com" },
              { condition: { state: "CO" } }
            )
        );

        expect(e.errors).toEqual([
          new WriteConditionFailedError(
            "ConditionalCheckFailed: Write condition failed on MockInformation with ID '123': its own row",
            {
              entity: "MockInformation",
              id: "123",
              guards: [{ kind: "self" }]
            }
          )
        ]);
        expect(instance).toEqual({
          pk: "MockInformation#123",
          sk: "MockInformation",
          id: "123",
          type: "MockInformation",
          address: "11 Some St",
          email: "old@example.com",
          state: "CO",
          createdAt: new Date("2023-10-01"),
          updatedAt: new Date("2023-10-02")
        });
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [{ TransactItems: [guardedUpdate] }]
        ]);
      });

      it("types the condition from the instance's class", async () => {
        await instance
          .update(
            {},
            {
              condition: {
                // @ts-expect-error not an attribute of MockInformation
                notAnAttribute: "x"
              }
            }
          )
          .catch(() => {
            Logger.log("Testing types");
          });

        await MockInformation.update(
          "123",
          {},
          {
            condition: {
              // @ts-expect-error email is not nullable, so null is not offered
              email: null
            }
          }
        ).catch(() => {
          Logger.log("Testing types");
        });
      });
    });
  });

  describe("a dot path at the top level of the entity's own row (R4, R23)", () => {
    const update = async (): Promise<void> => {
      await MyClassWithAllAttributeTypes.update(
        "123",
        { stringAttribute: "new" },
        {
          condition: {
            "objectAttribute.name": "Jane",
            "addressAttribute.scores[0]": { $gt: 5 },
            "addressAttribute.zip": null
          }
        }
      );
    };

    const guardedUpdate = {
      Update: {
        TableName: "mock-table",
        Key: {
          PK: "MyClassWithAllAttributeTypes#123",
          SK: "MyClassWithAllAttributeTypes"
        },
        UpdateExpression:
          "SET #stringAttribute = :stringAttribute, #UpdatedAt = :UpdatedAt",
        ConditionExpression:
          "attribute_exists(PK) AND (#objectAttribute.#name = :wc1_objectAttributename1 AND #addressAttribute.#scores[0] > :wc1_addressAttributescores02 AND attribute_not_exists(#addressAttribute.#zip))",
        ExpressionAttributeNames: {
          "#stringAttribute": "stringAttribute",
          "#UpdatedAt": "UpdatedAt",
          "#objectAttribute": "objectAttribute",
          "#name": "name",
          "#addressAttribute": "addressAttribute",
          "#scores": "scores",
          "#zip": "zip"
        },
        ExpressionAttributeValues: {
          ":stringAttribute": "new",
          ":UpdatedAt": now,
          ":wc1_objectAttributename1": "Jane",
          ":wc1_addressAttributescores02": 5
        },
        ReturnValuesOnConditionCheckFailure: "ALL_OLD"
      }
    };

    it("ANDs the nested paths onto the canonical update", async () => {
      expect.assertions(2);

      await update();

      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [{ TransactItems: [guardedUpdate] }]
      ]);
    });

    it("reports a failed nested condition as a WriteConditionFailedError naming the self row", async () => {
      expect.assertions(3);

      cancelTransactWrite([
        {
          Code: "ConditionalCheckFailed",
          Item: {
            PK: { S: "MyClassWithAllAttributeTypes#123" },
            SK: { S: "MyClassWithAllAttributeTypes" },
            objectAttribute: { M: { name: { S: "John" } } }
          }
        }
      ]);

      const e = await failureOf(update);

      expect(e).toBeInstanceOf(TransactionWriteFailedError);
      expect(e.errors).toEqual([
        new WriteConditionFailedError(
          "ConditionalCheckFailed: Write condition failed on MyClassWithAllAttributeTypes with ID '123': its own row",
          {
            entity: "MyClassWithAllAttributeTypes",
            id: "123",
            guards: [{ kind: "self" }]
          }
        )
      ]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [{ TransactItems: [guardedUpdate] }]
      ]);
    });

    it("rejects a path the schema does not declare before sending anything", async () => {
      expect.assertions(3);

      const e = await failureOf(
        async () =>
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "new" },
            {
              condition: {
                // @ts-expect-error country is not a field of the address schema
                "addressAttribute.country": "US"
              }
            }
          )
      );

      expect(e).toEqual(
        new FilterError(
          'Invalid filter key "addressAttribute.country": "country" is not a field its object declares, so the condition names nothing a row can hold and can match nothing. The declared fields are: street, city, zip, geo, scores, category'
        )
      );
      expect(mockSend.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    });

    it("rejects a $contains operand that is not an element of the list before sending anything", async () => {
      expect.assertions(3);

      const e = await failureOf(
        async () =>
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "new" },
            {
              condition: {
                // @ts-expect-error tags holds strings
                "objectAttribute.tags": { $contains: 1 }
              }
            }
          )
      );

      expect(e).toEqual(
        new FilterError(
          'Invalid filter value for attribute "objectAttribute.tags": $contains on a list looks for one of its elements, and this list\'s elements are stored as a string, which this operand is not'
        )
      );
      expect(mockSend.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    });

    it("converts a Date $contains operand on a list of dates to the ISO string its elements are stored as", async () => {
      expect.assertions(2);

      await MyClassWithAllAttributeTypes.update(
        "123",
        { stringAttribute: "new" },
        {
          condition: {
            "objectAttribute.contactedAt": {
              $contains: new Date("2023-01-01T00:00:00.000Z")
            }
          }
        }
      );

      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  TableName: "mock-table",
                  Key: {
                    PK: "MyClassWithAllAttributeTypes#123",
                    SK: "MyClassWithAllAttributeTypes"
                  },
                  UpdateExpression:
                    "SET #stringAttribute = :stringAttribute, #UpdatedAt = :UpdatedAt",
                  ConditionExpression:
                    "attribute_exists(PK) AND (contains(#objectAttribute.#contactedAt, :wc1_objectAttributecontactedAt1))",
                  ExpressionAttributeNames: {
                    "#stringAttribute": "stringAttribute",
                    "#UpdatedAt": "UpdatedAt",
                    "#objectAttribute": "objectAttribute",
                    "#contactedAt": "contactedAt"
                  },
                  ExpressionAttributeValues: {
                    ":stringAttribute": "new",
                    ":UpdatedAt": now,
                    ":wc1_objectAttributecontactedAt1":
                      "2023-01-01T00:00:00.000Z"
                  },
                  ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("converts a whole $contains element of a list of objects to its stored form, nested dates included", async () => {
      expect.assertions(2);

      await MyClassWithAllAttributeTypes.update(
        "123",
        { stringAttribute: "new" },
        {
          condition: {
            "objectAttribute.history": {
              $contains: {
                at: new Date("2023-01-01T00:00:00.000Z"),
                actor: "ann"
              }
            }
          }
        }
      );

      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  TableName: "mock-table",
                  Key: {
                    PK: "MyClassWithAllAttributeTypes#123",
                    SK: "MyClassWithAllAttributeTypes"
                  },
                  UpdateExpression:
                    "SET #stringAttribute = :stringAttribute, #UpdatedAt = :UpdatedAt",
                  ConditionExpression:
                    "attribute_exists(PK) AND (contains(#objectAttribute.#history, :wc1_objectAttributehistory1))",
                  ExpressionAttributeNames: {
                    "#stringAttribute": "stringAttribute",
                    "#UpdatedAt": "UpdatedAt",
                    "#objectAttribute": "objectAttribute",
                    "#history": "history"
                  },
                  ExpressionAttributeValues: {
                    ":stringAttribute": "new",
                    ":UpdatedAt": now,
                    ":wc1_objectAttributehistory1": {
                      at: "2023-01-01T00:00:00.000Z",
                      actor: "ann"
                    }
                  },
                  ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("rejects a $contains element outside the enum of a list of enums before sending anything", async () => {
      expect.assertions(3);

      const e = await failureOf(
        async () =>
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "new" },
            {
              condition: {
                // @ts-expect-error admin is not a member of the roles enum
                "objectAttribute.roles": { $contains: "admin" }
              }
            }
          )
      );

      expect(e).toEqual(
        new FilterError(
          'Invalid filter value for attribute "objectAttribute.roles": $contains on a list looks for one of its elements, and this operand is not a value the list\'s elements can hold'
        )
      );
      expect(mockSend.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    });
  });

  describe("a BelongsTo guard", () => {
    const petQuery = [
      {
        TableName: "mock-table",
        KeyConditionExpression: "#PK = :PK2",
        ExpressionAttributeNames: { "#PK": "PK", "#Type": "Type" },
        ExpressionAttributeValues: { ":PK2": "Pet#123", ":Type1": "Pet" },
        FilterExpression: "#Type IN (:Type1)",
        ConsistentRead: true
      }
    ];

    const storedPet = (ownerId?: string): MockTableEntityTableItem<Pet> => ({
      PK: "Pet#123",
      SK: "Pet",
      Id: "123",
      Type: "Pet",
      Name: "Mock Pet",
      OwnerId: ownerId,
      CreatedAt: "2023-01-01T00:00:00.000Z",
      UpdatedAt: "2023-01-02T00:00:00.000Z"
    });

    describe("when the foreign key is unchanged (AE7)", () => {
      const update = async (): Promise<void> => {
        await Pet.update(
          "123",
          { name: "Fido" },
          { condition: { owner: { name: "Jane" } } }
        );
      };

      const sentItems = [
        {
          // The owner was resolved from the earlier read, so the foreign key
          // is pinned to it
          Update: {
            TableName: "mock-table",
            Key: { PK: "Pet#123", SK: "Pet" },
            UpdateExpression: "SET #Name = :Name, #UpdatedAt = :UpdatedAt",
            ConditionExpression:
              "attribute_exists(PK) AND (#OwnerId = :wc2_OwnerId)",
            ExpressionAttributeNames: {
              "#Name": "Name",
              "#OwnerId": "OwnerId",
              "#UpdatedAt": "UpdatedAt"
            },
            ExpressionAttributeValues: {
              ":Name": "Fido",
              ":UpdatedAt": now,
              ":wc2_OwnerId": "456"
            },
            ReturnValuesOnConditionCheckFailure: "ALL_OLD"
          }
        },
        {
          Update: {
            TableName: "mock-table",
            Key: { PK: "Person#456", SK: "Pet#123" },
            UpdateExpression: "SET #Name = :Name, #UpdatedAt = :UpdatedAt",
            ConditionExpression: "attribute_exists(PK)",
            ExpressionAttributeNames: {
              "#Name": "Name",
              "#UpdatedAt": "UpdatedAt"
            },
            ExpressionAttributeValues: { ":Name": "Fido", ":UpdatedAt": now }
          }
        },
        {
          ConditionCheck: {
            TableName: "mock-table",
            Key: { PK: "Person#456", SK: "Person" },
            ConditionExpression:
              "attribute_exists(PK) AND (attribute_exists(PK) AND (#Name = :wc1_Name1))",
            ExpressionAttributeNames: { "#Name": "Name" },
            ExpressionAttributeValues: { ":wc1_Name1": "Jane" },
            ReturnValuesOnConditionCheckFailure: "ALL_OLD"
          }
        }
      ];

      beforeEach(() => {
        mockQuery.mockResolvedValue({ Items: [storedPet("456")] });
      });

      it("checks the stored parent and pins the foreign key on the entity's own row", async () => {
        expect.assertions(4);

        await update();

        expect(mockSend.mock.calls).toEqual([
          [{ name: "QueryCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockedQueryCommand.mock.calls).toEqual([petQuery]);
        expect(mockTransactGetCommand.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [{ TransactItems: sentItems }]
        ]);
      });

      it("reports a failed guard as a WriteConditionFailedError naming the relationship", async () => {
        expect.assertions(2);

        cancelTransactWrite([
          { Code: "None" },
          { Code: "None" },
          {
            Code: "ConditionalCheckFailed",
            Item: {
              PK: { S: "Person#456" },
              SK: { S: "Person" },
              Name: { S: "Bob" }
            }
          }
        ]);

        const e = await failureOf(update);

        expect(e.errors).toEqual([
          new WriteConditionFailedError(
            "ConditionalCheckFailed: Write condition failed on Pet with ID '123': relationship 'owner'",
            {
              entity: "Pet",
              id: "123",
              guards: [{ kind: "relationship", name: "owner" }]
            }
          )
        ]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [{ TransactItems: sentItems }]
        ]);
      });

      it("reports a concurrent foreign key change, not the guard, even when the old parent also fails the guard", async () => {
        expect.assertions(3);

        cancelTransactWrite([
          {
            Code: "ConditionalCheckFailed",
            Item: {
              PK: { S: "Pet#123" },
              SK: { S: "Pet" },
              OwnerId: { S: "999" }
            }
          },
          { Code: "None" },
          {
            Code: "ConditionalCheckFailed",
            Item: {
              PK: { S: "Person#456" },
              SK: { S: "Person" },
              Name: { S: "Bob" }
            }
          }
        ]);

        const e = await failureOf(update);

        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Pet with ID '123' no longer references Person with ID '456': its foreign key 'ownerId' was changed by a concurrent write"
          )
        ]);
        expect(e.errors[0]).not.toBeInstanceOf(WriteConditionFailedError);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [{ TransactItems: sentItems }]
        ]);
      });

      it("reports a missing parent as a referential-integrity failure", async () => {
        expect.assertions(1);

        cancelTransactWrite([
          { Code: "None" },
          { Code: "None" },
          { Code: "ConditionalCheckFailed" }
        ]);

        const e = await failureOf(update);

        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Person with ID '456' does not exist"
          )
        ]);
      });

      it("sends a $or of one block naming two attributes in one pair of parentheses on the parent check", async () => {
        expect.assertions(2);

        // A second pair, `… AND (attribute_exists(PK) AND ((… AND …)))`, is
        // rejected by DynamoDB: "The expression has redundant parentheses"
        await Pet.update(
          "123",
          { name: "Fido" },
          {
            condition: {
              owner: {
                $or: [
                  {
                    name: "Jane",
                    createdAt: { $lt: new Date("2024-01-01T00:00:00.000Z") }
                  }
                ]
              }
            }
          }
        );

        expect(mockSend.mock.calls).toEqual([
          [{ name: "QueryCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                sentItems[0],
                sentItems[1],
                {
                  ConditionCheck: {
                    TableName: "mock-table",
                    Key: { PK: "Person#456", SK: "Person" },
                    ConditionExpression:
                      "attribute_exists(PK) AND (attribute_exists(PK) AND (#Name = :wc1_Name1 AND #CreatedAt < :wc1_CreatedAt2))",
                    ExpressionAttributeNames: {
                      "#Name": "Name",
                      "#CreatedAt": "CreatedAt"
                    },
                    ExpressionAttributeValues: {
                      ":wc1_Name1": "Jane",
                      ":wc1_CreatedAt2": "2024-01-01T00:00:00.000Z"
                    },
                    ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                  }
                }
              ]
            }
          ]
        ]);
      });
    });

    describe("when the update changes the foreign key", () => {
      const update = async (
        referentialIntegrityCheck: boolean
      ): Promise<void> => {
        await Pet.update(
          "123",
          { name: "Fido", ownerId: "789" },
          { referentialIntegrityCheck, condition: { owner: { name: "Jane" } } }
        );
      };

      const canonicalUpdate = {
        // The new parent comes from the payload, so nothing is pinned
        Update: {
          TableName: "mock-table",
          Key: { PK: "Pet#123", SK: "Pet" },
          UpdateExpression:
            "SET #Name = :Name, #OwnerId = :OwnerId, #UpdatedAt = :UpdatedAt",
          ConditionExpression: "attribute_exists(PK)",
          ExpressionAttributeNames: {
            "#Name": "Name",
            "#OwnerId": "OwnerId",
            "#UpdatedAt": "UpdatedAt"
          },
          ExpressionAttributeValues: {
            ":Name": "Fido",
            ":OwnerId": "789",
            ":UpdatedAt": now
          }
        }
      };
      const deleteOldLink = {
        Delete: {
          TableName: "mock-table",
          Key: { PK: "Person#456", SK: "Pet#123" }
        }
      };
      const guardedNewParentCheck = {
        ConditionCheck: {
          TableName: "mock-table",
          Key: { PK: "Person#789", SK: "Person" },
          ConditionExpression:
            "attribute_exists(PK) AND (attribute_exists(PK) AND (#Name = :wc1_Name1))",
          ExpressionAttributeNames: { "#Name": "Name" },
          ExpressionAttributeValues: { ":wc1_Name1": "Jane" },
          ReturnValuesOnConditionCheckFailure: "ALL_OLD"
        }
      };
      const putNewLink = {
        Put: {
          TableName: "mock-table",
          ConditionExpression: "attribute_not_exists(PK)",
          Item: {
            PK: "Person#789",
            SK: "Pet#123",
            Id: "123",
            Type: "Pet",
            Name: "Fido",
            OwnerId: "789",
            CreatedAt: "2023-01-01T00:00:00.000Z",
            UpdatedAt: now
          }
        }
      };
      const putNewParentCopy = {
        Put: {
          TableName: "mock-table",
          ConditionExpression: "attribute_exists(PK)",
          Item: {
            PK: "Pet#123",
            SK: "Person",
            Id: "789",
            Type: "Person",
            Name: "Jane",
            CreatedAt: "2023-01-01T00:00:00.000Z",
            UpdatedAt: "2023-01-02T00:00:00.000Z"
          }
        }
      };

      beforeEach(() => {
        mockQuery.mockResolvedValue({ Items: [storedPet("456")] });
        mockTransactGetItems.mockResolvedValue({
          Responses: [
            {
              Item: {
                PK: "Person#789",
                SK: "Person",
                Id: "789",
                Type: "Person",
                Name: "Jane",
                CreatedAt: "2023-01-01T00:00:00.000Z",
                UpdatedAt: "2023-01-02T00:00:00.000Z"
              }
            }
          ]
        });
      });

      it("merges the guard into the new parent's integrity check", async () => {
        expect.assertions(4);

        await update(true);

        expect(mockedQueryCommand.mock.calls).toEqual([petQuery]);
        expect(mockTransactGetCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                {
                  Get: {
                    TableName: "mock-table",
                    Key: { PK: "Person#789", SK: "Person" }
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
                canonicalUpdate,
                deleteOldLink,
                guardedNewParentCheck,
                putNewLink,
                putNewParentCopy
              ]
            }
          ]
        ]);
        expect(mockSend.mock.calls).toEqual([
          [{ name: "TransactGetCommand" }],
          [{ name: "QueryCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
      });

      it("adds its own check on the new parent when integrity checks are off, which still fails on a missing parent (R18)", async () => {
        expect.assertions(2);

        cancelTransactWrite([
          { Code: "None" },
          { Code: "None" },
          { Code: "None" },
          { Code: "None" },
          { Code: "ConditionalCheckFailed" }
        ]);

        const e = await failureOf(async () => {
          await update(false);
        });

        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Person with ID '789' does not exist"
          )
        ]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                canonicalUpdate,
                deleteOldLink,
                putNewLink,
                putNewParentCopy,
                guardedNewParentCheck
              ]
            }
          ]
        ]);
      });
    });

    it("fails before sending when the stored foreign key is not set (AE8)", async () => {
      expect.assertions(4);

      mockQuery.mockResolvedValue({ Items: [storedPet()] });

      const e = await failureOf(
        async () =>
          await Pet.update(
            "123",
            { name: "Fido" },
            { condition: { owner: { name: "Jane" } } }
          )
      );

      expect(e).toBeInstanceOf(TransactionWriteFailedError);
      expect(e.errors).toEqual([
        new WriteConditionFailedError(
          "Write condition failed on Pet with ID '123': relationship 'owner' references no Person",
          {
            entity: "Pet",
            id: "123",
            guards: [{ kind: "relationship", name: "owner" }]
          }
        )
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    });

    it("throws a FilterError before any read when the payload clears the foreign key (AE16)", async () => {
      expect.assertions(2);

      const e = await failureOf(
        async () =>
          await Pet.update(
            "123",
            { ownerId: null },
            { condition: { owner: { name: "Jane" } } }
          )
      );

      expect(e).toBeInstanceOf(FilterError);
      expect(mockSend.mock.calls).toEqual([]);
    });
  });

  describe("a HasOne guard", () => {
    const customer = {
      PK: "Customer#123",
      SK: "Customer",
      Id: "123",
      Type: "Customer",
      Name: "Mock Customer",
      Address: "11 Some St",
      CreatedAt: "2023-01-01T00:00:00.000Z",
      UpdatedAt: "2023-01-02T00:00:00.000Z"
    };
    const contactInformationCopy = {
      PK: "Customer#123",
      SK: "ContactInformation",
      Id: "ci1",
      Type: "ContactInformation",
      Email: "jane@example.com",
      CustomerId: "123",
      CreatedAt: "2023-01-01T00:00:00.000Z",
      UpdatedAt: "2023-01-02T00:00:00.000Z"
    };
    const customerQuery = [
      {
        TableName: "mock-table",
        KeyConditionExpression: "#PK = :PK5",
        ExpressionAttributeNames: { "#PK": "PK", "#Type": "Type" },
        ExpressionAttributeValues: {
          ":PK5": "Customer#123",
          ":Type1": "Customer",
          ":Type2": "Order",
          ":Type3": "PaymentMethod",
          ":Type4": "ContactInformation"
        },
        FilterExpression: "#Type IN (:Type1,:Type2,:Type3,:Type4)",
        ConsistentRead: true
      }
    ];
    const expression = {
      UpdateExpression: "SET #Name = :Name, #UpdatedAt = :UpdatedAt",
      ExpressionAttributeNames: { "#Name": "Name", "#UpdatedAt": "UpdatedAt" },
      ExpressionAttributeValues: { ":Name": "New Name", ":UpdatedAt": now }
    };

    const update = async (): Promise<void> => {
      await Customer.update(
        "123",
        { name: "New Name" },
        { condition: { contactInformation: { email: "jane@example.com" } } }
      );
    };

    const sentItems = [
      {
        Update: {
          TableName: "mock-table",
          Key: { PK: "Customer#123", SK: "Customer" },
          ConditionExpression: "attribute_exists(PK)",
          ...expression
        }
      },
      {
        Update: {
          TableName: "mock-table",
          Key: { PK: "ContactInformation#ci1", SK: "Customer" },
          ConditionExpression: "attribute_exists(PK)",
          ...expression
        }
      },
      {
        // The child found through the earlier read must still reference
        // this Customer
        ConditionCheck: {
          TableName: "mock-table",
          Key: { PK: "ContactInformation#ci1", SK: "ContactInformation" },
          ConditionExpression:
            "attribute_exists(PK) AND (#CustomerId = :wc2_CustomerId) AND (attribute_exists(PK) AND (#Email = :wc1_Email1))",
          ExpressionAttributeNames: {
            "#CustomerId": "CustomerId",
            "#Email": "Email"
          },
          ExpressionAttributeValues: {
            ":wc1_Email1": "jane@example.com",
            ":wc2_CustomerId": "123"
          },
          ReturnValuesOnConditionCheckFailure: "ALL_OLD"
        }
      }
    ];

    it("checks the child row with the child foreign key pinned", async () => {
      expect.assertions(2);

      mockQuery.mockResolvedValue({
        Items: [customer, contactInformationCopy]
      });

      await update();

      expect(mockedQueryCommand.mock.calls).toEqual([customerQuery]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [{ TransactItems: sentItems }]
      ]);
    });

    it("reports a child that moved to another parent as not-associated", async () => {
      expect.assertions(1);

      mockQuery.mockResolvedValue({
        Items: [customer, contactInformationCopy]
      });
      cancelTransactWrite([
        { Code: "None" },
        { Code: "None" },
        {
          Code: "ConditionalCheckFailed",
          Item: {
            PK: { S: "ContactInformation#ci1" },
            SK: { S: "ContactInformation" },
            Email: { S: "jane@example.com" },
            CustomerId: { S: "456" }
          }
        }
      ]);

      const e = await failureOf(update);

      expect(e.errors).toEqual([
        new ConditionalCheckFailedError(
          "ConditionalCheckFailed: ContactInformation with ID 'ci1' is not associated with Customer with ID '123' through 'contactInformation'"
        )
      ]);
    });

    it("fails before sending when the entity has no child", async () => {
      expect.assertions(3);

      mockQuery.mockResolvedValue({ Items: [customer] });

      const e = await failureOf(update);

      expect(e.errors).toEqual([
        new WriteConditionFailedError(
          "Write condition failed on Customer with ID '123': relationship 'contactInformation' references no ContactInformation",
          {
            entity: "Customer",
            id: "123",
            guards: [{ kind: "relationship", name: "contactInformation" }]
          }
        )
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    });
  });

  describe("a HasMany guard", () => {
    const update = async (): Promise<void> => {
      await Customer.update(
        "123",
        { name: "New Name" },
        {
          condition: {
            orders: [
              {
                id: "o1",
                condition: { orderDate: { $lt: new Date(now) } }
              }
            ]
          }
        }
      );
    };

    const sentItems = [
      {
        Update: {
          TableName: "mock-table",
          Key: { PK: "Customer#123", SK: "Customer" },
          UpdateExpression: "SET #Name = :Name, #UpdatedAt = :UpdatedAt",
          ConditionExpression: "attribute_exists(PK)",
          ExpressionAttributeNames: {
            "#Name": "Name",
            "#UpdatedAt": "UpdatedAt"
          },
          ExpressionAttributeValues: { ":Name": "New Name", ":UpdatedAt": now }
        }
      },
      {
        ConditionCheck: {
          TableName: "mock-table",
          Key: { PK: "Order#o1", SK: "Order" },
          ConditionExpression:
            "attribute_exists(PK) AND (#CustomerId = :wc2_CustomerId) AND (attribute_exists(PK) AND (#OrderDate < :wc1_OrderDate1))",
          ExpressionAttributeNames: {
            "#CustomerId": "CustomerId",
            "#OrderDate": "OrderDate"
          },
          ExpressionAttributeValues: {
            ":wc1_OrderDate1": now,
            ":wc2_CustomerId": "123"
          },
          ReturnValuesOnConditionCheckFailure: "ALL_OLD"
        }
      }
    ];

    beforeEach(() => {
      mockQuery.mockResolvedValue({
        Items: [
          {
            PK: "Customer#123",
            SK: "Customer",
            Id: "123",
            Type: "Customer",
            Name: "Mock Customer",
            Address: "11 Some St",
            CreatedAt: "2023-01-01T00:00:00.000Z",
            UpdatedAt: "2023-01-02T00:00:00.000Z"
          }
        ]
      });
    });

    it("checks the named child with its foreign key pinned to this entity", async () => {
      expect.assertions(1);

      await update();

      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [{ TransactItems: sentItems }]
      ]);
    });

    it("reports an id belonging to another parent as not-related, even when its row meets the guard (AE4)", async () => {
      expect.assertions(3);

      cancelTransactWrite([
        { Code: "None" },
        {
          Code: "ConditionalCheckFailed",
          Item: {
            PK: { S: "Order#o1" },
            SK: { S: "Order" },
            CustomerId: { S: "456" },
            OrderDate: { S: "2023-01-01T00:00:00.000Z" }
          }
        }
      ]);

      const e = await failureOf(update);

      expect(e.errors).toEqual([
        new ConditionalCheckFailedError(
          "ConditionalCheckFailed: Order with ID 'o1' is not associated with Customer with ID '123' through 'orders'"
        )
      ]);
      expect(e.errors[0]).not.toBeInstanceOf(WriteConditionFailedError);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [{ TransactItems: sentItems }]
      ]);
    });

    it("reports a related child failing the guard with the relationship and id", async () => {
      expect.assertions(1);

      cancelTransactWrite([
        { Code: "None" },
        {
          Code: "ConditionalCheckFailed",
          Item: {
            PK: { S: "Order#o1" },
            SK: { S: "Order" },
            CustomerId: { S: "123" },
            OrderDate: { S: "2023-10-17T00:00:00.000Z" }
          }
        }
      ]);

      const e = await failureOf(update);

      expect(e.errors).toEqual([
        new WriteConditionFailedError(
          "ConditionalCheckFailed: Write condition failed on Customer with ID '123': relationship 'orders' (ID 'o1')",
          {
            entity: "Customer",
            id: "123",
            guards: [{ kind: "relationship", name: "orders", id: "o1" }]
          }
        )
      ]);
    });
  });

  it("guards a uni-directional HasMany child that the earlier read does not return", async () => {
    expect.assertions(3);

    mockQuery.mockResolvedValue({
      Items: [
        {
          PK: "Organization#123",
          SK: "Organization",
          Id: "123",
          Type: "Organization",
          Name: "Mock Organization",
          CreatedAt: "2023-01-01T00:00:00.000Z",
          UpdatedAt: "2023-01-02T00:00:00.000Z"
        }
      ]
    });

    await Organization.update(
      "123",
      { name: "New Name" },
      { condition: { founders: [{ id: "f1", condition: { name: "Ada" } }] } }
    );

    expect(mockSend.mock.calls).toEqual([
      [{ name: "QueryCommand" }],
      [{ name: "TransactWriteCommand" }]
    ]);
    // Uni-directional children are not read
    expect(mockedQueryCommand.mock.calls).toEqual([
      [
        {
          TableName: "mock-table",
          KeyConditionExpression: "#PK = :PK3",
          ExpressionAttributeNames: { "#PK": "PK", "#Type": "Type" },
          ExpressionAttributeValues: {
            ":PK3": "Organization#123",
            ":Type1": "Organization",
            ":Type2": "User"
          },
          FilterExpression: "#Type IN (:Type1,:Type2)",
          ConsistentRead: true
        }
      ]
    ]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Update: {
                TableName: "mock-table",
                Key: { PK: "Organization#123", SK: "Organization" },
                UpdateExpression: "SET #Name = :Name, #UpdatedAt = :UpdatedAt",
                ConditionExpression: "attribute_exists(PK)",
                ExpressionAttributeNames: {
                  "#Name": "Name",
                  "#UpdatedAt": "UpdatedAt"
                },
                ExpressionAttributeValues: {
                  ":Name": "New Name",
                  ":UpdatedAt": now
                }
              }
            },
            {
              ConditionCheck: {
                TableName: "mock-table",
                Key: { PK: "Founder#f1", SK: "Founder" },
                ConditionExpression:
                  "attribute_exists(PK) AND (#OrganizationId = :wc2_OrganizationId) AND (attribute_exists(PK) AND (#Name = :wc1_Name1))",
                ExpressionAttributeNames: {
                  "#Name": "Name",
                  "#OrganizationId": "OrganizationId"
                },
                ExpressionAttributeValues: {
                  ":wc1_Name1": "Ada",
                  ":wc2_OrganizationId": "123"
                },
                ReturnValuesOnConditionCheckFailure: "ALL_OLD"
              }
            }
          ]
        }
      ]
    ]);
  });

  describe("a HasAndBelongsToMany guard", () => {
    const author = {
      PK: "Author#123",
      SK: "Author",
      Id: "123",
      Type: "Author",
      Name: "Mock Author",
      CreatedAt: "2023-01-01T00:00:00.000Z",
      UpdatedAt: "2023-01-02T00:00:00.000Z"
    };
    const bookCopy = {
      PK: "Author#123",
      SK: "Book#b1",
      Id: "b1",
      Type: "Book",
      Name: "Mock Book",
      NumPages: 100,
      CreatedAt: "2023-01-01T00:00:00.000Z",
      UpdatedAt: "2023-01-02T00:00:00.000Z"
    };
    const expression = {
      UpdateExpression: "SET #Name = :Name, #UpdatedAt = :UpdatedAt",
      ExpressionAttributeNames: { "#Name": "Name", "#UpdatedAt": "UpdatedAt" },
      ExpressionAttributeValues: { ":Name": "New Name", ":UpdatedAt": now }
    };
    const canonicalUpdate = {
      Update: {
        TableName: "mock-table",
        Key: { PK: "Author#123", SK: "Author" },
        ConditionExpression: "attribute_exists(PK)",
        ...expression
      }
    };

    const update = async (bookId: string): Promise<void> => {
      await Author.update(
        "123",
        { name: "New Name" },
        { condition: { books: [{ id: bookId, condition: { numPages: 100 } }] } }
      );
    };

    beforeEach(() => {
      mockQuery.mockResolvedValue({ Items: [author, bookCopy] });
    });

    it("merges membership into the link-row update and checks the partner row", async () => {
      expect.assertions(2);

      await update("b1");

      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK3",
            ExpressionAttributeNames: { "#PK": "PK", "#Type": "Type" },
            ExpressionAttributeValues: {
              ":PK3": "Author#123",
              ":Type1": "Author",
              ":Type2": "Book"
            },
            FilterExpression: "#Type IN (:Type1,:Type2)",
            ConsistentRead: true
          }
        ]
      ]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              canonicalUpdate,
              {
                // The link row in the partner's partition must still exist
                // and hold this Author
                Update: {
                  TableName: "mock-table",
                  Key: { PK: "Book#b1", SK: "Author#123" },
                  UpdateExpression: expression.UpdateExpression,
                  ConditionExpression:
                    "attribute_exists(PK) AND (#Id = :wc2_Id)",
                  ExpressionAttributeNames: {
                    ...expression.ExpressionAttributeNames,
                    "#Id": "Id"
                  },
                  ExpressionAttributeValues: {
                    ...expression.ExpressionAttributeValues,
                    ":wc2_Id": "123"
                  },
                  ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                }
              },
              {
                ConditionCheck: {
                  TableName: "mock-table",
                  Key: { PK: "Book#b1", SK: "Book" },
                  ConditionExpression:
                    "attribute_exists(PK) AND (attribute_exists(PK) AND (#NumPages = :wc1_NumPages1))",
                  ExpressionAttributeNames: { "#NumPages": "NumPages" },
                  ExpressionAttributeValues: { ":wc1_NumPages1": 100 },
                  ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("reports a partner without a link as not-related, not as the guard", async () => {
      expect.assertions(2);

      cancelTransactWrite([
        { Code: "None" },
        { Code: "None" },
        { Code: "ConditionalCheckFailed" },
        {
          Code: "ConditionalCheckFailed",
          Item: {
            PK: { S: "Book#b2" },
            SK: { S: "Book" },
            NumPages: { N: "50" }
          }
        }
      ]);

      const e = await failureOf(async () => {
        await update("b2");
      });

      expect(e.errors).toEqual([
        new ConditionalCheckFailedError(
          "ConditionalCheckFailed: Book with ID 'b2' is not linked to Author with ID '123' through 'books'"
        )
      ]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              canonicalUpdate,
              {
                Update: {
                  TableName: "mock-table",
                  Key: { PK: "Book#b1", SK: "Author#123" },
                  ConditionExpression: "attribute_exists(PK)",
                  ...expression
                }
              },
              {
                // No link row is queued for an unrelated id, so membership
                // gets a check of its own
                ConditionCheck: {
                  TableName: "mock-table",
                  Key: { PK: "Book#b2", SK: "Author#123" },
                  ConditionExpression:
                    "attribute_exists(PK) AND (#Id = :wc2_Id)",
                  ExpressionAttributeNames: { "#Id": "Id" },
                  ExpressionAttributeValues: { ":wc2_Id": "123" },
                  ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                }
              },
              {
                ConditionCheck: {
                  TableName: "mock-table",
                  Key: { PK: "Book#b2", SK: "Book" },
                  ConditionExpression:
                    "attribute_exists(PK) AND (attribute_exists(PK) AND (#NumPages = :wc1_NumPages1))",
                  ExpressionAttributeNames: { "#NumPages": "NumPages" },
                  ExpressionAttributeValues: { ":wc1_NumPages1": 100 },
                  ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                }
              }
            ]
          }
        ]
      ]);
    });
  });

  it("guards a self-referential HasAndBelongsToMany partner through its link row", async () => {
    expect.assertions(1);

    mockQuery.mockResolvedValue({
      Items: [
        {
          PK: "Accessory#a1",
          SK: "Accessory",
          Id: "a1",
          Type: "Accessory",
          Name: "Charger",
          CreatedAt: "2023-01-01T00:00:00.000Z",
          UpdatedAt: "2023-01-02T00:00:00.000Z"
        },
        {
          PK: "Accessory#a1",
          SK: "Accessory#a2",
          Id: "a2",
          Type: "Accessory",
          Name: "Cable",
          CreatedAt: "2023-01-01T00:00:00.000Z",
          UpdatedAt: "2023-01-02T00:00:00.000Z"
        }
      ]
    });

    await Accessory.update(
      "a1",
      { name: "Fast Charger" },
      {
        condition: {
          compatibleAccessories: [{ id: "a2", condition: { name: "Cable" } }]
        }
      }
    );

    const expression = {
      UpdateExpression: "SET #Name = :Name, #UpdatedAt = :UpdatedAt",
      ExpressionAttributeNames: { "#Name": "Name", "#UpdatedAt": "UpdatedAt" },
      ExpressionAttributeValues: { ":Name": "Fast Charger", ":UpdatedAt": now }
    };

    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Update: {
                TableName: "mock-table",
                Key: { PK: "Accessory#a1", SK: "Accessory" },
                ConditionExpression: "attribute_exists(PK)",
                ...expression
              }
            },
            {
              Update: {
                TableName: "mock-table",
                Key: { PK: "Accessory#a2", SK: "Accessory#a1" },
                UpdateExpression: expression.UpdateExpression,
                ConditionExpression: "attribute_exists(PK) AND (#Id = :wc2_Id)",
                ExpressionAttributeNames: {
                  ...expression.ExpressionAttributeNames,
                  "#Id": "Id"
                },
                ExpressionAttributeValues: {
                  ...expression.ExpressionAttributeValues,
                  ":wc2_Id": "a1"
                },
                ReturnValuesOnConditionCheckFailure: "ALL_OLD"
              }
            },
            {
              ConditionCheck: {
                TableName: "mock-table",
                Key: { PK: "Accessory#a2", SK: "Accessory" },
                ConditionExpression:
                  "attribute_exists(PK) AND (attribute_exists(PK) AND (#Name = :wc1_Name1))",
                ExpressionAttributeNames: { "#Name": "Name" },
                ExpressionAttributeValues: { ":wc1_Name1": "Cable" },
                ReturnValuesOnConditionCheckFailure: "ALL_OLD"
              }
            }
          ]
        }
      ]
    ]);
  });

  describe("a self-referential HasMany guard whose id is the entity's own", () => {
    const update = async (): Promise<void> => {
      await Category.update(
        "c1",
        { name: "Kitchen" },
        {
          condition: {
            subcategories: [{ id: "c1", condition: { name: "Home" } }]
          }
        }
      );
    };

    const sentItems = [
      {
        // The child row is the entity's own row, so the pin and the guard
        // merge onto the canonical update
        Update: {
          TableName: "mock-table",
          Key: { PK: "Category#c1", SK: "Category" },
          UpdateExpression: "SET #Name = :Name, #UpdatedAt = :UpdatedAt",
          ConditionExpression:
            "attribute_exists(PK) AND (#ParentCategoryId = :wc2_ParentCategoryId) AND (attribute_exists(PK) AND (#Name = :wc1_Name1))",
          ExpressionAttributeNames: {
            "#Name": "Name",
            "#ParentCategoryId": "ParentCategoryId",
            "#UpdatedAt": "UpdatedAt"
          },
          ExpressionAttributeValues: {
            ":Name": "Kitchen",
            ":UpdatedAt": now,
            ":wc1_Name1": "Home",
            ":wc2_ParentCategoryId": "c1"
          },
          ReturnValuesOnConditionCheckFailure: "ALL_OLD"
        }
      },
      {
        // The Category is its own parent, so its link copy in the parent's
        // partition is updated too
        Update: {
          TableName: "mock-table",
          Key: { PK: "Category#c1", SK: "Category#c1" },
          UpdateExpression: "SET #Name = :Name, #UpdatedAt = :UpdatedAt",
          ConditionExpression: "attribute_exists(PK)",
          ExpressionAttributeNames: {
            "#Name": "Name",
            "#UpdatedAt": "UpdatedAt"
          },
          ExpressionAttributeValues: { ":Name": "Kitchen", ":UpdatedAt": now }
        }
      }
    ];

    beforeEach(() => {
      mockQuery.mockResolvedValue({
        Items: [
          {
            PK: "Category#c1",
            SK: "Category",
            Id: "c1",
            Type: "Category",
            Name: "Home",
            ParentCategoryId: "c1",
            CreatedAt: "2023-01-01T00:00:00.000Z",
            UpdatedAt: "2023-01-02T00:00:00.000Z"
          }
        ]
      });
    });

    it("merges into the canonical update", async () => {
      expect.assertions(2);

      await update();

      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK2",
            ExpressionAttributeNames: { "#PK": "PK", "#Type": "Type" },
            ExpressionAttributeValues: {
              ":PK2": "Category#c1",
              ":Type1": "Category"
            },
            FilterExpression: "#Type IN (:Type1)",
            ConsistentRead: true
          }
        ]
      ]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [{ TransactItems: sentItems }]
      ]);
    });

    it("reports its own missing row as not-found", async () => {
      expect.assertions(1);

      cancelTransactWrite([
        { Code: "ConditionalCheckFailed" },
        { Code: "None" }
      ]);

      const e = await failureOf(update);

      expect(e.errors).toEqual([
        new ConditionalCheckFailedError(
          "ConditionalCheckFailed: Category with ID 'c1' does not exist"
        )
      ]);
    });
  });

  describe("a foreign key target guard on an entity without relationships (R24)", () => {
    const storedEntity = {
      PK: "MyClassWithAllAttributeTypes#123",
      SK: "MyClassWithAllAttributeTypes",
      Id: "123",
      Type: "MyClassWithAllAttributeTypes",
      stringAttribute: "old",
      foreignKeyAttribute: "c1",
      nullableForeignKeyAttribute: "c1",
      CreatedAt: "2023-01-01T00:00:00.000Z",
      UpdatedAt: "2023-01-02T00:00:00.000Z"
    };
    const forcedRead = [
      {
        TableName: "mock-table",
        KeyConditionExpression: "#PK = :PK2",
        ExpressionAttributeNames: { "#PK": "PK", "#Type": "Type" },
        ExpressionAttributeValues: {
          ":PK2": "MyClassWithAllAttributeTypes#123",
          ":Type1": "MyClassWithAllAttributeTypes"
        },
        FilterExpression: "#Type IN (:Type1)",
        ConsistentRead: true
      }
    ];

    describe("when the payload does not set the foreign key", () => {
      beforeEach(() => {
        mockQuery.mockResolvedValue({ Items: [storedEntity] });
      });

      it("reads the entity's own row consistently, then checks the stored parent with the foreign key pinned", async () => {
        expect.assertions(4);

        await MyClassWithAllAttributeTypes.update(
          "123",
          { stringAttribute: "new" },
          { condition: { foreignKeyAttribute: { target: { name: "Jane" } } } }
        );

        expect(mockSend.mock.calls).toEqual([
          [{ name: "QueryCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockedQueryCommand.mock.calls).toEqual([forcedRead]);
        expect(mockTransactGetCommand.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                {
                  Update: {
                    TableName: "mock-table",
                    Key: {
                      PK: "MyClassWithAllAttributeTypes#123",
                      SK: "MyClassWithAllAttributeTypes"
                    },
                    UpdateExpression:
                      "SET #stringAttribute = :stringAttribute, #UpdatedAt = :UpdatedAt",
                    ConditionExpression:
                      "attribute_exists(PK) AND (#foreignKeyAttribute = :wc2_foreignKeyAttribute)",
                    ExpressionAttributeNames: {
                      "#UpdatedAt": "UpdatedAt",
                      "#foreignKeyAttribute": "foreignKeyAttribute",
                      "#stringAttribute": "stringAttribute"
                    },
                    ExpressionAttributeValues: {
                      ":UpdatedAt": now,
                      ":stringAttribute": "new",
                      ":wc2_foreignKeyAttribute": "c1"
                    },
                    ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                  }
                },
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
                }
              ]
            }
          ]
        ]);
      });

      describe("two guards on the same parent row with the same attribute", () => {
        const update = async (): Promise<void> => {
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "new" },
            {
              condition: {
                foreignKeyAttribute: { target: { name: "Jane" } },
                nullableForeignKeyAttribute: { target: { name: "Janet" } }
              }
            }
          );
        };

        const sentItems = [
          {
            Update: {
              TableName: "mock-table",
              Key: {
                PK: "MyClassWithAllAttributeTypes#123",
                SK: "MyClassWithAllAttributeTypes"
              },
              UpdateExpression:
                "SET #stringAttribute = :stringAttribute, #UpdatedAt = :UpdatedAt",
              ConditionExpression:
                "attribute_exists(PK) AND (#foreignKeyAttribute = :wc3_foreignKeyAttribute) AND (#nullableForeignKeyAttribute = :wc4_nullableForeignKeyAttribute)",
              ExpressionAttributeNames: {
                "#UpdatedAt": "UpdatedAt",
                "#foreignKeyAttribute": "foreignKeyAttribute",
                "#nullableForeignKeyAttribute": "nullableForeignKeyAttribute",
                "#stringAttribute": "stringAttribute"
              },
              ExpressionAttributeValues: {
                ":UpdatedAt": now,
                ":stringAttribute": "new",
                ":wc3_foreignKeyAttribute": "c1",
                ":wc4_nullableForeignKeyAttribute": "c1"
              },
              ReturnValuesOnConditionCheckFailure: "ALL_OLD"
            }
          },
          {
            // Both guards merge into one check with distinct placeholders
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
        ];

        it("merges into one item with distinct placeholders", async () => {
          expect.assertions(1);

          await update();

          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [{ TransactItems: sentItems }]
          ]);
        });

        it("names both guards when the row's check fails", async () => {
          expect.assertions(2);

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

          const e = await failureOf(update);

          expect(e.errors).toEqual([
            new WriteConditionFailedError(
              "ConditionalCheckFailed: Write condition failed on MyClassWithAllAttributeTypes with ID '123': foreign key 'foreignKeyAttribute', foreign key 'nullableForeignKeyAttribute'",
              {
                entity: "MyClassWithAllAttributeTypes",
                id: "123",
                guards: [
                  { kind: "foreignKey", name: "foreignKeyAttribute" },
                  { kind: "foreignKey", name: "nullableForeignKeyAttribute" }
                ]
              }
            )
          ]);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [{ TransactItems: sentItems }]
          ]);
        });
      });
    });

    describe("when the payload sets the foreign key", () => {
      const canonicalUpdate = {
        Update: {
          TableName: "mock-table",
          Key: {
            PK: "MyClassWithAllAttributeTypes#123",
            SK: "MyClassWithAllAttributeTypes"
          },
          UpdateExpression:
            "SET #foreignKeyAttribute = :foreignKeyAttribute, #UpdatedAt = :UpdatedAt",
          ConditionExpression: "attribute_exists(PK)",
          ExpressionAttributeNames: {
            "#UpdatedAt": "UpdatedAt",
            "#foreignKeyAttribute": "foreignKeyAttribute"
          },
          ExpressionAttributeValues: {
            ":UpdatedAt": now,
            ":foreignKeyAttribute": "c2"
          }
        }
      };
      const guardedParentCheck = {
        ConditionCheck: {
          TableName: "mock-table",
          Key: { PK: "Customer#c2", SK: "Customer" },
          ConditionExpression:
            "attribute_exists(PK) AND (attribute_exists(PK) AND (#Name = :wc1_Name1))",
          ExpressionAttributeNames: { "#Name": "Name" },
          ExpressionAttributeValues: { ":wc1_Name1": "Jane" },
          ReturnValuesOnConditionCheckFailure: "ALL_OLD"
        }
      };

      it.each([true, false])(
        "reads nothing and guards the new parent in one check (referentialIntegrityCheck: %s)",
        async referentialIntegrityCheck => {
          expect.assertions(2);

          await MyClassWithAllAttributeTypes.update(
            "123",
            { foreignKeyAttribute: "c2" },
            {
              referentialIntegrityCheck,
              condition: { foreignKeyAttribute: { target: { name: "Jane" } } }
            }
          );

          // With integrity checks on, the guard merges into the library's
          // check on the parent; off, it adds the same check itself
          expect(mockSend.mock.calls).toEqual([
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [{ TransactItems: [canonicalUpdate, guardedParentCheck] }]
          ]);
        }
      );
    });
  });

  describe("a searchable entity", () => {
    const listingTableItem = {
      PK: "Listing#123",
      SK: "Listing",
      Id: "123",
      Type: "Listing",
      Description: "The very same description",
      Category: "Mugs",
      StoreId: "456",
      CreatedAt: "2023-10-01T00:00:00.000Z",
      UpdatedAt: "2023-10-02T00:00:00.000Z"
    };
    const expression = {
      UpdateExpression:
        "SET #Description = :Description, #UpdatedAt = :UpdatedAt",
      ExpressionAttributeNames: {
        "#Description": "Description",
        "#UpdatedAt": "UpdatedAt"
      },
      ExpressionAttributeValues: {
        ":Description": "The very same description",
        ":UpdatedAt": now
      }
    };
    const sentItems = [
      {
        // The searchable-value pin is registered with the transaction, so a
        // changed value is attributed as a concurrent change
        Update: {
          TableName: "search-table",
          Key: { PK: "Listing#123", SK: "Listing" },
          UpdateExpression: expression.UpdateExpression,
          ConditionExpression:
            "attribute_exists(PK) AND (#Description = :wc2_Description) AND (#Category = :wc1_Category1)",
          ExpressionAttributeNames: {
            ...expression.ExpressionAttributeNames,
            "#Category": "Category"
          },
          ExpressionAttributeValues: {
            ...expression.ExpressionAttributeValues,
            ":wc1_Category1": "Mugs",
            ":wc2_Description": "The very same description"
          },
          ReturnValuesOnConditionCheckFailure: "ALL_OLD"
        }
      },
      {
        Update: {
          TableName: "search-table",
          Key: { PK: "Store#456", SK: "Listing#123" },
          ConditionExpression: "attribute_exists(PK)",
          ...expression
        }
      }
    ];

    const update = async (): Promise<void> => {
      await Listing.update(
        "123",
        { description: "The very same description" },
        { condition: { category: "Mugs" } }
      );
    };

    beforeEach(() => {
      mockQuery.mockResolvedValue({ Items: [listingTableItem] });
    });

    it("keeps the searchable-value pin alongside the consumer condition", async () => {
      expect.assertions(2);

      await update();

      expect(mockEmbeddingProviderCalls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [{ TransactItems: sentItems }]
      ]);
    });

    it("reports a changed searchable value with the pin's message, not the condition error", async () => {
      expect.assertions(2);

      cancelTransactWrite([
        {
          Code: "ConditionalCheckFailed",
          Item: {
            PK: { S: "Listing#123" },
            SK: { S: "Listing" },
            Description: { S: "A newer description" },
            Category: { S: "Plates" }
          }
        },
        { Code: "None" }
      ]);

      const e = await failureOf(update);

      expect(e.errors).toEqual([
        new ConditionalCheckFailedError(
          "ConditionalCheckFailed: Listing with ID '123' does not exist or its searchable value was changed by a concurrent write — retry the update"
        )
      ]);
      expect(e.errors[0]).not.toBeInstanceOf(WriteConditionFailedError);
    });

    it("reports a failed condition when the searchable value still holds", async () => {
      expect.assertions(1);

      cancelTransactWrite([
        {
          Code: "ConditionalCheckFailed",
          Item: {
            PK: { S: "Listing#123" },
            SK: { S: "Listing" },
            Description: { S: "The very same description" },
            Category: { S: "Plates" }
          }
        },
        { Code: "None" }
      ]);

      const e = await failureOf(update);

      expect(e.errors).toEqual([
        new WriteConditionFailedError(
          "ConditionalCheckFailed: Write condition failed on Listing with ID '123': its own row",
          { entity: "Listing", id: "123", guards: [{ kind: "self" }] }
        )
      ]);
    });
  });
  describe("a whole-value object operand naming a field its schema does not declare (R30, R15)", () => {
    // Before this was refused, the operand was converted to its stored form,
    // which strips a field the schema does not declare: `{ ..., region: "west" }`
    // was sent as `{ ... }`, so the guard held against a row holding no region
    // at all and let through the write the caller meant to stop
    const undeclared = (attr: string, path: string): FilterError =>
      new FilterError(
        `Invalid filter value for attribute "${attr}": "${path}" is not a field the attribute declares. An object is compared whole, so no stored value can equal this operand`
      );

    const address = {
      street: "1 Main St",
      city: "Denver",
      geo: { lat: 39.7, lng: -104.9, accuracy: "precise" as const },
      scores: [1]
    };
    const location = { city: "Denver", state: "CO" };

    const expectNothingSent = (): void => {
      expect(mockSend.mock.calls).toEqual([]);
      expect(mockedQueryCommand.mock.calls).toEqual([]);
      expect(mockTransactGetCommand.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    };

    it("refuses one at the top level of an own-row object attribute before anything is sent", async () => {
      expect.assertions(5);

      const e = await failureOf(
        async () =>
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "new" },
            {
              condition: {
                addressAttribute: {
                  ...address,
                  // @ts-expect-error: a plain JavaScript caller's undeclared field
                  region: "west"
                }
              }
            }
          )
      );

      expect(e).toEqual(undeclared("addressAttribute", "region"));
      expectNothingSent();
    });

    it("refuses one inside a nested object, a nested list element, an IN element and a dot-path object field", async () => {
      expect.assertions(8);

      const nested = await failureOf(
        async () =>
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "new" },
            {
              condition: {
                addressAttribute: {
                  ...address,
                  geo: {
                    ...address.geo,
                    // @ts-expect-error: a plain JavaScript caller's undeclared field
                    alt: 1600
                  }
                }
              }
            }
          )
      );
      const inList = await failureOf(
        async () =>
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "new" },
            {
              condition: {
                objectAttribute: {
                  name: "Jane",
                  email: "jane@example.com",
                  tags: [],
                  status: "active",
                  createdDate: new Date("2023-01-01T00:00:00.000Z"),
                  history: [
                    {
                      at: new Date("2023-01-02T00:00:00.000Z"),
                      actor: "ann",
                      // @ts-expect-error: a plain JavaScript caller's undeclared field
                      mood: "calm"
                    }
                  ]
                }
              }
            }
          )
      );
      const inElement = await failureOf(
        async () =>
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "new" },
            {
              condition: {
                addressAttribute: [
                  address,
                  {
                    ...address,
                    // @ts-expect-error: a plain JavaScript caller's undeclared field
                    region: "west"
                  }
                ]
              }
            }
          )
      );
      const dotPath = await failureOf(
        async () =>
          await MyClassWithAllAttributeTypes.update(
            "123",
            { stringAttribute: "new" },
            {
              condition: {
                "addressAttribute.geo": {
                  ...address.geo,
                  // @ts-expect-error: a plain JavaScript caller's undeclared field
                  alt: 1600
                }
              }
            }
          )
      );

      expect(nested).toEqual(undeclared("addressAttribute", "geo.alt"));
      expect(inList).toEqual(undeclared("objectAttribute", "history[0].mood"));
      expect(inElement).toEqual(undeclared("addressAttribute", "region"));
      expect(dotPath).toEqual(undeclared("addressAttribute.geo", "alt"));
      expectNothingSent();
    });

    it("refuses one through the instance method, leaving the instance unmodified", async () => {
      expect.assertions(6);

      const instance = createInstance(Warehouse, {
        pk: "Warehouse#w1" as PartitionKey,
        sk: "Warehouse" as SortKey,
        id: "w1",
        type: "Warehouse",
        name: "Central",
        location,
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });

      const e = await failureOf(
        async () =>
          await instance.update(
            { name: "North" },
            {
              condition: {
                location: {
                  ...location,
                  // @ts-expect-error: a plain JavaScript caller's undeclared field
                  region: "west"
                }
              }
            }
          )
      );

      expect(e).toEqual(undeclared("location", "region"));
      expect(instance).toEqual({
        pk: "Warehouse#w1",
        sk: "Warehouse",
        id: "w1",
        type: "Warehouse",
        name: "Central",
        location,
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });
      expectNothingSent();
    });

    it("refuses one in a BelongsTo guard's condition before anything is sent", async () => {
      expect.assertions(5);

      const e = await failureOf(
        async () =>
          await Shipment.update(
            "s1",
            { destination: "Boise" },
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

      expect(e).toEqual(undeclared("location", "region"));
      expectNothingSent();
    });

    it("refuses one in a HasMany entry's condition before anything is sent", async () => {
      expect.assertions(5);

      const e = await failureOf(
        async () =>
          await Warehouse.update(
            "w1",
            { name: "North" },
            {
              condition: {
                shipments: [
                  {
                    id: "s1",
                    condition: {
                      dimensions: {
                        weight: 2,
                        unit: "kg",
                        // @ts-expect-error: a plain JavaScript caller's undeclared field
                        fragile: true
                      }
                    }
                  }
                ]
              }
            }
          )
      );

      expect(e).toEqual(undeclared("dimensions", "fragile"));
      expectNothingSent();
    });

    it("refuses one in a HasAndBelongsToMany entry's condition before anything is sent", async () => {
      expect.assertions(5);

      const e = await failureOf(
        async () =>
          await Festival.update(
            "f1",
            { name: "Summer" },
            {
              condition: {
                sponsors: [
                  {
                    id: "sp1",
                    condition: {
                      inventory: {
                        quantity: 3,
                        location: "Bay 4",
                        // @ts-expect-error: a plain JavaScript caller's undeclared field
                        reserved: 1
                      }
                    }
                  }
                ]
              }
            }
          )
      );

      expect(e).toEqual(undeclared("inventory", "reserved"));
      expectNothingSent();
    });

    it("refuses one in a foreign key target guard's condition before anything is sent", async () => {
      expect.assertions(5);

      const e = await failureOf(
        async () =>
          await WarehouseInspection.update(
            "i1",
            { warehouseId: "w2" },
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

      expect(e).toEqual(undeclared("location", "region"));
      expectNothingSent();
    });
  });
});
