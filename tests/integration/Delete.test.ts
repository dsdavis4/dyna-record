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
  type Address,
  Organization,
  Employee,
  type Founder
} from "./mockModels";
import { Entity, NumberAttribute, StringAttribute } from "../../src/decorators";
import { TransactWriteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedError } from "../../src/dynamo-utils";
import { NotFoundError, NullConstraintViolationError } from "../../src/errors";
import { type MockTableEntityTableItem } from "./utils";
import Logger from "../../src/Logger";

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
  beforeAll(() => {
    jest.useFakeTimers();

    jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

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
          ExpressionAttributeValues: { ":PK1": "MockModel#123" },
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
          ExpressionAttributeValues: { ":PK1": "Pet#123" },
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
          ExpressionAttributeValues: { ":PK1": "Home#123" },
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

  describe("when the entity being deleted has relationships of HasMany or HasOne (needs to nullify foreign keys on the entities that belong to it)", () => {
    const dbOperationAssertions = (): void => {
      expect(mockSend.mock.calls).toEqual([
        [{ name: "QueryCommand" }], // Initial prefetch
        [{ name: "QueryCommand" }], // Getting records for which foreign key nullification must be denormalized
        [{ name: "QueryCommand" }], // Getting records for which foreign key nullification must be denormalized
        [{ name: "TransactWriteCommand" }] // Save everything
      ]);
      expect(mockQuery.mock.calls).toEqual([[], [], []]);
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK1",
            ExpressionAttributeNames: {
              "#PK": "PK"
            },
            ExpressionAttributeValues: {
              ":PK1": "Person#123"
            },
            ConsistentRead: true
          }
        ],
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK2",
            FilterExpression: "#Type IN (:Type1)",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#Type": "Type"
            },
            ExpressionAttributeValues: {
              ":PK2": "Pet#001",
              ":Type1": "Pet"
            },
            ConsistentRead: true
          }
        ],
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK3",
            FilterExpression: "#Type IN (:Type1,:Type2)",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#Type": "Type"
            },
            ExpressionAttributeValues: {
              ":PK3": "Home#002",
              ":Type1": "Home",
              ":Type2": "Address"
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
                // Delete Item
                Delete: {
                  TableName: "mock-table",
                  Key: {
                    PK: "Person#123",
                    SK: "Person"
                  }
                }
              },
              {
                // (HasMany) Remove the nullable foreign key from Pet item
                Update: {
                  TableName: "mock-table",
                  Key: { PK: "Pet#001", SK: "Pet" },
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#UpdatedAt": "UpdatedAt",
                    "#OwnerId": "OwnerId"
                  },
                  ExpressionAttributeValues: {
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                  },
                  UpdateExpression:
                    "SET #UpdatedAt = :UpdatedAt REMOVE #OwnerId"
                }
              },
              {
                // (HasOne) Remove the nullable foreign key from Home item
                Update: {
                  TableName: "mock-table",
                  Key: { PK: "Home#002", SK: "Home" },
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#UpdatedAt": "UpdatedAt",
                    "#PersonId": "PersonId"
                  },
                  ExpressionAttributeValues: {
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                  },
                  UpdateExpression:
                    "SET #UpdatedAt = :UpdatedAt REMOVE #PersonId"
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
                // (HasMany) Delete denormalized Pet from Person partition
                Delete: {
                  TableName: "mock-table",
                  Key: { PK: "Person#123", SK: "Pet#001" }
                }
              },
              {
                // Since the Home record was updated to remove Person foreign key, update denormalized Home records. In this case the record within Address partition
                Update: {
                  TableName: "mock-table",
                  Key: { PK: "Address#003", SK: "Home" },
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: {
                    "#UpdatedAt": "UpdatedAt",
                    "#PersonId": "PersonId"
                  },
                  ExpressionAttributeValues: {
                    ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                  },
                  UpdateExpression:
                    "SET #UpdatedAt = :UpdatedAt REMOVE #PersonId"
                }
              },
              {
                // (HasOne) Delete denormalized Person from Home partition
                Delete: {
                  TableName: "mock-table",
                  Key: { PK: "Home#002", SK: "Person" }
                }
              },
              {
                // (HasOne) Delete denormalized Home from Person partition
                Delete: {
                  TableName: "mock-table",
                  Key: { PK: "Person#123", SK: "Home" }
                }
              }
            ]
          }
        ]
      ]);
    };

    beforeEach(() => {
      const person: MockTableEntityTableItem<Person> = {
        PK: "Person#123",
        SK: "Person",
        Id: "123",
        Type: "Person",
        Name: "Jon Doe",
        CreatedAt: "2021-10-14T08:31:15.148Z",
        UpdatedAt: "2022-10-15T08:31:15.148Z"
      };

      // Pet entity denormalized to Person partition
      const petPersonLink: MockTableEntityTableItem<Pet> = {
        PK: "Person#123",
        SK: "Pet#001",
        Id: "001",
        Type: "Pet",
        Name: "Pet-1",
        OwnerId: person.Id,
        CreatedAt: "2021-10-16T09:31:15.148Z",
        UpdatedAt: "2022-10-17T09:31:15.148Z"
      };

      // Home entity denormalized to Person partition
      const homePersonLink: HomeTableItem = {
        PK: "Person#123",
        SK: "Home",
        Id: "002",
        Type: "Home",
        PersonId: person.Id,
        "MLS#": "ABC123",
        CreatedAt: "2021-10-15T09:31:15.148Z",
        UpdatedAt: "2022-10-15T09:31:15.148Z"
      };

      // Initial pre-fetch
      mockQuery.mockResolvedValueOnce({
        Items: [
          person,
          // HasMany Pets
          petPersonLink,
          // HasOne Home
          homePersonLink
        ]
      });

      // Begin get Pet and associated records

      const pet: MockTableEntityTableItem<Pet> = {
        ...petPersonLink,
        PK: `Pet#${petPersonLink.Id}`
      };

      // Get the pet with denormalized records
      mockQuery.mockResolvedValueOnce({ Items: [pet] });

      // End get Pet and associated records

      // Begin get Home and associated records

      const home: HomeTableItem = {
        ...homePersonLink,
        PK: `Home#${homePersonLink.Id}`
      };

      // Address record denormalized to Home partition
      const addressHomeLink: MockTableEntityTableItem<Address> = {
        PK: home.PK,
        SK: "Address",
        Id: "003",
        Type: "Address",
        State: "CO",
        HomeId: home.Id,
        PhoneBookId: "111",
        CreatedAt: "2021-11-15T09:31:15.148Z",
        UpdatedAt: "2022-11-16T09:31:15.148Z"
      };

      // Get Home with its denormalized link records
      mockQuery.mockResolvedValueOnce({ Items: [home, addressHomeLink] });

      // End get Home and associated records
    });

    it("will nullify foreign keys on the entities that belong to it, as well as update the denormalized links of those entities", async () => {
      expect.assertions(6);

      // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
      const res = await Person.delete("123");

      expect(res).toEqual(undefined);

      dbOperationAssertions();
    });

    it("will throw an error if it fails to remove the foreign key attribute from items which belong to the entity as HasMany or HasOne", async () => {
      expect.assertions(7);

      mockSend
        .mockReturnValueOnce(undefined) // Query
        .mockReturnValueOnce(undefined) // Query
        .mockReturnValueOnce(undefined) // Query
        // TransactWrite
        .mockImplementationOnce(() => {
          mockTransact();
          throw new TransactionCanceledException({
            message: "MockMessage",
            CancellationReasons: [
              { Code: "None" },
              { Code: "ConditionalCheckFailed" },
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
            "ConditionalCheckFailed: Pet with ID '001' does not exist"
          ),
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Home with ID '002' does not exist"
          ),
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Address (003) is not associated with Home (002)"
          )
        ]);

        dbOperationAssertions();
      }
    });

    it("will throw an error if it fails to delete denormalized records in its own partition", async () => {
      expect.assertions(7);

      mockSend
        .mockReturnValueOnce(undefined) // Query
        .mockReturnValueOnce(undefined) // Query
        .mockReturnValueOnce(undefined) // Query
        // TransactWrite
        .mockImplementationOnce(() => {
          mockTransact();
          throw new TransactionCanceledException({
            message: "MockMessage",
            CancellationReasons: [
              { Code: "None" },
              { Code: "None" },
              { Code: "None" },
              { Code: "None" },
              { Code: "ConditionalCheckFailed" },
              { Code: "None" },
              { Code: "None" },
              { Code: "ConditionalCheckFailed" }
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
            'ConditionalCheckFailed: Failed to delete denormalized record with keys: {"PK":"Person#123","SK":"Pet#001"}'
          ),
          new ConditionalCheckFailedError(
            'ConditionalCheckFailed: Failed to delete denormalized record with keys: {"PK":"Person#123","SK":"Home"}'
          )
        ]);

        dbOperationAssertions();
      }
    });
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
          ExpressionAttributeValues: { ":PK1": "Book#123" },
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
          ExpressionAttributeValues: { ":PK1": "Book#123" },
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
          TableName: "mock-table",
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

  describe("in a unidirectional has many relationship", () => {
    describe("deleting the owning entity", () => {
      const organization: MockTableEntityTableItem<Organization> = {
        PK: "Organization#123",
        SK: "Organization",
        Id: "123",
        Type: "Organization",
        Name: "Mock Org",
        CreatedAt: "2021-10-14T08:31:15.148Z",
        UpdatedAt: "2022-10-15T08:31:15.148Z"
      };

      it("can delete the owning entity and nullify the foreign keys on the associated entity if they are nullable", async () => {
        expect.assertions(6);

        const organizationEmployeeLink: MockTableEntityTableItem<Employee> = {
          PK: organization.PK,
          SK: "Employee#001",
          Id: "001",
          Type: "Employee",
          Name: "Employee-1",
          OrganizationId: organization.Id,
          CreatedAt: "2021-10-16T09:31:15.148Z",
          UpdatedAt: "2022-10-17T09:31:15.148Z"
        };

        // Initial pre-fetch
        mockQuery.mockResolvedValueOnce({
          Items: [organization, organizationEmployeeLink]
        });

        // Begin get Employee
        const employee: MockTableEntityTableItem<Employee> = {
          ...organizationEmployeeLink,
          PK: `Employee#${organizationEmployeeLink.Id}`
        };

        // Get the employee with denormalized records
        mockQuery.mockResolvedValueOnce({ Items: [employee] });

        // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
        const res = await Organization.delete("123");

        expect(res).toEqual(undefined);

        expect(mockSend.mock.calls).toEqual([
          [{ name: "QueryCommand" }], // Initial prefetch
          [{ name: "QueryCommand" }], // Getting records for which foreign key nullification must be denormalized
          [{ name: "TransactWriteCommand" }] // Save everything
        ]);
        expect(mockQuery.mock.calls).toEqual([[], []]);
        expect(mockedQueryCommand.mock.calls).toEqual([
          [
            {
              TableName: "mock-table",
              KeyConditionExpression: "#PK = :PK1",
              ExpressionAttributeNames: {
                "#PK": "PK"
              },
              ExpressionAttributeValues: {
                ":PK1": "Organization#123"
              },
              ConsistentRead: true
            }
          ],
          [
            {
              TableName: "mock-table",
              KeyConditionExpression: "#PK = :PK2",
              FilterExpression: "#Type IN (:Type1)",
              ExpressionAttributeNames: {
                "#PK": "PK",
                "#Type": "Type"
              },
              ExpressionAttributeValues: {
                ":PK2": "Employee#001",
                ":Type1": "Employee"
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
                  Delete: {
                    TableName: "mock-table",
                    Key: {
                      PK: "Organization#123",
                      SK: "Organization"
                    }
                  }
                },
                {
                  Update: {
                    TableName: "mock-table",
                    Key: {
                      PK: "Employee#001",
                      SK: "Employee"
                    },
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeNames: {
                      "#OrganizationId": "OrganizationId",
                      "#UpdatedAt": "UpdatedAt"
                    },
                    ExpressionAttributeValues: {
                      ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                    },
                    UpdateExpression:
                      "SET #UpdatedAt = :UpdatedAt REMOVE #OrganizationId"
                  }
                },
                {
                  Delete: {
                    TableName: "mock-table",
                    Key: {
                      PK: "Organization#123",
                      SK: "Employee#001"
                    }
                  }
                }
              ]
            }
          ]
        ]);
      });

      it("will throw an error if it attempts to delete the owning entity by the associated entity has non-nullable foreign keys", async () => {
        expect.assertions(7);

        const organizationFounderLink: MockTableEntityTableItem<Founder> = {
          PK: organization.PK,
          SK: "Founder#001",
          Id: "001",
          Type: "Founder",
          Name: "Founder-1",
          OrganizationId: organization.Id,
          CreatedAt: "2021-10-16T09:31:15.148Z",
          UpdatedAt: "2022-10-17T09:31:15.148Z"
        };

        // Initial pre-fetch
        mockQuery.mockResolvedValueOnce({
          Items: [organization, organizationFounderLink]
        });

        try {
          await Organization.delete("123");
        } catch (e: any) {
          expect(e.constructor.name).toEqual("TransactionWriteFailedError");
          expect(e.errors).toEqual([
            new NullConstraintViolationError(
              `Cannot set Founder with id: '001' attribute 'organizationId' to null`
            )
          ]);
          expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
          expect(mockQuery.mock.calls).toEqual([[]]);
          expect(mockedQueryCommand.mock.calls).toEqual([
            [
              {
                TableName: "mock-table",
                KeyConditionExpression: "#PK = :PK1",
                ExpressionAttributeNames: { "#PK": "PK" },
                ExpressionAttributeValues: { ":PK1": "Organization#123" },
                ConsistentRead: true
              }
            ]
          ]);
          expect(mockTransact.mock.calls).toEqual([]);
          expect(mockTransactWriteCommand.mock.calls).toEqual([]);
        }
      });
    });

    describe("deleting the entity owned by a uni directional has many", () => {
      beforeEach(() => {
        const employee: MockTableEntityTableItem<Employee> = {
          PK: "Employee#123",
          SK: "Employee",
          Id: "123",
          Type: "Employee",
          Name: "Mock Employee",
          OrganizationId: "456",
          CreatedAt: "2022-09-02T23:31:21.148Z",
          UpdatedAt: "2022-09-03T23:31:21.148Z"
        };

        mockQuery.mockResolvedValueOnce({
          Items: [employee]
        });
      });

      it(" can delete an entity that is owned by a has many uni directional relationship", async () => {
        expect.assertions(6);

        // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
        const res = await Employee.delete("123");

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
              ExpressionAttributeValues: { ":PK1": "Employee#123" },
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
                  Delete: {
                    TableName: "mock-table",
                    Key: {
                      PK: "Employee#123",
                      SK: "Employee"
                    }
                  }
                },
                {
                  Delete: {
                    TableName: "mock-table",
                    Key: {
                      PK: "Organization#456",
                      SK: "Employee#123"
                    }
                  }
                }
              ]
            }
          ]
        ]);
      });

      it("will throw an error if it encounters a transaction error when deleting the denormalized link from the owning entities partition", async () => {
        expect.assertions(2);

        mockSend
          .mockReturnValueOnce(undefined) // Query
          // TransactWrite
          .mockImplementationOnce(() => {
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
          await Employee.delete("123");
        } catch (e: any) {
          expect(e.constructor.name).toEqual("TransactionWriteFailedError");
          expect(e.errors).toEqual([
            new ConditionalCheckFailedError(
              'ConditionalCheckFailed: Failed to delete denormalized record with keys: {"PK":"Organization#456","SK":"Employee#123"}'
            )
          ]);
        }
      });
    });
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
              ExpressionAttributeValues: { ":PK1": "Person#123" },
              ConsistentRead: true
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
              ExpressionAttributeValues: { ":PK1": "MockModel#123" },
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

    it("will throw an error if it fails to delete denormalized records for HasMany", async () => {
      expect.assertions(7);

      // Denormalized Person (Owner) link in Pet partition
      const person: MockTableEntityTableItem<Person> = {
        PK: "Pet#456",
        SK: "Person",
        Id: "456",
        Type: "Person",
        Name: "Jon Doe",
        CreatedAt: "2021-10-14T08:31:15.148Z",
        UpdatedAt: "2022-10-15T08:31:15.148Z"
      };

      // Entity being deleted
      const pet: MockTableEntityTableItem<Pet> = {
        PK: "Pet#123",
        SK: "Pet",
        Id: "123",
        Type: "Pet",
        Name: "Fido",
        OwnerId: person.Id,
        CreatedAt: "2022-09-02T23:31:21.148Z",
        UpdatedAt: "2022-09-03T23:31:21.148Z"
      };

      mockQuery.mockResolvedValueOnce({
        Items: [pet, person]
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
        await Pet.delete("123");
      } catch (e: any) {
        expect(e.constructor.name).toEqual("TransactionWriteFailedError");
        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            'ConditionalCheckFailed: Failed to delete denormalized record with keys: {"PK":"Person#456","SK":"Pet#123"}'
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
              ExpressionAttributeValues: { ":PK1": "Pet#123" },
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
                  // Delete the entity
                  Delete: {
                    TableName: "mock-table",
                    Key: { PK: "Pet#123", SK: "Pet" }
                  }
                },
                {
                  // Delete denormalized Pet from Person partition
                  Delete: {
                    TableName: "mock-table",
                    Key: { PK: "Person#456", SK: "Pet#123" }
                  }
                },
                {
                  // Delete denormalized Person from Pet partition
                  Delete: {
                    Key: { PK: "Pet#456", SK: "Person" },
                    TableName: "mock-table"
                  }
                }
              ]
            }
          ]
        ]);
      }
    });

    it("will throw an error if it fails to delete denormalized record for HasOne", async () => {
      expect.assertions(7);

      // Denormalized Person in Home partition
      const person: MockTableEntityTableItem<Person> = {
        PK: "Home#123",
        SK: "Person",
        Id: "456",
        Type: "Person",
        Name: "Jon Doe",
        CreatedAt: "2021-10-14T08:31:15.148Z",
        UpdatedAt: "2022-10-15T08:31:15.148Z"
      };

      // Entity being deleted
      const home: HomeTableItem = {
        PK: "Home#123",
        SK: "Home",
        Id: "123",
        Type: "Home",
        "MLS#": "MLS-XXX",
        PersonId: person.Id,
        CreatedAt: "2022-09-02T23:31:21.148Z",
        UpdatedAt: "2022-09-03T23:31:21.148Z"
      };

      mockQuery.mockResolvedValueOnce({
        Items: [home, person]
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
        await Home.delete("123");
      } catch (e: any) {
        expect(e.constructor.name).toEqual("TransactionWriteFailedError");
        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            'ConditionalCheckFailed: Failed to delete denormalized record with keys: {"PK":"Person#456","SK":"Home"}'
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
              ExpressionAttributeValues: { ":PK1": "Home#123" },
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
                  Delete: {
                    TableName: "mock-table",
                    Key: { PK: "Home#123", SK: "Home" }
                  }
                },
                {
                  // Delete denormalize Home record from Person Partition
                  Delete: {
                    TableName: "mock-table",
                    Key: { PK: "Person#456", SK: "Home" }
                  }
                },
                {
                  // Delete denormalize Person record from Home Partition
                  Delete: {
                    Key: { PK: "Home#123", SK: "Person" },
                    TableName: "mock-table"
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
              TableName: "mock-table",
              ConsistentRead: true
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
              TableName: "mock-table",
              ConsistentRead: true
            }
          ]
        ]);
        expect(mockTransact.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([]);
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
        Logger.log("Testing types");
      });
    });
  });
});
