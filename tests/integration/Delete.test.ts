import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { MockTable } from "./mockModels";
import {
  Attribute,
  ForeignKeyAttribute,
  BelongsTo,
  Entity,
  HasMany,
  HasOne,
  NullableForeignKeyAttribute
} from "../../src/decorators";
import { TransactWriteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { ForeignKey, NullableForeignKey } from "../../src/types";
import { ConditionalCheckFailedError } from "../../src/dynamo-utils";
import { NullConstraintViolationError } from "../../src/errors";

const mockTransactWriteCommand = jest.mocked(TransactWriteCommand);
const mockedQueryCommand = jest.mocked(QueryCommand);

const mockSend = jest.fn();
const mockQuery = jest.fn();
const mockDelete = jest.fn();
const mockTransact = jest.fn();

@Entity
class Person extends MockTable {
  @Attribute({ alias: "Name" })
  public name: string;

  @HasMany(() => Pet, { foreignKey: "ownerId" })
  public pets: Pet[];

  @HasOne(() => Home, { foreignKey: "personId" })
  public home: Home;
}

@Entity
class Pet extends MockTable {
  @Attribute({ alias: "Name" })
  public name: string;

  @NullableForeignKeyAttribute({ alias: "OwnerId" })
  public ownerId?: NullableForeignKey;

  @BelongsTo(() => Person, { foreignKey: "ownerId" })
  public owner?: Person;
}

@Entity
class Home extends MockTable {
  @Attribute({ alias: "MLS#" })
  public mlsNum: string;

  @NullableForeignKeyAttribute({ alias: "PersonId" })
  public personId?: NullableForeignKey;

  @BelongsTo(() => Person, { foreignKey: "personId" })
  public person?: Person;

  @HasOne(() => Address, { foreignKey: "homeId" })
  public address: Address; // TODO if this is optional then it should not be able to be set to null...
}

@Entity
class Address extends MockTable {
  @Attribute({ alias: "State" })
  public state: string;

  @ForeignKeyAttribute({ alias: "HomeId" })
  public homeId: ForeignKey;

  @BelongsTo(() => Home, { foreignKey: "homeId" })
  public home: Home;

  @ForeignKeyAttribute({ alias: "PhoneBookId" })
  public phoneBookId: ForeignKey;

  @BelongsTo(() => PhoneBook, { foreignKey: "phoneBookId" })
  public phoneBook: PhoneBook;
}

@Entity
class PhoneBook extends MockTable {
  @Attribute({ alias: "Edition" })
  public edition: string;

  @HasMany(() => Address, { foreignKey: "phoneBookId" })
  public address: Address[];
}

@Entity
class MockModel extends MockTable {
  @Attribute({ alias: "MyVar1" })
  public myVar1: string;

  @Attribute({ alias: "MyVar2" })
  public myVar2: number;
}

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
            if (command.name === "QueryCommand") {
              return await Promise.resolve(mockQuery());
            }

            if (command.name === "DeleteCommand") {
              return await Promise.resolve(mockDelete());
            }

            if (command.name === "TransactWriteCommand") {
              return await Promise.resolve(mockTransact());
            }
          })
        };
      })
    },
    QueryCommand: jest.fn().mockImplementation(() => {
      return { name: "QueryCommand" };
    }),
    DeleteCommand: jest.fn().mockImplementation(() => {
      return { name: "DeleteCommand" };
    }),
    TransactWriteCommand: jest.fn().mockImplementation(() => {
      return { name: "TransactWriteCommand" };
    })
  };
});

