import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import {
  MockTable,
  Person,
  Pet,
  Home,
  PhoneBook,
  Book,
  User,
  type Author,
  type Website,
  type Address
} from "./mockModels";
import { Entity, NumberAttribute, StringAttribute } from "../../src/decorators";
import { TransactWriteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedError } from "../../src/dynamo-utils";
import { NotFoundError, NullConstraintViolationError } from "../../src/errors";
import { type MockTableEntityTableItem } from "./utils";

/**
 * The testing type util does not support converting MLS# so set it here
 */
type HomeTableItem = Omit<MockTableEntityTableItem<Home>, "MlsNum"> & {
  "MLS#": string;
};

/**
 * The testing type util does not support account for ownerId and PersonId not being pascal cased versions of each other
 */
type BookTableItem = Omit<MockTableEntityTableItem<Book>, "OwnerId"> & {
  PersonId: string;
};

const mockTransactWriteCommand = jest.mocked(TransactWriteCommand);
const mockedQueryCommand = jest.mocked(QueryCommand);

const mockSend = jest.fn();
const mockQuery = jest.fn();
const mockDelete = jest.fn();
const mockTransact = jest.fn();

@Entity
class MockModel extends MockTable {
  @StringAttribute({ alias: "MyVar1" })
  public myVar1: string;

  @NumberAttribute({ alias: "MyVar2" })
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

    const mockModel: MockTableEntityTableItem<MockModel> = {
      PK: "MockModel#123",
      SK: "MockModel",
      Id: "123",
      Type: "MockModel",
      MyVar1: "MyVar1 val",
      MyVar2: 1,
      CreatedAt: "2022-09-02T23:31:21.148Z",
      UpdatedAt: "2022-09-03T23:31:21.148Z"
    };

