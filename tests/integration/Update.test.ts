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
  Grade,
  MockTable,
  MyClassWithAllAttributeTypes,
  Order,
  type Person,
  Pet,
  PhoneBook,
  type Student,
  type User,
  Website
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

// TODO make sure there is a test for updating an entity which does not need to do any prefetch
//      does not belong to anything (or has nullable foreign key) or have has one or has many

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
            FilterExpression: "#Type IN (:Type1,:Type2,:Type3,:Type4)"
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
            FilterExpression: "#Type IN (:Type1,:Type2,:Type3,:Type4)"
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
                    ":stringAttribute": "1"
                  },
                  Key: {
                    PK: "MyClassWithAllAttributeTypes#123",
                    SK: "MyClassWithAllAttributeTypes"
                  },
                  TableName: "mock-table",
                  UpdateExpression:
                    "SET #stringAttribute = :stringAttribute, #nullableStringAttribute = :nullableStringAttribute, #dateAttribute = :dateAttribute, #nullableDateAttribute = :nullableDateAttribute, #boolAttribute = :boolAttribute, #nullableBoolAttribute = :nullableBoolAttribute, #numberAttribute = :numberAttribute, #nullableNumberAttribute = :nullableNumberAttribute, #foreignKeyAttribute = :foreignKeyAttribute, #nullableForeignKeyAttribute = :nullableForeignKeyAttribute, #enumAttribute = :enumAttribute, #nullableEnumAttribute = :nullableEnumAttribute, #UpdatedAt = :UpdatedAt"
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
          nullableEnumAttribute: "val-2"
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
        foreignKeyAttribute: "old-1111" as ForeignKey,
        nullableForeignKeyAttribute: "old-2222" as NullableForeignKey,
        boolAttribute: false,
        nullableBoolAttribute: true,
        numberAttribute: 9,
        nullableNumberAttribute: 8,
        enumAttribute: "val-2",
        nullableEnumAttribute: "val-1",
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
        nullableEnumAttribute: "val-2"
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
            FilterExpression: "#Type IN (:Type1)"
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
        foreignKeyAttribute: "11111" as ForeignKey,
        boolAttribute: true,
        numberAttribute: 9,
        enumAttribute: "val-2",
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

  describe("will allow nullable attributes to be set to null", () => {
    const dbOperationAssertions = (): void => {
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockedQueryCommand.mock.calls).toEqual([]);
      expect(mockTransactGetCommand.mock.calls).toEqual([]);
      // TODO I think this is wrong... There should be a remove...
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
                    "SET #someDate = :someDate, #UpdatedAt = :UpdatedAt",
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#UpdatedAt": "UpdatedAt",
                    "#someDate": "someDate"
                  },
                  ExpressionAttributeValues: {
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                    ":someDate": undefined
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

    it("static method", async () => {
      expect.assertions(4);

      await MockInformation.update("123", {
        someDate: null
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

      const updatedInstance = await instance.update({ someDate: null });

      expect(updatedInstance).toEqual({
        ...instance,
        someDate: undefined,
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

  describe("ForeignKey is updated for entity which BelongsTo an entity who HasOne of it", () => {
    describe("when the entity does not already belong to another entity", () => {
      const contactInformation: MockTableEntityTableItem<ContactInformation> = {
        PK: "ContactInformation#123",
        SK: "ContactInformation",
        Id: "123",
        Type: "ContactInformation",
        Email: "old-email@email.com",
        Phone: "555-555-5555",
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
                FilterExpression: "#Type IN (:Type1)"
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
          expect(e).toEqual(new NotFoundError("Customer does not exist: 456"));
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

      // TODO determine how to handle this, see note in last expect
      describe.skip("will remove a nullable foreign key", () => {
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
                FilterExpression: "#Type IN (:Type1)"
              }
            ]
          ]);
          // Dont get customer because its being deleted
          expect(mockTransactGetCommand.mock.calls).toEqual([]);
          expect(mockTransactWriteCommand.mock.calls).toEqual(
            "TODO how do I want to handle this? I think I need to make this error for malformed data. With the ContactInformation not having a customer id, I cant ensure data is in good state"
          );
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
        customerId: contactInformation.CustomerId as NullableForeignKey,
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
                FilterExpression: "#Type IN (:Type1)"
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
          expect(e).toEqual(new NotFoundError("Customer does not exist: 456"));
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

      describe("will remove a nullable foreign key and delete the BelongsToLinks for the associated entity", () => {
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
                FilterExpression: "#Type IN (:Type1)"
              }
            ]
          ]);
          // Dont get customer because its being deleted
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
    });
  });

  describe("ForeignKey is updated for entity which BelongsTo an entity who HasMany of it", () => {
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
                FilterExpression: "#Type IN (:Type1)"
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

      // TODO determine how to handle this
      describe.skip("will remove a nullable foreign key and delete the links for the associated entity", () => {
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
                FilterExpression: "#Type IN (:Type1)"
              }
            ]
          ]);
          // Dont get owner (Person) because its being deleted
          expect(mockTransactGetCommand.mock.calls).toEqual([]);
          expect(mockTransactWriteCommand.mock.calls).toEqual(
            "TODO how do I handle this?"
          );
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
        ownerId: pet.OwnerId as NullableForeignKey,
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
                FilterExpression: "#Type IN (:Type1)"
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

      describe("will remove a nullable foreign key and delete the BelongsToLinks for the associated entity", () => {
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
                FilterExpression: "#Type IN (:Type1)"
              }
            ]
          ]);
          // Dont get customer because its being deleted
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

      @ForeignKeyAttribute({ alias: "Model1Id", nullable: true })
      public model1Id?: NullableForeignKey;

      @ForeignKeyAttribute({ alias: "Model2Id", nullable: true })
      public model2Id?: NullableForeignKey;

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
              FilterExpression: "#Type IN (:Type1)"
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
              FilterExpression: "#Type IN (:Type1)"
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
        model1Id: "001" as NullableForeignKey, // Already has an associated entity
        model2Id: "002" as NullableForeignKey, // Already has an associated entity
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
              FilterExpression: "#type IN (:type1)"
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
        assignmentId: "001" as ForeignKey, // Already has an associated entity
        studentId: "002" as ForeignKey, // Already has an associated entity
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
              FilterExpression: "#Type IN (:Type1,:Type2)"
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
  });

  describe("A model who HasOne of a relationship is updated", () => {
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
            FilterExpression: "#Type IN (:Type1,:Type2)"
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
                  UpdateExpression: "SET #Num = :Num, #UpdatedAt = :UpdatedAt",
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
                  UpdateExpression: "SET #Num = :Num, #UpdatedAt = :UpdatedAt",
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
  });

  describe("A model who HasAndBelongsToMany of a relationship is updated", () => {
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
            FilterExpression: "#Type IN (:Type1,:Type2)"
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
          console.log("Testing types");
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
          console.log("Testing types");
        });
      });

      it("will not accept DefaultFields on update because they are managed by dyna-record", async () => {
        await Order.update("123", {
          // @ts-expect-error default fields are not accepted on update, they are managed by dyna-record
          id: "123"
        }).catch(() => {
          console.log("Testing types");
        });

        await Order.update("123", {
          // @ts-expect-error default fields are not accepted on update, they are managed by dyna-record
          type: "456"
        }).catch(() => {
          console.log("Testing types");
        });

        await Order.update("123", {
          // @ts-expect-error default fields are not accepted on update, they are managed by dyna-record
          createdAt: new Date()
        }).catch(() => {
          console.log("Testing types");
        });

        await Order.update("123", {
          // @ts-expect-error default fields are not accepted on update, they are managed by dyna-record
          updatedAt: new Date()
        }).catch(() => {
          console.log("Testing types");
        });
      });

      it("will not accept partition and sort keys on update because they are managed by dyna-record", async () => {
        await Order.update("123", {
          // @ts-expect-error primary key fields are not accepted on update, they are managed by dyna-record
          pk: "123"
        }).catch(() => {
          console.log("Testing types");
        });

        await Order.update("123", {
          // @ts-expect-error sort key fields are not accepted on update, they are managed by dyna-record
          sk: "456"
        }).catch(() => {
          console.log("Testing types");
        });
      });

      it("does not require all of an entity attributes to be passed", async () => {
        await Order.update("123", {
          // @ts-expect-no-error ForeignKey is of type string so it can be passed as such without casing to ForeignKey
          paymentMethodId: "123",
          // @ts-expect-no-error ForeignKey is of type string so it can be passed as such without casing to ForeignKey
          customerId: "456"
        }).catch(() => {
          console.log("Testing types");
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
            console.log("Testing types");
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
            console.log("Testing types");
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
            console.log("Testing types");
          });

        await instance
          .update({
            // @ts-expect-error default fields are not accepted on update, they are managed by dyna-record
            type: "456"
          })
          .catch(() => {
            console.log("Testing types");
          });

        await instance
          .update({
            // @ts-expect-error default fields are not accepted on update, they are managed by dyna-record
            createdAt: new Date()
          })
          .catch(() => {
            console.log("Testing types");
          });

        await instance
          .update({
            // @ts-expect-error default fields are not accepted on update, they are managed by dyna-record
            updatedAt: new Date()
          })
          .catch(() => {
            console.log("Testing types");
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
            console.log("Testing types");
          });

        await instance
          .update({
            // @ts-expect-error sort key fields are not accepted on update, they are managed by dyna-record
            sk: "456"
          })
          .catch(() => {
            console.log("Testing types");
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
            console.log("Testing types");
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
    });
  });
});
