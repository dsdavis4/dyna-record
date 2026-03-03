import {
  TransactWriteCommand,
  TransactGetCommand,
  QueryCommand
} from "@aws-sdk/lib-dynamodb";
import {
  type Address,
  type Assignment,
  ContactInformation,
  Customer,
  Desk,
  Employee,
  Grade,
  MockTable,
  MyClassWithAllAttributeTypes,
  Order,
  Organization,
  PaymentMethod,
  type Person,
  Pet,
  PhoneBook,
  type Student,
  type User,
  Website,
  Warehouse,
  type Shipment
} from "./mockModels";
import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { ConditionalCheckFailedError } from "../../src/dynamo-utils";
import {
  ForeignKeyAttribute,
  BelongsTo,
  Entity,
  HasMany,
  HasOne,
  DateAttribute,
  StringAttribute
} from "../../src/decorators";
import {
  type NullableForeignKey,
  type PartitionKey,
  type SortKey,
  type ForeignKey
} from "../../src/types";
import { NotFoundError, ValidationError } from "../../src";
import { createInstance } from "../../src/utils";
import {
  type OtherTableEntityTableItem,
  type MockTableEntityTableItem
} from "./utils";
import Logger from "../../src/Logger";

const mockTransactWriteCommand = jest.mocked(TransactWriteCommand);
const mockTransactGetCommand = jest.mocked(TransactGetCommand);
const mockedQueryCommand = jest.mocked(QueryCommand);

const mockSend = jest.fn();
const mockTransactGetItems = jest.fn();
const mockQuery = jest.fn();

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
    TransactGetCommand: jest.fn().mockImplementation(() => {
      return { name: "TransactGetCommand" };
    }),
    TransactWriteCommand: jest.fn().mockImplementation(() => {
      return { name: "TransactWriteCommand" };
    }),
    QueryCommand: jest.fn().mockImplementation(() => {
      return { name: "QueryCommand" };
    })
  };
});

@Entity
class MyModelNullableAttribute extends MockTable {
  @StringAttribute({ alias: "MyAttribute", nullable: true })
  public myAttribute?: string;
}

@Entity
class MyModelNonNullableAttribute extends MockTable {
  @DateAttribute({ alias: "DateAttribute", nullable: false })
  public myAttribute: Date;
}