    mockQuery.mockResolvedValueOnce({
      Items: [mockModel]
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

  it("it will delete an entity that belongs to a relationship as HasMany (Removes denormalized link from related HasMany partition)", async () => {
    expect.assertions(6);

    const pet: MockTableEntityTableItem<Pet> = {
      PK: "Pet#123",
      SK: "Pet",
      Id: "123",
      Type: "Pet",
      Name: "Fido",
      OwnerId: "456",
      CreatedAt: "2022-09-02T23:31:21.148Z",
      UpdatedAt: "2022-09-03T23:31:21.148Z"
    };

    mockQuery.mockResolvedValueOnce({
      Items: [pet]
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

  it("it will delete an entity that belongs to a relationship as HasOne (Removes denormalized link from related HasOne partition)", async () => {
    expect.assertions(6);

    const home: HomeTableItem = {
      PK: "Home#123",
      SK: "Home",
      Id: "123",
      Type: "Home",
      "MLS#": "MLS-XXX",
      PersonId: "456",
      CreatedAt: "2022-09-02T23:31:21.148Z",
      UpdatedAt: "2022-09-03T23:31:21.148Z"
    };

    mockQuery.mockResolvedValueOnce({
      Items: [home]
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

  it("will remove the foreign key attribute on any of the HasMany or HasOne entities that belong to it", async () => {
    expect.assertions(6);

    const person: MockTableEntityTableItem<Person> = {
      PK: "Person#123",
      SK: "Person",
      Id: "123",
      Type: "Person",
      Name: "Jon Doe",
      CreatedAt: "2021-10-14T08:31:15.148Z",
      UpdatedAt: "2022-10-15T08:31:15.148Z"
    };

    const pet: MockTableEntityTableItem<Pet> = {
      PK: "Person#123",
      SK: "Pet#001",
      Id: "001",
      Type: "Pet",
      Name: "Pet-1",
      OwnerId: person.Id,
      CreatedAt: "2021-10-16T09:31:15.148Z",
      UpdatedAt: "2022-10-17T09:31:15.148Z"
    };

    const home: HomeTableItem = {
      PK: "Person#123",
      SK: "Home",
      Id: "002",
      Type: "Home",
      PersonId: person.Id,
      "MLS#": "ABC123",
      CreatedAt: "2021-10-15T09:31:15.148Z",
      UpdatedAt: "2022-10-15T09:31:15.148Z"
    };

    mockQuery.mockResolvedValueOnce({
      Items: [
        person,
        // HasMany Pets
        pet,
        // HasOne Home
        home
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
            // (HasMany) Delete denormalized Pet from Person partition
            {
              Delete: {
                TableName: "mock-table",
                Key: { PK: "Person#123", SK: "Pet#001" }
              }
            },
            // (HasMany) Remove the nullable foreign key from Pet item
            // TODO this will need to go find all denormalized pet records and update...
            // Could I leverage logic within update?
            {
              Update: {
                TableName: "mock-table",
                Key: { PK: "Pet#001", SK: "Pet" },
                ExpressionAttributeNames: {
                  "#OwnerId": "OwnerId"
                },
                UpdateExpression: "REMOVE #OwnerId"
              }
            },
            {
              // (HasMany) - Delete the Person record from the Pet partition
              Delete: {
                TableName: "mock-table",
                Key: { PK: "Pet#001", SK: "Person" }
              }
            },
            {
              // (HasOne) Delete denormalized Home from Person partition
              Delete: {
                TableName: "mock-table",
                Key: { PK: "Person#123", SK: "Home" }
              }
            },
            {
              // (HasOne) Remove the nullable foreign key from Home item
              // TODO this will need to go find all denormalized home records and update...
              Update: {
                TableName: "mock-table",
                Key: { PK: "Home#002", SK: "Home" },
                ExpressionAttributeNames: {
                  "#PersonId": "PersonId"
                },
                UpdateExpression: "REMOVE #PersonId"
              }
            },
            {
              // (HasOne) Delete denormalized Person from Home partition
              Delete: {
                TableName: "mock-table",
                Key: { PK: "Home", SK: "Person" }
              }
            }
          ]
        }
      ]
    ]);
  });

  it("will delete an entity from a HasAndBelongsToMany relationship", async () => {
    expect.assertions(6);

    const book: MockTableEntityTableItem<Book> = {
      PK: "Book#123",
      SK: "Book",
      Id: "123",
      Type: "Book",
      Name: "Some Name",
      NumPages: 100,
      CreatedAt: "2021-10-15T08:31:15.148Z",
      UpdatedAt: "2022-10-15T08:31:15.148Z"
    };

    const author: MockTableEntityTableItem<Author> = {
      PK: "Book#123",
      SK: "Author#456",
      Id: "456",
      Type: "Author",
      Name: "Author-1",
      CreatedAt: "2024-02-27T03:19:52.667Z",
      UpdatedAt: "2024-02-27T03:19:52.667Z"
    };

    mockQuery.mockResolvedValueOnce({
      Items: [book, author]
    });

    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    const res = await Book.delete("123");

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
          ExpressionAttributeValues: { ":PK1": "Book#123" }
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
                Key: { PK: "Book#123", SK: "Book" },
                TableName: "mock-table"
              }
            },
            // Delete denormalized records
            {
              Delete: {
                Key: { PK: "Book#123", SK: "Author#456" },
                TableName: "mock-table"
              }
            },
            {
              Delete: {
                Key: { PK: "Author#456", SK: "Book#123" },
                TableName: "mock-table"
              }
            }
          ]
        }
      ]
    ]);
  });

  it("will delete an entity from a HasAndBelongsToMany relationship and a BelongsTo -> HasMany relationship", async () => {
    expect.assertions(6);

    // Belongs to as HasOne
    const owner: MockTableEntityTableItem<Person> = {
      PK: "Book#123",
      SK: "Person",
      Id: "789",
      Type: "Person",
      Name: "Person-1",
      CreatedAt: "2024-02-27T03:19:52.667Z",
      UpdatedAt: "2024-02-27T03:19:52.667Z"
    };

    // Entity being deleted
    const book: BookTableItem = {
      PK: "Book#123",
      SK: "Book",
      Id: "123",
      PersonId: owner.Id,
      Type: "Book",
      Name: "Some Name",
      NumPages: 100,
      CreatedAt: "2021-10-15T08:31:15.148Z",
      UpdatedAt: "2022-10-15T08:31:15.148Z"
    };

    // Belongs to via HasAndBelongsToMany
    const author: MockTableEntityTableItem<Author> = {
      PK: "Book#123",
      SK: "Author#456",
      Id: "456",
      Type: "Author",
      Name: "Author-1",
      CreatedAt: "2024-02-27T03:19:52.667Z",
      UpdatedAt: "2024-02-27T03:19:52.667Z"
    };

    mockQuery.mockResolvedValueOnce({
      Items: [book, author, owner]
    });

    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    const res = await Book.delete("123");

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
          ExpressionAttributeValues: { ":PK1": "Book#123" }
        }
      ]
    ]);
    expect(mockTransact.mock.calls).toEqual([[]]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              // Delete the book
              Delete: {
                Key: { PK: "Book#123", SK: "Book" },
                TableName: "mock-table"
              }
            },
            // Delete the denormalized Book from Person partition
            {
              Delete: {
                Key: { PK: "Person#789", SK: "Book#123" },
                TableName: "mock-table"
              }
            },
            // Delete first AuthorBook JoinTable entry
            {
              Delete: {
                Key: { PK: "Book#123", SK: "Author#456" },
                TableName: "mock-table"
              }
            },
            // Delete second AuthorBook JoinTable entry
            {
              Delete: {
                Key: { PK: "Author#456", SK: "Book#123" },
                TableName: "mock-table"
              }
            },
            {
              // Delete Person from Book partition
              Delete: {
                Key: { PK: "Book#123", SK: "Person" },
                TableName: "mock-table"
              }
            }
          ]
        }
      ]
    ]);
  });

  it("with custom id field - will delete an entity from a HasAndBelongsToMany relationship and a BelongsTo -> HasMany relationship", async () => {
    expect.assertions(6);

    const user: MockTableEntityTableItem<User> = {
      PK: "User#email@email.com",
      SK: "User",
      Id: "email@email.com",
      Type: "User",
      Name: "Some Name",
      Email: "test@test.com",
      CreatedAt: "2021-10-15T08:31:15.148Z",
      UpdatedAt: "2022-10-15T08:31:15.148Z"
    };

    const website: MockTableEntityTableItem<Website> = {
      PK: "User#email@email.com",
      SK: "Website#456",
      Id: "456",
      Type: "Website",
      Name: "Website-1",
      CreatedAt: "2024-02-27T03:19:52.667Z",
      UpdatedAt: "2024-02-27T03:19:52.667Z"
    };

    mockQuery.mockResolvedValueOnce({
      Items: [user, website]
    });

    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    const res = await User.delete("email@email.com");

    expect(res).toEqual(undefined);
    expect(mockSend.mock.calls).toEqual([
      [{ name: "QueryCommand" }],
      [{ name: "TransactWriteCommand" }]
    ]);
    expect(mockQuery.mock.calls).toEqual([[]]);
    expect(mockedQueryCommand.mock.calls).toEqual([
      [
        {
          ExpressionAttributeValues: { ":PK1": "User#email@email.com" },
          ExpressionAttributeNames: { "#PK": "PK" },
          KeyConditionExpression: "#PK = :PK1",
          TableName: "mock-table"
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
                Key: { PK: "User#email@email.com", SK: "User" },
                TableName: "mock-table"
              }
            },
            {
              Delete: {
                Key: { PK: "User#email@email.com", SK: "Website#456" },
                TableName: "mock-table"
              }
            },
            {
              Delete: {
                Key: { PK: "Website#456", SK: "User#email@email.com" },
                TableName: "mock-table"
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
        expect(e).toEqual(new NotFoundError("Item does not exist: 123"));
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

      const mockModel: MockTableEntityTableItem<MockModel> = {
        PK: "MockModel#123",
        SK: "MockModel",
        Id: "123",
        Type: "MockModel",
        MyVar1: "val",
        MyVar2: 1,
        CreatedAt: "2024-02-27T03:19:52.667Z",
        UpdatedAt: "2024-02-27T03:19:52.667Z"
      };

      mockQuery.mockResolvedValueOnce({
        Items: [mockModel]
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
        expect(e.constructor.name).toEqual("TransactionWriteFailedError");
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
        expect(e.constructor.name).toEqual("TransactionWriteFailedError");
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

    // TODO check that this is accurate.... does it need to have links returned?
    it("will throw an error if it fails to delete BelongsToLink for HasOne", async () => {
      expect.assertions(7);

      const home: HomeTableItem = {
        PK: "Home#123",
        SK: "Home",
        Id: "123",
        Type: "Home",
        "MLS#": "MLS-XXX",
        PersonId: "456",
        CreatedAt: "2022-09-02T23:31:21.148Z",
        UpdatedAt: "2022-09-03T23:31:21.148Z"
      };

      mockQuery.mockResolvedValueOnce({
        Items: [home]
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
        expect(e.constructor.name).toEqual("TransactionWriteFailedError");
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

      const person: MockTableEntityTableItem<Person> = {
        PK: "Person#123",
        SK: "Person",
        Id: "123",
        Type: "Person",
        Name: "Jon Doe",
        CreatedAt: "2021-10-14T08:31:15.148Z",
        UpdatedAt: "2022-10-15T08:31:15.148Z"
      };

      const pet: MockTableEntityTableItem<Pet> = {
        PK: "Person#123",
        SK: "Pet#001",
        Id: "001",
        Type: "Pet",
        Name: "Pet-1",
        OwnerId: person.Id,
        CreatedAt: "2021-10-16T09:31:15.148Z",
        UpdatedAt: "2022-10-17T09:31:15.148Z"
      };

      const home: HomeTableItem = {
        PK: "Person#123",
        SK: "Home",
        Id: "002",
        Type: "Home",
        PersonId: person.Id,
        "MLS#": "ABC123",
        CreatedAt: "2021-10-15T09:31:15.148Z",
        UpdatedAt: "2022-10-15T09:31:15.148Z"
      };

      mockQuery.mockResolvedValueOnce({
        Items: [
          person,
          // HasMany Pets
          pet,
          // HasOne Home
          home
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
        expect(e.constructor.name).toEqual("TransactionWriteFailedError");
        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Failed to remove foreign key attribute from Pet with Id: 001"
          ),
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Failed to remove foreign key attribute from Home with Id: 002"
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
                // (HasMany) Delete denormalized Pet from Person partition
                {
                  Delete: {
                    TableName: "mock-table",
                    Key: { PK: "Person#123", SK: "Pet#001" }
                  }
                },
                // (HasMany) Remove the nullable foreign key from Pet item
                // TODO this will need to go find all denormalized pet records and update...
                // Could I leverage logic within update?
                {
                  Update: {
                    TableName: "mock-table",
                    Key: { PK: "Pet#001", SK: "Pet" },
                    ExpressionAttributeNames: {
                      "#OwnerId": "OwnerId"
                    },
                    UpdateExpression: "REMOVE #OwnerId"
                  }
                },
                {
                  // (HasMany) - Delete the Person record from the Pet partition
                  Delete: {
                    TableName: "mock-table",
                    Key: { PK: "Pet#001", SK: "Person" }
                  }
                },
                {
                  // (HasOne) Delete denormalized Home from Person partition
                  Delete: {
                    TableName: "mock-table",
                    Key: { PK: "Person#123", SK: "Home" }
                  }
                },
                {
                  // (HasOne) Remove the nullable foreign key from Home item
                  // TODO this will need to go find all denormalized home records and update...
                  Update: {
                    TableName: "mock-table",
                    Key: { PK: "Home#002", SK: "Home" },
                    ExpressionAttributeNames: {
                      "#PersonId": "PersonId"
                    },
                    UpdateExpression: "REMOVE #PersonId"
                  }
                },
                {
                  // (HasOne) Delete denormalized Person from Home partition
                  Delete: {
                    TableName: "mock-table",
                    Key: { PK: "Home", SK: "Person" }
                  }
                }
              ]
            }
          ]
        ]);
      }
    });

    it("will throw NullConstraintViolationError error if its trying to unlink a HasMany association (nullify the foreign key) on a related entity that is linked by a (non nullable) ForeignKey", async () => {
      expect.assertions(7);

      const phoneBook: MockTableEntityTableItem<PhoneBook> = {
        PK: "PhoneBook#123",
        SK: "PhoneBook",
        Id: "123",
        Type: "PhoneBook",
        Edition: "1",
        CreatedAt: "2021-10-15T08:31:15.148Z",
        UpdatedAt: "2022-10-15T08:31:15.148Z"
      };

      const address1: MockTableEntityTableItem<Address> = {
        PK: "PhoneBook#123",
        SK: "Address#001",
        Id: "001",
        Type: "Address",
        State: "CO",
        HomeId: "111",
        PhoneBookId: phoneBook.Id,
        CreatedAt: "2021-10-16T09:31:15.148Z",
        UpdatedAt: "2022-10-17T09:31:15.148Z"
      };

      const address2: MockTableEntityTableItem<Address> = {
        PK: "PhoneBook#123",
        SK: "Address#002",
        Id: "002",
        Type: "Address",
        State: "AZ",
        HomeId: "222",
        PhoneBookId: phoneBook.Id,
        CreatedAt: "2021-10-18T09:31:15.148Z",
        UpdatedAt: "2022-10-19T09:31:15.148Z"
      };

      mockQuery.mockResolvedValueOnce({
        Items: [
          phoneBook,
          // HasMany Address
          address1,
          address2
        ]
      });

      try {
        await PhoneBook.delete("123");
      } catch (e: any) {
        expect(e.constructor.name).toEqual("TransactionWriteFailedError");
        expect(e.errors).toEqual([
          new NullConstraintViolationError(
            `Cannot set Address with id: '001' attribute 'phoneBookId' to null`
          ),
          new NullConstraintViolationError(
            `Cannot set Address with id: '002' attribute 'phoneBookId' to null`
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

    it("will throw NullConstraintViolationError error if its trying to unlink a HasOne association (nullify the foreign key) on a related entity that is linked by a (non nullable) ForeignKey", async () => {
      expect.assertions(7);

      const home: HomeTableItem = {
        PK: "Home#123",
        SK: "Home",
        Id: "123",
        Type: "Home",
        "MLS#": "MLS-XXX",
        CreatedAt: "2022-09-02T23:31:21.148Z",
        UpdatedAt: "2022-09-03T23:31:21.148Z"
      };

      const address: MockTableEntityTableItem<Address> = {
        PK: "Home#123",
        SK: "Address",
        Id: "002",
        Type: "Address",
        State: "CO",
        HomeId: "111",
        PhoneBookId: "222",
        CreatedAt: "2021-10-17T09:31:15.148Z",
        UpdatedAt: "2022-10-18T09:31:15.148Z"
      };

      mockQuery.mockResolvedValueOnce({
        Items: [
          home,
          // HasOne Address
          address
        ]
      });

      try {
        await Home.delete("123");
      } catch (e: any) {
        expect(e.constructor.name).toEqual("TransactionWriteFailedError");
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

    it("will throw an error if it fails to delete denormalized records in its own partition", async () => {
      expect.assertions(7);

      const person: MockTableEntityTableItem<Person> = {
        PK: "Person#123",
        SK: "Person",
        Id: "123",
        Type: "Person",
        Name: "Jon Doe",
        CreatedAt: "2021-10-14T08:31:15.148Z",
        UpdatedAt: "2022-10-15T08:31:15.148Z"
      };

      const pet: MockTableEntityTableItem<Pet> = {
        PK: "Person#123",
        SK: "Pet#001",
        Id: "001",
        Type: "Pet",
        Name: "Pet-1",
        OwnerId: person.Id,
        CreatedAt: "2021-10-16T09:31:15.148Z",
        UpdatedAt: "2022-10-17T09:31:15.148Z"
      };

      const home: HomeTableItem = {
        PK: "Person#123",
        SK: "Home",
        Id: "002",
        Type: "Home",
        PersonId: person.Id,
        "MLS#": "ABC123",
        CreatedAt: "2021-10-15T09:31:15.148Z",
        UpdatedAt: "2022-10-15T09:31:15.148Z"
      };

      mockQuery.mockResolvedValueOnce({
        Items: [
          person,
          // HasMany Pets
          pet,
          // HasOne Home
          home
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
            { Code: "None" },
            { Code: "ConditionalCheckFailed" },
            { Code: "None" },
            { Code: "None" }
          ],
          $metadata: {}
        });
      });

      try {
        await Person.delete("123");
      } catch (e: any) {
        expect(e.constructor.name).toEqual("TransactionWriteFailedError");
        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            'ConditionalCheckFailed: Failed to delete BelongsToLink with keys: {"pk":"Person#123","sk":"Pet#001"}'
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
                // (HasMany) Delete denormalized Pet from Person partition
                {
                  Delete: {
                    TableName: "mock-table",
                    Key: { PK: "Person#123", SK: "Pet#001" }
                  }
                },
                // (HasMany) Remove the nullable foreign key from Pet item
                // TODO this will need to go find all denormalized pet records and update...
                // Could I leverage logic within update?
                {
                  Update: {
                    TableName: "mock-table",
                    Key: { PK: "Pet#001", SK: "Pet" },
                    ExpressionAttributeNames: {
                      "#OwnerId": "OwnerId"
                    },
                    UpdateExpression: "REMOVE #OwnerId"
                  }
                },
                {
                  // (HasMany) - Delete the Person record from the Pet partition
                  Delete: {
                    TableName: "mock-table",
                    Key: { PK: "Pet#001", SK: "Person" }
                  }
                },
                {
                  // (HasOne) Delete denormalized Home from Person partition
                  Delete: {
                    TableName: "mock-table",
                    Key: { PK: "Person#123", SK: "Home" }
                  }
                },
                {
                  // (HasOne) Remove the nullable foreign key from Home item
                  // TODO this will need to go find all denormalized home records and update...
                  Update: {
                    TableName: "mock-table",
                    Key: { PK: "Home#002", SK: "Home" },
                    ExpressionAttributeNames: {
                      "#PersonId": "PersonId"
                    },
                    UpdateExpression: "REMOVE #PersonId"
                  }
                },
                {
                  // (HasOne) Delete denormalized Person from Home partition
                  Delete: {
                    TableName: "mock-table",
                    Key: { PK: "Home", SK: "Person" }
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
        Items: []
      });

      // @ts-expect-no-error Accepts a string as id
      await MockModel.delete("id").catch(() => {
        console.log("Testing types");
      });
    });
  });
});
