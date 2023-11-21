import { TransactWriteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import {
  ContactInformation,
  Customer,
  MockTable,
  Order,
  PaymentMethodProvider
} from "./mockModels";
import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { ConditionalCheckFailedError } from "../../src/dynamo-utils";

// TODO start here
// After wrting tests, refactor and dry everything up.
// and clean up

jest.mock("uuid");

const mockTransactWriteCommand = jest.mocked(TransactWriteCommand);
const mockedGetCommand = jest.mocked(GetCommand);

const mockSend = jest.fn();
const mockGet = jest.fn();
const mockTransact = jest.fn(); // TODO is this used?

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

  describe("ForeignKey is updated for entity which BelongsTo an entity who HasOne of it", () => {
    describe("when the entity does not already belong to another entity", () => {
      beforeEach(() => {
        jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
        mockedUuidv4.mockReturnValueOnce("belongsToLinkId1");
        mockGet.mockResolvedValue({
          Item: {
            PK: "ContactInformation#123",
            SK: "ContactInformation",
            Email: "old-email@example.com",
            Phone: "555-555-5555",
            CustomerId: undefined // Does not already belong to custom
          }
        });
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

      it("will throw an error if the entity is already associated with the requested entity", async () => {
        expect.assertions(7);

        mockSend.mockReturnValueOnce(undefined).mockImplementationOnce(() => {
          mockTransact();
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
    });

    describe("when the entity belongs to another another entity (Adds delete of existing BelongsToLink)", () => {
      beforeEach(() => {
        jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
        mockedUuidv4.mockReturnValueOnce("belongsToLinkId1");
        mockGet.mockResolvedValue({
          Item: {
            PK: "ContactInformation#123",
            SK: "ContactInformation",
            Email: "old-email@example.com",
            Phone: "555-555-5555",
            CustomerId: "789" // Already belongs to custom
          }
        });
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
    });
  });

  // TODO has many
});
