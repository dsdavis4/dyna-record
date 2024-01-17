import { TransactWriteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import {
  ContactInformation,
  Customer,
  MockTable,
  Order,
  PaymentMethod,
  Pet
} from "./mockModels";
import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { ConditionalCheckFailedError } from "../../src/dynamo-utils";
import {
  Attribute,
  ForeignKeyAttribute,
  BelongsTo,
  Entity,
  HasMany,
  HasOne,
  NullableAttribute
} from "../../src/decorators";
import { type ForeignKey } from "../../src/types";

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
  @NullableAttribute({ alias: "MyAttribute" })
  public myAttribute?: string;
}

@Entity
class MockInformation extends MockTable {
  @Attribute({ alias: "Address" })
  public address: string;

  @Attribute({ alias: "Email" })
  public email: string;

  @NullableAttribute({ alias: "Phone" })
  public phone?: string;

  @NullableAttribute({ alias: "State" })
  public state?: string;
}

// TODO add types test, similiar to create but with optional properties
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
                Key: { PK: "ContactInformation#123", SK: "ContactInformation" },
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
                  "SET #Address = :Address, #Email = :Email, #UpdatedAt = :UpdatedAt REMOVE #State, #Phone"
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
          expect(e.constructor.name).toEqual("AggregateError");
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
          expect(e.constructor.name).toEqual("AggregateError");
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
          expect(e.constructor.name).toEqual("AggregateError");
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
          expect(e.constructor.name).toEqual("AggregateError");
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
          expect(e.constructor.name).toEqual("AggregateError");
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
                    // TODO should I make individual tests for each of thee that way its super clear in the description of the test "why" its important?
                    //      If so do this to all tests with transactions
                    //      But also keep the ones like this so order of operations is tested
                    //     ex: it("deletes old BelongsToLink for the entity that is no longer associated")
                    //       expect(mockTransactWriteCommand).toHaveBeenCalledWith(<block below>)
                    //      and this would be the only assertion
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
          expect(e.constructor.name).toEqual("AggregateError");
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
          expect(e.constructor.name).toEqual("AggregateError");
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
          expect(e.constructor.name).toEqual("AggregateError");
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
          expect(e.constructor.name).toEqual("AggregateError");
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
          expect(e.constructor.name).toEqual("AggregateError");
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

  describe("A model is updating mutiple ForeignKeys of different relationship types", () => {
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
      @Attribute({ alias: "Name" })
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

    it("can update foreign keys for an enitity that includes both HasMany and Belongs to relationships", async () => {
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
      expect.assertions(1);

      @Entity
      class MyModel extends MockTable {
        @Attribute({ alias: "MyAttribute" })
        public myAttribute: string;

        public someMethod(): string {
          return "abc123";
        }
      }

      try {
        await MyModel.update("123", {
          myAttribute: "someVal",
          // @ts-expect-error function attributes are not allowed
          someMethod: () => "123"
        });
      } catch (e) {
        expect(true).toEqual(true);
      }
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

    it("will not accept DefaultFields on update because they are managed by no-orm", async () => {
      await Order.update("123", {
        // @ts-expect-error default fields are not accepted on update, they are managed by no-orm
        id: "123"
      });

      await Order.update("123", {
        // @ts-expect-error default fields are not accepted on update, they are managed by no-orm
        type: "456"
      });

      await Order.update("123", {
        // @ts-expect-error default fields are not accepted on update, they are managed by no-orm
        createdAt: new Date()
      });

      await Order.update("123", {
        // @ts-expect-error default fields are not accepted on update, they are managed by no-orm
        updatedAt: new Date()
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
      await Order.update("123", {
        // @ts-expect-error non-nullable fields cannot be removed (set to null)
        paymentMethodId: null
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