@Entity
class MockInformation extends MockTable {
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

describe("Update", () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
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
      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

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
        // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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
      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

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
        // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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
                    "#dateAttribute": "dateAttribute",
                    "#enumAttribute": "enumAttribute",
                    "#foreignKeyAttribute": "foreignKeyAttribute",
                    "#nullableBoolAttribute": "nullableBoolAttribute",
                    "#nullableDateAttribute": "nullableDateAttribute",
                    "#nullableEnumAttribute": "nullableEnumAttribute",
                    "#nullableForeignKeyAttribute":
                      "nullableForeignKeyAttribute",
                    "#nullableNumberAttribute": "nullableNumberAttribute",
                    "#nullableStringAttribute": "nullableStringAttribute",
                    "#numberAttribute": "numberAttribute",
                    "#objectAttribute": "objectAttribute",
                    "#stringAttribute": "stringAttribute"
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
                    ":objectAttribute": {
                      name: "John",
                      email: "john@example.com",
                      tags: ["work", "vip"],
                      status: "active",
                      createdDate: "2023-10-16T03:31:35.918Z"
                    },
                    ":stringAttribute": "1"
                  },
                  Key: {
                    PK: "MyClassWithAllAttributeTypes#123",
                    SK: "MyClassWithAllAttributeTypes"
                  },
                  TableName: "mock-table",
                  UpdateExpression:
                    "SET #stringAttribute = :stringAttribute, #nullableStringAttribute = :nullableStringAttribute, #dateAttribute = :dateAttribute, #nullableDateAttribute = :nullableDateAttribute, #boolAttribute = :boolAttribute, #nullableBoolAttribute = :nullableBoolAttribute, #numberAttribute = :numberAttribute, #nullableNumberAttribute = :nullableNumberAttribute, #foreignKeyAttribute = :foreignKeyAttribute, #nullableForeignKeyAttribute = :nullableForeignKeyAttribute, #enumAttribute = :enumAttribute, #nullableEnumAttribute = :nullableEnumAttribute, #objectAttribute = :objectAttribute, #UpdatedAt = :UpdatedAt"
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
      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
    });

    test("static method", async () => {
      expect.assertions(5);

      expect(
        // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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
      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
    });

    test("static method", async () => {
      expect.assertions(5);

      expect(
        // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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
      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

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
        // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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
        // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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
      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
    });

    test("static method", async () => {
      expect.assertions(5);

      expect(
        // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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
      jest.setSystemTime(now);

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
          nullableEnumAttribute: "val-4"
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
          nullableEnumAttribute: "val-4"
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
        },
        {
          code: "invalid_type",
          expected: "'active' | 'inactive'",
          message: "Required",
          path: ["objectAttribute", "status"],
          received: "undefined"
        },
        {
          code: "invalid_type",
          expected: "date",
          message: "Required",
          path: ["objectAttribute", "createdDate"],
          received: "undefined"
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
        },
        {
          code: "invalid_type",
          expected: "'active' | 'inactive'",
          message: "Required",
          path: ["objectAttribute", "status"],
          received: "undefined"
        },
        {
          code: "invalid_type",
          expected: "date",
          message: "Required",
          path: ["objectAttribute", "createdDate"],
          received: "undefined"
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

  describe("will error if nullableObjectAttribute nested object and array fields are the wrong type", () => {
    const operationSharedAssertions = (e: any): void => {
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
          expected: "'precise' | 'approximate'",
          message: "Required",
          path: ["nullableObjectAttribute", "geo", "accuracy"],
          received: "undefined"
        },
        {
          code: "invalid_type",
          expected: "number",
          message: "Expected number, received string",
          path: ["nullableObjectAttribute", "scores", 0],
          received: "string"
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
          nullableObjectAttribute: {
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
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });

      try {
        await instance.update({
          nullableObjectAttribute: {
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

  describe("will error if nullableObjectAttribute top-level fields are the wrong type", () => {
    const operationSharedAssertions = (e: any): void => {
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
      expect(mockedQueryCommand.mock.calls).toEqual([]);
      expect(mockTransactGetCommand.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    };

    test("static method", async () => {
      expect.assertions(6);

      try {
        await MyClassWithAllAttributeTypes.update("123", {
          nullableObjectAttribute: {
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
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });

      try {
        await instance.update({
          nullableObjectAttribute: {
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
        },
        {
          code: "invalid_type",
          expected: "'active' | 'inactive'",
          message: "Required",
          path: ["objectAttribute", "status"],
          received: "undefined"
        },
        {
          code: "invalid_type",
          expected: "date",
          message: "Required",
          path: ["objectAttribute", "createdDate"],
          received: "undefined"
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

  describe("will error if non-nullable nullableObjectAttribute fields are set to null", () => {
    const operationSharedAssertions = (e: any): void => {
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
      expect(mockedQueryCommand.mock.calls).toEqual([]);
      expect(mockTransactGetCommand.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    };

    test("static method", async () => {
      expect.assertions(6);

      try {
        await MyClassWithAllAttributeTypes.update("123", {
          nullableObjectAttribute: {
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
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });

      try {
        await instance.update({
          nullableObjectAttribute: {
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

  describe("will error if non-nullable nested fields within nullableObjectAttribute are set to null", () => {
    const operationSharedAssertions = (e: any): void => {
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
          expected: "'precise' | 'approximate'",
          message: "Required",
          path: ["nullableObjectAttribute", "geo", "accuracy"],
          received: "undefined"
        },
        {
          code: "invalid_type",
          expected: "number",
          message: "Expected number, received null",
          path: ["nullableObjectAttribute", "scores", 0],
          received: "null"
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
          nullableObjectAttribute: {
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
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });

      try {
        await instance.update({
          nullableObjectAttribute: {
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
          code: "invalid_enum_value",
          message:
            "Invalid enum value. Expected 'active' | 'inactive', received 'bad-value'",
          options: ["active", "inactive"],
          path: ["objectAttribute", "status"],
          received: "bad-value"
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

  describe("will error if nullableObjectAttribute nested enum field has an invalid value", () => {
    const operationSharedAssertions = (e: any): void => {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toEqual("Validation errors");
      expect(e.cause).toEqual([
        {
          code: "invalid_enum_value",
          message:
            "Invalid enum value. Expected 'precise' | 'approximate', received 'bad-value'",
          options: ["precise", "approximate"],
          path: ["nullableObjectAttribute", "geo", "accuracy"],
          received: "bad-value"
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
          nullableObjectAttribute: {
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
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });

      try {
        await instance.update({
          nullableObjectAttribute: {
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
      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
    });

    test("static method", async () => {
      expect.assertions(4);

      await MyClassWithAllAttributeTypes.update("123", {
        nullableObjectAttribute: {
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
                    "#nullableObjectAttribute": "nullableObjectAttribute",
                    "#UpdatedAt": "UpdatedAt"
                  },
                  ExpressionAttributeValues: {
                    ":nullableObjectAttribute": {
                      street: "123 Main St",
                      city: "Springfield",
                      geo: { lat: 1, lng: 2, accuracy: "precise" },
                      scores: [95]
                    },
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                  },
                  Key: {
                    PK: "MyClassWithAllAttributeTypes#123",
                    SK: "MyClassWithAllAttributeTypes"
                  },
                  TableName: "mock-table",
                  UpdateExpression:
                    "SET #nullableObjectAttribute = :nullableObjectAttribute, #UpdatedAt = :UpdatedAt"
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
      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
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
          message: "Expected date, received null",
          path: ["myAttribute"],
          received: "null"
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

        jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
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
            // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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
              // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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
              // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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

        jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
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
            // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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
              // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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
              // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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

        jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
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
            // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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
              // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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
              // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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

        jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
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
            // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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
              // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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
              // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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

        jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
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
            // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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
              // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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
              // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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

        jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
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
            // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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
              // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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
            // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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
          // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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
      @StringAttribute({ alias: "SomeAttr" })
      public someAttr: string;

      @HasOne(() => Model3, { foreignKey: "model1Id" })
      public model3: Model3;
    }

    @Entity
    class Model2 extends MockTable {
      @StringAttribute({ alias: "OtherAttr" })
      public otherAttr: string;

      @HasMany(() => Model3, { foreignKey: "model2Id" })
      public model3: Model3[];
    }

    @Entity
    class Model3 extends MockTable {
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
      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
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
          // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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
          // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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
          // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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
          // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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
          // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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
          // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
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
                      "SET #Location = :Location, #UpdatedAt = :UpdatedAt",
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeNames: {
                      "#Location": "Location",
                      "#UpdatedAt": "UpdatedAt"
                    },
                    ExpressionAttributeValues: {
                      ":Location": { city: "Chicago", state: "IL" },
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
                      "SET #Location = :Location, #UpdatedAt = :UpdatedAt",
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeNames: {
                      "#Location": "Location",
                      "#UpdatedAt": "UpdatedAt"
                    },
                    ExpressionAttributeValues: {
                      ":Location": { city: "Chicago", state: "IL" },
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
          // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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
                        "#dateAttribute": "dateAttribute",
                        "#enumAttribute": "enumAttribute",
                        "#foreignKeyAttribute": "foreignKeyAttribute",
                        "#nullableBoolAttribute": "nullableBoolAttribute",
                        "#nullableDateAttribute": "nullableDateAttribute",
                        "#nullableEnumAttribute": "nullableEnumAttribute",
                        "#nullableForeignKeyAttribute":
                          "nullableForeignKeyAttribute",
                        "#nullableNumberAttribute": "nullableNumberAttribute",
                        "#nullableStringAttribute": "nullableStringAttribute",
                        "#numberAttribute": "numberAttribute",
                        "#objectAttribute": "objectAttribute",
                        "#stringAttribute": "stringAttribute"
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
                        ":objectAttribute": {
                          name: "John",
                          email: "john@example.com",
                          tags: ["work", "vip"],
                          status: "active",
                          createdDate: "2023-10-16T03:31:35.918Z"
                        },
                        ":stringAttribute": "1"
                      },
                      Key: {
                        PK: "MyClassWithAllAttributeTypes#123",
                        SK: "MyClassWithAllAttributeTypes"
                      },
                      TableName: "mock-table",
                      UpdateExpression:
                        "SET #stringAttribute = :stringAttribute, #nullableStringAttribute = :nullableStringAttribute, #dateAttribute = :dateAttribute, #nullableDateAttribute = :nullableDateAttribute, #boolAttribute = :boolAttribute, #nullableBoolAttribute = :nullableBoolAttribute, #numberAttribute = :numberAttribute, #nullableNumberAttribute = :nullableNumberAttribute, #foreignKeyAttribute = :foreignKeyAttribute, #nullableForeignKeyAttribute = :nullableForeignKeyAttribute, #enumAttribute = :enumAttribute, #nullableEnumAttribute = :nullableEnumAttribute, #objectAttribute = :objectAttribute, #UpdatedAt = :UpdatedAt"
                    }
                  }
                ]
              }
            ]
          ]);
        };

        beforeEach(() => {
          jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
        });

        test("static method", async () => {
          expect.assertions(5);

          expect(
            // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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
              message: "Expected string, received null",
              path: ["paymentMethodId"],
              received: "null"
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

      it("objectAttribute does not accept missing required fields", async () => {
        await MyClassWithAllAttributeTypes.update("123", {
          // @ts-expect-error: email and tags are missing
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

      it("nullableObjectAttribute accepts correct nested object shape", async () => {
        await MyClassWithAllAttributeTypes.update("123", {
          // @ts-expect-no-error: correct nested shape is accepted
          nullableObjectAttribute: {
            street: "123 Main St",
            city: "Springfield",
            geo: { lat: 1, lng: 2, accuracy: "precise" },
            scores: [95, 87]
          }
        });
      });

      it("nullableObjectAttribute does not accept wrong types for nested object fields", async () => {
        await MyClassWithAllAttributeTypes.update("123", {
          nullableObjectAttribute: {
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

      it("nullableObjectAttribute does not accept wrong item types in arrays", async () => {
        await MyClassWithAllAttributeTypes.update("123", {
          nullableObjectAttribute: {
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

      it("nullableObjectAttribute allows nullable fields to be omitted", async () => {
        await MyClassWithAllAttributeTypes.update("123", {
          // @ts-expect-no-error: zip is nullable so it can be omitted
          nullableObjectAttribute: {
            zip: undefined,
            street: "123 Main St",
            city: "Springfield",
            geo: { lat: 1, lng: 2, accuracy: "precise" },
            scores: [95]
          }
        });
      });

      it("nullableObjectAttribute allows nullable fields to be null for updates", async () => {
        await MyClassWithAllAttributeTypes.update("123", {
          nullableObjectAttribute: {
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

      it("nullableObjectAttribute does not allow non-nullable fields to be null", async () => {
        await MyClassWithAllAttributeTypes.update("123", {
          nullableObjectAttribute: {
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

      it("nullableObjectAttribute does not accept missing required nested fields", async () => {
        await MyClassWithAllAttributeTypes.update("123", {
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
                message: "Expected string, received null",
                path: ["paymentMethodId"],
                received: "null"
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

      it("return value nullableObjectAttribute requires optional chaining", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({ stringAttribute: "val" })
          .then(result => {
            // @ts-expect-error: nullableObjectAttribute might be undefined, requires optional chaining
            Logger.log(result.nullableObjectAttribute.city);
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("return value nullableObjectAttribute is accessible with optional chaining and has correct nested types", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({ stringAttribute: "val" })
          .then(result => {
            // @ts-expect-no-error: optional chaining allows safe access
            Logger.log(result.nullableObjectAttribute?.street);

            // @ts-expect-no-error: nested string field
            Logger.log(result.nullableObjectAttribute?.city);

            // @ts-expect-no-error: nested nullable field can be number or undefined
            Logger.log(result.nullableObjectAttribute?.zip);

            // @ts-expect-no-error: nested object field
            Logger.log(result.nullableObjectAttribute?.geo.lat);

            // @ts-expect-no-error: nested object field
            Logger.log(result.nullableObjectAttribute?.geo.lng);

            // @ts-expect-no-error: nested array field
            Logger.log(result.nullableObjectAttribute?.scores);

            // @ts-expect-no-error: array item is a number
            Logger.log(result.nullableObjectAttribute?.scores[0]);
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("return value nullableObjectAttribute nested fields have correct types (rejects wrong assignments)", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({ stringAttribute: "val" })
          .then(result => {
            if (result.nullableObjectAttribute !== undefined) {
              // @ts-expect-error: city is string, not number
              const cityAsNum: number = result.nullableObjectAttribute.city;
              Logger.log(cityAsNum);

              // @ts-expect-error: geo.lat is number, not string
              const latAsStr: string = result.nullableObjectAttribute.geo.lat;
              Logger.log(latAsStr);

              // @ts-expect-error: scores is number[], not string[]
              const scoresAsStrs: string[] =
                result.nullableObjectAttribute.scores;
              Logger.log(scoresAsStrs);

              // @ts-expect-error: nonExistent is not in the schema
              Logger.log(result.nullableObjectAttribute.nonExistent);
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

      it("objectAttribute does not accept missing required fields", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({
            // @ts-expect-error: email and tags are missing
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

      it("nullableObjectAttribute accepts correct nested object shape", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance.update({
          // @ts-expect-no-error: correct nested shape is accepted
          nullableObjectAttribute: {
            street: "123 Main St",
            city: "Springfield",
            geo: { lat: 1, lng: 2, accuracy: "precise" },
            scores: [95, 87]
          }
        });
      });

      it("nullableObjectAttribute does not accept wrong types for nested object fields", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({
            nullableObjectAttribute: {
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

      it("nullableObjectAttribute does not accept wrong item types in arrays", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({
            nullableObjectAttribute: {
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

      it("nullableObjectAttribute allows nullable fields to be omitted", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance.update({
          // @ts-expect-no-error: zip is nullable so it can be omitted
          nullableObjectAttribute: {
            street: "123 Main St",
            city: "Springfield",
            geo: { lat: 1, lng: 2, accuracy: "precise" },
            scores: [95]
          }
        });
      });

      it("nullableObjectAttribute allows nullable fields to be null for updates", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({
            nullableObjectAttribute: {
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

      it("nullableObjectAttribute does not allow non-nullable fields to be null", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({
            nullableObjectAttribute: {
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

      it("nullableObjectAttribute does not accept missing required nested fields", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({
            nullableObjectAttribute: {
              street: "123 Main St",
              city: "Springfield",
              // @ts-expect-error: geo is missing required field lng
              geo: { lat: 1 },
              scores: [95]
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
            Logger.log(result.nullableObjectAttribute?.geo.accuracy);

            if (result.nullableObjectAttribute !== undefined) {
              // @ts-expect-no-error: accuracy is "precise" | "approximate"
              const acc: "precise" | "approximate" =
                result.nullableObjectAttribute.geo.accuracy;
              Logger.log(acc);

              // @ts-expect-error: accuracy is "precise" | "approximate", not number
              const accAsNum: number =
                result.nullableObjectAttribute.geo.accuracy;
              Logger.log(accAsNum);
            }
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });

      it("nullableObjectAttribute nullable enum field supports undefined", async () => {
        const instance = new MyClassWithAllAttributeTypes();

        await instance
          .update({ stringAttribute: "val" })
          .then(result => {
            // @ts-expect-no-error: nullable enum field can be accessed with optional chaining
            Logger.log(result.nullableObjectAttribute?.category);

            if (result.nullableObjectAttribute !== undefined) {
              // @ts-expect-no-error: category is "home" | "work" | "other" | undefined
              const cat: "home" | "work" | "other" | undefined =
                result.nullableObjectAttribute.category;
              Logger.log(cat);
            }
          })
          .catch(() => {
            Logger.log("Testing types");
          });
      });
    });
  });
});
