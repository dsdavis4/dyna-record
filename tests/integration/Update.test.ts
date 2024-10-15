import { TransactWriteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import {
  ContactInformation,
  Customer,
  Grade,
  MockTable,
  MyClassWithAllAttributeTypes,
  Order,
  PaymentMethod,
  Pet
} from "./mockModels";
import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { v4 as uuidv4 } from "uuid";
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
import { ValidationError } from "../../src";
import { createInstance } from "../../src/utils";

jest.mock("uuid");

const mockTransactWriteCommand = jest.mocked(TransactWriteCommand);
const mockedGetCommand = jest.mocked(GetCommand);

const mockSend = jest.fn();
const mockGet = jest.fn();
const mockTransact = jest.fn();

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
            if (command.name === "GetCommand") {
              return await Promise.resolve(mockGet());
            }

            if (command.name === "TransactWriteCommand") {
              return await Promise.resolve(mockTransact());
            }
          })
        };
      })
    },
    GetCommand: jest.fn().mockImplementation(() => {
      return { name: "GetCommand" };
    }),
    TransactWriteCommand: jest.fn().mockImplementation(() => {
      return { name: "TransactWriteCommand" };
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

  describe("static method", () => {
    it("will update an entity without foreign key attributes", async () => {
      expect.assertions(6);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

      expect(
        // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
        await Customer.update("123", {
          name: "New Name",
          address: "new Address"
        })
      ).toBeUndefined();
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockGet.mock.calls).toEqual([]);
      expect(mockedGetCommand.mock.calls).toEqual([]);
      expect(mockTransact.mock.calls).toEqual([[]]);
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
    });

    it("has runtime schema validation to ensure that reserved keys are not set on update. They will be omitted from update", async () => {
      expect.assertions(6);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

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
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockGet.mock.calls).toEqual([]);
      expect(mockedGetCommand.mock.calls).toEqual([]);
      expect(mockTransact.mock.calls).toEqual([[]]);
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
    });

    it("can update all attribute types", async () => {
      expect.assertions(6);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

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
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockGet.mock.calls).toEqual([]);
      expect(mockedGetCommand.mock.calls).toEqual([]);
      expect(mockTransact.mock.calls).toEqual([[]]);
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
    });

    it("will update an entity and remove attributes", async () => {
      expect.assertions(6);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

      expect(
        // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
        await ContactInformation.update("123", {
          email: "new@example.com",
          phone: null
        })
      ).toBeUndefined();
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockGet.mock.calls).toEqual([]);
      expect(mockedGetCommand.mock.calls).toEqual([]);
      expect(mockTransact.mock.calls).toEqual([[]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#Email": "Email",
                    "#Phone": "Phone",
                    "#UpdatedAt": "UpdatedAt"
                  },
                  ExpressionAttributeValues: {
                    ":Email": "new@example.com",
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                  },
                  Key: {
                    PK: "ContactInformation#123",
                    SK: "ContactInformation"
                  },
                  TableName: "mock-table",
                  UpdateExpression:
                    "SET #Email = :Email, #UpdatedAt = :UpdatedAt REMOVE #Phone"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("will update and remove multiple attributes", async () => {
      expect.assertions(6);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

      expect(
        // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
        await MockInformation.update("123", {
          address: "11 Some St",
          email: "new@example.com",
          state: null,
          phone: null
        })
      ).toBeUndefined();
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockGet.mock.calls).toEqual([]);
      expect(mockedGetCommand.mock.calls).toEqual([]);
      expect(mockTransact.mock.calls).toEqual([[]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
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
                  },
                  Key: { PK: "MockInformation#123", SK: "MockInformation" },
                  TableName: "mock-table",
                  UpdateExpression:
                    "SET #Address = :Address, #Email = :Email, #UpdatedAt = :UpdatedAt REMOVE #Phone, #State"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("will error if any attributes are the wrong type", async () => {
      expect.assertions(5);

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
        expect(mockSend.mock.calls).toEqual([undefined]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([]);
      }
    });

    it("will allow nullable attributes to be set to null", async () => {
      expect.assertions(5);

      await MockInformation.update("123", {
        someDate: null
      });

      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockGet.mock.calls).toEqual([]);
      expect(mockedGetCommand.mock.calls).toEqual([]);
      expect(mockTransact.mock.calls).toEqual([[]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#UpdatedAt": "UpdatedAt",
                    "#someDate": "someDate"
                  },
                  ExpressionAttributeValues: {
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                    ":someDate": undefined
                  },
                  Key: { PK: "MockInformation#123", SK: "MockInformation" },
                  TableName: "mock-table",
                  UpdateExpression:
                    "SET #someDate = :someDate, #UpdatedAt = :UpdatedAt"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("will not allow non nullable attributes to be null", async () => {
      expect.assertions(5);

      try {
        await MyModelNonNullableAttribute.update("123", {
          myAttribute: null as any // Force any to test runtime validations
        });
      } catch (e: any) {
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
        expect(mockSend.mock.calls).toEqual([undefined]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([]);
      }
    });

    it("will allow nullable attributes to be set to null", async () => {
      expect.assertions(5);

      await MockInformation.update("123", {
        someDate: null
      });

      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockGet.mock.calls).toEqual([]);
      expect(mockedGetCommand.mock.calls).toEqual([]);
      expect(mockTransact.mock.calls).toEqual([[]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#UpdatedAt": "UpdatedAt",
                    "#someDate": "someDate"
                  },
                  ExpressionAttributeValues: {
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                    ":someDate": undefined
                  },
                  Key: { PK: "MockInformation#123", SK: "MockInformation" },
                  TableName: "mock-table",
                  UpdateExpression:
                    "SET #someDate = :someDate, #UpdatedAt = :UpdatedAt"
                }
              }
            ]
          }
        ]
      ]);
    });

    describe("ForeignKey is updated for entity which BelongsTo an entity who HasOne of it", () => {
      describe("when the entity does not already belong to another entity", () => {
        beforeEach(() => {
          jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
          mockedUuidv4.mockReturnValueOnce("belongsToLinkId1");
          mockGet.mockResolvedValue({
            Item: {
              PK: "ContactInformation#123",
              SK: "ContactInformation",
              Id: "123",
              Email: "old-email@example.com",
              Phone: "555-555-5555",
              CustomerId: undefined // Does not already belong to customer
            }
          });
        });

        afterEach(() => {
          mockedUuidv4.mockReset();
        });

        it("will update the foreign key if the entity being associated with exists", async () => {
          expect.assertions(6);

          expect(
            // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
            await ContactInformation.update("123", {
              email: "new-email@example.com",
              customerId: "456"
            })
          ).toBeUndefined();
          expect(mockSend.mock.calls).toEqual([
            [{ name: "GetCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockGet.mock.calls).toEqual([[]]);
          expect(mockedGetCommand.mock.calls).toEqual([
            [
              {
                TableName: "mock-table",
                Key: { PK: "ContactInformation#123", SK: "ContactInformation" },
                ConsistentRead: true
              }
            ]
          ]);
          expect(mockTransact.mock.calls).toEqual([[]]);
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
                        "SET #Email = :Email, #CustomerId = :CustomerId, #UpdatedAt = :UpdatedAt",
                      // Check that the entity being updated exists
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
                  {
                    // Check that the entity being associated with exists
                    ConditionCheck: {
                      TableName: "mock-table",
                      Key: { PK: "Customer#456", SK: "Customer" },
                      ConditionExpression: "attribute_exists(PK)"
                    }
                  },
                  {
                    Put: {
                      TableName: "mock-table",
                      ConditionExpression: "attribute_not_exists(PK)",
                      Item: {
                        PK: "Customer#456",
                        SK: "ContactInformation",
                        Id: "belongsToLinkId1",
                        Type: "BelongsToLink",
                        ForeignEntityType: "ContactInformation",
                        ForeignKey: "123",
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

        it("will throw an error if the entity being updated does not exist", async () => {
          expect.assertions(7);

          mockGet.mockResolvedValueOnce({}); // Entity does not exist but will fail in transaction

          mockSend.mockReturnValueOnce(undefined).mockImplementationOnce(() => {
            mockTransact();
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
            await ContactInformation.update("123", {
              email: "new-email@example.com",
              customerId: "456"
            });
          } catch (e: any) {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: ContactInformation with ID '123' does not exist"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "GetCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
            expect(mockGet.mock.calls).toEqual([[]]);
            expect(mockedGetCommand.mock.calls).toEqual([
              [
                {
                  TableName: "mock-table",
                  Key: {
                    PK: "ContactInformation#123",
                    SK: "ContactInformation"
                  },
                  ConsistentRead: true
                }
              ]
            ]);
            expect(mockTransact.mock.calls).toEqual([[]]);
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
                          "SET #Email = :Email, #CustomerId = :CustomerId, #UpdatedAt = :UpdatedAt",
                        // Check that the entity being updated exists
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
                    {
                      // Check that the entity being associated with exists
                      ConditionCheck: {
                        TableName: "mock-table",
                        Key: { PK: "Customer#456", SK: "Customer" },
                        ConditionExpression: "attribute_exists(PK)"
                      }
                    },
                    {
                      Put: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_not_exists(PK)",
                        Item: {
                          PK: "Customer#456",
                          SK: "ContactInformation",
                          Id: "belongsToLinkId1",
                          Type: "BelongsToLink",
                          ForeignEntityType: "ContactInformation",
                          ForeignKey: "123",
                          CreatedAt: "2023-10-16T03:31:35.918Z",
                          UpdatedAt: "2023-10-16T03:31:35.918Z"
                        }
                      }
                    }
                  ]
                }
              ]
            ]);
          }
        });

        it("will throw an error if the entity being associated with does not exist", async () => {
          expect.assertions(7);

          mockSend.mockReturnValueOnce(undefined).mockImplementationOnce(() => {
            mockTransact();
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
            await ContactInformation.update("123", {
              email: "new-email@example.com",
              customerId: "456"
            });
          } catch (e: any) {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: Customer with ID '456' does not exist"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "GetCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
            expect(mockGet.mock.calls).toEqual([[]]);
            expect(mockedGetCommand.mock.calls).toEqual([
              [
                {
                  TableName: "mock-table",
                  Key: {
                    PK: "ContactInformation#123",
                    SK: "ContactInformation"
                  },
                  ConsistentRead: true
                }
              ]
            ]);
            expect(mockTransact.mock.calls).toEqual([[]]);
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
                          "SET #Email = :Email, #CustomerId = :CustomerId, #UpdatedAt = :UpdatedAt",
                        // Check that the entity being updated exists
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
                    {
                      // Check that the entity being associated with exists
                      ConditionCheck: {
                        TableName: "mock-table",
                        Key: { PK: "Customer#456", SK: "Customer" },
                        ConditionExpression: "attribute_exists(PK)"
                      }
                    },
                    {
                      Put: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_not_exists(PK)",
                        Item: {
                          PK: "Customer#456",
                          SK: "ContactInformation",
                          Id: "belongsToLinkId1",
                          Type: "BelongsToLink",
                          ForeignEntityType: "ContactInformation",
                          ForeignKey: "123",
                          CreatedAt: "2023-10-16T03:31:35.918Z",
                          UpdatedAt: "2023-10-16T03:31:35.918Z"
                        }
                      }
                    }
                  ]
                }
              ]
            ]);
          }
        });

        it("will remove a nullable foreign key", async () => {
          expect.assertions(6);

          expect(
            // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
            await ContactInformation.update("123", {
              email: "new-email@example.com",
              customerId: null
            })
          ).toBeUndefined();
          expect(mockSend.mock.calls).toEqual([
            [{ name: "GetCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockGet.mock.calls).toEqual([[]]);
          expect(mockedGetCommand.mock.calls).toEqual([
            [
              {
                TableName: "mock-table",
                Key: { PK: "ContactInformation#123", SK: "ContactInformation" },
                ConsistentRead: true
              }
            ]
          ]);
          expect(mockTransact.mock.calls).toEqual([[]]);
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
                      ExpressionAttributeValues: {
                        ":Email": "new-email@example.com",
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      },
                      ExpressionAttributeNames: {
                        "#Email": "Email",
                        "#UpdatedAt": "UpdatedAt",
                        "#CustomerId": "CustomerId"
                      },
                      UpdateExpression:
                        "SET #Email = :Email, #UpdatedAt = :UpdatedAt REMOVE #CustomerId"
                    }
                  }
                ]
              }
            ]
          ]);
        });
      });

      describe("when the entity belongs to another another entity (Adds delete transaction for existing BelongsToLink)", () => {
        beforeEach(() => {
          jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
          mockedUuidv4.mockReturnValueOnce("belongsToLinkId1");
          mockGet.mockResolvedValue({
            Item: {
              PK: "ContactInformation#123",
              SK: "ContactInformation",
              Id: "123",
              Email: "old-email@example.com",
              Phone: "555-555-5555",
              CustomerId: "789" // Already belongs to customer
            }
          });
        });

        afterEach(() => {
          mockedUuidv4.mockReset();
        });

        it("will update the foreign key and delete the old BelongsToLink if the entity being associated with exists", async () => {
          expect.assertions(6);

          expect(
            // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
            await ContactInformation.update("123", {
              email: "new-email@example.com",
              customerId: "456"
            })
          ).toBeUndefined();
          expect(mockSend.mock.calls).toEqual([
            [{ name: "GetCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockGet.mock.calls).toEqual([[]]);
          expect(mockedGetCommand.mock.calls).toEqual([
            [
              {
                TableName: "mock-table",
                Key: { PK: "ContactInformation#123", SK: "ContactInformation" },
                ConsistentRead: true
              }
            ]
          ]);
          expect(mockTransact.mock.calls).toEqual([[]]);
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
                        "SET #Email = :Email, #CustomerId = :CustomerId, #UpdatedAt = :UpdatedAt",
                      // Check that the entity being updated exists
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
                  {
                    // Check that the entity being associated with exists
                    ConditionCheck: {
                      TableName: "mock-table",
                      Key: { PK: "Customer#456", SK: "Customer" },
                      ConditionExpression: "attribute_exists(PK)"
                    }
                  },
                  {
                    // Delete old BelongsToLink
                    Delete: {
                      TableName: "mock-table",
                      Key: {
                        PK: "Customer#789",
                        SK: "ContactInformation"
                      }
                    }
                  },
                  {
                    Put: {
                      TableName: "mock-table",
                      ConditionExpression: "attribute_not_exists(PK)",
                      Item: {
                        PK: "Customer#456",
                        SK: "ContactInformation",
                        Id: "belongsToLinkId1",
                        Type: "BelongsToLink",
                        ForeignEntityType: "ContactInformation",
                        ForeignKey: "123",
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

        it("will throw an error if the entity being updated does not exist", async () => {
          expect.assertions(7);

          mockGet.mockResolvedValueOnce({}); // Entity does not exist but will fail in transaction

          mockSend.mockReturnValueOnce(undefined).mockImplementationOnce(() => {
            mockTransact();
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

          try {
            await ContactInformation.update("123", {
              email: "new-email@example.com",
              customerId: "456"
            });
          } catch (e: any) {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: ContactInformation with ID '123' does not exist"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "GetCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
            expect(mockGet.mock.calls).toEqual([[]]);
            expect(mockedGetCommand.mock.calls).toEqual([
              [
                {
                  TableName: "mock-table",
                  Key: {
                    PK: "ContactInformation#123",
                    SK: "ContactInformation"
                  },
                  ConsistentRead: true
                }
              ]
            ]);
            expect(mockTransact.mock.calls).toEqual([[]]);
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
                          "SET #Email = :Email, #CustomerId = :CustomerId, #UpdatedAt = :UpdatedAt",
                        // Check that the entity being updated exists
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
                    {
                      // Check that the entity being associated with exists
                      ConditionCheck: {
                        TableName: "mock-table",
                        Key: { PK: "Customer#456", SK: "Customer" },
                        ConditionExpression: "attribute_exists(PK)"
                      }
                    },
                    // No Delete transaction because the item does not exist to look up the foreign key to build the delete operation with
                    {
                      Put: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_not_exists(PK)",
                        Item: {
                          PK: "Customer#456",
                          SK: "ContactInformation",
                          Id: "belongsToLinkId1",
                          Type: "BelongsToLink",
                          ForeignEntityType: "ContactInformation",
                          ForeignKey: "123",
                          CreatedAt: "2023-10-16T03:31:35.918Z",
                          UpdatedAt: "2023-10-16T03:31:35.918Z"
                        }
                      }
                    }
                  ]
                }
              ]
            ]);
          }
        });

        it("will throw an error if the associated entity does not exist", async () => {
          expect.assertions(7);

          mockSend.mockReturnValueOnce(undefined).mockImplementationOnce(() => {
            mockTransact();
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

          try {
            await ContactInformation.update("123", {
              email: "new-email@example.com",
              customerId: "456"
            });
          } catch (e: any) {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: Customer with ID '456' does not exist"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "GetCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
            expect(mockGet.mock.calls).toEqual([[]]);
            expect(mockedGetCommand.mock.calls).toEqual([
              [
                {
                  TableName: "mock-table",
                  Key: {
                    PK: "ContactInformation#123",
                    SK: "ContactInformation"
                  },
                  ConsistentRead: true
                }
              ]
            ]);
            expect(mockTransact.mock.calls).toEqual([[]]);
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
                          "SET #Email = :Email, #CustomerId = :CustomerId, #UpdatedAt = :UpdatedAt",
                        // Check that the entity being updated exists
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
                    {
                      // Check that the entity being associated with exists
                      ConditionCheck: {
                        TableName: "mock-table",
                        Key: { PK: "Customer#456", SK: "Customer" },
                        ConditionExpression: "attribute_exists(PK)"
                      }
                    },
                    {
                      // Delete old BelongsToLink
                      Delete: {
                        TableName: "mock-table",
                        Key: {
                          PK: "Customer#789",
                          SK: "ContactInformation"
                        }
                      }
                    },
                    {
                      Put: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_not_exists(PK)",
                        Item: {
                          PK: "Customer#456",
                          SK: "ContactInformation",
                          Id: "belongsToLinkId1",
                          Type: "BelongsToLink",
                          ForeignEntityType: "ContactInformation",
                          ForeignKey: "123",
                          CreatedAt: "2023-10-16T03:31:35.918Z",
                          UpdatedAt: "2023-10-16T03:31:35.918Z"
                        }
                      }
                    }
                  ]
                }
              ]
            ]);
          }
        });

        it("will throw an error if the entity is already associated with the requested entity", async () => {
          expect.assertions(7);

          mockGet.mockResolvedValueOnce({
            Item: {
              PK: "ContactInformation#123",
              SK: "ContactInformation",
              Id: "123",
              Email: "old-email@example.com",
              Phone: "555-555-5555",
              CustomerId: "456" // Already belongs to customer, the same being updated
            }
          });

          mockSend.mockReturnValueOnce(undefined).mockImplementationOnce(() => {
            mockTransact();
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

          try {
            await ContactInformation.update("123", {
              email: "new-email@example.com",
              customerId: "456"
            });
          } catch (e: any) {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: Customer with id: 456 already has an associated ContactInformation"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "GetCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
            expect(mockGet.mock.calls).toEqual([[]]);
            expect(mockedGetCommand.mock.calls).toEqual([
              [
                {
                  TableName: "mock-table",
                  Key: {
                    PK: "ContactInformation#123",
                    SK: "ContactInformation"
                  },
                  ConsistentRead: true
                }
              ]
            ]);
            expect(mockTransact.mock.calls).toEqual([[]]);
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
                          "SET #Email = :Email, #CustomerId = :CustomerId, #UpdatedAt = :UpdatedAt",
                        // Check that the entity being updated exists
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
                    {
                      // Check that the entity being associated with exists
                      ConditionCheck: {
                        TableName: "mock-table",
                        Key: { PK: "Customer#456", SK: "Customer" },
                        ConditionExpression: "attribute_exists(PK)"
                      }
                    },
                    {
                      // Delete old BelongsToLink
                      Delete: {
                        TableName: "mock-table",
                        Key: {
                          PK: "Customer#456",
                          SK: "ContactInformation"
                        }
                      }
                    },
                    {
                      Put: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_not_exists(PK)",
                        Item: {
                          PK: "Customer#456",
                          SK: "ContactInformation",
                          Id: "belongsToLinkId1",
                          Type: "BelongsToLink",
                          ForeignEntityType: "ContactInformation",
                          ForeignKey: "123",
                          CreatedAt: "2023-10-16T03:31:35.918Z",
                          UpdatedAt: "2023-10-16T03:31:35.918Z"
                        }
                      }
                    }
                  ]
                }
              ]
            ]);
          }
        });

        it("will remove a nullable foreign key and delete the BelongsToLinks for the associated entity", async () => {
          expect.assertions(6);

          expect(
            // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
            await ContactInformation.update("123", {
              email: "new-email@example.com",
              customerId: null
            })
          ).toBeUndefined();
          expect(mockSend.mock.calls).toEqual([
            [{ name: "GetCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockGet.mock.calls).toEqual([[]]);
          expect(mockedGetCommand.mock.calls).toEqual([
            [
              {
                TableName: "mock-table",
                Key: { PK: "ContactInformation#123", SK: "ContactInformation" },
                ConsistentRead: true
              }
            ]
          ]);
          expect(mockTransact.mock.calls).toEqual([[]]);
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
                      ExpressionAttributeValues: {
                        ":Email": "new-email@example.com",
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      },
                      ExpressionAttributeNames: {
                        "#Email": "Email",
                        "#UpdatedAt": "UpdatedAt",
                        "#CustomerId": "CustomerId"
                      },
                      UpdateExpression:
                        "SET #Email = :Email, #UpdatedAt = :UpdatedAt REMOVE #CustomerId"
                    }
                  },
                  {
                    Delete: {
                      TableName: "mock-table",
                      Key: { PK: "Customer#789", SK: "ContactInformation" }
                    }
                  }
                ]
              }
            ]
          ]);
        });
      });
    });

    describe("ForeignKey is updated for entity which BelongsTo an entity who HasMany of it", () => {
      describe("when the entity does not already belong to another entity", () => {
        beforeEach(() => {
          jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
          mockedUuidv4.mockReturnValueOnce("belongsToLinkId1");
          mockGet.mockResolvedValue({
            Item: {
              PK: "PaymentMethod#123",
              SK: "PaymentMethod",
              Id: "123",
              lastFour: "1234",
              CustomerId: undefined // Does not already belong to customer
            }
          });
        });

        afterEach(() => {
          mockedUuidv4.mockReset();
        });

        it("will update the foreign key if the entity being associated with exists", async () => {
          expect.assertions(6);

          expect(
            // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
            await PaymentMethod.update("123", {
              lastFour: "5678",
              customerId: "456"
            })
          ).toBeUndefined();
          expect(mockSend.mock.calls).toEqual([
            [{ name: "GetCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockGet.mock.calls).toEqual([[]]);
          expect(mockedGetCommand.mock.calls).toEqual([
            [
              {
                TableName: "mock-table",
                Key: { PK: "PaymentMethod#123", SK: "PaymentMethod" },
                ConsistentRead: true
              }
            ]
          ]);
          expect(mockTransact.mock.calls).toEqual([[]]);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [
              {
                TransactItems: [
                  {
                    Update: {
                      TableName: "mock-table",
                      Key: { PK: "PaymentMethod#123", SK: "PaymentMethod" },
                      UpdateExpression:
                        "SET #LastFour = :LastFour, #CustomerId = :CustomerId, #UpdatedAt = :UpdatedAt",
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#CustomerId": "CustomerId",
                        "#LastFour": "LastFour",
                        "#UpdatedAt": "UpdatedAt"
                      },
                      ExpressionAttributeValues: {
                        ":CustomerId": "456",
                        ":LastFour": "5678",
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      }
                    }
                  },
                  {
                    ConditionCheck: {
                      TableName: "mock-table",
                      Key: { PK: "Customer#456", SK: "Customer" },
                      ConditionExpression: "attribute_exists(PK)"
                    }
                  },
                  {
                    Put: {
                      TableName: "mock-table",
                      ConditionExpression: "attribute_not_exists(PK)",
                      Item: {
                        PK: "Customer#456",
                        SK: "PaymentMethod#123",
                        Id: "belongsToLinkId1",
                        Type: "BelongsToLink",
                        ForeignEntityType: "PaymentMethod",
                        ForeignKey: "123",
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

        it("will throw an error if the entity being updated does not exist", async () => {
          expect.assertions(7);

          mockGet.mockResolvedValueOnce({}); // Entity does not exist but will fail in transaction
          mockSend.mockReturnValueOnce(undefined).mockImplementationOnce(() => {
            mockTransact();
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
            await PaymentMethod.update("123", {
              lastFour: "5678",
              customerId: "456"
            });
          } catch (e: any) {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: PaymentMethod with ID '123' does not exist"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "GetCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
            expect(mockGet.mock.calls).toEqual([[]]);
            expect(mockedGetCommand.mock.calls).toEqual([
              [
                {
                  TableName: "mock-table",
                  Key: { PK: "PaymentMethod#123", SK: "PaymentMethod" },
                  ConsistentRead: true
                }
              ]
            ]);
            expect(mockTransact.mock.calls).toEqual([[]]);
            expect(mockTransactWriteCommand.mock.calls).toEqual([
              [
                {
                  TransactItems: [
                    {
                      Update: {
                        TableName: "mock-table",
                        Key: { PK: "PaymentMethod#123", SK: "PaymentMethod" },
                        UpdateExpression:
                          "SET #LastFour = :LastFour, #CustomerId = :CustomerId, #UpdatedAt = :UpdatedAt",
                        ConditionExpression: "attribute_exists(PK)",
                        ExpressionAttributeNames: {
                          "#CustomerId": "CustomerId",
                          "#LastFour": "LastFour",
                          "#UpdatedAt": "UpdatedAt"
                        },
                        ExpressionAttributeValues: {
                          ":CustomerId": "456",
                          ":LastFour": "5678",
                          ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                        }
                      }
                    },
                    {
                      ConditionCheck: {
                        TableName: "mock-table",
                        Key: { PK: "Customer#456", SK: "Customer" },
                        ConditionExpression: "attribute_exists(PK)"
                      }
                    },
                    {
                      Put: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_not_exists(PK)",
                        Item: {
                          PK: "Customer#456",
                          SK: "PaymentMethod#123",
                          Id: "belongsToLinkId1",
                          Type: "BelongsToLink",
                          ForeignEntityType: "PaymentMethod",
                          ForeignKey: "123",
                          CreatedAt: "2023-10-16T03:31:35.918Z",
                          UpdatedAt: "2023-10-16T03:31:35.918Z"
                        }
                      }
                    }
                  ]
                }
              ]
            ]);
          }
        });

        it("will throw an error if the entity being associated with does not exist", async () => {
          expect.assertions(7);

          mockSend.mockReturnValueOnce(undefined).mockImplementationOnce(() => {
            mockTransact();
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
            await PaymentMethod.update("123", {
              lastFour: "5678",
              customerId: "456"
            });
          } catch (e: any) {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: Customer with ID '456' does not exist"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "GetCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
            expect(mockGet.mock.calls).toEqual([[]]);
            expect(mockedGetCommand.mock.calls).toEqual([
              [
                {
                  TableName: "mock-table",
                  Key: { PK: "PaymentMethod#123", SK: "PaymentMethod" },
                  ConsistentRead: true
                }
              ]
            ]);
            expect(mockTransact.mock.calls).toEqual([[]]);
            expect(mockTransactWriteCommand.mock.calls).toEqual([
              [
                {
                  TransactItems: [
                    {
                      Update: {
                        TableName: "mock-table",
                        Key: { PK: "PaymentMethod#123", SK: "PaymentMethod" },
                        UpdateExpression:
                          "SET #LastFour = :LastFour, #CustomerId = :CustomerId, #UpdatedAt = :UpdatedAt",
                        ConditionExpression: "attribute_exists(PK)",
                        ExpressionAttributeNames: {
                          "#CustomerId": "CustomerId",
                          "#LastFour": "LastFour",
                          "#UpdatedAt": "UpdatedAt"
                        },
                        ExpressionAttributeValues: {
                          ":CustomerId": "456",
                          ":LastFour": "5678",
                          ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                        }
                      }
                    },
                    {
                      ConditionCheck: {
                        TableName: "mock-table",
                        Key: { PK: "Customer#456", SK: "Customer" },
                        ConditionExpression: "attribute_exists(PK)"
                      }
                    },
                    {
                      Put: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_not_exists(PK)",
                        Item: {
                          PK: "Customer#456",
                          SK: "PaymentMethod#123",
                          Id: "belongsToLinkId1",
                          Type: "BelongsToLink",
                          ForeignEntityType: "PaymentMethod",
                          ForeignKey: "123",
                          CreatedAt: "2023-10-16T03:31:35.918Z",
                          UpdatedAt: "2023-10-16T03:31:35.918Z"
                        }
                      }
                    }
                  ]
                }
              ]
            ]);
          }
        });

        it("will remove a nullable foreign key", async () => {
          expect.assertions(6);

          mockGet.mockResolvedValueOnce({
            Item: {
              PK: "Pet#123",
              SK: "Pet",
              Id: "123",
              name: "Fido",
              OwnerId: undefined // Does not already belong an owner
            }
          });

          expect(
            // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
            await Pet.update("123", {
              name: "New Name",
              ownerId: null
            })
          ).toBeUndefined();
          expect(mockSend.mock.calls).toEqual([
            [{ name: "GetCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockGet.mock.calls).toEqual([[]]);
          expect(mockedGetCommand.mock.calls).toEqual([
            [
              {
                TableName: "mock-table",
                Key: { PK: "Pet#123", SK: "Pet" },
                ConsistentRead: true
              }
            ]
          ]);
          expect(mockTransact.mock.calls).toEqual([[]]);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [
              {
                TransactItems: [
                  {
                    Update: {
                      TableName: "mock-table",
                      Key: { PK: "Pet#123", SK: "Pet" },
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
        });
      });

      describe("when the entity belongs to another another entity (Adds delete transaction for existing BelongsToLink)", () => {
        beforeEach(() => {
          jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
          mockedUuidv4.mockReturnValueOnce("belongsToLinkId1");
          mockGet.mockResolvedValue({
            Item: {
              PK: "PaymentMethod#123",
              SK: "PaymentMethod",
              Id: "123",
              lastFour: "1234",
              CustomerId: "789" // Already belongs to customer
            }
          });
        });

        afterEach(() => {
          mockedUuidv4.mockReset();
        });

        it("will update the foreign key if the entity being associated with exists", async () => {
          expect.assertions(6);

          expect(
            // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
            await PaymentMethod.update("123", {
              lastFour: "5678",
              customerId: "456"
            })
          ).toBeUndefined();
          expect(mockSend.mock.calls).toEqual([
            [{ name: "GetCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockGet.mock.calls).toEqual([[]]);
          expect(mockedGetCommand.mock.calls).toEqual([
            [
              {
                TableName: "mock-table",
                Key: { PK: "PaymentMethod#123", SK: "PaymentMethod" },
                ConsistentRead: true
              }
            ]
          ]);
          expect(mockTransact.mock.calls).toEqual([[]]);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [
              {
                TransactItems: [
                  {
                    Update: {
                      TableName: "mock-table",
                      Key: { PK: "PaymentMethod#123", SK: "PaymentMethod" },
                      UpdateExpression:
                        "SET #LastFour = :LastFour, #CustomerId = :CustomerId, #UpdatedAt = :UpdatedAt",
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#CustomerId": "CustomerId",
                        "#LastFour": "LastFour",
                        "#UpdatedAt": "UpdatedAt"
                      },
                      ExpressionAttributeValues: {
                        ":CustomerId": "456",
                        ":LastFour": "5678",
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      }
                    }
                  },
                  {
                    ConditionCheck: {
                      TableName: "mock-table",
                      Key: { PK: "Customer#456", SK: "Customer" },
                      ConditionExpression: "attribute_exists(PK)"
                    }
                  },
                  {
                    // Delete old BelongsToLink
                    Delete: {
                      TableName: "mock-table",
                      Key: {
                        PK: "Customer#789",
                        SK: "PaymentMethod#123"
                      }
                    }
                  },
                  {
                    Put: {
                      TableName: "mock-table",
                      ConditionExpression: "attribute_not_exists(PK)",
                      Item: {
                        PK: "Customer#456",
                        SK: "PaymentMethod#123",
                        Id: "belongsToLinkId1",
                        Type: "BelongsToLink",
                        ForeignEntityType: "PaymentMethod",
                        ForeignKey: "123",
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

        it("will throw an error if the entity being updated does not exist", async () => {
          expect.assertions(7);

          mockGet.mockResolvedValueOnce({}); // Entity does not exist but will fail in transaction

          mockSend.mockReturnValueOnce(undefined).mockImplementationOnce(() => {
            mockTransact();
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

          try {
            await PaymentMethod.update("123", {
              lastFour: "5678",
              customerId: "456"
            });
          } catch (e: any) {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: PaymentMethod with ID '123' does not exist"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "GetCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
            expect(mockGet.mock.calls).toEqual([[]]);
            expect(mockedGetCommand.mock.calls).toEqual([
              [
                {
                  TableName: "mock-table",
                  Key: { PK: "PaymentMethod#123", SK: "PaymentMethod" },
                  ConsistentRead: true
                }
              ]
            ]);
            expect(mockTransact.mock.calls).toEqual([[]]);
            expect(mockTransactWriteCommand.mock.calls).toEqual([
              [
                {
                  TransactItems: [
                    {
                      Update: {
                        TableName: "mock-table",
                        Key: { PK: "PaymentMethod#123", SK: "PaymentMethod" },
                        UpdateExpression:
                          "SET #LastFour = :LastFour, #CustomerId = :CustomerId, #UpdatedAt = :UpdatedAt",
                        ConditionExpression: "attribute_exists(PK)",
                        ExpressionAttributeNames: {
                          "#CustomerId": "CustomerId",
                          "#LastFour": "LastFour",
                          "#UpdatedAt": "UpdatedAt"
                        },
                        ExpressionAttributeValues: {
                          ":CustomerId": "456",
                          ":LastFour": "5678",
                          ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                        }
                      }
                    },
                    {
                      ConditionCheck: {
                        TableName: "mock-table",
                        Key: { PK: "Customer#456", SK: "Customer" },
                        ConditionExpression: "attribute_exists(PK)"
                      }
                    },
                    // No Delete transaction because the item does not exist to look up the foreign key to build the delete operation with
                    {
                      Put: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_not_exists(PK)",
                        Item: {
                          PK: "Customer#456",
                          SK: "PaymentMethod#123",
                          Id: "belongsToLinkId1",
                          Type: "BelongsToLink",
                          ForeignEntityType: "PaymentMethod",
                          ForeignKey: "123",
                          CreatedAt: "2023-10-16T03:31:35.918Z",
                          UpdatedAt: "2023-10-16T03:31:35.918Z"
                        }
                      }
                    }
                  ]
                }
              ]
            ]);
          }
        });

        it("will throw an error if the entity being associated with does not exist", async () => {
          expect.assertions(7);

          mockSend.mockReturnValueOnce(undefined).mockImplementationOnce(() => {
            mockTransact();
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

          try {
            await PaymentMethod.update("123", {
              lastFour: "5678",
              customerId: "456"
            });
          } catch (e: any) {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: Customer with ID '456' does not exist"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "GetCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
            expect(mockGet.mock.calls).toEqual([[]]);
            expect(mockedGetCommand.mock.calls).toEqual([
              [
                {
                  TableName: "mock-table",
                  Key: { PK: "PaymentMethod#123", SK: "PaymentMethod" },
                  ConsistentRead: true
                }
              ]
            ]);
            expect(mockTransact.mock.calls).toEqual([[]]);
            expect(mockTransactWriteCommand.mock.calls).toEqual([
              [
                {
                  TransactItems: [
                    {
                      Update: {
                        TableName: "mock-table",
                        Key: { PK: "PaymentMethod#123", SK: "PaymentMethod" },
                        UpdateExpression:
                          "SET #LastFour = :LastFour, #CustomerId = :CustomerId, #UpdatedAt = :UpdatedAt",
                        ConditionExpression: "attribute_exists(PK)",
                        ExpressionAttributeNames: {
                          "#CustomerId": "CustomerId",
                          "#LastFour": "LastFour",
                          "#UpdatedAt": "UpdatedAt"
                        },
                        ExpressionAttributeValues: {
                          ":CustomerId": "456",
                          ":LastFour": "5678",
                          ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                        }
                      }
                    },
                    {
                      ConditionCheck: {
                        TableName: "mock-table",
                        Key: { PK: "Customer#456", SK: "Customer" },
                        ConditionExpression: "attribute_exists(PK)"
                      }
                    },
                    {
                      // Delete old BelongsToLink
                      Delete: {
                        TableName: "mock-table",
                        Key: {
                          PK: "Customer#789",
                          SK: "PaymentMethod#123"
                        }
                      }
                    },
                    {
                      Put: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_not_exists(PK)",
                        Item: {
                          PK: "Customer#456",
                          SK: "PaymentMethod#123",
                          Id: "belongsToLinkId1",
                          Type: "BelongsToLink",
                          ForeignEntityType: "PaymentMethod",
                          ForeignKey: "123",
                          CreatedAt: "2023-10-16T03:31:35.918Z",
                          UpdatedAt: "2023-10-16T03:31:35.918Z"
                        }
                      }
                    }
                  ]
                }
              ]
            ]);
          }
        });

        it("will throw an error if the entity is already associated with the requested entity", async () => {
          expect.assertions(7);

          mockGet.mockResolvedValueOnce({
            Item: {
              PK: "PaymentMethod#123",
              SK: "PaymentMethod",
              Id: "123",
              lastFour: "1234",
              CustomerId: "456" // Already belongs to customer, the same being updated
            }
          });

          mockSend.mockReturnValueOnce(undefined).mockImplementationOnce(() => {
            mockTransact();
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

          try {
            await PaymentMethod.update("123", {
              lastFour: "5678",
              customerId: "456"
            });
          } catch (e: any) {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: PaymentMethod with ID '123' already belongs to Customer with Id '456'"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "GetCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
            expect(mockGet.mock.calls).toEqual([[]]);
            expect(mockedGetCommand.mock.calls).toEqual([
              [
                {
                  TableName: "mock-table",
                  Key: { PK: "PaymentMethod#123", SK: "PaymentMethod" },
                  ConsistentRead: true
                }
              ]
            ]);
            expect(mockTransact.mock.calls).toEqual([[]]);
            expect(mockTransactWriteCommand.mock.calls).toEqual([
              [
                {
                  TransactItems: [
                    {
                      Update: {
                        TableName: "mock-table",
                        Key: { PK: "PaymentMethod#123", SK: "PaymentMethod" },
                        UpdateExpression:
                          "SET #LastFour = :LastFour, #CustomerId = :CustomerId, #UpdatedAt = :UpdatedAt",
                        ConditionExpression: "attribute_exists(PK)",
                        ExpressionAttributeNames: {
                          "#CustomerId": "CustomerId",
                          "#LastFour": "LastFour",
                          "#UpdatedAt": "UpdatedAt"
                        },
                        ExpressionAttributeValues: {
                          ":CustomerId": "456",
                          ":LastFour": "5678",
                          ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                        }
                      }
                    },
                    {
                      ConditionCheck: {
                        TableName: "mock-table",
                        Key: { PK: "Customer#456", SK: "Customer" },
                        ConditionExpression: "attribute_exists(PK)"
                      }
                    },
                    {
                      // Delete old BelongsToLink
                      Delete: {
                        TableName: "mock-table",
                        Key: {
                          PK: "Customer#456",
                          SK: "PaymentMethod#123"
                        }
                      }
                    },
                    {
                      Put: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_not_exists(PK)",
                        Item: {
                          PK: "Customer#456",
                          SK: "PaymentMethod#123",
                          Id: "belongsToLinkId1",
                          Type: "BelongsToLink",
                          ForeignEntityType: "PaymentMethod",
                          ForeignKey: "123",
                          CreatedAt: "2023-10-16T03:31:35.918Z",
                          UpdatedAt: "2023-10-16T03:31:35.918Z"
                        }
                      }
                    }
                  ]
                }
              ]
            ]);
          }
        });

        it("will remove a nullable foreign key and delete the associated BelongsToLinks", async () => {
          expect.assertions(6);

          mockGet.mockResolvedValueOnce({
            Item: {
              PK: "Pet#123",
              SK: "Pet",
              Id: "123",
              name: "Fido",
              OwnerId: "456" // Does not already belong an owner
            }
          });

          expect(
            // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
            await Pet.update("123", {
              name: "New Name",
              ownerId: null
            })
          ).toBeUndefined();
          expect(mockSend.mock.calls).toEqual([
            [{ name: "GetCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockGet.mock.calls).toEqual([[]]);
          expect(mockedGetCommand.mock.calls).toEqual([
            [
              {
                TableName: "mock-table",
                Key: { PK: "Pet#123", SK: "Pet" },
                ConsistentRead: true
              }
            ]
          ]);
          expect(mockTransact.mock.calls).toEqual([[]]);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [
              {
                TransactItems: [
                  {
                    Update: {
                      TableName: "mock-table",
                      Key: { PK: "Pet#123", SK: "Pet" },
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
                  },
                  {
                    Delete: {
                      TableName: "mock-table",
                      Key: { PK: "Person#456", SK: "Pet#123" }
                    }
                  }
                ]
              }
            ]
          ]);
        });
      });
    });

    describe("A model is updating multiple ForeignKeys of different relationship types", () => {
      @Entity
      class Model1 extends MockTable {
        @HasOne(() => Model3, { foreignKey: "model1Id" })
        public model3: Model3;
      }

      @Entity
      class Model2 extends MockTable {
        @HasMany(() => Model3, { foreignKey: "model2Id" })
        public model3: Model3[];
      }

      @Entity
      class Model3 extends MockTable {
        @StringAttribute({ alias: "Name" })
        public name: string;

        @ForeignKeyAttribute({ alias: "Model1Id" })
        public model1Id: ForeignKey;

        @ForeignKeyAttribute({ alias: "Model2Id" })
        public model2Id: ForeignKey;

        @BelongsTo(() => Model1, { foreignKey: "model1Id" })
        public model1: Model1;

        @BelongsTo(() => Model2, { foreignKey: "model2Id" })
        public model2: Model2;
      }

      beforeEach(() => {
        jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
        mockedUuidv4
          .mockReturnValueOnce("belongsToLinkId1")
          .mockReturnValueOnce("belongsToLinkId2");
      });

      it("can update foreign keys for an entity that includes both HasMany and Belongs to relationships", async () => {
        expect.assertions(6);

        mockGet.mockResolvedValue({
          Item: {
            PK: "Model3#123",
            SK: "Model3",
            Id: "123",
            Name: "originalName",
            Phone: "555-555-5555",
            Model1Id: undefined,
            Model2Id: undefined
          }
        });

        expect(
          // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
          await Model3.update("123", {
            name: "newName",
            model1Id: "model1-ID",
            model2Id: "model2-ID"
          })
        ).toBeUndefined();
        expect(mockSend.mock.calls).toEqual([
          [{ name: "GetCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockGet.mock.calls).toEqual([[]]);
        expect(mockedGetCommand.mock.calls).toEqual([
          [
            {
              TableName: "mock-table",
              Key: { PK: "Model3#123", SK: "Model3" },
              ConsistentRead: true
            }
          ]
        ]);
        expect(mockTransact.mock.calls).toEqual([[]]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                {
                  Update: {
                    TableName: "mock-table",
                    Key: { PK: "Model3#123", SK: "Model3" },
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
                      ":Model1Id": "model1-ID",
                      ":Model2Id": "model2-ID",
                      ":Name": "newName",
                      ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                    }
                  }
                },
                {
                  ConditionCheck: {
                    TableName: "mock-table",
                    Key: { PK: "Model1#model1-ID", SK: "Model1" },
                    ConditionExpression: "attribute_exists(PK)"
                  }
                },
                {
                  Put: {
                    TableName: "mock-table",
                    ConditionExpression: "attribute_not_exists(PK)",
                    Item: {
                      PK: "Model1#model1-ID",
                      SK: "Model3",
                      Id: "belongsToLinkId1",
                      Type: "BelongsToLink",
                      ForeignEntityType: "Model3",
                      ForeignKey: "123",
                      CreatedAt: "2023-10-16T03:31:35.918Z",
                      UpdatedAt: "2023-10-16T03:31:35.918Z"
                    }
                  }
                },
                {
                  ConditionCheck: {
                    TableName: "mock-table",
                    Key: { PK: "Model2#model2-ID", SK: "Model2" },
                    ConditionExpression: "attribute_exists(PK)"
                  }
                },
                {
                  Put: {
                    TableName: "mock-table",
                    ConditionExpression: "attribute_not_exists(PK)",
                    Item: {
                      PK: "Model2#model2-ID",
                      SK: "Model3#123",
                      Id: "belongsToLinkId2",
                      Type: "BelongsToLink",
                      ForeignEntityType: "Model3",
                      ForeignKey: "123",
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

      it("alternate table (different alias/keys) - can update foreign keys for an entity that includes both HasMany and Belongs to relationships", async () => {
        expect.assertions(6);

        mockGet.mockResolvedValueOnce({
          Item: {
            myPk: "Grade|123",
            mySk: "Grade",
            id: "123",
            type: "Grade",
            gradeValue: "A+",
            assignmentId: "456",
            studentId: "789",
            createdAt: "2023-10-16T03:31:35.918Z",
            updatedAt: "2023-10-16T03:31:35.918Z"
          }
        });

        expect(
          // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
          await Grade.update("123", {
            gradeValue: "B",
            assignmentId: "111",
            studentId: "222"
          })
        ).toBeUndefined();
        expect(mockSend.mock.calls).toEqual([
          [{ name: "GetCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockGet.mock.calls).toEqual([[]]);
        expect(mockedGetCommand.mock.calls).toEqual([
          [
            {
              TableName: "other-table",
              Key: { myPk: "Grade|123", mySk: "Grade" },
              ConsistentRead: true
            }
          ]
        ]);
        expect(mockTransact.mock.calls).toEqual([[]]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                {
                  Update: {
                    TableName: "other-table",
                    Key: { myPk: "Grade|123", mySk: "Grade" },
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
                      ":assignmentId": "111",
                      ":studentId": "222",
                      ":updatedAt": "2023-10-16T03:31:35.918Z"
                    }
                  }
                },
                {
                  ConditionCheck: {
                    TableName: "other-table",
                    Key: { myPk: "Assignment|111", mySk: "Assignment" },
                    ConditionExpression: "attribute_exists(myPk)"
                  }
                },
                {
                  Delete: {
                    TableName: "other-table",
                    Key: { myPk: "Assignment|456", mySk: "Grade" }
                  }
                },
                {
                  Put: {
                    TableName: "other-table",
                    ConditionExpression: "attribute_not_exists(myPk)",
                    Item: {
                      myPk: "Assignment|111",
                      mySk: "Grade",
                      id: "belongsToLinkId1",
                      type: "BelongsToLink",
                      foreignKey: "123",
                      foreignEntityType: "Grade",
                      createdAt: "2023-10-16T03:31:35.918Z",
                      updatedAt: "2023-10-16T03:31:35.918Z"
                    }
                  }
                },
                {
                  ConditionCheck: {
                    TableName: "other-table",
                    Key: { myPk: "Student|222", mySk: "Student" },
                    ConditionExpression: "attribute_exists(myPk)"
                  }
                },
                {
                  Delete: {
                    TableName: "other-table",
                    Key: { myPk: "Student|789", mySk: "Grade|123" }
                  }
                },
                {
                  Put: {
                    TableName: "other-table",
                    ConditionExpression: "attribute_not_exists(myPk)",
                    Item: {
                      myPk: "Student|222",
                      mySk: "Grade|123",
                      id: "belongsToLinkId2",
                      type: "BelongsToLink",
                      foreignKey: "123",
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
    });

    describe("types", () => {
      it("will not accept relationship attributes on update", async () => {
        await Order.update("123", {
          orderDate: new Date(),
          paymentMethodId: "123",
          customerId: "456",
          // @ts-expect-error relationship attributes are not allowed
          customer: new Customer()
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
        });
      });

      it("will not accept DefaultFields on update because they are managed by dyna-record", async () => {
        await Order.update("123", {
          // @ts-expect-error default fields are not accepted on update, they are managed by dyna-record
          id: "123"
        });

        await Order.update("123", {
          // @ts-expect-error default fields are not accepted on update, they are managed by dyna-record
          type: "456"
        });

        await Order.update("123", {
          // @ts-expect-error default fields are not accepted on update, they are managed by dyna-record
          createdAt: new Date()
        });

        await Order.update("123", {
          // @ts-expect-error default fields are not accepted on update, they are managed by dyna-record
          updatedAt: new Date()
        });
      });

      it("will not accept partition and sort keys on update because they are managed by dyna-record", async () => {
        await Order.update("123", {
          // @ts-expect-error primary key fields are not accepted on update, they are managed by dyna-record
          pk: "123"
        });

        await Order.update("123", {
          // @ts-expect-error sort key fields are not accepted on update, they are managed by dyna-record
          sk: "456"
        });
      });

      it("does not require all of an entity attributes to be passed", async () => {
        await Order.update("123", {
          // @ts-expect-no-error ForeignKey is of type string so it can be passed as such without casing to ForeignKey
          paymentMethodId: "123",
          // @ts-expect-no-error ForeignKey is of type string so it can be passed as such without casing to ForeignKey
          customerId: "456"
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
  });

  describe("instance method", () => {
    it("will update an entity without foreign key attributes", async () => {
      expect.assertions(8);

      const now = new Date("2023-10-16T03:31:35.918Z");
      jest.setSystemTime(now);

      const instance = createInstance(Customer, {
        pk: "test-pk" as PartitionKey,
        sk: "test-sk" as SortKey,
        id: "123",
        name: "test-name",
        address: "test-address",
        type: "Customer",
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });

      const updatedInstance = await instance.update({ name: "newName" });

      expect(updatedInstance).toEqual({
        pk: "test-pk",
        sk: "test-sk",
        id: "123",
        name: "newName", // Updated name
        type: "Customer",
        address: "test-address",
        createdAt: new Date("2023-10-01"),
        updatedAt: now // Updated at gets updated
      });
      expect(updatedInstance).toBeInstanceOf(Customer);
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockGet.mock.calls).toEqual([]);
      expect(mockedGetCommand.mock.calls).toEqual([]);
      expect(mockTransact.mock.calls).toEqual([[]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  TableName: "mock-table",
                  Key: { PK: "Customer#123", SK: "Customer" },
                  UpdateExpression:
                    "SET #Name = :Name, #UpdatedAt = :UpdatedAt",
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#Name": "Name",
                    "#UpdatedAt": "UpdatedAt"
                  },
                  ExpressionAttributeValues: {
                    ":Name": "newName",
                    ":UpdatedAt": now.toISOString()
                  }
                }
              }
            ]
          }
        ]
      ]);
      // Original instance is not mutated
      expect(instance).toEqual({
        pk: "test-pk",
        sk: "test-sk",
        id: "123",
        name: "test-name",
        type: "Customer",
        address: "test-address",
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });
    });

    it("has runtime schema validation to ensure that reserved keys are not set on update. They will be omitted from update", async () => {
      expect.assertions(8);

      const now = new Date("2023-10-16T03:31:35.918Z");
      jest.setSystemTime(now);

      const instance = createInstance(Customer, {
        pk: "test-pk" as PartitionKey,
        sk: "test-sk" as SortKey,
        id: "123",
        name: "test-name",
        address: "test-address",
        type: "Customer",
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
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
        name: "newName"
      } as any); // Use any to force bad type and allow runtime checks to be tested

      expect(updatedInstance).toEqual({
        pk: "test-pk",
        sk: "test-sk",
        id: "123",
        name: "newName", // Updated name
        type: "Customer",
        address: "test-address",
        createdAt: new Date("2023-10-01"),
        updatedAt: now // Updated at gets updated
      });
      expect(updatedInstance).toBeInstanceOf(Customer);
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockGet.mock.calls).toEqual([]);
      expect(mockedGetCommand.mock.calls).toEqual([]);
      expect(mockTransact.mock.calls).toEqual([[]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  TableName: "mock-table",
                  Key: { PK: "Customer#123", SK: "Customer" },
                  UpdateExpression:
                    "SET #Name = :Name, #UpdatedAt = :UpdatedAt",
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#Name": "Name",
                    "#UpdatedAt": "UpdatedAt"
                  },
                  ExpressionAttributeValues: {
                    ":Name": "newName",
                    ":UpdatedAt": now.toISOString()
                  }
                }
              }
            ]
          }
        ]
      ]);
      // Original instance is not mutated
      expect(instance).toEqual({
        pk: "test-pk",
        sk: "test-sk",
        id: "123",
        name: "test-name",
        type: "Customer",
        address: "test-address",
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });
    });

    it("can update all attribute types", async () => {
      expect.assertions(8);

      const now = new Date("2023-10-16T03:31:35.918Z");
      jest.setSystemTime(now);

      const instance = createInstance(MyClassWithAllAttributeTypes, {
        pk: "test-pk" as PartitionKey,
        sk: "test-sk" as SortKey,
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

      const updatedInstance = await instance.update({
        stringAttribute: "new-1",
        nullableStringAttribute: "new-2",
        dateAttribute: new Date(),
        nullableDateAttribute: new Date(),
        foreignKeyAttribute: "new-1111",
        nullableForeignKeyAttribute: "22222",
        boolAttribute: true,
        nullableBoolAttribute: false,
        numberAttribute: 9,
        nullableNumberAttribute: 10,
        enumAttribute: "val-1",
        nullableEnumAttribute: "val-2"
      });

      expect(updatedInstance).toEqual({
        pk: "test-pk",
        sk: "test-sk",
        id: "123",
        type: "MyClassWithAllAttributeTypes",
        stringAttribute: "new-1",
        nullableStringAttribute: "new-2",
        dateAttribute: new Date(),
        nullableDateAttribute: new Date(),
        foreignKeyAttribute: "new-1111",
        nullableForeignKeyAttribute: "22222",
        numberAttribute: 9,
        nullableNumberAttribute: 10,
        boolAttribute: true,
        nullableBoolAttribute: false,
        enumAttribute: "val-1",
        nullableEnumAttribute: "val-2",
        createdAt: new Date("2023-10-01"),
        updatedAt: now
      });
      expect(updatedInstance).toBeInstanceOf(MyClassWithAllAttributeTypes);
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockGet.mock.calls).toEqual([]);
      expect(mockedGetCommand.mock.calls).toEqual([]);
      expect(mockTransact.mock.calls).toEqual([[]]);
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
                    ":foreignKeyAttribute": "new-1111",
                    ":nullableBoolAttribute": false,
                    ":nullableDateAttribute": "2023-10-16T03:31:35.918Z",
                    ":nullableEnumAttribute": "val-2",
                    ":nullableForeignKeyAttribute": "22222",
                    ":nullableNumberAttribute": 10,
                    ":nullableStringAttribute": "new-2",
                    ":numberAttribute": 9,
                    ":stringAttribute": "new-1"
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
      // Assert original instance is not mutated
      expect(instance).toEqual({
        pk: "test-pk",
        sk: "test-sk",
        id: "123",
        type: "MyClassWithAllAttributeTypes",
        stringAttribute: "1",
        dateAttribute: new Date(),
        foreignKeyAttribute: "11111",
        boolAttribute: true,
        numberAttribute: 9,
        enumAttribute: "val-2",
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });
    });

    it("will update an entity and remove attributes", async () => {
      expect.assertions(8);

      const now = new Date("2023-10-16T03:31:35.918Z");
      jest.setSystemTime(now);

      const instance = createInstance(ContactInformation, {
        pk: "test-pk" as PartitionKey,
        sk: "test-sk" as SortKey,
        id: "123",
        email: "example@example.com",
        phone: "555-555-5555",
        type: "ContactInformation",
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });

      const updatedInstance = await instance.update({
        email: "new@example.com",
        phone: null
      });

      expect(updatedInstance).toEqual({
        pk: "test-pk",
        sk: "test-sk",
        id: "123",
        email: "new@example.com",
        phone: undefined,
        type: "ContactInformation",
        createdAt: new Date("2023-10-01"),
        updatedAt: now
      });
      expect(updatedInstance).toBeInstanceOf(ContactInformation);
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockGet.mock.calls).toEqual([]);
      expect(mockedGetCommand.mock.calls).toEqual([]);
      expect(mockTransact.mock.calls).toEqual([[]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#Email": "Email",
                    "#Phone": "Phone",
                    "#UpdatedAt": "UpdatedAt"
                  },
                  ExpressionAttributeValues: {
                    ":Email": "new@example.com",
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                  },
                  Key: {
                    PK: "ContactInformation#123",
                    SK: "ContactInformation"
                  },
                  TableName: "mock-table",
                  UpdateExpression:
                    "SET #Email = :Email, #UpdatedAt = :UpdatedAt REMOVE #Phone"
                }
              }
            ]
          }
        ]
      ]);
      // Original instance is not mutated
      expect(instance).toEqual({
        pk: "test-pk",
        sk: "test-sk",
        id: "123",
        email: "example@example.com",
        phone: "555-555-5555",
        type: "ContactInformation",
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });
    });

    it("will update and remove multiple attributes", async () => {
      expect.assertions(8);

      const now = new Date("2023-10-16T03:31:35.918Z");
      jest.setSystemTime(now);

      const instance = createInstance(MockInformation, {
        pk: "test-pk" as PartitionKey,
        sk: "test-sk" as SortKey,
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
        address: "111 Some St",
        email: "new@example.com",
        state: null,
        phone: null
      });

      expect(updatedInstance).toEqual({
        pk: "test-pk",
        sk: "test-sk",
        id: "123",
        type: "MockInformation",
        address: "111 Some St",
        email: "new@example.com",
        state: undefined,
        phone: undefined,
        createdAt: new Date("2023-10-01"),
        updatedAt: now
      });
      expect(updatedInstance).toBeInstanceOf(MockInformation);
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockGet.mock.calls).toEqual([]);
      expect(mockedGetCommand.mock.calls).toEqual([]);
      expect(mockTransact.mock.calls).toEqual([[]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#Address": "Address",
                    "#Email": "Email",
                    "#Phone": "Phone",
                    "#State": "State",
                    "#UpdatedAt": "UpdatedAt"
                  },
                  ExpressionAttributeValues: {
                    ":Address": "111 Some St",
                    ":Email": "new@example.com",
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                  },
                  Key: { PK: "MockInformation#123", SK: "MockInformation" },
                  TableName: "mock-table",
                  UpdateExpression:
                    "SET #Address = :Address, #Email = :Email, #UpdatedAt = :UpdatedAt REMOVE #Phone, #State"
                }
              }
            ]
          }
        ]
      ]);
      // Original instance is not mutated
      expect(instance).toEqual({
        pk: "test-pk",
        sk: "test-sk",
        id: "123",
        type: "MockInformation",
        address: "9 Example Ave",
        email: "example@example.com",
        state: "SomeState",
        phone: "555-555-5555",
        createdAt: new Date("2023-10-01"),
        updatedAt: new Date("2023-10-02")
      });
    });

    it("will error if any attributes are the wrong type", async () => {
      expect.assertions(5);

      const instance = createInstance(MyClassWithAllAttributeTypes, {
        pk: "test-pk" as PartitionKey,
        sk: "test-sk" as SortKey,
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
        expect(mockSend.mock.calls).toEqual([undefined]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([]);
      }
    });

    it("will allow nullable attributes to be set to null", async () => {
      expect.assertions(8);

      const now = new Date("2023-10-16T03:31:35.918Z");
      jest.setSystemTime(now);

      const instance = createInstance(MockInformation, {
        pk: "test-pk" as PartitionKey,
        sk: "test-sk" as SortKey,
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
        pk: "test-pk" as PartitionKey,
        sk: "test-sk" as SortKey,
        id: "123",
        type: "MockInformation",
        address: "9 Example Ave",
        email: "example@example.com",
        someDate: undefined,
        state: "SomeState",
        phone: "555-555-5555",
        createdAt: new Date("2023-10-01"),
        updatedAt: now
      });
      expect(updatedInstance).toBeInstanceOf(MockInformation);
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockGet.mock.calls).toEqual([]);
      expect(mockedGetCommand.mock.calls).toEqual([]);
      expect(mockTransact.mock.calls).toEqual([[]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#UpdatedAt": "UpdatedAt",
                    "#someDate": "someDate"
                  },
                  ExpressionAttributeValues: {
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                    ":someDate": undefined
                  },
                  Key: { PK: "MockInformation#123", SK: "MockInformation" },
                  TableName: "mock-table",
                  UpdateExpression:
                    "SET #someDate = :someDate, #UpdatedAt = :UpdatedAt"
                }
              }
            ]
          }
        ]
      ]);
      // Original instance is not mutated
      expect(instance).toEqual({
        pk: "test-pk",
        sk: "test-sk",
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
    });

    it("will not allow non nullable attributes to be null", async () => {
      expect.assertions(5);

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
        expect(mockSend.mock.calls).toEqual([undefined]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([]);
      }
    });

    it("will allow nullable attributes to be set to null", async () => {
      expect.assertions(8);

      const now = new Date("2023-10-16T03:31:35.918Z");
      jest.setSystemTime(now);

      const instance = createInstance(MockInformation, {
        pk: "test-pk" as PartitionKey,
        sk: "test-sk" as SortKey,
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
        pk: "test-pk" as PartitionKey,
        sk: "test-sk" as SortKey,
        id: "123",
        type: "MockInformation",
        address: "9 Example Ave",
        email: "example@example.com",
        someDate: undefined,
        state: "SomeState",
        phone: "555-555-5555",
        createdAt: new Date("2023-10-01"),
        updatedAt: now
      });
      expect(updatedInstance).toBeInstanceOf(MockInformation);
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockGet.mock.calls).toEqual([]);
      expect(mockedGetCommand.mock.calls).toEqual([]);
      expect(mockTransact.mock.calls).toEqual([[]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#UpdatedAt": "UpdatedAt",
                    "#someDate": "someDate"
                  },
                  ExpressionAttributeValues: {
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z",
                    ":someDate": undefined
                  },
                  Key: { PK: "MockInformation#123", SK: "MockInformation" },
                  TableName: "mock-table",
                  UpdateExpression:
                    "SET #someDate = :someDate, #UpdatedAt = :UpdatedAt"
                }
              }
            ]
          }
        ]
      ]);
      // Original instance is not mutated
      expect(instance).toEqual({
        pk: "test-pk",
        sk: "test-sk",
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
    });

    describe("ForeignKey is updated for entity which BelongsTo an entity who HasOne of it", () => {
      describe("when the entity does not already belong to another entity", () => {
        const now = new Date("2023-10-16T03:31:35.918Z");

        beforeEach(() => {
          jest.setSystemTime(now);
          mockedUuidv4.mockReturnValueOnce("belongsToLinkId1");
          mockGet.mockResolvedValue({
            Item: {
              PK: "ContactInformation#123",
              SK: "ContactInformation",
              Id: "123",
              Email: "old-email@example.com",
              Phone: "555-555-5555",
              CustomerId: undefined // Does not already belong to customer
            }
          });
        });

        afterEach(() => {
          mockedUuidv4.mockReset();
        });

        it("will update the foreign key if the entity being associated with exists", async () => {
          expect.assertions(8);

          const instance = createInstance(ContactInformation, {
            pk: "test-pk" as PartitionKey,
            sk: "test-sk" as SortKey,
            id: "123",
            email: "example@example.com",
            phone: "555-555-5555",
            type: "ContactInformation",
            createdAt: new Date("2023-10-01"),
            updatedAt: new Date("2023-10-02")
          });

          const updatedInstance = await instance.update({
            email: "new-email@example.com",
            customerId: "456"
          });

          expect(updatedInstance).toEqual({
            pk: "test-pk",
            sk: "test-sk",
            id: "123",
            email: "new-email@example.com",
            customerId: "456",
            phone: "555-555-5555",
            type: "ContactInformation",
            createdAt: new Date("2023-10-01"),
            updatedAt: now
          });
          expect(updatedInstance).toBeInstanceOf(ContactInformation);
          expect(mockSend.mock.calls).toEqual([
            [{ name: "GetCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockGet.mock.calls).toEqual([[]]);
          expect(mockedGetCommand.mock.calls).toEqual([
            [
              {
                TableName: "mock-table",
                Key: { PK: "ContactInformation#123", SK: "ContactInformation" },
                ConsistentRead: true
              }
            ]
          ]);
          expect(mockTransact.mock.calls).toEqual([[]]);
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
                        "SET #Email = :Email, #CustomerId = :CustomerId, #UpdatedAt = :UpdatedAt",
                      // Check that the entity being updated exists
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
                  {
                    // Check that the entity being associated with exists
                    ConditionCheck: {
                      TableName: "mock-table",
                      Key: { PK: "Customer#456", SK: "Customer" },
                      ConditionExpression: "attribute_exists(PK)"
                    }
                  },
                  {
                    Put: {
                      TableName: "mock-table",
                      ConditionExpression: "attribute_not_exists(PK)",
                      Item: {
                        PK: "Customer#456",
                        SK: "ContactInformation",
                        Id: "belongsToLinkId1",
                        Type: "BelongsToLink",
                        ForeignEntityType: "ContactInformation",
                        ForeignKey: "123",
                        CreatedAt: "2023-10-16T03:31:35.918Z",
                        UpdatedAt: "2023-10-16T03:31:35.918Z"
                      }
                    }
                  }
                ]
              }
            ]
          ]);
          // Original instance is not mutated
          expect(instance).toEqual({
            pk: "test-pk",
            sk: "test-sk",
            id: "123",
            email: "example@example.com",
            phone: "555-555-5555",
            type: "ContactInformation",
            createdAt: new Date("2023-10-01"),
            updatedAt: new Date("2023-10-02")
          });
        });

        it("will throw an error if the entity being updated does not exist", async () => {
          expect.assertions(7);

          const instance = createInstance(ContactInformation, {
            pk: "test-pk" as PartitionKey,
            sk: "test-sk" as SortKey,
            id: "123",
            email: "example@example.com",
            phone: "555-555-5555",
            type: "ContactInformation",
            createdAt: new Date("2023-10-01"),
            updatedAt: new Date("2023-10-02")
          });

          mockGet.mockResolvedValueOnce({}); // Entity does not exist but will fail in transaction

          mockSend.mockReturnValueOnce(undefined).mockImplementationOnce(() => {
            mockTransact();
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
            await instance.update({
              email: "new-email@example.com",
              customerId: "456"
            });
          } catch (e: any) {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: ContactInformation with ID '123' does not exist"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "GetCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
            expect(mockGet.mock.calls).toEqual([[]]);
            expect(mockedGetCommand.mock.calls).toEqual([
              [
                {
                  TableName: "mock-table",
                  Key: {
                    PK: "ContactInformation#123",
                    SK: "ContactInformation"
                  },
                  ConsistentRead: true
                }
              ]
            ]);
            expect(mockTransact.mock.calls).toEqual([[]]);
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
                          "SET #Email = :Email, #CustomerId = :CustomerId, #UpdatedAt = :UpdatedAt",
                        // Check that the entity being updated exists
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
                    {
                      // Check that the entity being associated with exists
                      ConditionCheck: {
                        TableName: "mock-table",
                        Key: { PK: "Customer#456", SK: "Customer" },
                        ConditionExpression: "attribute_exists(PK)"
                      }
                    },
                    {
                      Put: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_not_exists(PK)",
                        Item: {
                          PK: "Customer#456",
                          SK: "ContactInformation",
                          Id: "belongsToLinkId1",
                          Type: "BelongsToLink",
                          ForeignEntityType: "ContactInformation",
                          ForeignKey: "123",
                          CreatedAt: "2023-10-16T03:31:35.918Z",
                          UpdatedAt: "2023-10-16T03:31:35.918Z"
                        }
                      }
                    }
                  ]
                }
              ]
            ]);
          }
        });

        it("will throw an error if the entity being associated with does not exist", async () => {
          expect.assertions(7);

          const instance = createInstance(ContactInformation, {
            pk: "test-pk" as PartitionKey,
            sk: "test-sk" as SortKey,
            id: "123",
            email: "example@example.com",
            phone: "555-555-5555",
            type: "ContactInformation",
            createdAt: new Date("2023-10-01"),
            updatedAt: new Date("2023-10-02")
          });

          mockSend.mockReturnValueOnce(undefined).mockImplementationOnce(() => {
            mockTransact();
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
            await instance.update({
              email: "new-email@example.com",
              customerId: "456"
            });
          } catch (e: any) {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: Customer with ID '456' does not exist"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "GetCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
            expect(mockGet.mock.calls).toEqual([[]]);
            expect(mockedGetCommand.mock.calls).toEqual([
              [
                {
                  TableName: "mock-table",
                  Key: {
                    PK: "ContactInformation#123",
                    SK: "ContactInformation"
                  },
                  ConsistentRead: true
                }
              ]
            ]);
            expect(mockTransact.mock.calls).toEqual([[]]);
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
                          "SET #Email = :Email, #CustomerId = :CustomerId, #UpdatedAt = :UpdatedAt",
                        // Check that the entity being updated exists
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
                    {
                      // Check that the entity being associated with exists
                      ConditionCheck: {
                        TableName: "mock-table",
                        Key: { PK: "Customer#456", SK: "Customer" },
                        ConditionExpression: "attribute_exists(PK)"
                      }
                    },
                    {
                      Put: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_not_exists(PK)",
                        Item: {
                          PK: "Customer#456",
                          SK: "ContactInformation",
                          Id: "belongsToLinkId1",
                          Type: "BelongsToLink",
                          ForeignEntityType: "ContactInformation",
                          ForeignKey: "123",
                          CreatedAt: "2023-10-16T03:31:35.918Z",
                          UpdatedAt: "2023-10-16T03:31:35.918Z"
                        }
                      }
                    }
                  ]
                }
              ]
            ]);
          }
        });

        it("will remove a nullable foreign key", async () => {
          expect.assertions(7);

          const instance = createInstance(ContactInformation, {
            pk: "test-pk" as PartitionKey,
            sk: "test-sk" as SortKey,
            id: "123",
            email: "example@example.com",
            phone: "555-555-5555",
            type: "ContactInformation",
            createdAt: new Date("2023-10-01"),
            updatedAt: new Date("2023-10-02")
          });

          expect(
            await instance.update({
              email: "new-email@example.com",
              customerId: null
            })
          ).toEqual({
            pk: "test-pk" as PartitionKey,
            sk: "test-sk" as SortKey,
            id: "123",
            email: "new-email@example.com",
            phone: "555-555-5555",
            customerId: undefined,
            type: "ContactInformation",
            createdAt: new Date("2023-10-01"),
            updatedAt: now
          });
          expect(mockSend.mock.calls).toEqual([
            [{ name: "GetCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockGet.mock.calls).toEqual([[]]);
          expect(mockedGetCommand.mock.calls).toEqual([
            [
              {
                TableName: "mock-table",
                Key: { PK: "ContactInformation#123", SK: "ContactInformation" },
                ConsistentRead: true
              }
            ]
          ]);
          expect(mockTransact.mock.calls).toEqual([[]]);
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
                      ExpressionAttributeValues: {
                        ":Email": "new-email@example.com",
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      },
                      ExpressionAttributeNames: {
                        "#Email": "Email",
                        "#UpdatedAt": "UpdatedAt",
                        "#CustomerId": "CustomerId"
                      },
                      UpdateExpression:
                        "SET #Email = :Email, #UpdatedAt = :UpdatedAt REMOVE #CustomerId"
                    }
                  }
                ]
              }
            ]
          ]);
          // Original instance is not mutated
          expect(instance).toEqual({
            pk: "test-pk",
            sk: "test-sk",
            id: "123",
            email: "example@example.com",
            phone: "555-555-5555",
            type: "ContactInformation",
            createdAt: new Date("2023-10-01"),
            updatedAt: new Date("2023-10-02")
          });
        });
      });

      describe("when the entity belongs to another another entity (Adds delete transaction for existing BelongsToLink)", () => {
        const now = new Date("2023-10-16T03:31:35.918Z");

        beforeEach(() => {
          jest.setSystemTime(now);
          mockedUuidv4.mockReturnValueOnce("belongsToLinkId1");
          mockGet.mockResolvedValue({
            Item: {
              PK: "ContactInformation#123",
              SK: "ContactInformation",
              Id: "123",
              Email: "old-email@example.com",
              Phone: "555-555-5555",
              CustomerId: "789" // Already belongs to customer
            }
          });
        });

        afterEach(() => {
          mockedUuidv4.mockReset();
        });

        it("will update the foreign key and delete the old BelongsToLink if the entity being associated with exists", async () => {
          expect.assertions(8);

          const instance = createInstance(ContactInformation, {
            pk: "test-pk" as PartitionKey,
            sk: "test-sk" as SortKey,
            id: "123",
            email: "example@example.com",
            phone: "555-555-5555",
            type: "ContactInformation",
            customerId: "789" as NullableForeignKey,
            createdAt: new Date("2023-10-01"),
            updatedAt: new Date("2023-10-02")
          });

          const updatedInstance = await instance.update({
            email: "new-email@example.com",
            customerId: "456"
          });

          expect(updatedInstance).toEqual({
            pk: "test-pk",
            sk: "test-sk",
            id: "123",
            email: "new-email@example.com",
            customerId: "456",
            phone: "555-555-5555",
            type: "ContactInformation",
            createdAt: new Date("2023-10-01"),
            updatedAt: now
          });
          expect(updatedInstance).toBeInstanceOf(ContactInformation);
          expect(mockSend.mock.calls).toEqual([
            [{ name: "GetCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockGet.mock.calls).toEqual([[]]);
          expect(mockedGetCommand.mock.calls).toEqual([
            [
              {
                TableName: "mock-table",
                Key: { PK: "ContactInformation#123", SK: "ContactInformation" },
                ConsistentRead: true
              }
            ]
          ]);
          expect(mockTransact.mock.calls).toEqual([[]]);
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
                        "SET #Email = :Email, #CustomerId = :CustomerId, #UpdatedAt = :UpdatedAt",
                      // Check that the entity being updated exists
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
                  {
                    // Check that the entity being associated with exists
                    ConditionCheck: {
                      TableName: "mock-table",
                      Key: { PK: "Customer#456", SK: "Customer" },
                      ConditionExpression: "attribute_exists(PK)"
                    }
                  },
                  {
                    // Delete old BelongsToLink
                    Delete: {
                      TableName: "mock-table",
                      Key: {
                        PK: "Customer#789",
                        SK: "ContactInformation"
                      }
                    }
                  },
                  {
                    Put: {
                      TableName: "mock-table",
                      ConditionExpression: "attribute_not_exists(PK)",
                      Item: {
                        PK: "Customer#456",
                        SK: "ContactInformation",
                        Id: "belongsToLinkId1",
                        Type: "BelongsToLink",
                        ForeignEntityType: "ContactInformation",
                        ForeignKey: "123",
                        CreatedAt: "2023-10-16T03:31:35.918Z",
                        UpdatedAt: "2023-10-16T03:31:35.918Z"
                      }
                    }
                  }
                ]
              }
            ]
          ]);
          // Assert that original instance was not mutated
          expect(instance).toEqual({
            pk: "test-pk",
            sk: "test-sk",
            id: "123",
            email: "example@example.com",
            phone: "555-555-5555",
            type: "ContactInformation",
            customerId: "789",
            createdAt: new Date("2023-10-01"),
            updatedAt: new Date("2023-10-02")
          });
        });

        it("will throw an error if the entity being updated does not exist", async () => {
          expect.assertions(7);

          const instance = createInstance(ContactInformation, {
            pk: "test-pk" as PartitionKey,
            sk: "test-sk" as SortKey,
            id: "123",
            email: "example@example.com",
            phone: "555-555-5555",
            type: "ContactInformation",
            customerId: "789" as NullableForeignKey,
            createdAt: new Date("2023-10-01"),
            updatedAt: new Date("2023-10-02")
          });

          mockGet.mockResolvedValueOnce({}); // Entity does not exist but will fail in transaction

          mockSend.mockReturnValueOnce(undefined).mockImplementationOnce(() => {
            mockTransact();
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

          try {
            await instance.update({
              email: "new-email@example.com",
              customerId: "456"
            });
          } catch (e: any) {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: ContactInformation with ID '123' does not exist"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "GetCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
            expect(mockGet.mock.calls).toEqual([[]]);
            expect(mockedGetCommand.mock.calls).toEqual([
              [
                {
                  TableName: "mock-table",
                  Key: {
                    PK: "ContactInformation#123",
                    SK: "ContactInformation"
                  },
                  ConsistentRead: true
                }
              ]
            ]);
            expect(mockTransact.mock.calls).toEqual([[]]);
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
                          "SET #Email = :Email, #CustomerId = :CustomerId, #UpdatedAt = :UpdatedAt",
                        // Check that the entity being updated exists
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
                    {
                      // Check that the entity being associated with exists
                      ConditionCheck: {
                        TableName: "mock-table",
                        Key: { PK: "Customer#456", SK: "Customer" },
                        ConditionExpression: "attribute_exists(PK)"
                      }
                    },
                    // No Delete transaction because the item does not exist to look up the foreign key to build the delete operation with
                    {
                      Put: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_not_exists(PK)",
                        Item: {
                          PK: "Customer#456",
                          SK: "ContactInformation",
                          Id: "belongsToLinkId1",
                          Type: "BelongsToLink",
                          ForeignEntityType: "ContactInformation",
                          ForeignKey: "123",
                          CreatedAt: "2023-10-16T03:31:35.918Z",
                          UpdatedAt: "2023-10-16T03:31:35.918Z"
                        }
                      }
                    }
                  ]
                }
              ]
            ]);
          }
        });

        it("will throw an error if the associated entity does not exist", async () => {
          expect.assertions(7);

          const instance = createInstance(ContactInformation, {
            pk: "test-pk" as PartitionKey,
            sk: "test-sk" as SortKey,
            id: "123",
            email: "example@example.com",
            phone: "555-555-5555",
            type: "ContactInformation",
            customerId: "789" as NullableForeignKey,
            createdAt: new Date("2023-10-01"),
            updatedAt: new Date("2023-10-02")
          });

          mockSend.mockReturnValueOnce(undefined).mockImplementationOnce(() => {
            mockTransact();
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

          try {
            await instance.update({
              email: "new-email@example.com",
              customerId: "456"
            });
          } catch (e: any) {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: Customer with ID '456' does not exist"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "GetCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
            expect(mockGet.mock.calls).toEqual([[]]);
            expect(mockedGetCommand.mock.calls).toEqual([
              [
                {
                  TableName: "mock-table",
                  Key: {
                    PK: "ContactInformation#123",
                    SK: "ContactInformation"
                  },
                  ConsistentRead: true
                }
              ]
            ]);
            expect(mockTransact.mock.calls).toEqual([[]]);
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
                          "SET #Email = :Email, #CustomerId = :CustomerId, #UpdatedAt = :UpdatedAt",
                        // Check that the entity being updated exists
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
                    {
                      // Check that the entity being associated with exists
                      ConditionCheck: {
                        TableName: "mock-table",
                        Key: { PK: "Customer#456", SK: "Customer" },
                        ConditionExpression: "attribute_exists(PK)"
                      }
                    },
                    {
                      // Delete old BelongsToLink
                      Delete: {
                        TableName: "mock-table",
                        Key: {
                          PK: "Customer#789",
                          SK: "ContactInformation"
                        }
                      }
                    },
                    {
                      Put: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_not_exists(PK)",
                        Item: {
                          PK: "Customer#456",
                          SK: "ContactInformation",
                          Id: "belongsToLinkId1",
                          Type: "BelongsToLink",
                          ForeignEntityType: "ContactInformation",
                          ForeignKey: "123",
                          CreatedAt: "2023-10-16T03:31:35.918Z",
                          UpdatedAt: "2023-10-16T03:31:35.918Z"
                        }
                      }
                    }
                  ]
                }
              ]
            ]);
          }
        });

        it("will throw an error if the entity is already associated with the requested entity", async () => {
          expect.assertions(7);

          const instance = createInstance(ContactInformation, {
            pk: "test-pk" as PartitionKey,
            sk: "test-sk" as SortKey,
            id: "123",
            email: "example@example.com",
            phone: "555-555-5555",
            type: "ContactInformation",
            customerId: "789" as NullableForeignKey,
            createdAt: new Date("2023-10-01"),
            updatedAt: new Date("2023-10-02")
          });

          mockGet.mockResolvedValueOnce({
            Item: {
              PK: "ContactInformation#123",
              SK: "ContactInformation",
              Id: "123",
              Email: "old-email@example.com",
              Phone: "555-555-5555",
              CustomerId: "456" // Already belongs to customer, the same being updated
            }
          });

          mockSend.mockReturnValueOnce(undefined).mockImplementationOnce(() => {
            mockTransact();
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

          try {
            await instance.update({
              email: "new-email@example.com",
              customerId: "456"
            });
          } catch (e: any) {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: Customer with id: 456 already has an associated ContactInformation"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "GetCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
            expect(mockGet.mock.calls).toEqual([[]]);
            expect(mockedGetCommand.mock.calls).toEqual([
              [
                {
                  TableName: "mock-table",
                  Key: {
                    PK: "ContactInformation#123",
                    SK: "ContactInformation"
                  },
                  ConsistentRead: true
                }
              ]
            ]);
            expect(mockTransact.mock.calls).toEqual([[]]);
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
                          "SET #Email = :Email, #CustomerId = :CustomerId, #UpdatedAt = :UpdatedAt",
                        // Check that the entity being updated exists
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
                    {
                      // Check that the entity being associated with exists
                      ConditionCheck: {
                        TableName: "mock-table",
                        Key: { PK: "Customer#456", SK: "Customer" },
                        ConditionExpression: "attribute_exists(PK)"
                      }
                    },
                    {
                      // Delete old BelongsToLink
                      Delete: {
                        TableName: "mock-table",
                        Key: {
                          PK: "Customer#456",
                          SK: "ContactInformation"
                        }
                      }
                    },
                    {
                      Put: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_not_exists(PK)",
                        Item: {
                          PK: "Customer#456",
                          SK: "ContactInformation",
                          Id: "belongsToLinkId1",
                          Type: "BelongsToLink",
                          ForeignEntityType: "ContactInformation",
                          ForeignKey: "123",
                          CreatedAt: "2023-10-16T03:31:35.918Z",
                          UpdatedAt: "2023-10-16T03:31:35.918Z"
                        }
                      }
                    }
                  ]
                }
              ]
            ]);
          }
        });

        it("will remove a nullable foreign key and delete the BelongsToLinks for the associated entity", async () => {
          expect.assertions(8);

          const instance = createInstance(ContactInformation, {
            pk: "test-pk" as PartitionKey,
            sk: "test-sk" as SortKey,
            id: "123",
            email: "example@example.com",
            phone: "555-555-5555",
            type: "ContactInformation",
            customerId: "789" as NullableForeignKey,
            createdAt: new Date("2023-10-01"),
            updatedAt: new Date("2023-10-02")
          });

          const updatedInstance = await instance.update({
            email: "new-email@example.com",
            customerId: null
          });

          expect(updatedInstance).toEqual({
            pk: "test-pk" as PartitionKey,
            sk: "test-sk" as SortKey,
            id: "123",
            email: "new-email@example.com",
            customerId: undefined,
            phone: "555-555-5555",
            type: "ContactInformation",
            createdAt: new Date("2023-10-01"),
            updatedAt: now
          });
          expect(updatedInstance).toBeInstanceOf(ContactInformation);
          expect(mockSend.mock.calls).toEqual([
            [{ name: "GetCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockGet.mock.calls).toEqual([[]]);
          expect(mockedGetCommand.mock.calls).toEqual([
            [
              {
                TableName: "mock-table",
                Key: { PK: "ContactInformation#123", SK: "ContactInformation" },
                ConsistentRead: true
              }
            ]
          ]);
          expect(mockTransact.mock.calls).toEqual([[]]);
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
                      ExpressionAttributeValues: {
                        ":Email": "new-email@example.com",
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      },
                      ExpressionAttributeNames: {
                        "#Email": "Email",
                        "#UpdatedAt": "UpdatedAt",
                        "#CustomerId": "CustomerId"
                      },
                      UpdateExpression:
                        "SET #Email = :Email, #UpdatedAt = :UpdatedAt REMOVE #CustomerId"
                    }
                  },
                  {
                    Delete: {
                      TableName: "mock-table",
                      Key: { PK: "Customer#789", SK: "ContactInformation" }
                    }
                  }
                ]
              }
            ]
          ]);
          // Assert that original instance was not mutated
          expect(instance).toEqual({
            pk: "test-pk",
            sk: "test-sk",
            id: "123",
            email: "example@example.com",
            phone: "555-555-5555",
            type: "ContactInformation",
            customerId: "789",
            createdAt: new Date("2023-10-01"),
            updatedAt: new Date("2023-10-02")
          });
        });
      });
    });

    describe("ForeignKey is updated for entity which BelongsTo an entity who HasMany of it", () => {
      describe("when the entity does not already belong to another entity", () => {
        const now = new Date("2023-10-16T03:31:35.918Z");

        beforeEach(() => {
          jest.setSystemTime(now);
          mockedUuidv4.mockReturnValueOnce("belongsToLinkId1");
          mockGet.mockResolvedValue({
            Item: {
              PK: "PaymentMethod#123",
              SK: "PaymentMethod",
              Id: "123",
              lastFour: "1234",
              CustomerId: undefined // Does not already belong to customer
            }
          });
        });

        afterEach(() => {
          mockedUuidv4.mockReset();
        });

        it("will update the foreign key if the entity being associated with exists", async () => {
          expect.assertions(8);

          const instance = createInstance(PaymentMethod, {
            pk: "test-pk" as PartitionKey,
            sk: "test-sk" as SortKey,
            id: "123",
            type: "PaymentMethod",
            lastFour: "1234",
            customerId: "111" as ForeignKey,
            createdAt: new Date("2023-10-01"),
            updatedAt: new Date("2023-10-02")
          });

          const updatedInstance = await instance.update({
            lastFour: "5678",
            customerId: "456"
          });

          expect(updatedInstance).toEqual({
            pk: "test-pk",
            sk: "test-sk",
            id: "123",
            type: "PaymentMethod",
            lastFour: "5678",
            customerId: "456",
            createdAt: new Date("2023-10-01"),
            updatedAt: now
          });
          expect(updatedInstance).toBeInstanceOf(PaymentMethod);
          expect(mockSend.mock.calls).toEqual([
            [{ name: "GetCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockGet.mock.calls).toEqual([[]]);
          expect(mockedGetCommand.mock.calls).toEqual([
            [
              {
                TableName: "mock-table",
                Key: { PK: "PaymentMethod#123", SK: "PaymentMethod" },
                ConsistentRead: true
              }
            ]
          ]);
          expect(mockTransact.mock.calls).toEqual([[]]);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [
              {
                TransactItems: [
                  {
                    Update: {
                      TableName: "mock-table",
                      Key: { PK: "PaymentMethod#123", SK: "PaymentMethod" },
                      UpdateExpression:
                        "SET #LastFour = :LastFour, #CustomerId = :CustomerId, #UpdatedAt = :UpdatedAt",
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#CustomerId": "CustomerId",
                        "#LastFour": "LastFour",
                        "#UpdatedAt": "UpdatedAt"
                      },
                      ExpressionAttributeValues: {
                        ":CustomerId": "456",
                        ":LastFour": "5678",
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      }
                    }
                  },
                  {
                    ConditionCheck: {
                      TableName: "mock-table",
                      Key: { PK: "Customer#456", SK: "Customer" },
                      ConditionExpression: "attribute_exists(PK)"
                    }
                  },
                  {
                    Put: {
                      TableName: "mock-table",
                      ConditionExpression: "attribute_not_exists(PK)",
                      Item: {
                        PK: "Customer#456",
                        SK: "PaymentMethod#123",
                        Id: "belongsToLinkId1",
                        Type: "BelongsToLink",
                        ForeignEntityType: "PaymentMethod",
                        ForeignKey: "123",
                        CreatedAt: "2023-10-16T03:31:35.918Z",
                        UpdatedAt: "2023-10-16T03:31:35.918Z"
                      }
                    }
                  }
                ]
              }
            ]
          ]);
          // Assert original instance not mutated
          expect(instance).toEqual({
            pk: "test-pk",
            sk: "test-sk",
            id: "123",
            type: "PaymentMethod",
            lastFour: "1234",
            customerId: "111",
            createdAt: new Date("2023-10-01"),
            updatedAt: new Date("2023-10-02")
          });
        });

        it("will throw an error if the entity being updated does not exist", async () => {
          expect.assertions(7);

          const instance = createInstance(PaymentMethod, {
            pk: "test-pk" as PartitionKey,
            sk: "test-sk" as SortKey,
            id: "123",
            type: "PaymentMethod",
            lastFour: "1234",
            customerId: "111" as ForeignKey,
            createdAt: new Date("2023-10-01"),
            updatedAt: new Date("2023-10-02")
          });

          mockGet.mockResolvedValueOnce({}); // Entity does not exist but will fail in transaction
          mockSend.mockReturnValueOnce(undefined).mockImplementationOnce(() => {
            mockTransact();
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
            await instance.update({ lastFour: "5678", customerId: "456" });
          } catch (e: any) {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: PaymentMethod with ID '123' does not exist"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "GetCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
            expect(mockGet.mock.calls).toEqual([[]]);
            expect(mockedGetCommand.mock.calls).toEqual([
              [
                {
                  TableName: "mock-table",
                  Key: { PK: "PaymentMethod#123", SK: "PaymentMethod" },
                  ConsistentRead: true
                }
              ]
            ]);
            expect(mockTransact.mock.calls).toEqual([[]]);
            expect(mockTransactWriteCommand.mock.calls).toEqual([
              [
                {
                  TransactItems: [
                    {
                      Update: {
                        TableName: "mock-table",
                        Key: { PK: "PaymentMethod#123", SK: "PaymentMethod" },
                        UpdateExpression:
                          "SET #LastFour = :LastFour, #CustomerId = :CustomerId, #UpdatedAt = :UpdatedAt",
                        ConditionExpression: "attribute_exists(PK)",
                        ExpressionAttributeNames: {
                          "#CustomerId": "CustomerId",
                          "#LastFour": "LastFour",
                          "#UpdatedAt": "UpdatedAt"
                        },
                        ExpressionAttributeValues: {
                          ":CustomerId": "456",
                          ":LastFour": "5678",
                          ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                        }
                      }
                    },
                    {
                      ConditionCheck: {
                        TableName: "mock-table",
                        Key: { PK: "Customer#456", SK: "Customer" },
                        ConditionExpression: "attribute_exists(PK)"
                      }
                    },
                    {
                      Put: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_not_exists(PK)",
                        Item: {
                          PK: "Customer#456",
                          SK: "PaymentMethod#123",
                          Id: "belongsToLinkId1",
                          Type: "BelongsToLink",
                          ForeignEntityType: "PaymentMethod",
                          ForeignKey: "123",
                          CreatedAt: "2023-10-16T03:31:35.918Z",
                          UpdatedAt: "2023-10-16T03:31:35.918Z"
                        }
                      }
                    }
                  ]
                }
              ]
            ]);
          }
        });

        it("will throw an error if the entity being associated with does not exist", async () => {
          expect.assertions(7);

          const instance = createInstance(PaymentMethod, {
            pk: "test-pk" as PartitionKey,
            sk: "test-sk" as SortKey,
            id: "123",
            type: "PaymentMethod",
            lastFour: "1234",
            customerId: "111" as ForeignKey,
            createdAt: new Date("2023-10-01"),
            updatedAt: new Date("2023-10-02")
          });

          mockSend.mockReturnValueOnce(undefined).mockImplementationOnce(() => {
            mockTransact();
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
            await instance.update({
              lastFour: "5678",
              customerId: "456"
            });
          } catch (e: any) {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: Customer with ID '456' does not exist"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "GetCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
            expect(mockGet.mock.calls).toEqual([[]]);
            expect(mockedGetCommand.mock.calls).toEqual([
              [
                {
                  TableName: "mock-table",
                  Key: { PK: "PaymentMethod#123", SK: "PaymentMethod" },
                  ConsistentRead: true
                }
              ]
            ]);
            expect(mockTransact.mock.calls).toEqual([[]]);
            expect(mockTransactWriteCommand.mock.calls).toEqual([
              [
                {
                  TransactItems: [
                    {
                      Update: {
                        TableName: "mock-table",
                        Key: { PK: "PaymentMethod#123", SK: "PaymentMethod" },
                        UpdateExpression:
                          "SET #LastFour = :LastFour, #CustomerId = :CustomerId, #UpdatedAt = :UpdatedAt",
                        ConditionExpression: "attribute_exists(PK)",
                        ExpressionAttributeNames: {
                          "#CustomerId": "CustomerId",
                          "#LastFour": "LastFour",
                          "#UpdatedAt": "UpdatedAt"
                        },
                        ExpressionAttributeValues: {
                          ":CustomerId": "456",
                          ":LastFour": "5678",
                          ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                        }
                      }
                    },
                    {
                      ConditionCheck: {
                        TableName: "mock-table",
                        Key: { PK: "Customer#456", SK: "Customer" },
                        ConditionExpression: "attribute_exists(PK)"
                      }
                    },
                    {
                      Put: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_not_exists(PK)",
                        Item: {
                          PK: "Customer#456",
                          SK: "PaymentMethod#123",
                          Id: "belongsToLinkId1",
                          Type: "BelongsToLink",
                          ForeignEntityType: "PaymentMethod",
                          ForeignKey: "123",
                          CreatedAt: "2023-10-16T03:31:35.918Z",
                          UpdatedAt: "2023-10-16T03:31:35.918Z"
                        }
                      }
                    }
                  ]
                }
              ]
            ]);
          }
        });

        it("will remove a nullable foreign key", async () => {
          expect.assertions(8);

          const instance = createInstance(Pet, {
            pk: "test-pk" as PartitionKey,
            sk: "test-sk" as SortKey,
            id: "123",
            type: "Pet",
            name: "fido",
            ownerId: undefined,
            createdAt: new Date("2023-10-01"),
            updatedAt: new Date("2023-10-02")
          });

          mockGet.mockResolvedValueOnce({
            Item: {
              PK: "Pet#123",
              SK: "Pet",
              Id: "123",
              name: "Fido",
              OwnerId: undefined // Does not already belong an owner
            }
          });

          const updatedInstance = await instance.update({
            name: "New Name",
            ownerId: null
          });

          expect(updatedInstance).toEqual({
            pk: "test-pk" as PartitionKey,
            sk: "test-sk" as SortKey,
            id: "123",
            type: "Pet",
            name: "New Name",
            ownerId: undefined,
            createdAt: new Date("2023-10-01"),
            updatedAt: now
          });
          expect(updatedInstance).toBeInstanceOf(Pet);
          expect(mockSend.mock.calls).toEqual([
            [{ name: "GetCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockGet.mock.calls).toEqual([[]]);
          expect(mockedGetCommand.mock.calls).toEqual([
            [
              {
                TableName: "mock-table",
                Key: { PK: "Pet#123", SK: "Pet" },
                ConsistentRead: true
              }
            ]
          ]);
          expect(mockTransact.mock.calls).toEqual([[]]);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [
              {
                TransactItems: [
                  {
                    Update: {
                      TableName: "mock-table",
                      Key: { PK: "Pet#123", SK: "Pet" },
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
          // Assert original instance not mutated
          expect(instance).toEqual({
            pk: "test-pk",
            sk: "test-sk",
            id: "123",
            type: "Pet",
            name: "fido",
            ownerId: undefined,
            createdAt: new Date("2023-10-01"),
            updatedAt: new Date("2023-10-02")
          });
        });
      });

      describe("when the entity belongs to another another entity (Adds delete transaction for existing BelongsToLink)", () => {
        const now = new Date("2023-10-16T03:31:35.918Z");

        const oldCustomerId = "789" as ForeignKey;

        beforeEach(() => {
          jest.setSystemTime(now);
          mockedUuidv4.mockReturnValueOnce("belongsToLinkId1");
          mockGet.mockResolvedValue({
            Item: {
              PK: "PaymentMethod#123",
              SK: "PaymentMethod",
              Id: "123",
              lastFour: "1234",
              CustomerId: oldCustomerId // Already belongs to customer
            }
          });
        });

        afterEach(() => {
          mockedUuidv4.mockReset();
        });

        it("will update the foreign key if the entity being associated with exists", async () => {
          expect.assertions(8);

          const instance = createInstance(PaymentMethod, {
            pk: "test-pk" as PartitionKey,
            sk: "test-sk" as SortKey,
            id: "123",
            type: "PaymentMethod",
            lastFour: "1234",
            customerId: oldCustomerId,
            createdAt: new Date("2023-10-01"),
            updatedAt: new Date("2023-10-02")
          });

          const updatedInstance = await instance.update({
            lastFour: "5678",
            customerId: "456"
          });

          expect(updatedInstance).toEqual({
            pk: "test-pk",
            sk: "test-sk",
            id: "123",
            type: "PaymentMethod",
            lastFour: "5678",
            customerId: "456",
            createdAt: new Date("2023-10-01"),
            updatedAt: now
          });
          expect(updatedInstance).toBeInstanceOf(PaymentMethod);
          expect(mockSend.mock.calls).toEqual([
            [{ name: "GetCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockGet.mock.calls).toEqual([[]]);
          expect(mockedGetCommand.mock.calls).toEqual([
            [
              {
                TableName: "mock-table",
                Key: { PK: "PaymentMethod#123", SK: "PaymentMethod" },
                ConsistentRead: true
              }
            ]
          ]);
          expect(mockTransact.mock.calls).toEqual([[]]);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [
              {
                TransactItems: [
                  {
                    Update: {
                      TableName: "mock-table",
                      Key: { PK: "PaymentMethod#123", SK: "PaymentMethod" },
                      UpdateExpression:
                        "SET #LastFour = :LastFour, #CustomerId = :CustomerId, #UpdatedAt = :UpdatedAt",
                      ConditionExpression: "attribute_exists(PK)",
                      ExpressionAttributeNames: {
                        "#CustomerId": "CustomerId",
                        "#LastFour": "LastFour",
                        "#UpdatedAt": "UpdatedAt"
                      },
                      ExpressionAttributeValues: {
                        ":CustomerId": "456",
                        ":LastFour": "5678",
                        ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                      }
                    }
                  },
                  {
                    ConditionCheck: {
                      TableName: "mock-table",
                      Key: { PK: "Customer#456", SK: "Customer" },
                      ConditionExpression: "attribute_exists(PK)"
                    }
                  },
                  {
                    // Delete old BelongsToLink
                    Delete: {
                      TableName: "mock-table",
                      Key: {
                        PK: "Customer#789",
                        SK: "PaymentMethod#123"
                      }
                    }
                  },
                  {
                    Put: {
                      TableName: "mock-table",
                      ConditionExpression: "attribute_not_exists(PK)",
                      Item: {
                        PK: "Customer#456",
                        SK: "PaymentMethod#123",
                        Id: "belongsToLinkId1",
                        Type: "BelongsToLink",
                        ForeignEntityType: "PaymentMethod",
                        ForeignKey: "123",
                        CreatedAt: "2023-10-16T03:31:35.918Z",
                        UpdatedAt: "2023-10-16T03:31:35.918Z"
                      }
                    }
                  }
                ]
              }
            ]
          ]);
          // Assert original instance is not mutated
          expect(instance).toEqual({
            pk: "test-pk",
            sk: "test-sk",
            id: "123",
            type: "PaymentMethod",
            lastFour: "1234",
            customerId: oldCustomerId,
            createdAt: new Date("2023-10-01"),
            updatedAt: new Date("2023-10-02")
          });
        });

        it("will throw an error if the entity being updated does not exist", async () => {
          expect.assertions(7);

          const instance = createInstance(PaymentMethod, {
            pk: "test-pk" as PartitionKey,
            sk: "test-sk" as SortKey,
            id: "123",
            type: "PaymentMethod",
            lastFour: "1234",
            customerId: oldCustomerId,
            createdAt: new Date("2023-10-01"),
            updatedAt: new Date("2023-10-02")
          });

          mockGet.mockResolvedValueOnce({}); // Entity does not exist but will fail in transaction

          mockSend.mockReturnValueOnce(undefined).mockImplementationOnce(() => {
            mockTransact();
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

          try {
            await instance.update({ lastFour: "5678", customerId: "456" });
          } catch (e: any) {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: PaymentMethod with ID '123' does not exist"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "GetCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
            expect(mockGet.mock.calls).toEqual([[]]);
            expect(mockedGetCommand.mock.calls).toEqual([
              [
                {
                  TableName: "mock-table",
                  Key: { PK: "PaymentMethod#123", SK: "PaymentMethod" },
                  ConsistentRead: true
                }
              ]
            ]);
            expect(mockTransact.mock.calls).toEqual([[]]);
            expect(mockTransactWriteCommand.mock.calls).toEqual([
              [
                {
                  TransactItems: [
                    {
                      Update: {
                        TableName: "mock-table",
                        Key: { PK: "PaymentMethod#123", SK: "PaymentMethod" },
                        UpdateExpression:
                          "SET #LastFour = :LastFour, #CustomerId = :CustomerId, #UpdatedAt = :UpdatedAt",
                        ConditionExpression: "attribute_exists(PK)",
                        ExpressionAttributeNames: {
                          "#CustomerId": "CustomerId",
                          "#LastFour": "LastFour",
                          "#UpdatedAt": "UpdatedAt"
                        },
                        ExpressionAttributeValues: {
                          ":CustomerId": "456",
                          ":LastFour": "5678",
                          ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                        }
                      }
                    },
                    {
                      ConditionCheck: {
                        TableName: "mock-table",
                        Key: { PK: "Customer#456", SK: "Customer" },
                        ConditionExpression: "attribute_exists(PK)"
                      }
                    },
                    // No Delete transaction because the item does not exist to look up the foreign key to build the delete operation with
                    {
                      Put: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_not_exists(PK)",
                        Item: {
                          PK: "Customer#456",
                          SK: "PaymentMethod#123",
                          Id: "belongsToLinkId1",
                          Type: "BelongsToLink",
                          ForeignEntityType: "PaymentMethod",
                          ForeignKey: "123",
                          CreatedAt: "2023-10-16T03:31:35.918Z",
                          UpdatedAt: "2023-10-16T03:31:35.918Z"
                        }
                      }
                    }
                  ]
                }
              ]
            ]);
          }
        });

        it("will throw an error if the entity being associated with does not exist", async () => {
          expect.assertions(7);

          const instance = createInstance(PaymentMethod, {
            pk: "test-pk" as PartitionKey,
            sk: "test-sk" as SortKey,
            id: "123",
            type: "PaymentMethod",
            lastFour: "1234",
            customerId: oldCustomerId,
            createdAt: new Date("2023-10-01"),
            updatedAt: new Date("2023-10-02")
          });

          mockSend.mockReturnValueOnce(undefined).mockImplementationOnce(() => {
            mockTransact();
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

          try {
            await instance.update({ lastFour: "5678", customerId: "456" });
          } catch (e: any) {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: Customer with ID '456' does not exist"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "GetCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
            expect(mockGet.mock.calls).toEqual([[]]);
            expect(mockedGetCommand.mock.calls).toEqual([
              [
                {
                  TableName: "mock-table",
                  Key: { PK: "PaymentMethod#123", SK: "PaymentMethod" },
                  ConsistentRead: true
                }
              ]
            ]);
            expect(mockTransact.mock.calls).toEqual([[]]);
            expect(mockTransactWriteCommand.mock.calls).toEqual([
              [
                {
                  TransactItems: [
                    {
                      Update: {
                        TableName: "mock-table",
                        Key: { PK: "PaymentMethod#123", SK: "PaymentMethod" },
                        UpdateExpression:
                          "SET #LastFour = :LastFour, #CustomerId = :CustomerId, #UpdatedAt = :UpdatedAt",
                        ConditionExpression: "attribute_exists(PK)",
                        ExpressionAttributeNames: {
                          "#CustomerId": "CustomerId",
                          "#LastFour": "LastFour",
                          "#UpdatedAt": "UpdatedAt"
                        },
                        ExpressionAttributeValues: {
                          ":CustomerId": "456",
                          ":LastFour": "5678",
                          ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                        }
                      }
                    },
                    {
                      ConditionCheck: {
                        TableName: "mock-table",
                        Key: { PK: "Customer#456", SK: "Customer" },
                        ConditionExpression: "attribute_exists(PK)"
                      }
                    },
                    {
                      // Delete old BelongsToLink
                      Delete: {
                        TableName: "mock-table",
                        Key: {
                          PK: "Customer#789",
                          SK: "PaymentMethod#123"
                        }
                      }
                    },
                    {
                      Put: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_not_exists(PK)",
                        Item: {
                          PK: "Customer#456",
                          SK: "PaymentMethod#123",
                          Id: "belongsToLinkId1",
                          Type: "BelongsToLink",
                          ForeignEntityType: "PaymentMethod",
                          ForeignKey: "123",
                          CreatedAt: "2023-10-16T03:31:35.918Z",
                          UpdatedAt: "2023-10-16T03:31:35.918Z"
                        }
                      }
                    }
                  ]
                }
              ]
            ]);
          }
        });

        it("will throw an error if the entity is already associated with the requested entity", async () => {
          expect.assertions(7);

          const instance = createInstance(PaymentMethod, {
            pk: "test-pk" as PartitionKey,
            sk: "test-sk" as SortKey,
            id: "123",
            type: "PaymentMethod",
            lastFour: "1234",
            customerId: oldCustomerId,
            createdAt: new Date("2023-10-01"),
            updatedAt: new Date("2023-10-02")
          });

          mockGet.mockResolvedValueOnce({
            Item: {
              PK: "PaymentMethod#123",
              SK: "PaymentMethod",
              Id: "123",
              lastFour: "1234",
              CustomerId: "456" // Already belongs to customer, the same being updated
            }
          });

          mockSend.mockReturnValueOnce(undefined).mockImplementationOnce(() => {
            mockTransact();
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

          try {
            await instance.update({ lastFour: "5678", customerId: "456" });
          } catch (e: any) {
            expect(e.constructor.name).toEqual("TransactionWriteFailedError");
            expect(e.errors).toEqual([
              new ConditionalCheckFailedError(
                "ConditionalCheckFailed: PaymentMethod with ID '123' already belongs to Customer with Id '456'"
              )
            ]);
            expect(mockSend.mock.calls).toEqual([
              [{ name: "GetCommand" }],
              [{ name: "TransactWriteCommand" }]
            ]);
            expect(mockGet.mock.calls).toEqual([[]]);
            expect(mockedGetCommand.mock.calls).toEqual([
              [
                {
                  TableName: "mock-table",
                  Key: { PK: "PaymentMethod#123", SK: "PaymentMethod" },
                  ConsistentRead: true
                }
              ]
            ]);
            expect(mockTransact.mock.calls).toEqual([[]]);
            expect(mockTransactWriteCommand.mock.calls).toEqual([
              [
                {
                  TransactItems: [
                    {
                      Update: {
                        TableName: "mock-table",
                        Key: { PK: "PaymentMethod#123", SK: "PaymentMethod" },
                        UpdateExpression:
                          "SET #LastFour = :LastFour, #CustomerId = :CustomerId, #UpdatedAt = :UpdatedAt",
                        ConditionExpression: "attribute_exists(PK)",
                        ExpressionAttributeNames: {
                          "#CustomerId": "CustomerId",
                          "#LastFour": "LastFour",
                          "#UpdatedAt": "UpdatedAt"
                        },
                        ExpressionAttributeValues: {
                          ":CustomerId": "456",
                          ":LastFour": "5678",
                          ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                        }
                      }
                    },
                    {
                      ConditionCheck: {
                        TableName: "mock-table",
                        Key: { PK: "Customer#456", SK: "Customer" },
                        ConditionExpression: "attribute_exists(PK)"
                      }
                    },
                    {
                      // Delete old BelongsToLink
                      Delete: {
                        TableName: "mock-table",
                        Key: {
                          PK: "Customer#456",
                          SK: "PaymentMethod#123"
                        }
                      }
                    },
                    {
                      Put: {
                        TableName: "mock-table",
                        ConditionExpression: "attribute_not_exists(PK)",
                        Item: {
                          PK: "Customer#456",
                          SK: "PaymentMethod#123",
                          Id: "belongsToLinkId1",
                          Type: "BelongsToLink",
                          ForeignEntityType: "PaymentMethod",
                          ForeignKey: "123",
                          CreatedAt: "2023-10-16T03:31:35.918Z",
                          UpdatedAt: "2023-10-16T03:31:35.918Z"
                        }
                      }
                    }
                  ]
                }
              ]
            ]);
          }
        });

        it("will remove a nullable foreign key and delete the associated BelongsToLinks", async () => {
          expect.assertions(8);

          const instance = createInstance(Pet, {
            pk: "test-pk" as PartitionKey,
            sk: "test-sk" as SortKey,
            id: "123",
            type: "Pet",
            name: "fido",
            ownerId: "456" as NullableForeignKey,
            createdAt: new Date("2023-10-01"),
            updatedAt: new Date("2023-10-02")
          });

          mockGet.mockResolvedValueOnce({
            Item: {
              PK: "Pet#123",
              SK: "Pet",
              Id: "123",
              name: "Fido",
              OwnerId: "456" // Does not already belong an owner
            }
          });

          const updatedInstance = await instance.update({
            name: "New Name",
            ownerId: null
          });

          expect(updatedInstance).toEqual({
            pk: "test-pk",
            sk: "test-sk",
            id: "123",
            type: "Pet",
            name: "New Name",
            ownerId: undefined,
            createdAt: new Date("2023-10-01"),
            updatedAt: now
          });
          expect(updatedInstance).toBeInstanceOf(Pet);
          expect(mockSend.mock.calls).toEqual([
            [{ name: "GetCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockGet.mock.calls).toEqual([[]]);
          expect(mockedGetCommand.mock.calls).toEqual([
            [
              {
                TableName: "mock-table",
                Key: { PK: "Pet#123", SK: "Pet" },
                ConsistentRead: true
              }
            ]
          ]);
          expect(mockTransact.mock.calls).toEqual([[]]);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [
              {
                TransactItems: [
                  {
                    Update: {
                      TableName: "mock-table",
                      Key: { PK: "Pet#123", SK: "Pet" },
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
                  },
                  {
                    Delete: {
                      TableName: "mock-table",
                      Key: { PK: "Person#456", SK: "Pet#123" }
                    }
                  }
                ]
              }
            ]
          ]);
          // Assert original instance not mutated
          expect(instance).toEqual({
            pk: "test-pk",
            sk: "test-sk",
            id: "123",
            type: "Pet",
            name: "fido",
            ownerId: "456",
            createdAt: new Date("2023-10-01"),
            updatedAt: new Date("2023-10-02")
          });
        });
      });
    });

    describe("A model is updating multiple ForeignKeys of different relationship types", () => {
      @Entity
      class OtherModel1 extends MockTable {
        @HasOne(() => OtherModel3, { foreignKey: "model1Id" })
        public model3: OtherModel3;
      }

      @Entity
      class OtherModel2 extends MockTable {
        @HasMany(() => OtherModel3, { foreignKey: "model2Id" })
        public model3: OtherModel3[];
      }

      @Entity
      class OtherModel3 extends MockTable {
        @StringAttribute({ alias: "Name" })
        public name: string;

        @ForeignKeyAttribute({ alias: "Model1Id" })
        public model1Id: ForeignKey;

        @ForeignKeyAttribute({ alias: "Model2Id" })
        public model2Id: ForeignKey;

        @BelongsTo(() => OtherModel1, { foreignKey: "model1Id" })
        public model1: OtherModel1;

        @BelongsTo(() => OtherModel2, { foreignKey: "model2Id" })
        public model2: OtherModel2;
      }

      const now = new Date("2023-10-16T03:31:35.918Z");

      beforeEach(() => {
        jest.setSystemTime(now);
        mockedUuidv4
          .mockReturnValueOnce("belongsToLinkId1")
          .mockReturnValueOnce("belongsToLinkId2");
      });

      it("can update foreign keys for an entity that includes both HasMany and Belongs to relationships", async () => {
        expect.assertions(8);

        const instance = createInstance(OtherModel3, {
          pk: "test-pk" as PartitionKey,
          sk: "test-sk" as SortKey,
          id: "123",
          type: "OtherModel3",
          name: "test-name",
          model1Id: "model1Id" as ForeignKey,
          model2Id: "model2Id" as ForeignKey,
          createdAt: new Date("2023-10-01"),
          updatedAt: new Date("2023-10-02")
        });

        mockGet.mockResolvedValue({
          Item: {
            PK: "OtherModel3#123",
            SK: "OtherModel3",
            Id: "123",
            Name: "originalName",
            Phone: "555-555-5555",
            Model1Id: undefined,
            Model2Id: undefined
          }
        });

        const updatedInstance = await instance.update({
          name: "newName",
          model1Id: "model1-ID",
          model2Id: "model2-ID"
        });

        expect(updatedInstance).toEqual({
          pk: "test-pk",
          sk: "test-sk",
          id: "123",
          type: "OtherModel3",
          name: "newName",
          model1Id: "model1-ID",
          model2Id: "model2-ID",
          createdAt: new Date("2023-10-01"),
          updatedAt: now
        });
        expect(updatedInstance).toBeInstanceOf(OtherModel3);
        expect(mockSend.mock.calls).toEqual([
          [{ name: "GetCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockGet.mock.calls).toEqual([[]]);
        expect(mockedGetCommand.mock.calls).toEqual([
          [
            {
              TableName: "mock-table",
              Key: { PK: "OtherModel3#123", SK: "OtherModel3" },
              ConsistentRead: true
            }
          ]
        ]);
        expect(mockTransact.mock.calls).toEqual([[]]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                {
                  Update: {
                    TableName: "mock-table",
                    Key: { PK: "OtherModel3#123", SK: "OtherModel3" },
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
                      ":Model1Id": "model1-ID",
                      ":Model2Id": "model2-ID",
                      ":Name": "newName",
                      ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                    }
                  }
                },
                {
                  ConditionCheck: {
                    TableName: "mock-table",
                    Key: { PK: "OtherModel1#model1-ID", SK: "OtherModel1" },
                    ConditionExpression: "attribute_exists(PK)"
                  }
                },
                {
                  Put: {
                    TableName: "mock-table",
                    ConditionExpression: "attribute_not_exists(PK)",
                    Item: {
                      PK: "OtherModel1#model1-ID",
                      SK: "OtherModel3",
                      Id: "belongsToLinkId1",
                      Type: "BelongsToLink",
                      ForeignEntityType: "OtherModel3",
                      ForeignKey: "123",
                      CreatedAt: "2023-10-16T03:31:35.918Z",
                      UpdatedAt: "2023-10-16T03:31:35.918Z"
                    }
                  }
                },
                {
                  ConditionCheck: {
                    TableName: "mock-table",
                    Key: { PK: "OtherModel2#model2-ID", SK: "OtherModel2" },
                    ConditionExpression: "attribute_exists(PK)"
                  }
                },
                {
                  Put: {
                    TableName: "mock-table",
                    ConditionExpression: "attribute_not_exists(PK)",
                    Item: {
                      PK: "OtherModel2#model2-ID",
                      SK: "OtherModel3#123",
                      Id: "belongsToLinkId2",
                      Type: "BelongsToLink",
                      ForeignEntityType: "OtherModel3",
                      ForeignKey: "123",
                      CreatedAt: "2023-10-16T03:31:35.918Z",
                      UpdatedAt: "2023-10-16T03:31:35.918Z"
                    }
                  }
                }
              ]
            }
          ]
        ]);
        // Assert original instance not mutated
        expect(instance).toEqual({
          pk: "test-pk",
          sk: "test-sk",
          id: "123",
          type: "OtherModel3",
          name: "test-name",
          model1Id: "model1Id",
          model2Id: "model2Id",
          createdAt: new Date("2023-10-01"),
          updatedAt: new Date("2023-10-02")
        });
      });

      it("alternate table (different alias/keys) - can update foreign keys for an entity that includes both HasMany and Belongs to relationships", async () => {
        expect.assertions(8);

        const instance = createInstance(Grade, {
          myPk: "Grade#123" as PartitionKey,
          mySk: "Grade" as SortKey,
          id: "123",
          type: "Grade",
          gradeValue: "A+",
          assignmentId: "456" as ForeignKey,
          studentId: "789" as ForeignKey,
          createdAt: new Date("2023-10-01"),
          updatedAt: new Date("2023-10-02")
        });

        mockGet.mockResolvedValueOnce({
          Item: {
            myPk: "Grade|123",
            mySk: "Grade",
            id: "123",
            type: "Grade",
            gradeValue: "A+",
            assignmentId: "456",
            studentId: "789",
            createdAt: "2023-10-16T03:31:35.918Z",
            updatedAt: "2023-10-16T03:31:35.918Z"
          }
        });

        const updatedInstance = await instance.update({
          gradeValue: "B",
          assignmentId: "111",
          studentId: "222"
        });

        expect(updatedInstance).toEqual({
          myPk: "Grade#123",
          mySk: "Grade",
          id: "123",
          type: "Grade",
          gradeValue: "B",
          assignmentId: "111",
          studentId: "222",
          createdAt: new Date("2023-10-01"),
          updatedAt: now
        });
        expect(updatedInstance).toBeInstanceOf(Grade);
        expect(mockSend.mock.calls).toEqual([
          [{ name: "GetCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockGet.mock.calls).toEqual([[]]);
        expect(mockedGetCommand.mock.calls).toEqual([
          [
            {
              TableName: "other-table",
              Key: { myPk: "Grade|123", mySk: "Grade" },
              ConsistentRead: true
            }
          ]
        ]);
        expect(mockTransact.mock.calls).toEqual([[]]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                {
                  Update: {
                    TableName: "other-table",
                    Key: { myPk: "Grade|123", mySk: "Grade" },
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
                      ":assignmentId": "111",
                      ":studentId": "222",
                      ":updatedAt": "2023-10-16T03:31:35.918Z"
                    }
                  }
                },
                {
                  ConditionCheck: {
                    TableName: "other-table",
                    Key: { myPk: "Assignment|111", mySk: "Assignment" },
                    ConditionExpression: "attribute_exists(myPk)"
                  }
                },
                {
                  Delete: {
                    TableName: "other-table",
                    Key: { myPk: "Assignment|456", mySk: "Grade" }
                  }
                },
                {
                  Put: {
                    TableName: "other-table",
                    ConditionExpression: "attribute_not_exists(myPk)",
                    Item: {
                      myPk: "Assignment|111",
                      mySk: "Grade",
                      id: "belongsToLinkId1",
                      type: "BelongsToLink",
                      foreignKey: "123",
                      foreignEntityType: "Grade",
                      createdAt: "2023-10-16T03:31:35.918Z",
                      updatedAt: "2023-10-16T03:31:35.918Z"
                    }
                  }
                },
                {
                  ConditionCheck: {
                    TableName: "other-table",
                    Key: { myPk: "Student|222", mySk: "Student" },
                    ConditionExpression: "attribute_exists(myPk)"
                  }
                },
                {
                  Delete: {
                    TableName: "other-table",
                    Key: { myPk: "Student|789", mySk: "Grade|123" }
                  }
                },
                {
                  Put: {
                    TableName: "other-table",
                    ConditionExpression: "attribute_not_exists(myPk)",
                    Item: {
                      myPk: "Student|222",
                      mySk: "Grade|123",
                      id: "belongsToLinkId2",
                      type: "BelongsToLink",
                      foreignKey: "123",
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
        // Assert original instance not mutated
        expect(instance).toEqual({
          myPk: "Grade#123",
          mySk: "Grade",
          id: "123",
          type: "Grade",
          gradeValue: "A+",
          assignmentId: "456",
          studentId: "789",
          createdAt: new Date("2023-10-01"),
          updatedAt: new Date("2023-10-02")
        });
      });
    });

    describe("types", () => {
      it("will not accept relationship attributes on update", async () => {
        const instance = new Order();

        await instance.update({
          orderDate: new Date(),
          paymentMethodId: "123",
          customerId: "456",
          // @ts-expect-error relationship attributes are not allowed
          customer: new Customer()
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

        await instance.update({
          orderDate: new Date(),
          // @ts-expect-no-error ForeignKey is of type string so it can be passed as such without casing to ForeignKey
          paymentMethodId: "123",
          // @ts-expect-no-error ForeignKey is of type string so it can be passed as such without casing to ForeignKey
          customerId: "456"
        });
      });

      it("will not accept DefaultFields on update because they are managed by dyna-record", async () => {
        const instance = new Order();

        await instance.update({
          // @ts-expect-error default fields are not accepted on update, they are managed by dyna-record
          id: "123"
        });

        await instance.update({
          // @ts-expect-error default fields are not accepted on update, they are managed by dyna-record
          type: "456"
        });

        await instance.update({
          // @ts-expect-error default fields are not accepted on update, they are managed by dyna-record
          createdAt: new Date()
        });

        await instance.update({
          // @ts-expect-error default fields are not accepted on update, they are managed by dyna-record
          updatedAt: new Date()
        });
      });

      it("will not accept partition and sort keys on update because they are managed by dyna-record", async () => {
        const instance = new Order();

        await instance.update({
          // @ts-expect-error primary key fields are not accepted on update, they are managed by dyna-record
          pk: "123"
        });

        await instance.update({
          // @ts-expect-error sort key fields are not accepted on update, they are managed by dyna-record
          sk: "456"
        });
      });

      it("does not require all of an entity attributes to be passed", async () => {
        const instance = new Order();

        await instance.update({
          // @ts-expect-no-error ForeignKey is of type string so it can be passed as such without casing to ForeignKey
          paymentMethodId: "123",
          // @ts-expect-no-error ForeignKey is of type string so it can be passed as such without casing to ForeignKey
          customerId: "456"
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