describe("Delete", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("will delete an entity that has no relationships", async () => {
    expect.assertions(6);

    mockQuery.mockResolvedValueOnce({
      Items: [
        {
          PK: "MockModel#123",
          SK: "MockModel",
          Id: "123",
          Type: "MockModel",
          MyVar1: "MyVar1 val",
          MyVar2: 1
        }
      ]
    });

    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    const res = await MockModel.delete("123");

    expect(res).toEqual(undefined);
    expect(mockSend.mock.calls).toEqual([
      [{ name: "QueryCommand" }],
      [{ name: "TransactWriteCommand" }]
    ]);
    expect(mockQuery.mock.calls).toEqual([[]]);
    expect(mockedQueryCommand.mock.calls).toEqual([
      [
        {
          TableName: "mock-table",
          KeyConditionExpression: "#PK = :PK1",
          ExpressionAttributeNames: { "#PK": "PK" },
          ExpressionAttributeValues: { ":PK1": "MockModel#123" }
        }
      ]
    ]);
    expect(mockTransact.mock.calls).toEqual([[]]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Delete: {
                TableName: "mock-table",
                Key: { PK: "MockModel#123", SK: "MockModel" }
              }
            }
          ]
        }
      ]
    ]);
  });

  it("it will delete an entity that belongs to a relationship as HasMany (Removes BelongsToLink from related HasMany partition)", async () => {
    expect.assertions(6);

    mockQuery.mockResolvedValueOnce({
      Items: [
        {
          PK: "Pet#123",
          SK: "Pet",
          Id: "123",
          Type: "Pet",
          Name: "Fido",
          OwnerId: "456"
        }
      ]
    });

    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    const res = await Pet.delete("123");

    expect(res).toEqual(undefined);
    expect(mockSend.mock.calls).toEqual([
      [{ name: "QueryCommand" }],
      [{ name: "TransactWriteCommand" }]
    ]);
    expect(mockQuery.mock.calls).toEqual([[]]);
    expect(mockedQueryCommand.mock.calls).toEqual([
      [
        {
          TableName: "mock-table",
          KeyConditionExpression: "#PK = :PK1",
          ExpressionAttributeNames: { "#PK": "PK" },
          ExpressionAttributeValues: { ":PK1": "Pet#123" }
        }
      ]
    ]);
    expect(mockTransact.mock.calls).toEqual([[]]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Delete: {
                TableName: "mock-table",
                Key: { PK: "Pet#123", SK: "Pet" }
              }
            },
            {
              // Delete belongs to link for associated hasMany
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

  it("it will delete an entity that belongs to a relationship as HasOne (Removes BelongsToLink from related HasOne partition)", async () => {
    expect.assertions(6);

    mockQuery.mockResolvedValueOnce({
      Items: [
        {
          PK: "Home#123",
          SK: "Home",
          Id: "123",
          Type: "Home",
          "MLS#": "MLS-XXX",
          PersonId: "456"
        }
      ]
    });

    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    const res = await Home.delete("123");

    expect(res).toEqual(undefined);
    expect(mockSend.mock.calls).toEqual([
      [{ name: "QueryCommand" }],
      [{ name: "TransactWriteCommand" }]
    ]);
    expect(mockQuery.mock.calls).toEqual([[]]);
    expect(mockedQueryCommand.mock.calls).toEqual([
      [
        {
          TableName: "mock-table",
          KeyConditionExpression: "#PK = :PK1",
          ExpressionAttributeNames: { "#PK": "PK" },
          ExpressionAttributeValues: { ":PK1": "Home#123" }
        }
      ]
    ]);
    expect(mockTransact.mock.calls).toEqual([[]]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Delete: {
                TableName: "mock-table",
                Key: { PK: "Home#123", SK: "Home" }
              }
            },
            {
              // Delete belongs to link for associated HasOne
              Delete: {
                TableName: "mock-table",
                Key: { PK: "Person#456", SK: "Home" }
              }
            }
          ]
        }
      ]
    ]);
  });

  it("will remove the foreign key attribute on any the HasMany or HasOne entities that belong to it", async () => {
    expect.assertions(6);

    mockQuery.mockResolvedValueOnce({
      Items: [
        {
          PK: "Person#123",
          SK: "Person",
          Id: "123",
          Type: "Person",
          Name: "Jon Doe",
          CreatedAt: "2021-10-15T08:31:15.148Z",
          UpdatedAt: "2022-10-15T08:31:15.148Z"
        },
        // HasMany Pets
        {
          PK: "Person#123",
          SK: "Pet#111",
          Id: "001",
          Type: "BelongsToLink",
          ForeignEntityType: "Pet",
          ForeignKey: "111",
          CreatedAt: "2021-10-15T09:31:15.148Z",
          UpdatedAt: "2022-10-15T09:31:15.148Z"
        },
        // HasOne Home
        {
          PK: "Person#123",
          SK: "Home",
          Id: "002",
          Type: "BelongsToLink",
          ForeignEntityType: "Home",
          ForeignKey: "222",
          CreatedAt: "2021-10-15T09:31:15.148Z",
          UpdatedAt: "2022-10-15T09:31:15.148Z"
        }
      ]
    });

    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    const res = await Person.delete("123");

    expect(res).toEqual(undefined);
    expect(mockSend.mock.calls).toEqual([
      [{ name: "QueryCommand" }],
      [{ name: "TransactWriteCommand" }]
    ]);
    expect(mockQuery.mock.calls).toEqual([[]]);
    expect(mockedQueryCommand.mock.calls).toEqual([
      [
        {
          TableName: "mock-table",
          KeyConditionExpression: "#PK = :PK1",
          ExpressionAttributeNames: { "#PK": "PK" },
          ExpressionAttributeValues: { ":PK1": "Person#123" }
        }
      ]
    ]);
    expect(mockTransact.mock.calls).toEqual([[]]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              // Delete Item
              Delete: {
                TableName: "mock-table",
                Key: { PK: "Person#123", SK: "Person" }
              }
            },
            {
              // Delete BelongsToLink for HasMany
              Delete: {
                TableName: "mock-table",
                Key: { PK: "Person#123", SK: "Pet#111" }
              }
            },
            {
              // Remove ForeignKey id for HasMany link
              Update: {
                TableName: "mock-table",
                Key: { PK: "Pet#111", SK: "Pet" },
                ExpressionAttributeNames: { "#OwnerId": "OwnerId" },
                UpdateExpression: "REMOVE #OwnerId"
              }
            },
            {
              // Delete BelongsToLink for HasOne
              Delete: {
                TableName: "mock-table",
                Key: { PK: "Person#123", SK: "Home" }
              }
            },
            {
              // Remove ForeignKey id for HasOne link
              Update: {
                TableName: "mock-table",
                Key: { PK: "Home#222", SK: "Home" },
                ExpressionAttributeNames: { "#PersonId": "PersonId" },
                UpdateExpression: "REMOVE #PersonId"
              }
            }
          ]
        }
      ]
    ]);
  });

  describe("error handling", () => {
    it("will throw an error if the entity being deleted does not exist", async () => {
      expect.assertions(6);

      mockQuery.mockResolvedValueOnce({
        Items: []
      });

      try {
        await Person.delete("123");
      } catch (e) {
        expect(e).toEqual(new Error("Item does not exist: 123"));
        expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
        expect(mockQuery.mock.calls).toEqual([[]]);
        expect(mockedQueryCommand.mock.calls).toEqual([
          [
            {
              TableName: "mock-table",
              KeyConditionExpression: "#PK = :PK1",
              ExpressionAttributeNames: { "#PK": "PK" },
              ExpressionAttributeValues: { ":PK1": "Person#123" }
            }
          ]
        ]);
        expect(mockTransact.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([]);
      }
    });

    it("will throw an error if it fails to delete the entity", async () => {
      expect.assertions(7);

      mockQuery.mockResolvedValueOnce({
        Items: [
          {
            PK: "MockModel#123",
            SK: "MockModel",
            Id: "123",
            Type: "MockModel",
            MyVar1: "val",
            MyVar2: 1
          }
        ]
      });

      mockSend.mockReturnValueOnce(undefined).mockImplementationOnce(() => {
        mockTransact();
        throw new TransactionCanceledException({
          message: "MockMessage",
          CancellationReasons: [{ Code: "ConditionalCheckFailed" }],
          $metadata: {}
        });
      });

      try {
        await MockModel.delete("123");
      } catch (e: any) {
        expect(e.constructor.name).toEqual("AggregateError");
        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Failed to delete MockModel with Id: 123"
          )
        ]);
        expect(mockSend.mock.calls).toEqual([
          [{ name: "QueryCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockQuery.mock.calls).toEqual([[]]);
        expect(mockedQueryCommand.mock.calls).toEqual([
          [
            {
              TableName: "mock-table",
              KeyConditionExpression: "#PK = :PK1",
              ExpressionAttributeNames: { "#PK": "PK" },
              ExpressionAttributeValues: { ":PK1": "MockModel#123" }
            }
          ]
        ]);
        expect(mockTransact.mock.calls).toEqual([[]]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                {
                  Delete: {
                    TableName: "mock-table",
                    Key: { PK: "MockModel#123", SK: "MockModel" }
                  }
                }
              ]
            }
          ]
        ]);
      }
    });

    it("will throw an error if it fails to delete BelongsToLink for HasMany", async () => {
      expect.assertions(7);

      mockQuery.mockResolvedValueOnce({
        Items: [
          {
            PK: "Pet#123",
            SK: "Pet",
            Id: "123",
            Type: "Pet",
            Name: "Fido",
            OwnerId: "456"
          }
        ]
      });

      mockSend.mockReturnValueOnce(undefined).mockImplementationOnce(() => {
        mockTransact();
        throw new TransactionCanceledException({
          message: "MockMessage",
          CancellationReasons: [
            { Code: "None" },
            { Code: "ConditionalCheckFailed" }
          ],
          $metadata: {}
        });
      });

      try {
        await Pet.delete("123");
      } catch (e: any) {
        expect(e.constructor.name).toEqual("AggregateError");
        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            'ConditionalCheckFailed: Failed to delete BelongsToLink with keys: {"pk":"Person#456","sk":"Pet#123"}'
          )
        ]);
        expect(mockSend.mock.calls).toEqual([
          [{ name: "QueryCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockQuery.mock.calls).toEqual([[]]);
        expect(mockedQueryCommand.mock.calls).toEqual([
          [
            {
              TableName: "mock-table",
              KeyConditionExpression: "#PK = :PK1",
              ExpressionAttributeNames: { "#PK": "PK" },
              ExpressionAttributeValues: { ":PK1": "Pet#123" }
            }
          ]
        ]);
        expect(mockTransact.mock.calls).toEqual([[]]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                {
                  Delete: {
                    TableName: "mock-table",
                    Key: { PK: "Pet#123", SK: "Pet" }
                  }
                },
                {
                  // Delete belongs to link for associated hasMany
                  Delete: {
                    TableName: "mock-table",
                    Key: { PK: "Person#456", SK: "Pet#123" }
                  }
                }
              ]
            }
          ]
        ]);
      }
    });

    it("will throw an error if it fails to delete BelongsToLink for HasOne", async () => {
      expect.assertions(7);

      mockQuery.mockResolvedValueOnce({
        Items: [
          {
            PK: "Home#123",
            SK: "Home",
            Id: "123",
            Type: "Home",
            "MLS#": "MLS-XXX",
            PersonId: "456"
          }
        ]
      });

      mockSend.mockReturnValueOnce(undefined).mockImplementationOnce(() => {
        mockTransact();
        throw new TransactionCanceledException({
          message: "MockMessage",
          CancellationReasons: [
            { Code: "None" },
            { Code: "ConditionalCheckFailed" }
          ],
          $metadata: {}
        });
      });

      try {
        await Home.delete("123");
      } catch (e: any) {
        expect(e.constructor.name).toEqual("AggregateError");
        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            'ConditionalCheckFailed: Failed to delete BelongsToLink with keys: {"pk":"Person#456","sk":"Home"}'
          )
        ]);
        expect(mockSend.mock.calls).toEqual([
          [{ name: "QueryCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockQuery.mock.calls).toEqual([[]]);
        expect(mockedQueryCommand.mock.calls).toEqual([
          [
            {
              TableName: "mock-table",
              KeyConditionExpression: "#PK = :PK1",
              ExpressionAttributeNames: { "#PK": "PK" },
              ExpressionAttributeValues: { ":PK1": "Home#123" }
            }
          ]
        ]);
        expect(mockTransact.mock.calls).toEqual([[]]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                {
                  Delete: {
                    TableName: "mock-table",
                    Key: { PK: "Home#123", SK: "Home" }
                  }
                },
                {
                  // Delete belongs to link for associated HasOne
                  Delete: {
                    TableName: "mock-table",
                    Key: { PK: "Person#456", SK: "Home" }
                  }
                }
              ]
            }
          ]
        ]);
      }
    });

    it("will throw an error if it fails to remove the foreign key attribute from items which belong to the entity as HasMany or HasOne", async () => {
      expect.assertions(7);

      mockQuery.mockResolvedValueOnce({
        Items: [
          {
            PK: "Person#123",
            SK: "Person",
            Id: "123",
            Type: "Person",
            Name: "Jon Doe",
            CreatedAt: "2021-10-15T08:31:15.148Z",
            UpdatedAt: "2022-10-15T08:31:15.148Z"
          },
          // HasMany Pets
          {
            PK: "Person#123",
            SK: "Pet#111",
            Id: "001",
            Type: "BelongsToLink",
            ForeignEntityType: "Pet",
            ForeignKey: "111",
            CreatedAt: "2021-10-15T09:31:15.148Z",
            UpdatedAt: "2022-10-15T09:31:15.148Z"
          },
          // HasOne Home
          {
            PK: "Person#123",
            SK: "Home",
            Id: "002",
            Type: "BelongsToLink",
            ForeignEntityType: "Home",
            ForeignKey: "222",
            CreatedAt: "2021-10-15T09:31:15.148Z",
            UpdatedAt: "2022-10-15T09:31:15.148Z"
          }
        ]
      });

      mockSend.mockReturnValueOnce(undefined).mockImplementationOnce(() => {
        mockTransact();
        throw new TransactionCanceledException({
          message: "MockMessage",
          CancellationReasons: [
            { Code: "None" },
            { Code: "None" },
            { Code: "ConditionalCheckFailed" },
            { Code: "None" },
            { Code: "ConditionalCheckFailed" }
          ],
          $metadata: {}
        });
      });

      try {
        await Person.delete("123");
      } catch (e: any) {
        expect(e.constructor.name).toEqual("AggregateError");
        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Failed to remove foreign key attribute from Pet with Id: 111"
          ),
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Failed to remove foreign key attribute from Home with Id: 222"
          )
        ]);
        expect(mockSend.mock.calls).toEqual([
          [{ name: "QueryCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockQuery.mock.calls).toEqual([[]]);
        expect(mockedQueryCommand.mock.calls).toEqual([
          [
            {
              TableName: "mock-table",
              KeyConditionExpression: "#PK = :PK1",
              ExpressionAttributeNames: { "#PK": "PK" },
              ExpressionAttributeValues: { ":PK1": "Person#123" }
            }
          ]
        ]);
        expect(mockTransact.mock.calls).toEqual([[]]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                {
                  // Delete Item
                  Delete: {
                    TableName: "mock-table",
                    Key: { PK: "Person#123", SK: "Person" }
                  }
                },
                {
                  // Delete BelongsToLink for HasMany
                  Delete: {
                    TableName: "mock-table",
                    Key: { PK: "Person#123", SK: "Pet#111" }
                  }
                },
                {
                  // Remove ForeignKey id for HasMany link
                  Update: {
                    TableName: "mock-table",
                    Key: { PK: "Pet#111", SK: "Pet" },
                    ExpressionAttributeNames: { "#OwnerId": "OwnerId" },
                    UpdateExpression: "REMOVE #OwnerId"
                  }
                },
                {
                  // Delete BelongsToLink for HasOne
                  Delete: {
                    TableName: "mock-table",
                    Key: { PK: "Person#123", SK: "Home" }
                  }
                },
                {
                  // Remove ForeignKey id for HasOne link
                  Update: {
                    TableName: "mock-table",
                    Key: { PK: "Home#222", SK: "Home" },
                    ExpressionAttributeNames: { "#PersonId": "PersonId" },
                    UpdateExpression: "REMOVE #PersonId"
                  }
                }
              ]
            }
          ]
        ]);
      }
    });

    it("will throw NullConstraintViolationError error if its trying to unlink a HasMany association (nullify the foreign key) on a related entity that is linked by a NullableForeignKey", async () => {
      expect.assertions(7);

      mockQuery.mockResolvedValueOnce({
        Items: [
          {
            PK: "PhoneBook#123",
            SK: "PhoneBook",
            Id: "123",
            Type: "PhoneBook",
            State: "CO",
            CreatedAt: "2021-10-15T08:31:15.148Z",
            UpdatedAt: "2022-10-15T08:31:15.148Z"
          },
          // HasOne Address
          {
            PK: "PhoneBook#123",
            SK: "Address",
            Id: "002",
            Type: "BelongsToLink",
            ForeignEntityType: "Address",
            ForeignKey: "123",
            CreatedAt: "2021-10-15T09:31:15.148Z",
            UpdatedAt: "2022-10-15T09:31:15.148Z"
          },
          {
            PK: "PhoneBook#123",
            SK: "Address",
            Id: "003",
            Type: "BelongsToLink",
            ForeignEntityType: "Address",
            ForeignKey: "123",
            CreatedAt: "2021-10-15T09:31:15.148Z",
            UpdatedAt: "2022-10-15T09:31:15.148Z"
          }
        ]
      });

      try {
        await PhoneBook.delete("123");
      } catch (e: any) {
        expect(e.constructor.name).toEqual("AggregateError");
        expect(e.errors).toEqual([
          new NullConstraintViolationError(
            `Cannot set Address with id: '002' attribute 'phoneBookId' to null`
          ),
          new NullConstraintViolationError(
            `Cannot set Address with id: '003' attribute 'phoneBookId' to null`
          )
        ]);
        expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
        expect(mockQuery.mock.calls).toEqual([[]]);
        expect(mockedQueryCommand.mock.calls).toEqual([
          [
            {
              ExpressionAttributeNames: {
                "#PK": "PK"
              },
              ExpressionAttributeValues: {
                ":PK1": "PhoneBook#123"
              },
              KeyConditionExpression: "#PK = :PK1",
              TableName: "mock-table"
            }
          ]
        ]);
        expect(mockTransact.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([]);
      }
    });

    it.skip("TODO should haandle this, its the opposite of the test above", () => {
      // TODO What to do here? The Phonebook has address as not nullable... do I need to catch this via a validation?
      //      If so I need to enforce it via types
      // await Address.delete("123")
    });

    it("will throw NullConstraintViolationError error if its trying to unlink a HasOne association (nullify the foreign key) on a related entity that is linked by a NullableForeignKey", async () => {
      expect.assertions(7);

      mockQuery.mockResolvedValueOnce({
        Items: [
          {
            PK: "Home#123",
            SK: "Home",
            Id: "123",
            Type: "Home",
            State: "CO",
            CreatedAt: "2021-10-15T08:31:15.148Z",
            UpdatedAt: "2022-10-15T08:31:15.148Z"
          },
          // HasOne Address
          {
            PK: "Home#123",
            SK: "Address",
            Id: "002",
            Type: "BelongsToLink",
            ForeignEntityType: "Address",
            ForeignKey: "123",
            CreatedAt: "2021-10-15T09:31:15.148Z",
            UpdatedAt: "2022-10-15T09:31:15.148Z"
          }
        ]
      });

      try {
        await Home.delete("123");
      } catch (e: any) {
        expect(e.constructor.name).toEqual("AggregateError");
        expect(e.errors).toEqual([
          new NullConstraintViolationError(
            `Cannot set Address with id: '002' attribute 'homeId' to null`
          )
        ]);
        expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
        expect(mockQuery.mock.calls).toEqual([[]]);
        expect(mockedQueryCommand.mock.calls).toEqual([
          [
            {
              ExpressionAttributeNames: {
                "#PK": "PK"
              },
              ExpressionAttributeValues: {
                ":PK1": "Home#123"
              },
              KeyConditionExpression: "#PK = :PK1",
              TableName: "mock-table"
            }
          ]
        ]);
        expect(mockTransact.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([]);
      }
    });

    // What if the attribute on the other side is set as not optional?
    it.skip("TODO should allow entities to be deleted", () => {
      // await Address.delete("")
      // Deleting an address should be ok ... right?
    });

    it("will throw an error if it fails to delete BelongsToLinks in its own partition", async () => {
      expect.assertions(7);

      mockQuery.mockResolvedValueOnce({
        Items: [
          {
            PK: "Person#123",
            SK: "Person",
            Id: "123",
            Type: "Person",
            Name: "Jon Doe",
            CreatedAt: "2021-10-15T08:31:15.148Z",
            UpdatedAt: "2022-10-15T08:31:15.148Z"
          },
          // HasMany Pets
          {
            PK: "Person#123",
            SK: "Pet#111",
            Id: "001",
            Type: "BelongsToLink",
            ForeignEntityType: "Pet",
            ForeignKey: "111",
            CreatedAt: "2021-10-15T09:31:15.148Z",
            UpdatedAt: "2022-10-15T09:31:15.148Z"
          },
          // HasOne Home
          {
            PK: "Person#123",
            SK: "Home",
            Id: "002",
            Type: "BelongsToLink",
            ForeignEntityType: "Home",
            ForeignKey: "222",
            CreatedAt: "2021-10-15T09:31:15.148Z",
            UpdatedAt: "2022-10-15T09:31:15.148Z"
          }
        ]
      });

      mockSend.mockReturnValueOnce(undefined).mockImplementationOnce(() => {
        mockTransact();
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
        await Person.delete("123");
      } catch (e: any) {
        expect(e.constructor.name).toEqual("AggregateError");
        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            'ConditionalCheckFailed: Failed to delete BelongsToLink with keys: {"pk":"Person#123","sk":"Pet#111"}'
          ),
          new ConditionalCheckFailedError(
            'ConditionalCheckFailed: Failed to delete BelongsToLink with keys: {"pk":"Person#123","sk":"Home"}'
          )
        ]);
        expect(mockSend.mock.calls).toEqual([
          [{ name: "QueryCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockQuery.mock.calls).toEqual([[]]);
        expect(mockedQueryCommand.mock.calls).toEqual([
          [
            {
              TableName: "mock-table",
              KeyConditionExpression: "#PK = :PK1",
              ExpressionAttributeNames: { "#PK": "PK" },
              ExpressionAttributeValues: { ":PK1": "Person#123" }
            }
          ]
        ]);
        expect(mockTransact.mock.calls).toEqual([[]]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                {
                  // Delete Item
                  Delete: {
                    TableName: "mock-table",
                    Key: { PK: "Person#123", SK: "Person" }
                  }
                },
                {
                  // Delete BelongsToLink for HasMany
                  Delete: {
                    TableName: "mock-table",
                    Key: { PK: "Person#123", SK: "Pet#111" }
                  }
                },
                {
                  // Remove ForeignKey id for HasMany link
                  Update: {
                    TableName: "mock-table",
                    Key: { PK: "Pet#111", SK: "Pet" },
                    ExpressionAttributeNames: { "#OwnerId": "OwnerId" },
                    UpdateExpression: "REMOVE #OwnerId"
                  }
                },
                {
                  // Delete BelongsToLink for HasOne
                  Delete: {
                    TableName: "mock-table",
                    Key: { PK: "Person#123", SK: "Home" }
                  }
                },
                {
                  // Remove ForeignKey id for HasOne link
                  Update: {
                    TableName: "mock-table",
                    Key: { PK: "Home#222", SK: "Home" },
                    ExpressionAttributeNames: { "#PersonId": "PersonId" },
                    UpdateExpression: "REMOVE #PersonId"
                  }
                }
              ]
            }
          ]
        ]);
      }
    });
  });

  describe("types", () => {
    it("accepts a string as id", async () => {
      mockQuery.mockResolvedValueOnce({
        Items: [{}]
      });

      // @ts-expect-no-error Accepts a string as id
      await MockModel.delete("id");
    });
  });
});
