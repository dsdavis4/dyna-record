import DynaRecord from "../../index.js";
import {
  TransactionCanceledException,
  type CancellationReason
} from "@aws-sdk/client-dynamodb";
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
  Founder,
  Order,
  Customer,
  PaymentMethod,
  MyClassWithAllAttributeTypes,
  Profile,
  Shipment,
  Warehouse,
  ArrayOfObjectsEntity,
  DeepNestedEntity,
  Category,
  Accessory,
  mockEmbeddingProvider,
  mockEmbeddingProviderCalls
} from "./mockModels.js";
import {
  BelongsTo,
  DateAttribute,
  Entity,
  ForeignKeyAttribute,
  HasMany,
  HasOne,
  NumberAttribute,
  PartitionKeyAttribute,
  Searchable,
  SortKeyAttribute,
  StringAttribute,
  Table
} from "../../src/decorators/index.js";
import { TitanTextEmbedV2 } from "../../src/embedding/types.js";
import type {
  EntityClass,
  ForeignKey,
  NullableForeignKey,
  PartitionKey,
  SortKey,
  Searchable as SearchableText
} from "../../src/types.js";
import { TransactWriteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  ConditionalCheckFailedError,
  TransactionWriteFailedError,
  WriteConditionFailedError
} from "../../src/dynamo-utils/index.js";
import {
  FilterError,
  NotFoundError,
  NullConstraintViolationError
} from "../../src/errors.js";
import { type MockTableEntityTableItem } from "./utils.js";
import Logger from "../../src/Logger.js";

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

const mockTransactWriteCommand = vi.mocked(TransactWriteCommand);
const mockedQueryCommand = vi.mocked(QueryCommand);

const mockSend = vi.fn();
const mockQuery = vi.fn();
const mockDelete = vi.fn();
const mockTransact = vi.fn();

@Entity
class MockModel extends MockTable {
  declare readonly type: "MockModel";

  @StringAttribute({ alias: "MyVar1" })
  public myVar1: string;

  @NumberAttribute({ alias: "MyVar2" })
  public myVar2: number;
}

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
    QueryCommand: vi.fn().mockImplementation(() => {
      return { name: "QueryCommand" };
    }),
    DeleteCommand: vi.fn().mockImplementation(() => {
      return { name: "DeleteCommand" };
    }),
    TransactWriteCommand: vi.fn().mockImplementation(() => {
      return { name: "TransactWriteCommand" };
    })
  };
});

describe("Delete", () => {
  beforeAll(() => {
    vi.useFakeTimers();

    vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
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

    describe("write conditions", () => {
      it("accepts every attribute kind with each operator it allows", async () => {
        await MyClassWithAllAttributeTypes.delete("123", {
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
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("accepts dot paths and list-index paths into object attributes", async () => {
        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-no-error: a dot path names a nested object field
            "objectAttribute.name": { $contains: "Jane" },
            // @ts-expect-no-error: an array field takes $contains on its items
            "objectAttribute.tags": { $contains: "vip" },
            // @ts-expect-no-error: dot paths reach nested objects at any depth
            "addressAttribute.geo.lat": { $lt: 41 },
            // @ts-expect-no-error: a list-index path names one array item
            "addressAttribute.scores[0]": 5
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses an attribute the entity does not declare", async () => {
        await Order.delete("123", {
          condition: {
            // @ts-expect-error: name is a Customer attribute, not an Order one
            name: "Jane"
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses type, which the write already fixes", async () => {
        await Order.delete("123", {
          condition: {
            // @ts-expect-error: type is not a condition key
            type: "Order"
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses an operator the attribute cannot take", async () => {
        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: a boolean has no prefix
            boolAttribute: { $beginsWith: "t" },
            // @ts-expect-error: a number has no substring
            numberAttribute: { $contains: 1 }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("accepts null on a nullable attribute, at any depth and inside $or", async () => {
        await MyClassWithAllAttributeTypes.delete("123", {
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
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses null on a non-nullable attribute, at any depth", async () => {
        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: stringAttribute is not nullable
            stringAttribute: null,
            // @ts-expect-error: city is not nullable
            "addressAttribute.city": null,
            // @ts-expect-error: foreignKeyAttribute is not nullable
            $or: [{ foreignKeyAttribute: null }]
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses null inside an IN array, nullable attribute or not", async () => {
        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: an IN list holds values; null is not one
            enumAttribute: ["val-1", null],
            // @ts-expect-error: null means "not set", which IN cannot express
            nullableEnumAttribute: ["val-1", null]
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("accepts $or blocks on the entity's own attributes", async () => {
        await Order.delete("123", {
          condition: {
            // @ts-expect-no-error: each branch is a condition on this row
            $or: [
              { orderDate: { $lt: new Date() } },
              { customerId: "customer-1", paymentMethodId: "pm-1" }
            ]
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses a relationship key inside $or (AE6)", async () => {
        await Order.delete("123", {
          condition: {
            $or: [
              { orderDate: new Date() },
              // @ts-expect-error: $or branches take the entity's own attributes only
              { customer: { name: "Jane" } }
            ]
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses target inside $or", async () => {
        await Founder.delete("123", {
          condition: {
            // @ts-expect-error: $or branches hold conditions on this row only
            $or: [{ organizationId: { target: { name: "Acme" } } }]
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("takes a target condition on a BelongsTo and a HasOne", async () => {
        await Order.delete("123", {
          condition: {
            // @ts-expect-no-error: a BelongsTo takes a condition on the related row, $or included
            customer: {
              name: "Jane",
              $or: [{ address: "A" }, { address: "B" }]
            },
            // @ts-expect-no-error: an empty target condition requires the target to exist
            paymentMethod: {}
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Customer.delete("123", {
          condition: {
            // @ts-expect-no-error: a HasOne takes a target condition, null on its nullable attributes
            contactInformation: { phone: null, email: { $contains: "@" } }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("takes { id, condition } entries on a HasMany, a HasAndBelongsToMany and the parent side of a one-way HasMany", async () => {
        await Customer.delete("123", {
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
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Book.delete("123", {
          condition: {
            // @ts-expect-no-error: a HasAndBelongsToMany names each linked row by id
            authors: [{ id: "author-1", condition: { name: "Jane" } }]
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Organization.delete("123", {
          condition: {
            // @ts-expect-no-error: a one-way HasMany is guarded from its parent side
            employees: [{ id: "employee-1", condition: { name: "Jane" } }],
            founders: [{ id: "founder-1", condition: {} }]
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses { id, condition } on a single-valued relationship", async () => {
        await Order.delete("123", {
          condition: {
            // @ts-expect-error: the library resolves a BelongsTo target itself
            customer: { id: "customer-1", condition: { name: "Jane" } }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses a plain condition on an array relationship", async () => {
        await Customer.delete("123", {
          condition: {
            // @ts-expect-error: a HasMany takes { id, condition } entries
            orders: { orderDate: new Date() }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses an attribute the related entity does not declare", async () => {
        await Order.delete("123", {
          condition: {
            // @ts-expect-error: orderDate is an Order attribute, not a Customer one
            customer: { orderDate: new Date() }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Customer.delete("123", {
          condition: {
            orders: [
              // @ts-expect-error: name is a Customer attribute, not an Order one
              { id: "order-1", condition: { name: "Jane" } }
            ]
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses a relationship key inside a target condition", async () => {
        await Order.delete("123", {
          condition: {
            // @ts-expect-error: a target condition names the related row's own attributes
            customer: { orders: [{ id: "order-1", condition: {} }] }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Customer.delete("123", {
          condition: {
            orders: [
              // @ts-expect-error: nor the related entity's own relationships
              { id: "order-1", condition: { paymentMethod: {} } }
            ]
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses a target guard inside a target condition", async () => {
        await Organization.delete("123", {
          condition: {
            founders: [
              {
                id: "founder-1",
                // @ts-expect-error: the related row's foreign key takes its own value only
                condition: { organizationId: { target: { name: "Acme" } } }
              }
            ]
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses a malformed { id, condition } entry", async () => {
        await Customer.delete("123", {
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
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("takes target on a typed standalone foreign key", async () => {
        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-no-error: a ForeignKey<Customer> guards its Customer
            foreignKeyAttribute: { target: { name: "Jane" } },
            // @ts-expect-no-error: a NullableForeignKey<Customer> guards its Customer
            nullableForeignKeyAttribute: { target: {} }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Profile.delete("123", {
          condition: {
            // @ts-expect-no-error: the target condition is typed from the referenced entity
            userId: { target: { name: { $beginsWith: "J" } } }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("takes target on the child side of a one-way HasMany", async () => {
        await Founder.delete("123", {
          condition: {
            // @ts-expect-no-error: no BelongsTo backs the key, so it guards its target
            organizationId: { target: { name: "Acme" } }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Employee.delete("123", {
          condition: {
            // @ts-expect-no-error: a nullable child-side key guards its target too
            organizationId: { target: { name: "Acme" } }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("keeps a value condition on the key, with the guard's value in $or", async () => {
        await Founder.delete("123", {
          condition: {
            // @ts-expect-no-error: the key still takes a value condition
            organizationId: "org-1"
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Founder.delete("123", {
          condition: {
            // @ts-expect-no-error: the guard sits on the key
            organizationId: { target: { name: "Acme" } },
            // @ts-expect-no-error: and the value condition moves into $or
            $or: [{ organizationId: "org-1" }, { name: "Jane" }]
          }
        }).catch(() => {
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

        await LooseOrder.delete("123", {
          condition: {
            // @ts-expect-error: customerId needs its target type to guard it
            customerId: { target: { name: "Jane" } }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses target on a foreign key backing a BelongsTo", async () => {
        await Order.delete("123", {
          condition: {
            // @ts-expect-error: guard the Customer under the customer key
            customerId: { target: { name: "Jane" } }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses a value condition and target on the same key (R33)", async () => {
        await Founder.delete("123", {
          condition: {
            // @ts-expect-error: a value condition alongside a guard goes in $or
            organizationId: { target: { name: "Acme" }, $beginsWith: "org" }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses a target attribute the referenced entity does not declare", async () => {
        await Founder.delete("123", {
          condition: {
            // @ts-expect-error: lastFour is a PaymentMethod attribute
            organizationId: { target: { lastFour: "1234" } }
          }
        }).catch(() => {
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

        await Kiosk.delete("123", {
          condition: {
            // @ts-expect-error: known limit — read as backing a BelongsTo; the compiler decides at run time
            backupPaymentMethodId: { target: { lastFour: "1234" } }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("takes condition as its only option, and no options at all", async () => {
        await Order.delete("123", {
          // @ts-expect-no-error: condition is delete's option
          condition: { orderDate: { $lt: new Date() }, customer: {} }
        }).catch(() => {
          Logger.log("Testing types");
        });

        // @ts-expect-no-error: the options argument may be empty
        await Order.delete("123", {}).catch(() => {
          Logger.log("Testing types");
        });

        // @ts-expect-no-error: the options argument is optional
        await Order.delete("123").catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses an option delete does not take", async () => {
        await Order.delete("123", {
          condition: { orderDate: new Date() },
          // @ts-expect-error: delete has no such option
          conditions: { orderDate: new Date() }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Order.delete("123", {
          // @ts-expect-error: a delete writes no foreign key to check
          referentialIntegrityCheck: false
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Order.delete("123", {
          // @ts-expect-error: a delete embeds nothing
          forceEmbed: true
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("accepts each operator a nested field's type allows", async () => {
        await MyClassWithAllAttributeTypes.delete("123", {
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
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-no-error: a nested date is stored as an ISO string, so it takes a prefix
            "objectAttribute.createdDate": { $beginsWith: "2026" }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await ArrayOfObjectsEntity.delete("123", {
          condition: {
            // @ts-expect-no-error: a field below a list index resolves to the element's field
            "data.entries[0].price": { $lt: 10 }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await DeepNestedEntity.delete("123", {
          condition: {
            // @ts-expect-no-error: the deepest field takes its own type
            "data.level1.level2.level3.flag": false,
            // @ts-expect-no-error: a nullable field deep in the schema takes null
            "data.level1.tag": null
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses a dot path naming no declared field, at each depth", async () => {
        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: objectAttribute declares no such field
            "objectAttribute.nope": 1
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: geo declares lat, lng and accuracy, not this
            "addressAttribute.geo.nope": 1
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await ArrayOfObjectsEntity.delete("123", {
          condition: {
            // @ts-expect-error: an entries element declares sku and price, not this
            "data.entries[0].nope": 1
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await DeepNestedEntity.delete("123", {
          condition: {
            // @ts-expect-error: level3 declares flag and detail, not this
            "data.level1.level2.level3.nope": 1
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses a list index on a field that is not a list, and a dot path into an attribute that is not an object", async () => {
        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: name is a string, not a list
            "objectAttribute.name[0]": "J"
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: geo is an object, not a list
            "addressAttribute.geo[0]": 1
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: stringAttribute is not an object attribute
            "stringAttribute.x": "a"
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: numberAttribute is not a list
            "numberAttribute[0]": 1
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses a value a nested field cannot hold", async () => {
        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: name is a string
            "objectAttribute.name": 1
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: geo.lat is a number
            "addressAttribute.geo.lat": "41"
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: a scores item is a number
            "addressAttribute.scores[0]": "5"
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: tags holds strings
            "objectAttribute.tags": { $contains: 1 }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: createdDate is a Date
            "objectAttribute.createdDate": "2026-01-01"
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: status takes active or inactive
            "objectAttribute.status": "archived"
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await ArrayOfObjectsEntity.delete("123", {
          condition: {
            // @ts-expect-error: price is a number
            "data.entries[0].price": "10"
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await DeepNestedEntity.delete("123", {
          condition: {
            // @ts-expect-error: score is a number
            "data.level1.level2.score": "5"
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses an operator a nested field cannot take", async () => {
        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: a number has no prefix
            "addressAttribute.geo.lat": { $beginsWith: "4" }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: a number has no substring
            "addressAttribute.zip": { $contains: 1 }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: a list has no ordering
            "objectAttribute.tags": { $gt: "a" }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: a list has no prefix
            "objectAttribute.tags": { $beginsWith: "v" }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await DeepNestedEntity.delete("123", {
          condition: {
            // @ts-expect-error: a boolean has no substring
            "data.level1.level2.level3.flag": { $contains: true }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await DeepNestedEntity.delete("123", {
          condition: {
            // @ts-expect-error: a boolean has no ordering
            "data.level1.level2.level3.flag": { $gt: true }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses a wrong operand for $between and comparisons at a nested path", async () => {
        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: both bounds are numbers
            "addressAttribute.geo.lat": { $between: [1, "2"] }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: $between takes a pair
            "addressAttribute.geo.lat": { $between: [1] }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: geo.lat compares against a number
            "addressAttribute.geo.lat": { $gt: "40" }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: createdDate compares against a Date
            "objectAttribute.createdDate": { $gte: "2026-01-01" }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await ArrayOfObjectsEntity.delete("123", {
          condition: {
            // @ts-expect-error: price compares against a number
            "data.entries[0].price": { $lt: "10" }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("accepts every operator each attribute kind's stored form allows", async () => {
        await MyClassWithAllAttributeTypes.delete("123", {
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
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
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
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
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
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-no-error: a string takes equality
            stringAttribute: "a",
            // @ts-expect-no-error: a date takes equality with a Date
            dateAttribute: new Date("2026-01-01")
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-no-error: a date takes an IN list of Dates
            dateAttribute: [new Date("2026-01-01"), new Date("2026-02-01")],
            // @ts-expect-no-error: a date takes composed Date comparisons
            nullableDateAttribute: {
              $gte: new Date("2026-01-01"),
              $lt: new Date("2026-02-01")
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses each operator and operand a string attribute cannot take", async () => {
        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: stringAttribute is a string
            stringAttribute: 1
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: an IN list holds strings
            stringAttribute: ["a", 1]
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: a string compares against a string
            stringAttribute: { $gt: 1 }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: a Date is not a string operand
            stringAttribute: { $gte: new Date() }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: both bounds are strings
            stringAttribute: { $between: ["a", 1] }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: a prefix is a string
            stringAttribute: { $beginsWith: 1 }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: a substring is a scalar, not a Date
            stringAttribute: { $contains: new Date() }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses each operator and operand a number attribute cannot take", async () => {
        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: numberAttribute is a number
            numberAttribute: "5"
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: an IN list holds numbers
            numberAttribute: [1, "2"]
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: a number compares against a number
            numberAttribute: { $gt: "5" }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: a Date is not a number operand
            numberAttribute: { $lte: new Date() }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: both bounds are numbers
            numberAttribute: { $between: [1, "10"] }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: $between takes a pair
            numberAttribute: { $between: [1] }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: a number has no prefix
            numberAttribute: { $beginsWith: "1" }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: an operator object needs at least one operator
            numberAttribute: {}
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses each operator and operand a boolean attribute cannot take", async () => {
        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: boolAttribute is a boolean
            boolAttribute: "true"
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: an IN list holds booleans
            boolAttribute: [true, "false"]
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: a boolean has no substring
            boolAttribute: { $contains: true }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: a boolean has no ordering
            boolAttribute: { $gt: false }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: a boolean has no range
            boolAttribute: { $between: [false, true] }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses each operator and operand a date attribute cannot take", async () => {
        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: dateAttribute is compared as a Date
            dateAttribute: "2026-01-01"
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: an IN list holds Dates
            dateAttribute: ["2026-01-01"]
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: a date compares against a Date
            dateAttribute: { $gte: "2026-01-01" }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: a date compares against a Date, not a number
            dateAttribute: { $gt: 1 }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: both bounds are Dates
            dateAttribute: { $between: [new Date(), "2026-12-31"] }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: a prefix is a fragment of the stored string, not a Date
            dateAttribute: { $beginsWith: new Date() }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses each operator and operand an enum attribute cannot take", async () => {
        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: val-3 is not one of the enum's values
            enumAttribute: "val-3"
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: an IN list holds the enum's values
            enumAttribute: ["val-1", "val-3"]
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: a comparison operand is one of the enum's values
            enumAttribute: { $gt: "val-3" }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: both bounds are the enum's values
            enumAttribute: { $between: ["val-1", "val-3"] }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: an enum compares against its values, not a number
            enumAttribute: { $gte: 1 }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: a prefix is a string
            enumAttribute: { $beginsWith: 1 }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("accepts an enum range across two of its members", async () => {
        // An enum is stored as a string, which DynamoDB orders
        // lexicographically, so any two members bound a range
        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-no-error: both bounds are members of the enum
            enumAttribute: { $between: ["val-1", "val-2"] },
            // @ts-expect-no-error: a nullable enum ranges across its members
            nullableEnumAttribute: { $between: ["val-1", "val-2"] },
            // @ts-expect-no-error: a nested enum ranges across its members
            "objectAttribute.status": { $between: ["active", "inactive"] }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-no-error: composed comparisons may name different members
            enumAttribute: { $gte: "val-1", $lte: "val-2" },
            // @ts-expect-no-error: and composes across them
            nullableEnumAttribute: { $gt: "val-1", $lt: "val-2" },
            // @ts-expect-no-error: a nullable nested enum composes across its members
            "addressAttribute.category": { $gte: "home", $lte: "work" }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-no-error: both bounds may be the same member
            enumAttribute: { $between: ["val-1", "val-1"] }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses an enum range bound the enum cannot hold", async () => {
        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: val-3 is not one of the enum's values, composed or not
            enumAttribute: { $gte: "val-1", $lte: "val-3" }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: archived is not one of the nested enum's values
            "objectAttribute.status": { $between: ["active", "archived"] }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: an enum is ranged by its values, not a number
            enumAttribute: { $between: ["val-1", 2] }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: a range bound is never null, nullable enum or not
            nullableEnumAttribute: { $between: [null, "val-2"] }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: null means not set, which no ordering can compare
            nullableEnumAttribute: { $gte: "val-1", $lte: null }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: a boolean is not one of the enum's values
            enumAttribute: { $between: ["val-1", true] }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses each operator and operand a foreign key attribute cannot take", async () => {
        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: a foreign key is a string
            foreignKeyAttribute: 1
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: an IN list holds strings
            foreignKeyAttribute: [1]
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: a foreign key compares against a string
            foreignKeyAttribute: { $gt: 1 }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: both bounds are strings
            foreignKeyAttribute: { $between: ["a", 1] }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: a prefix is a string
            foreignKeyAttribute: { $beginsWith: 1 }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Founder.delete("123", {
          condition: {
            // @ts-expect-error: the key's value is a string
            organizationId: 1
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses each operator and operand a nullable attribute cannot take", async () => {
        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: nullableStringAttribute is a string
            nullableStringAttribute: 1
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: null means not set, which no ordering can compare
            nullableStringAttribute: { $gt: null }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: a number has no prefix, nullable or not
            nullableNumberAttribute: { $beginsWith: "1" }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: a range bound is never null
            nullableNumberAttribute: { $between: [null, 5] }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: a boolean has no ordering, nullable or not
            nullableBoolAttribute: { $gt: true }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: a nullable date compares against a Date
            nullableDateAttribute: { $gte: "2026" }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: val-3 is not one of the enum's values
            nullableEnumAttribute: "val-3"
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: a nullable foreign key is a string
            nullableForeignKeyAttribute: 1
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: null means not set, which no ordering can compare
            nullableForeignKeyAttribute: { $gt: null }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("audits a BelongsTo target condition like the entity's own", async () => {
        await Shipment.delete("123", {
          condition: {
            // @ts-expect-no-error: the target condition resolves the related row's dot paths
            warehouse: {
              "location.city": { $beginsWith: "Spring" },
              "location.zip": null,
              $or: [{ "location.state": "IL" }, { name: "Central" }]
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Shipment.delete("123", {
          condition: {
            warehouse: {
              // @ts-expect-error: city is a string
              "location.city": 1
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Shipment.delete("123", {
          condition: {
            warehouse: {
              // @ts-expect-error: a number has no prefix
              "location.zip": { $beginsWith: "9" }
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Shipment.delete("123", {
          condition: {
            warehouse: {
              // @ts-expect-error: location declares no such field
              "location.nope": "x"
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Shipment.delete("123", {
          condition: {
            warehouse: {
              // @ts-expect-error: a string compares against a string
              name: { $gt: 1 }
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("audits a { id, condition } entry's condition like the entity's own", async () => {
        await Warehouse.delete("123", {
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
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Warehouse.delete("123", {
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
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Warehouse.delete("123", {
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
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Warehouse.delete("123", {
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
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Warehouse.delete("123", {
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
        }).catch(() => {
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

        await Delivery.delete("123", {
          condition: {
            // @ts-expect-no-error: the guard's condition resolves the referenced row's dot paths
            warehouseId: {
              target: {
                "location.city": "Springfield",
                "location.zip": { $gte: 60000 }
              }
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Delivery.delete("123", {
          condition: {
            // @ts-expect-error: the guard's condition is typed from Warehouse: city is a string
            warehouseId: {
              target: {
                "location.city": 1
              }
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Delivery.delete("123", {
          condition: {
            // @ts-expect-error: the guard's condition is typed from Warehouse: a number has no prefix
            warehouseId: {
              target: {
                "location.zip": { $beginsWith: "6" }
              }
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Delivery.delete("123", {
          condition: {
            warehouseId: {
              target: {
                // @ts-expect-error: location declares no such field
                "location.nope": "x"
              }
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Delivery.delete("123", {
          condition: {
            // @ts-expect-error: the guard's condition is typed from Warehouse: both bounds are strings
            warehouseId: {
              target: {
                name: { $between: ["a", 1] }
              }
            }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses a value an attribute cannot hold inside $or", async () => {
        await Order.delete("123", {
          condition: {
            $or: [
              // @ts-expect-error: orderDate is compared as a Date
              { orderDate: "2026-01-01" }
            ]
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses on a HasOne what it refuses on a BelongsTo", async () => {
        await Customer.delete("123", {
          condition: {
            // @ts-expect-error: email and phone are ContactInformation attributes; name is not
            contactInformation: { name: "Jane" }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Customer.delete("123", {
          condition: {
            // @ts-expect-error: the library resolves a HasOne target itself
            contactInformation: { id: "contact-1", condition: {} }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses on a HasAndBelongsToMany and a one-way HasMany what it refuses on a HasMany", async () => {
        await Book.delete("123", {
          condition: {
            // @ts-expect-error: a HasAndBelongsToMany takes { id, condition } entries
            authors: { name: "Jane" }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Book.delete("123", {
          condition: {
            authors: [
              // @ts-expect-error: numPages is a Book attribute, not an Author one
              { id: "author-1", condition: { numPages: 100 } }
            ]
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Organization.delete("123", {
          condition: {
            // @ts-expect-error: a one-way HasMany takes { id, condition } entries
            employees: { name: "Jane" }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses a target attribute the referenced entity does not declare, on every typed key", async () => {
        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            // @ts-expect-error: lastFour is a PaymentMethod attribute, and the key references a Customer
            nullableForeignKeyAttribute: { target: { lastFour: "1234" } }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Employee.delete("123", {
          condition: {
            // @ts-expect-error: lastFour is a PaymentMethod attribute, and the key references an Organization
            organizationId: { target: { lastFour: "1234" } }
          }
        }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("refuses an option value of the wrong type", async () => {
        await Order.delete("123", {
          // @ts-expect-error: condition is an object of conditions
          condition: "orderDate"
        }).catch(() => {
          Logger.log("Testing types");
        });

        await Order.delete("123", {
          // @ts-expect-error: condition is one object, not a list of them
          condition: [{ orderDate: new Date() }]
        }).catch(() => {
          Logger.log("Testing types");
        });
      });
    });
  });
});

describe("Delete with write conditions", () => {
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
   * Runs a delete expected to fail and returns its error
   */
  const failureOf = async (remove: () => Promise<unknown>): Promise<any> => {
    try {
      await remove();
    } catch (e: unknown) {
      return e;
    }
    throw new Error("Expected the delete to fail");
  };

  /**
   * The earlier read of an entity's partition
   */
  const partitionQuery = (pk: string): unknown[] => [
    {
      TableName: "mock-table",
      KeyConditionExpression: "#PK = :PK1",
      ExpressionAttributeNames: { "#PK": "PK" },
      ExpressionAttributeValues: { ":PK1": pk },
      ConsistentRead: true
    }
  ];

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
    vi.clearAllMocks();
  });

  describe("on an entity with BelongsTo relationships", () => {
    const order = {
      PK: "Order#123",
      SK: "Order",
      Id: "123",
      Type: "Order",
      CustomerId: "c1",
      PaymentMethodId: "pm1",
      OrderDate: "2023-10-01T00:00:00.000Z",
      CreatedAt: "2023-01-01T00:00:00.000Z",
      UpdatedAt: "2023-01-02T00:00:00.000Z"
    };
    const customerCopy = {
      PK: "Order#123",
      SK: "Customer",
      Id: "c1",
      Type: "Customer",
      Name: "Jane",
      Address: "1 Main St",
      CreatedAt: "2023-01-01T00:00:00.000Z",
      UpdatedAt: "2023-01-02T00:00:00.000Z"
    };
    const paymentMethodCopy = {
      PK: "Order#123",
      SK: "PaymentMethod",
      Id: "pm1",
      Type: "PaymentMethod",
      LastFour: "1234",
      CustomerId: "c1",
      CreatedAt: "2023-01-01T00:00:00.000Z",
      UpdatedAt: "2023-01-02T00:00:00.000Z"
    };

    /**
     * Every item the library queues besides the Order's own row. A condition
     * never adds anything to these
     */
    const linkDeletes = [
      {
        Delete: {
          TableName: "mock-table",
          Key: { PK: "Customer#c1", SK: "Order#123" }
        }
      },
      {
        Delete: {
          TableName: "mock-table",
          Key: { PK: "PaymentMethod#pm1", SK: "Order#123" }
        }
      },
      {
        Delete: {
          TableName: "mock-table",
          Key: { PK: "Order#123", SK: "Customer" }
        }
      },
      {
        Delete: {
          TableName: "mock-table",
          Key: { PK: "Order#123", SK: "PaymentMethod" }
        }
      }
    ];

    beforeEach(() => {
      mockQuery.mockResolvedValue({
        Items: [order, customerCopy, paymentMethodCopy]
      });
    });

    describe("an unconditioned delete", () => {
      const unconditionedItems = [
        {
          Delete: {
            TableName: "mock-table",
            Key: { PK: "Order#123", SK: "Order" }
          }
        },
        ...linkDeletes
      ];

      it("sends exactly today's command without options", async () => {
        expect.assertions(3);

        await Order.delete("123");

        expect(mockSend.mock.calls).toEqual([
          [{ name: "QueryCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockedQueryCommand.mock.calls).toEqual([
          partitionQuery("Order#123")
        ]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [{ TransactItems: unconditionedItems }]
        ]);
      });

      it("sends exactly today's command with empty options", async () => {
        expect.assertions(1);

        await Order.delete("123", {});

        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [{ TransactItems: unconditionedItems }]
        ]);
      });

      it("sends exactly today's command for an empty condition (R29)", async () => {
        expect.assertions(1);

        await Order.delete("123", { condition: {} });

        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [{ TransactItems: unconditionedItems }]
        ]);
      });
    });

    describe("a condition on the entity's own row (AE2)", () => {
      const remove = async (): Promise<void> => {
        await Order.delete("123", {
          condition: {
            orderDate: { $lt: new Date("2023-10-10T00:00:00.000Z") }
          }
        });
      };

      const guardedItems = [
        {
          // The condition merges onto the own Delete, which also requires the
          // row to still exist
          Delete: {
            TableName: "mock-table",
            Key: { PK: "Order#123", SK: "Order" },
            ConditionExpression:
              "attribute_exists(PK) AND (#OrderDate < :wc1_OrderDate1)",
            ExpressionAttributeNames: { "#OrderDate": "OrderDate" },
            ExpressionAttributeValues: {
              ":wc1_OrderDate1": "2023-10-10T00:00:00.000Z"
            },
            ReturnValuesOnConditionCheckFailure: "ALL_OLD"
          }
        },
        // The link rows are deleted exactly as today, in the same transaction
        ...linkDeletes
      ];

      it("merges onto the own Delete with attribute_exists, leaving the link rows as today", async () => {
        expect.assertions(3);

        await remove();

        expect(mockSend.mock.calls).toEqual([
          [{ name: "QueryCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockedQueryCommand.mock.calls).toEqual([
          partitionQuery("Order#123")
        ]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [{ TransactItems: guardedItems }]
        ]);
      });

      it("reports a failed condition as a WriteConditionFailedError naming the self row, in the one transaction that also held every link row", async () => {
        expect.assertions(5);

        cancelTransactWrite([
          {
            Code: "ConditionalCheckFailed",
            Item: {
              PK: { S: "Order#123" },
              SK: { S: "Order" },
              OrderDate: { S: "2023-10-12T00:00:00.000Z" }
            }
          },
          { Code: "None" },
          { Code: "None" },
          { Code: "None" },
          { Code: "None" }
        ]);

        const e = await failureOf(remove);

        expect(e).toBeInstanceOf(TransactionWriteFailedError);
        expect(e.errors).toEqual([
          new WriteConditionFailedError(
            "ConditionalCheckFailed: Write condition failed on Order with ID '123': its own row",
            { entity: "Order", id: "123", guards: [{ kind: "self" }] }
          )
        ]);
        expect(e.errors[0]).toBeInstanceOf(WriteConditionFailedError);
        expect({
          entity: e.errors[0].entity,
          id: e.errors[0].id,
          guards: e.errors[0].guards
        }).toEqual({ entity: "Order", id: "123", guards: [{ kind: "self" }] });
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [{ TransactItems: guardedItems }]
        ]);
      });

      it("reports a row deleted after the earlier read as not-found, not as a failed condition (AE15)", async () => {
        expect.assertions(3);

        cancelTransactWrite([
          { Code: "ConditionalCheckFailed" },
          { Code: "None" },
          { Code: "None" },
          { Code: "None" },
          { Code: "None" }
        ]);

        const e = await failureOf(remove);

        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Order with ID '123' does not exist"
          )
        ]);
        expect(e.errors[0]).not.toBeInstanceOf(WriteConditionFailedError);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [{ TransactItems: guardedItems }]
        ]);
      });

      it("passes a TransactionConflict-only cancellation through unchanged", async () => {
        expect.assertions(3);

        cancelTransactWrite([
          { Code: "TransactionConflict" },
          { Code: "None" },
          { Code: "None" },
          { Code: "None" },
          { Code: "None" }
        ]);

        const e = await failureOf(remove);

        expect(e).toBeInstanceOf(TransactionCanceledException);
        expect(e.CancellationReasons).toEqual([
          { Code: "TransactionConflict" },
          { Code: "None" },
          { Code: "None" },
          { Code: "None" },
          { Code: "None" }
        ]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [{ TransactItems: guardedItems }]
        ]);
      });

      it("sends a $or of one block naming two attributes in one pair of parentheses", async () => {
        expect.assertions(2);

        // A second pair, `attribute_exists(PK) AND ((… AND …))`, is rejected
        // by DynamoDB: "The expression has redundant parentheses"
        await Order.delete("123", {
          condition: {
            $or: [
              {
                orderDate: { $lt: new Date("2023-10-10T00:00:00.000Z") },
                paymentMethodId: "pm1"
              }
            ]
          }
        });

        expect(mockSend.mock.calls).toEqual([
          [{ name: "QueryCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                {
                  Delete: {
                    TableName: "mock-table",
                    Key: { PK: "Order#123", SK: "Order" },
                    ConditionExpression:
                      "attribute_exists(PK) AND (#OrderDate < :wc1_OrderDate1 AND #PaymentMethodId = :wc1_PaymentMethodId2)",
                    ExpressionAttributeNames: {
                      "#OrderDate": "OrderDate",
                      "#PaymentMethodId": "PaymentMethodId"
                    },
                    ExpressionAttributeValues: {
                      ":wc1_OrderDate1": "2023-10-10T00:00:00.000Z",
                      ":wc1_PaymentMethodId2": "pm1"
                    },
                    ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                  }
                },
                ...linkDeletes
              ]
            }
          ]
        ]);
      });
    });

    describe("a BelongsTo guard", () => {
      const remove = async (): Promise<void> => {
        await Order.delete("123", {
          condition: { customer: { name: "Jane" } }
        });
      };

      const sentItems = [
        {
          // The stored foreign key is pinned on the own Delete, so a
          // concurrent re-parent fails the delete instead of checking the old
          // parent
          Delete: {
            TableName: "mock-table",
            Key: { PK: "Order#123", SK: "Order" },
            ConditionExpression:
              "attribute_exists(PK) AND (#CustomerId = :wc2_CustomerId)",
            ExpressionAttributeNames: { "#CustomerId": "CustomerId" },
            ExpressionAttributeValues: { ":wc2_CustomerId": "c1" },
            ReturnValuesOnConditionCheckFailure: "ALL_OLD"
          }
        },
        ...linkDeletes,
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
      ];

      it("checks the stored parent and pins the foreign key on the own Delete", async () => {
        expect.assertions(3);

        await remove();

        expect(mockSend.mock.calls).toEqual([
          [{ name: "QueryCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockedQueryCommand.mock.calls).toEqual([
          partitionQuery("Order#123")
        ]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [{ TransactItems: sentItems }]
        ]);
      });

      it("reports a failed guard as a WriteConditionFailedError naming the relationship", async () => {
        expect.assertions(3);

        cancelTransactWrite([
          { Code: "None" },
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

        const e = await failureOf(remove);

        expect(e.errors).toEqual([
          new WriteConditionFailedError(
            "ConditionalCheckFailed: Write condition failed on Order with ID '123': relationship 'customer'",
            {
              entity: "Order",
              id: "123",
              guards: [{ kind: "relationship", name: "customer" }]
            }
          )
        ]);
        expect(e.errors[0].guards).toEqual([
          { kind: "relationship", name: "customer" }
        ]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [{ TransactItems: sentItems }]
        ]);
      });

      it("reports a concurrent foreign key change, not the guard, even when the old parent also fails the guard", async () => {
        expect.assertions(2);

        cancelTransactWrite([
          {
            Code: "ConditionalCheckFailed",
            Item: {
              PK: { S: "Order#123" },
              SK: { S: "Order" },
              CustomerId: { S: "c9" }
            }
          },
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

        const e = await failureOf(remove);

        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Order with ID '123' no longer references Customer with ID 'c1': its foreign key 'customerId' was changed by a concurrent write"
          )
        ]);
        expect(e.errors[0]).not.toBeInstanceOf(WriteConditionFailedError);
      });

      it("reports a row deleted after the earlier read as not-found, even when the parent also fails the guard (AE15)", async () => {
        expect.assertions(2);

        cancelTransactWrite([
          { Code: "ConditionalCheckFailed" },
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

        const e = await failureOf(remove);

        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Order with ID '123' does not exist"
          )
        ]);
        expect(e.errors[0]).not.toBeInstanceOf(WriteConditionFailedError);
      });

      it("reports a missing parent as a referential-integrity failure", async () => {
        expect.assertions(1);

        cancelTransactWrite([
          { Code: "None" },
          { Code: "None" },
          { Code: "None" },
          { Code: "None" },
          { Code: "None" },
          { Code: "ConditionalCheckFailed" }
        ]);

        const e = await failureOf(remove);

        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Customer with ID 'c1' does not exist"
          )
        ]);
      });

      it("sends a $or of one block naming two attributes in one pair of parentheses on the parent check", async () => {
        expect.assertions(2);

        // A second pair, `… AND (attribute_exists(PK) AND ((… AND …)))`, is
        // rejected by DynamoDB: "The expression has redundant parentheses"
        await Order.delete("123", {
          condition: {
            customer: { $or: [{ name: "Jane", address: "1 Main St" }] }
          }
        });

        expect(mockSend.mock.calls).toEqual([
          [{ name: "QueryCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                sentItems[0],
                ...linkDeletes,
                {
                  ConditionCheck: {
                    TableName: "mock-table",
                    Key: { PK: "Customer#c1", SK: "Customer" },
                    ConditionExpression:
                      "attribute_exists(PK) AND (attribute_exists(PK) AND (#Name = :wc1_Name1 AND #Address = :wc1_Address2))",
                    ExpressionAttributeNames: {
                      "#Name": "Name",
                      "#Address": "Address"
                    },
                    ExpressionAttributeValues: {
                      ":wc1_Name1": "Jane",
                      ":wc1_Address2": "1 Main St"
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

    it("merges a self condition and a BelongsTo pin onto the own Delete, each in its own parentheses", async () => {
      expect.assertions(1);

      await Order.delete("123", {
        condition: {
          orderDate: { $lt: new Date("2023-10-10T00:00:00.000Z") },
          paymentMethod: {}
        }
      });

      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Delete: {
                  TableName: "mock-table",
                  Key: { PK: "Order#123", SK: "Order" },
                  ConditionExpression:
                    "attribute_exists(PK) AND (#PaymentMethodId = :wc3_PaymentMethodId) AND (#OrderDate < :wc2_OrderDate1)",
                  ExpressionAttributeNames: {
                    "#OrderDate": "OrderDate",
                    "#PaymentMethodId": "PaymentMethodId"
                  },
                  ExpressionAttributeValues: {
                    ":wc2_OrderDate1": "2023-10-10T00:00:00.000Z",
                    ":wc3_PaymentMethodId": "pm1"
                  },
                  ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                }
              },
              ...linkDeletes,
              {
                // An empty target condition requires the parent to exist
                ConditionCheck: {
                  TableName: "mock-table",
                  Key: { PK: "PaymentMethod#pm1", SK: "PaymentMethod" },
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

  it("fails before sending when the stored BelongsTo foreign key is not set (AE8)", async () => {
    expect.assertions(6);

    mockQuery.mockResolvedValue({
      Items: [
        {
          PK: "Pet#123",
          SK: "Pet",
          Id: "123",
          Type: "Pet",
          Name: "Fido",
          CreatedAt: "2023-01-01T00:00:00.000Z",
          UpdatedAt: "2023-01-02T00:00:00.000Z"
        }
      ]
    });

    const e = await failureOf(async () => {
      await Pet.delete("123", { condition: { owner: { name: "Jane" } } });
    });

    expect(e).toBeInstanceOf(TransactionWriteFailedError);
    expect(e.message).toEqual("Failed Validations");
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
    expect(e.errors[0]).toBeInstanceOf(WriteConditionFailedError);
    expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([]);
  });

  describe("on an entity whose children have nullable foreign keys", () => {
    const person = {
      PK: "Person#123",
      SK: "Person",
      Id: "123",
      Type: "Person",
      Name: "Jon Doe",
      CreatedAt: "2021-10-14T08:31:15.148Z",
      UpdatedAt: "2022-10-15T08:31:15.148Z"
    };
    const petPersonLink = {
      PK: "Person#123",
      SK: "Pet#001",
      Id: "001",
      Type: "Pet",
      Name: "Pet-1",
      OwnerId: "123",
      CreatedAt: "2021-10-16T09:31:15.148Z",
      UpdatedAt: "2022-10-17T09:31:15.148Z"
    };
    const homePersonLink = {
      PK: "Person#123",
      SK: "Home",
      Id: "002",
      Type: "Home",
      PersonId: "123",
      "MLS#": "ABC123",
      CreatedAt: "2021-10-15T09:31:15.148Z",
      UpdatedAt: "2022-10-15T09:31:15.148Z"
    };
    const addressHomeLink = {
      PK: "Home#002",
      SK: "Address",
      Id: "003",
      Type: "Address",
      State: "CO",
      HomeId: "002",
      PhoneBookId: "111",
      CreatedAt: "2021-11-15T09:31:15.148Z",
      UpdatedAt: "2022-11-16T09:31:15.148Z"
    };

    const queries = [
      partitionQuery("Person#123"),
      [
        {
          TableName: "mock-table",
          KeyConditionExpression: "#PK = :PK2",
          FilterExpression: "#Type IN (:Type1)",
          ExpressionAttributeNames: { "#PK": "PK", "#Type": "Type" },
          ExpressionAttributeValues: { ":PK2": "Pet#001", ":Type1": "Pet" },
          ConsistentRead: true
        }
      ],
      [
        {
          TableName: "mock-table",
          KeyConditionExpression: "#PK = :PK3",
          FilterExpression: "#Type IN (:Type1,:Type2)",
          ExpressionAttributeNames: { "#PK": "PK", "#Type": "Type" },
          ExpressionAttributeValues: {
            ":PK3": "Home#002",
            ":Type1": "Home",
            ":Type2": "Address"
          },
          ConsistentRead: true
        }
      ]
    ];

    /**
     * The Person's own Delete when the delete carries a condition: it
     * requires the row to still exist
     */
    const guardedSelfDelete = {
      Delete: {
        TableName: "mock-table",
        Key: { PK: "Person#123", SK: "Person" },
        ConditionExpression: "attribute_exists(PK)"
      }
    };
    const nullifyPet = {
      Update: {
        TableName: "mock-table",
        Key: { PK: "Pet#001", SK: "Pet" },
        ConditionExpression: "attribute_exists(PK)",
        ExpressionAttributeNames: {
          "#UpdatedAt": "UpdatedAt",
          "#OwnerId": "OwnerId"
        },
        ExpressionAttributeValues: { ":UpdatedAt": now },
        UpdateExpression: "SET #UpdatedAt = :UpdatedAt REMOVE #OwnerId"
      }
    };
    const nullifyHome = {
      Update: {
        TableName: "mock-table",
        Key: { PK: "Home#002", SK: "Home" },
        ConditionExpression: "attribute_exists(PK)",
        ExpressionAttributeNames: {
          "#UpdatedAt": "UpdatedAt",
          "#PersonId": "PersonId"
        },
        ExpressionAttributeValues: { ":UpdatedAt": now },
        UpdateExpression: "SET #UpdatedAt = :UpdatedAt REMOVE #PersonId"
      }
    };
    /**
     * The items queued after the two child-nullify updates
     */
    const trailingItems = [
      {
        Delete: {
          TableName: "mock-table",
          Key: { PK: "Pet#001", SK: "Person" }
        }
      },
      {
        Delete: {
          TableName: "mock-table",
          Key: { PK: "Person#123", SK: "Pet#001" }
        }
      },
      {
        Update: {
          TableName: "mock-table",
          Key: { PK: "Address#003", SK: "Home" },
          ConditionExpression: "attribute_exists(PK)",
          ExpressionAttributeNames: {
            "#UpdatedAt": "UpdatedAt",
            "#PersonId": "PersonId"
          },
          ExpressionAttributeValues: { ":UpdatedAt": now },
          UpdateExpression: "SET #UpdatedAt = :UpdatedAt REMOVE #PersonId"
        }
      },
      {
        Delete: {
          TableName: "mock-table",
          Key: { PK: "Home#002", SK: "Person" }
        }
      },
      {
        Delete: {
          TableName: "mock-table",
          Key: { PK: "Person#123", SK: "Home" }
        }
      }
    ];

    beforeEach(() => {
      mockQuery
        .mockResolvedValueOnce({
          Items: [person, petPersonLink, homePersonLink]
        })
        .mockResolvedValueOnce({
          Items: [{ ...petPersonLink, PK: "Pet#001", SK: "Pet" }]
        })
        .mockResolvedValueOnce({
          Items: [
            { ...homePersonLink, PK: "Home#002", SK: "Home" },
            addressHomeLink
          ]
        });
    });

    describe("a HasMany guard on a nullable child", () => {
      const remove = async (id: string): Promise<void> => {
        await Person.delete("123", {
          condition: { pets: [{ id, condition: { name: "Pet-1" } }] }
        });
      };

      const guardedNullifyPet = {
        // The child guard and its foreign key pin merge into the child's
        // nullify update, queued by the awaited dry-run update
        Update: {
          ...nullifyPet.Update,
          ConditionExpression:
            "attribute_exists(PK) AND (#OwnerId = :wc2_OwnerId) AND (attribute_exists(PK) AND (#Name = :wc1_Name1))",
          ExpressionAttributeNames: {
            "#UpdatedAt": "UpdatedAt",
            "#OwnerId": "OwnerId",
            "#Name": "Name"
          },
          ExpressionAttributeValues: {
            ":UpdatedAt": now,
            ":wc2_OwnerId": "123",
            ":wc1_Name1": "Pet-1"
          },
          ReturnValuesOnConditionCheckFailure: "ALL_OLD"
        }
      };
      const sentItems = [
        guardedSelfDelete,
        guardedNullifyPet,
        nullifyHome,
        ...trailingItems
      ];

      it("merges into that child's nullify update", async () => {
        expect.assertions(3);

        await remove("001");

        expect(mockSend.mock.calls).toEqual([
          [{ name: "QueryCommand" }],
          [{ name: "QueryCommand" }],
          [{ name: "QueryCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockedQueryCommand.mock.calls).toEqual(queries);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [{ TransactItems: sentItems }]
        ]);
      });

      it("reports a child that moved to another parent as not-associated", async () => {
        expect.assertions(2);

        cancelTransactWrite([
          { Code: "None" },
          {
            Code: "ConditionalCheckFailed",
            Item: {
              PK: { S: "Pet#001" },
              SK: { S: "Pet" },
              Name: { S: "Pet-1" },
              OwnerId: { S: "999" }
            }
          },
          ...trailingItems.map(() => ({ Code: "None" })),
          { Code: "None" }
        ]);

        const e = await failureOf(async () => {
          await remove("001");
        });

        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Pet with ID '001' is not associated with Person with ID '123' through 'pets'"
          )
        ]);
        expect(e.errors[0]).not.toBeInstanceOf(WriteConditionFailedError);
      });

      it("reports a failed guard with the relationship and id", async () => {
        expect.assertions(2);

        cancelTransactWrite([
          { Code: "None" },
          {
            Code: "ConditionalCheckFailed",
            Item: {
              PK: { S: "Pet#001" },
              SK: { S: "Pet" },
              Name: { S: "Rex" },
              OwnerId: { S: "123" }
            }
          },
          ...trailingItems.map(() => ({ Code: "None" })),
          { Code: "None" }
        ]);

        const e = await failureOf(async () => {
          await remove("001");
        });

        expect(e.errors).toEqual([
          new WriteConditionFailedError(
            "ConditionalCheckFailed: Write condition failed on Person with ID '123': relationship 'pets' (ID '001')",
            {
              entity: "Person",
              id: "123",
              guards: [{ kind: "relationship", name: "pets", id: "001" }]
            }
          )
        ]);
        expect(e.errors[0].guards).toEqual([
          { kind: "relationship", name: "pets", id: "001" }
        ]);
      });

      it("checks an id the earlier read did not return, which fails as not-associated when it is no child", async () => {
        expect.assertions(2);

        cancelTransactWrite([
          ...[guardedSelfDelete, nullifyPet, nullifyHome, ...trailingItems].map(
            () => ({ Code: "None" })
          ),
          { Code: "ConditionalCheckFailed" }
        ]);

        const e = await failureOf(async () => {
          await remove("009");
        });

        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Pet with ID '009' is not associated with Person with ID '123' through 'pets'"
          )
        ]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                guardedSelfDelete,
                nullifyPet,
                nullifyHome,
                ...trailingItems,
                {
                  ConditionCheck: {
                    TableName: "mock-table",
                    Key: { PK: "Pet#009", SK: "Pet" },
                    ConditionExpression:
                      "attribute_exists(PK) AND (#OwnerId = :wc2_OwnerId) AND (attribute_exists(PK) AND (#Name = :wc1_Name1))",
                    ExpressionAttributeNames: {
                      "#OwnerId": "OwnerId",
                      "#Name": "Name"
                    },
                    ExpressionAttributeValues: {
                      ":wc2_OwnerId": "123",
                      ":wc1_Name1": "Pet-1"
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

    it("merges a HasOne guard on a nullable child into that child's nullify update", async () => {
      expect.assertions(2);

      await Person.delete("123", {
        condition: { home: { neighborhood: null } }
      });

      expect(mockedQueryCommand.mock.calls).toEqual(queries);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              guardedSelfDelete,
              nullifyPet,
              {
                Update: {
                  ...nullifyHome.Update,
                  ConditionExpression:
                    "attribute_exists(PK) AND (#PersonId = :wc2_PersonId) AND (attribute_exists(PK) AND (attribute_not_exists(#Neighborhood)))",
                  ExpressionAttributeNames: {
                    "#UpdatedAt": "UpdatedAt",
                    "#PersonId": "PersonId",
                    "#Neighborhood": "Neighborhood"
                  },
                  ExpressionAttributeValues: {
                    ":UpdatedAt": now,
                    ":wc2_PersonId": "123"
                  },
                  ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                }
              },
              ...trailingItems
            ]
          }
        ]
      ]);
    });

    it("sends exactly today's command for an empty HasMany array (R29)", async () => {
      expect.assertions(1);

      await Person.delete("123", { condition: { pets: [] } });

      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Delete: {
                  TableName: "mock-table",
                  Key: { PK: "Person#123", SK: "Person" }
                }
              },
              nullifyPet,
              nullifyHome,
              ...trailingItems
            ]
          }
        ]
      ]);
    });
  });

  it("fails before sending when the entity has no HasOne child to guard", async () => {
    expect.assertions(3);

    mockQuery.mockResolvedValue({
      Items: [
        {
          PK: "Person#123",
          SK: "Person",
          Id: "123",
          Type: "Person",
          Name: "Jon Doe",
          CreatedAt: "2021-10-14T08:31:15.148Z",
          UpdatedAt: "2022-10-15T08:31:15.148Z"
        }
      ]
    });

    const e = await failureOf(async () => {
      await Person.delete("123", { condition: { home: {} } });
    });

    expect(e.errors).toEqual([
      new WriteConditionFailedError(
        "Write condition failed on Person with ID '123': relationship 'home' references no Home",
        {
          entity: "Person",
          id: "123",
          guards: [{ kind: "relationship", name: "home" }]
        }
      )
    ]);
    expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([]);
  });

  describe("a child guard where the child's foreign key is not nullable", () => {
    it("raises only the NullConstraintViolationError for a HasMany guard, sending nothing", async () => {
      expect.assertions(4);

      mockQuery.mockResolvedValue({
        Items: [
          {
            PK: "PhoneBook#123",
            SK: "PhoneBook",
            Id: "123",
            Type: "PhoneBook",
            Edition: "1",
            CreatedAt: "2021-10-15T08:31:15.148Z",
            UpdatedAt: "2022-10-15T08:31:15.148Z"
          },
          {
            PK: "PhoneBook#123",
            SK: "Address#001",
            Id: "001",
            Type: "Address",
            State: "CO",
            HomeId: "111",
            PhoneBookId: "123",
            CreatedAt: "2021-10-16T09:31:15.148Z",
            UpdatedAt: "2022-10-17T09:31:15.148Z"
          }
        ]
      });

      const e = await failureOf(async () => {
        await PhoneBook.delete("123", {
          condition: {
            addresses: [{ id: "001", condition: { state: "CO" } }]
          }
        });
      });

      expect(e).toBeInstanceOf(TransactionWriteFailedError);
      expect(e.errors).toEqual([
        new NullConstraintViolationError(
          "Cannot set Address with id: '001' attribute 'phoneBookId' to null"
        )
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    });

    it("raises only the NullConstraintViolationError for a HasOne guard, sending nothing", async () => {
      expect.assertions(4);

      mockQuery.mockResolvedValue({
        Items: [
          {
            PK: "Home#123",
            SK: "Home",
            Id: "123",
            Type: "Home",
            "MLS#": "MLS-XXX",
            CreatedAt: "2022-09-02T23:31:21.148Z",
            UpdatedAt: "2022-09-03T23:31:21.148Z"
          },
          {
            PK: "Home#123",
            SK: "Address",
            Id: "002",
            Type: "Address",
            State: "CO",
            HomeId: "123",
            PhoneBookId: "222",
            CreatedAt: "2021-10-17T09:31:15.148Z",
            UpdatedAt: "2022-10-18T09:31:15.148Z"
          }
        ]
      });

      const e = await failureOf(async () => {
        await Home.delete("123", { condition: { address: { state: "CO" } } });
      });

      expect(e).toBeInstanceOf(TransactionWriteFailedError);
      expect(e.errors).toEqual([
        new NullConstraintViolationError(
          "Cannot set Address with id: '002' attribute 'homeId' to null"
        )
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    });

    it("raises only the NullConstraintViolationError for a one-way HasMany guard, sending nothing", async () => {
      expect.assertions(3);

      mockQuery.mockResolvedValue({
        Items: [
          {
            PK: "Organization#123",
            SK: "Organization",
            Id: "123",
            Type: "Organization",
            Name: "Acme",
            CreatedAt: "2021-10-14T08:31:15.148Z",
            UpdatedAt: "2022-10-15T08:31:15.148Z"
          },
          {
            PK: "Organization#123",
            SK: "Founder#001",
            Id: "001",
            Type: "Founder",
            Name: "Founder-1",
            OrganizationId: "123",
            CreatedAt: "2021-10-16T09:31:15.148Z",
            UpdatedAt: "2022-10-17T09:31:15.148Z"
          }
        ]
      });

      const e = await failureOf(async () => {
        await Organization.delete("123", {
          condition: { founders: [{ id: "001", condition: {} }] }
        });
      });

      expect(e.errors).toEqual([
        new NullConstraintViolationError(
          "Cannot set Founder with id: '001' attribute 'organizationId' to null"
        )
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    });
  });

  describe("a HasAndBelongsToMany guard", () => {
    const book = {
      PK: "Book#123",
      SK: "Book",
      Id: "123",
      Type: "Book",
      Name: "Some Name",
      NumPages: 100,
      CreatedAt: "2021-10-15T08:31:15.148Z",
      UpdatedAt: "2022-10-15T08:31:15.148Z"
    };
    const authorCopy = {
      PK: "Book#123",
      SK: "Author#456",
      Id: "456",
      Type: "Author",
      Name: "Author-1",
      CreatedAt: "2024-02-27T03:19:52.667Z",
      UpdatedAt: "2024-02-27T03:19:52.667Z"
    };

    const remove = async (authorId: string): Promise<void> => {
      await Book.delete("123", {
        condition: {
          authors: [{ id: authorId, condition: { name: "Author-1" } }]
        }
      });
    };

    const selfDelete = {
      Delete: {
        TableName: "mock-table",
        Key: { PK: "Book#123", SK: "Book" },
        ConditionExpression: "attribute_exists(PK)"
      }
    };
    const deleteAuthorCopy = {
      Delete: {
        TableName: "mock-table",
        Key: { PK: "Book#123", SK: "Author#456" }
      }
    };
    const sentItems = [
      selfDelete,
      deleteAuthorCopy,
      {
        // Membership merges into the reverse join-link Delete: the link row
        // must still exist and hold this Book
        Delete: {
          TableName: "mock-table",
          Key: { PK: "Author#456", SK: "Book#123" },
          ConditionExpression: "(#Id = :wc2_Id)",
          ExpressionAttributeNames: { "#Id": "Id" },
          ExpressionAttributeValues: { ":wc2_Id": "123" },
          ReturnValuesOnConditionCheckFailure: "ALL_OLD"
        }
      },
      {
        ConditionCheck: {
          TableName: "mock-table",
          Key: { PK: "Author#456", SK: "Author" },
          ConditionExpression:
            "attribute_exists(PK) AND (attribute_exists(PK) AND (#Name = :wc1_Name1))",
          ExpressionAttributeNames: { "#Name": "Name" },
          ExpressionAttributeValues: { ":wc1_Name1": "Author-1" },
          ReturnValuesOnConditionCheckFailure: "ALL_OLD"
        }
      }
    ];

    beforeEach(() => {
      mockQuery.mockResolvedValue({ Items: [book, authorCopy] });
    });

    it("merges membership into the reverse join-link delete and checks the partner row", async () => {
      expect.assertions(3);

      await remove("456");

      expect(mockSend.mock.calls).toEqual([
        [{ name: "QueryCommand" }],
        [{ name: "TransactWriteCommand" }]
      ]);
      expect(mockedQueryCommand.mock.calls).toEqual([
        partitionQuery("Book#123")
      ]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [{ TransactItems: sentItems }]
      ]);
    });

    it("reports a missing link as not-related, not as a failed denormalized delete or the guard", async () => {
      expect.assertions(2);

      cancelTransactWrite([
        { Code: "None" },
        { Code: "None" },
        { Code: "ConditionalCheckFailed" },
        {
          Code: "ConditionalCheckFailed",
          Item: {
            PK: { S: "Author#456" },
            SK: { S: "Author" },
            Name: { S: "Someone Else" }
          }
        }
      ]);

      const e = await failureOf(async () => {
        await remove("456");
      });

      expect(e.errors).toEqual([
        new ConditionalCheckFailedError(
          "ConditionalCheckFailed: Author with ID '456' is not linked to Book with ID '123' through 'authors'"
        )
      ]);
      expect(e.errors[0]).not.toBeInstanceOf(WriteConditionFailedError);
    });

    it("reports a failed partner guard with the relationship and id", async () => {
      expect.assertions(1);

      cancelTransactWrite([
        { Code: "None" },
        { Code: "None" },
        { Code: "None" },
        {
          Code: "ConditionalCheckFailed",
          Item: {
            PK: { S: "Author#456" },
            SK: { S: "Author" },
            Name: { S: "Someone Else" }
          }
        }
      ]);

      const e = await failureOf(async () => {
        await remove("456");
      });

      expect(e.errors).toEqual([
        new WriteConditionFailedError(
          "ConditionalCheckFailed: Write condition failed on Book with ID '123': relationship 'authors' (ID '456')",
          {
            entity: "Book",
            id: "123",
            guards: [{ kind: "relationship", name: "authors", id: "456" }]
          }
        )
      ]);
    });

    it("checks the link row of a partner the earlier read did not return", async () => {
      expect.assertions(1);

      await remove("999");

      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              selfDelete,
              deleteAuthorCopy,
              {
                Delete: {
                  TableName: "mock-table",
                  Key: { PK: "Author#456", SK: "Book#123" }
                }
              },
              {
                ConditionCheck: {
                  TableName: "mock-table",
                  Key: { PK: "Author#999", SK: "Book#123" },
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
                  Key: { PK: "Author#999", SK: "Author" },
                  ConditionExpression:
                    "attribute_exists(PK) AND (attribute_exists(PK) AND (#Name = :wc1_Name1))",
                  ExpressionAttributeNames: { "#Name": "Name" },
                  ExpressionAttributeValues: { ":wc1_Name1": "Author-1" },
                  ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                }
              }
            ]
          }
        ]
      ]);
    });
  });

  it("guards a self-referential HasAndBelongsToMany partner through its reverse join-link delete", async () => {
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

    await Accessory.delete("a1", {
      condition: {
        compatibleAccessories: [{ id: "a2", condition: { name: "Cable" } }]
      }
    });

    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Delete: {
                TableName: "mock-table",
                Key: { PK: "Accessory#a1", SK: "Accessory" },
                ConditionExpression: "attribute_exists(PK)"
              }
            },
            {
              Delete: {
                TableName: "mock-table",
                Key: { PK: "Accessory#a1", SK: "Accessory#a2" }
              }
            },
            {
              Delete: {
                TableName: "mock-table",
                Key: { PK: "Accessory#a2", SK: "Accessory#a1" },
                ConditionExpression: "(#Id = :wc2_Id)",
                ExpressionAttributeNames: { "#Id": "Id" },
                ExpressionAttributeValues: { ":wc2_Id": "a1" },
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

  describe("a foreign key target guard on the child side of a one-way HasMany", () => {
    const employee = {
      PK: "Employee#123",
      SK: "Employee",
      Id: "123",
      Type: "Employee",
      Name: "Mock Employee",
      OrganizationId: "456",
      CreatedAt: "2022-09-02T23:31:21.148Z",
      UpdatedAt: "2022-09-03T23:31:21.148Z"
    };

    const remove = async (): Promise<void> => {
      await Employee.delete("123", {
        condition: { organizationId: { target: { name: "Acme" } } }
      });
    };

    const sentItems = [
      {
        Delete: {
          TableName: "mock-table",
          Key: { PK: "Employee#123", SK: "Employee" },
          ConditionExpression:
            "attribute_exists(PK) AND (#OrganizationId = :wc2_OrganizationId)",
          ExpressionAttributeNames: { "#OrganizationId": "OrganizationId" },
          ExpressionAttributeValues: { ":wc2_OrganizationId": "456" },
          ReturnValuesOnConditionCheckFailure: "ALL_OLD"
        }
      },
      {
        Delete: {
          TableName: "mock-table",
          Key: { PK: "Organization#456", SK: "Employee#123" }
        }
      },
      {
        ConditionCheck: {
          TableName: "mock-table",
          Key: { PK: "Organization#456", SK: "Organization" },
          ConditionExpression:
            "attribute_exists(PK) AND (attribute_exists(PK) AND (#Name = :wc1_Name1))",
          ExpressionAttributeNames: { "#Name": "Name" },
          ExpressionAttributeValues: { ":wc1_Name1": "Acme" },
          ReturnValuesOnConditionCheckFailure: "ALL_OLD"
        }
      }
    ];

    it("checks the owner row with the foreign key pinned on the own Delete", async () => {
      expect.assertions(2);

      mockQuery.mockResolvedValue({ Items: [employee] });

      await remove();

      expect(mockedQueryCommand.mock.calls).toEqual([
        partitionQuery("Employee#123")
      ]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [{ TransactItems: sentItems }]
      ]);
    });

    it("reports a failed owner guard naming the foreign key", async () => {
      expect.assertions(1);

      mockQuery.mockResolvedValue({ Items: [employee] });
      cancelTransactWrite([
        { Code: "None" },
        { Code: "None" },
        {
          Code: "ConditionalCheckFailed",
          Item: {
            PK: { S: "Organization#456" },
            SK: { S: "Organization" },
            Name: { S: "Globex" }
          }
        }
      ]);

      const e = await failureOf(remove);

      expect(e.errors).toEqual([
        new WriteConditionFailedError(
          "ConditionalCheckFailed: Write condition failed on Employee with ID '123': foreign key 'organizationId'",
          {
            entity: "Employee",
            id: "123",
            guards: [{ kind: "foreignKey", name: "organizationId" }]
          }
        )
      ]);
    });

    it("fails before sending when the stored foreign key is not set", async () => {
      expect.assertions(3);

      mockQuery.mockResolvedValue({
        Items: [{ ...employee, OrganizationId: undefined }]
      });

      const e = await failureOf(remove);

      expect(e.errors).toEqual([
        new WriteConditionFailedError(
          "Write condition failed on Employee with ID '123': foreign key 'organizationId' references no Organization",
          {
            entity: "Employee",
            id: "123",
            guards: [{ kind: "foreignKey", name: "organizationId" }]
          }
        )
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    });
  });

  describe("a standalone typed foreign key target guard (R24)", () => {
    const stored = {
      PK: "MyClassWithAllAttributeTypes#123",
      SK: "MyClassWithAllAttributeTypes",
      Id: "123",
      Type: "MyClassWithAllAttributeTypes",
      stringAttribute: "val",
      foreignKeyAttribute: "c1",
      nullableForeignKeyAttribute: "c1",
      CreatedAt: "2023-01-01T00:00:00.000Z",
      UpdatedAt: "2023-01-02T00:00:00.000Z"
    };

    it("checks the referenced row with the foreign key pinned on the own Delete", async () => {
      expect.assertions(2);

      mockQuery.mockResolvedValue({ Items: [stored] });

      await MyClassWithAllAttributeTypes.delete("123", {
        condition: { foreignKeyAttribute: { target: { name: "Jane" } } }
      });

      expect(mockedQueryCommand.mock.calls).toEqual([
        partitionQuery("MyClassWithAllAttributeTypes#123")
      ]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Delete: {
                  TableName: "mock-table",
                  Key: {
                    PK: "MyClassWithAllAttributeTypes#123",
                    SK: "MyClassWithAllAttributeTypes"
                  },
                  ConditionExpression:
                    "attribute_exists(PK) AND (#foreignKeyAttribute = :wc2_foreignKeyAttribute)",
                  ExpressionAttributeNames: {
                    "#foreignKeyAttribute": "foreignKeyAttribute"
                  },
                  ExpressionAttributeValues: {
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

    describe("two guards on the same parent row", () => {
      const remove = async (): Promise<void> => {
        await MyClassWithAllAttributeTypes.delete("123", {
          condition: {
            foreignKeyAttribute: { target: { name: "Jane" } },
            nullableForeignKeyAttribute: { target: { name: "Janet" } }
          }
        });
      };

      beforeEach(() => {
        mockQuery.mockResolvedValue({ Items: [stored] });
      });

      it("merge into one check with distinct placeholders, each foreign key pinned", async () => {
        expect.assertions(1);

        await remove();

        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                {
                  Delete: {
                    TableName: "mock-table",
                    Key: {
                      PK: "MyClassWithAllAttributeTypes#123",
                      SK: "MyClassWithAllAttributeTypes"
                    },
                    ConditionExpression:
                      "attribute_exists(PK) AND (#foreignKeyAttribute = :wc3_foreignKeyAttribute) AND (#nullableForeignKeyAttribute = :wc4_nullableForeignKeyAttribute)",
                    ExpressionAttributeNames: {
                      "#foreignKeyAttribute": "foreignKeyAttribute",
                      "#nullableForeignKeyAttribute":
                        "nullableForeignKeyAttribute"
                    },
                    ExpressionAttributeValues: {
                      ":wc3_foreignKeyAttribute": "c1",
                      ":wc4_nullableForeignKeyAttribute": "c1"
                    },
                    ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                  }
                },
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

        const e = await failureOf(remove);

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
      });

      it("reports a concurrent foreign key change on the own Delete", async () => {
        expect.assertions(1);

        cancelTransactWrite([
          {
            Code: "ConditionalCheckFailed",
            Item: {
              PK: { S: "MyClassWithAllAttributeTypes#123" },
              SK: { S: "MyClassWithAllAttributeTypes" },
              foreignKeyAttribute: { S: "c1" },
              nullableForeignKeyAttribute: { S: "c2" }
            }
          },
          { Code: "None" }
        ]);

        const e = await failureOf(remove);

        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: MyClassWithAllAttributeTypes with ID '123' no longer references Customer with ID 'c1': its foreign key 'nullableForeignKeyAttribute' was changed by a concurrent write"
          )
        ]);
      });
    });

    it("fails before sending when the stored nullable foreign key is not set", async () => {
      expect.assertions(3);

      mockQuery.mockResolvedValue({
        Items: [{ ...stored, nullableForeignKeyAttribute: undefined }]
      });

      const e = await failureOf(async () => {
        await MyClassWithAllAttributeTypes.delete("123", {
          condition: { nullableForeignKeyAttribute: { target: {} } }
        });
      });

      expect(e.errors).toEqual([
        new WriteConditionFailedError(
          "Write condition failed on MyClassWithAllAttributeTypes with ID '123': foreign key 'nullableForeignKeyAttribute' references no Customer",
          {
            entity: "MyClassWithAllAttributeTypes",
            id: "123",
            guards: [
              { kind: "foreignKey", name: "nullableForeignKeyAttribute" }
            ]
          }
        )
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    });
  });

  describe("on a self-referential entity whose guards land on its own row", () => {
    const category = {
      PK: "Category#c1",
      SK: "Category",
      Id: "c1",
      Type: "Category",
      Name: "Home",
      ParentCategoryId: "c1",
      CreatedAt: "2023-01-01T00:00:00.000Z",
      UpdatedAt: "2023-01-02T00:00:00.000Z"
    };
    const deleteOwnLink = {
      // The Category is its own parent, so its link copy in the parent's
      // partition is deleted too
      Delete: {
        TableName: "mock-table",
        Key: { PK: "Category#c1", SK: "Category#c1" }
      }
    };

    beforeEach(() => {
      mockQuery.mockResolvedValue({ Items: [category] });
    });

    it("merges a parent target guard and its pin onto the own Delete", async () => {
      expect.assertions(1);

      await Category.delete("c1", {
        condition: { parentCategoryId: { target: { name: "Home" } } }
      });

      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Delete: {
                  TableName: "mock-table",
                  Key: { PK: "Category#c1", SK: "Category" },
                  ConditionExpression:
                    "attribute_exists(PK) AND (#ParentCategoryId = :wc2_ParentCategoryId) AND (attribute_exists(PK) AND (#Name = :wc1_Name1))",
                  ExpressionAttributeNames: {
                    "#ParentCategoryId": "ParentCategoryId",
                    "#Name": "Name"
                  },
                  ExpressionAttributeValues: {
                    ":wc2_ParentCategoryId": "c1",
                    ":wc1_Name1": "Home"
                  },
                  ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                }
              },
              deleteOwnLink
            ]
          }
        ]
      ]);
    });

    describe("a self condition beside a HasMany guard whose id is the entity's own", () => {
      const remove = async (): Promise<void> => {
        await Category.delete("c1", {
          condition: {
            name: "Home",
            subcategories: [{ id: "c1", condition: {} }]
          }
        });
      };

      const sentItems = [
        {
          Delete: {
            TableName: "mock-table",
            Key: { PK: "Category#c1", SK: "Category" },
            ConditionExpression:
              "attribute_exists(PK) AND (#ParentCategoryId = :wc3_ParentCategoryId) AND (#Name = :wc2_Name1) AND (attribute_exists(PK))",
            ExpressionAttributeNames: {
              "#ParentCategoryId": "ParentCategoryId",
              "#Name": "Name"
            },
            ExpressionAttributeValues: {
              ":wc3_ParentCategoryId": "c1",
              ":wc2_Name1": "Home"
            },
            ReturnValuesOnConditionCheckFailure: "ALL_OLD"
          }
        },
        deleteOwnLink
      ];

      it("merge onto the own Delete", async () => {
        expect.assertions(1);

        await remove();

        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [{ TransactItems: sentItems }]
        ]);
      });

      it("names both guards when the row's check fails (R26)", async () => {
        expect.assertions(1);

        cancelTransactWrite([
          {
            Code: "ConditionalCheckFailed",
            Item: {
              PK: { S: "Category#c1" },
              SK: { S: "Category" },
              Name: { S: "Garden" },
              ParentCategoryId: { S: "c1" }
            }
          },
          { Code: "None" }
        ]);

        const e = await failureOf(remove);

        expect(e.errors).toEqual([
          new WriteConditionFailedError(
            "ConditionalCheckFailed: Write condition failed on Category with ID 'c1': its own row, relationship 'subcategories' (ID 'c1')",
            {
              entity: "Category",
              id: "c1",
              guards: [
                { kind: "self" },
                { kind: "relationship", name: "subcategories", id: "c1" }
              ]
            }
          )
        ]);
      });

      it("reports its own vanished row as not-found (AE15)", async () => {
        expect.assertions(1);

        cancelTransactWrite([
          { Code: "ConditionalCheckFailed" },
          { Code: "None" }
        ]);

        const e = await failureOf(remove);

        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Category with ID 'c1' does not exist"
          )
        ]);
      });
    });
  });

  describe("on an entity whose partition holds another entity's copy with the same id", () => {
    // Pet 123 belongs to Person 123: the copy of its owner in its partition
    // shares its id, but is not its own row
    const pet = {
      PK: "Pet#123",
      SK: "Pet",
      Id: "123",
      Type: "Pet",
      Name: "Fido",
      OwnerId: "123",
      CreatedAt: "2022-09-02T23:31:21.148Z",
      UpdatedAt: "2022-09-03T23:31:21.148Z"
    };
    const ownerCopy = {
      PK: "Pet#123",
      SK: "Person",
      Id: "123",
      Type: "Person",
      Name: "Jane",
      CreatedAt: "2022-09-02T23:31:21.148Z",
      UpdatedAt: "2022-09-03T23:31:21.148Z"
    };

    describe.each([
      { order: "its own row first", items: [pet, ownerCopy] },
      { order: "the copy first", items: [ownerCopy, pet] }
    ])("read with $order", ({ items }) => {
      beforeEach(() => {
        mockQuery.mockResolvedValue({ Items: items });
      });

      it("deletes its own row and treats the same-id copy as a linked copy", async () => {
        expect.assertions(3);

        await Pet.delete("123");

        expect(mockSend.mock.calls).toEqual([
          [{ name: "QueryCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockedQueryCommand.mock.calls).toEqual([
          partitionQuery("Pet#123")
        ]);
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
                  // The BelongsTo link in the owner's partition
                  Delete: {
                    TableName: "mock-table",
                    Key: { PK: "Person#123", SK: "Pet#123" }
                  }
                },
                {
                  // The owner's copy in the Pet's partition
                  Delete: {
                    TableName: "mock-table",
                    Key: { PK: "Pet#123", SK: "Person" }
                  }
                }
              ]
            }
          ]
        ]);
      });
    });
  });

  describe("on a self-referential entity whose own link copy is in its partition", () => {
    const category = {
      PK: "Category#c1",
      SK: "Category",
      Id: "c1",
      Type: "Category",
      Name: "Home",
      ParentCategoryId: "c1",
      CreatedAt: "2023-01-01T00:00:00.000Z",
      UpdatedAt: "2023-01-02T00:00:00.000Z"
    };
    // The Category is its own parent, so the read of its partition also
    // returns its own link copy, with the same id and type as its own row
    const selfCopy = { ...category, SK: "Category#c1" };
    const deleteOwnRow = {
      Delete: {
        TableName: "mock-table",
        Key: { PK: "Category#c1", SK: "Category" }
      }
    };
    const deleteSelfCopy = {
      Delete: {
        TableName: "mock-table",
        Key: { PK: "Category#c1", SK: "Category#c1" }
      }
    };

    describe.each([
      { order: "its own row first", items: [category, selfCopy] },
      { order: "its link copy first", items: [selfCopy, category] }
    ])("read with $order", ({ items }) => {
      beforeEach(() => {
        mockQuery.mockResolvedValue({ Items: items });
      });

      it("an unconditioned delete deletes both its own row and its link copy", async () => {
        expect.assertions(3);

        await Category.delete("c1");

        expect(mockSend.mock.calls).toEqual([
          [{ name: "QueryCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockedQueryCommand.mock.calls).toEqual([
          partitionQuery("Category#c1")
        ]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [{ TransactItems: [deleteOwnRow, deleteSelfCopy] }]
        ]);
      });

      describe("a self condition", () => {
        const remove = async (): Promise<void> => {
          await Category.delete("c1", { condition: { name: "Home" } });
        };

        it("guards the own row's Delete and still deletes the link copy", async () => {
          expect.assertions(3);

          await remove();

          expect(mockSend.mock.calls).toEqual([
            [{ name: "QueryCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockedQueryCommand.mock.calls).toEqual([
            partitionQuery("Category#c1")
          ]);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [
              {
                TransactItems: [
                  {
                    Delete: {
                      TableName: "mock-table",
                      Key: { PK: "Category#c1", SK: "Category" },
                      ConditionExpression:
                        "attribute_exists(PK) AND (#Name = :wc1_Name1)",
                      ExpressionAttributeNames: { "#Name": "Name" },
                      ExpressionAttributeValues: { ":wc1_Name1": "Home" },
                      ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                    }
                  },
                  deleteSelfCopy
                ]
              }
            ]
          ]);
        });

        it("names its own row when the condition fails", async () => {
          expect.assertions(1);

          cancelTransactWrite([
            {
              Code: "ConditionalCheckFailed",
              Item: {
                PK: { S: "Category#c1" },
                SK: { S: "Category" },
                Name: { S: "Garden" }
              }
            },
            { Code: "None" }
          ]);

          const e = await failureOf(remove);

          expect(e.errors).toEqual([
            new WriteConditionFailedError(
              "ConditionalCheckFailed: Write condition failed on Category with ID 'c1': its own row",
              { entity: "Category", id: "c1", guards: [{ kind: "self" }] }
            )
          ]);
        });
      });
    });

    describe("beside the link copy of another subcategory", () => {
      const childCopy = {
        PK: "Category#c1",
        SK: "Category#c2",
        Id: "c2",
        Type: "Category",
        Name: "Garden",
        ParentCategoryId: "c1",
        CreatedAt: "2023-01-01T00:00:00.000Z",
        UpdatedAt: "2023-01-02T00:00:00.000Z"
      };

      beforeEach(() => {
        mockQuery
          .mockResolvedValueOnce({ Items: [category, selfCopy, childCopy] })
          // The other subcategory's partition, read to nullify its foreign key
          .mockResolvedValueOnce({
            Items: [{ ...childCopy, PK: "Category#c2", SK: "Category" }]
          });
      });

      it("nullifies the other subcategory's foreign key but deletes its own link copy only once, without updating its own row", async () => {
        expect.assertions(3);

        await Category.delete("c1");

        expect(mockSend.mock.calls).toEqual([
          [{ name: "QueryCommand" }],
          [{ name: "QueryCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockedQueryCommand.mock.calls).toEqual([
          partitionQuery("Category#c1"),
          [
            {
              TableName: "mock-table",
              KeyConditionExpression: "#PK = :PK2",
              FilterExpression: "#Type IN (:Type1)",
              ExpressionAttributeNames: { "#PK": "PK", "#Type": "Type" },
              ExpressionAttributeValues: {
                ":PK2": "Category#c2",
                ":Type1": "Category"
              },
              ConsistentRead: true
            }
          ]
        ]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                deleteOwnRow,
                deleteSelfCopy,
                {
                  Update: {
                    TableName: "mock-table",
                    Key: { PK: "Category#c2", SK: "Category" },
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeNames: {
                      "#ParentCategoryId": "ParentCategoryId",
                      "#UpdatedAt": "UpdatedAt"
                    },
                    ExpressionAttributeValues: {
                      ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                    },
                    UpdateExpression:
                      "SET #UpdatedAt = :UpdatedAt REMOVE #ParentCategoryId"
                  }
                },
                {
                  Delete: {
                    TableName: "mock-table",
                    Key: { PK: "Category#c1", SK: "Category#c2" }
                  }
                }
              ]
            }
          ]
        ]);
      });
    });
  });

  describe("a dot path at the top level of the entity's own row (R4, R23)", () => {
    const remove = async (): Promise<void> => {
      await MyClassWithAllAttributeTypes.delete("123", {
        condition: {
          "objectAttribute.name": "Jane",
          "addressAttribute.geo.lat": { $between: [1, 2] },
          "objectAttribute.deletedAt": null
        }
      });
    };

    const guardedItems = [
      {
        Delete: {
          TableName: "mock-table",
          Key: {
            PK: "MyClassWithAllAttributeTypes#123",
            SK: "MyClassWithAllAttributeTypes"
          },
          ConditionExpression:
            "attribute_exists(PK) AND (#objectAttribute.#name = :wc1_objectAttributename1 AND #addressAttribute.#geo.#lat BETWEEN :wc1_addressAttributegeolat2 AND :wc1_addressAttributegeolat3 AND attribute_not_exists(#objectAttribute.#deletedAt))",
          ExpressionAttributeNames: {
            "#objectAttribute": "objectAttribute",
            "#name": "name",
            "#addressAttribute": "addressAttribute",
            "#geo": "geo",
            "#lat": "lat",
            "#deletedAt": "deletedAt"
          },
          ExpressionAttributeValues: {
            ":wc1_objectAttributename1": "Jane",
            ":wc1_addressAttributegeolat2": 1,
            ":wc1_addressAttributegeolat3": 2
          },
          ReturnValuesOnConditionCheckFailure: "ALL_OLD"
        }
      }
    ];

    beforeEach(() => {
      mockQuery.mockResolvedValue({
        Items: [
          {
            PK: "MyClassWithAllAttributeTypes#123",
            SK: "MyClassWithAllAttributeTypes",
            Id: "123",
            Type: "MyClassWithAllAttributeTypes",
            CreatedAt: "2023-01-01T00:00:00.000Z",
            UpdatedAt: "2023-01-02T00:00:00.000Z"
          }
        ]
      });
    });

    it("merges the nested paths onto the own Delete", async () => {
      expect.assertions(3);

      await remove();

      expect(mockSend.mock.calls).toEqual([
        [{ name: "QueryCommand" }],
        [{ name: "TransactWriteCommand" }]
      ]);
      expect(mockedQueryCommand.mock.calls).toEqual([
        partitionQuery("MyClassWithAllAttributeTypes#123")
      ]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [{ TransactItems: guardedItems }]
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

      const e = await failureOf(remove);

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
        [{ TransactItems: guardedItems }]
      ]);
    });

    it("rejects a path continuing past a scalar before any read", async () => {
      expect.assertions(4);

      const e = await failureOf(
        async () =>
          await MyClassWithAllAttributeTypes.delete("123", {
            condition: {
              // @ts-expect-error zip is a number, which has no fields
              "addressAttribute.zip.nope": 1
            }
          })
      );

      expect(e).toEqual(
        new FilterError(
          'Invalid filter key "addressAttribute.zip.nope": "zip" is not an object, so it has no field "nope" and the condition can match nothing'
        )
      );
      expect(mockSend.mock.calls).toEqual([]);
      expect(mockedQueryCommand.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    });

    it("rejects a $contains operand that is not an element of the list before any read", async () => {
      expect.assertions(4);

      const e = await failureOf(
        async () =>
          await MyClassWithAllAttributeTypes.delete("123", {
            condition: {
              // @ts-expect-error scores holds numbers
              "addressAttribute.scores": { $contains: "5" }
            }
          })
      );

      expect(e).toEqual(
        new FilterError(
          'Invalid filter value for attribute "addressAttribute.scores": $contains on a list looks for one of its elements, and this list\'s elements are stored as a number, which this operand is not'
        )
      );
      expect(mockSend.mock.calls).toEqual([]);
      expect(mockedQueryCommand.mock.calls).toEqual([]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([]);
    });
  });

  describe("an invalid condition", () => {
    it("throws a FilterError before any read when a HasMany id is guarded twice (R25)", async () => {
      expect.assertions(3);

      const e = await failureOf(async () => {
        await Person.delete("123", {
          condition: {
            pets: [
              { id: "001", condition: { name: "Pet-1" } },
              { id: "001", condition: {} }
            ]
          }
        });
      });

      expect(e).toBeInstanceOf(FilterError);
      expect(e.message).toEqual(
        'Invalid write condition for "pets": id "001" is guarded twice. Combine its conditions into one entry'
      );
      expect(mockSend.mock.calls).toEqual([]);
    });

    it("throws a FilterError before any read for an empty $or (R29)", async () => {
      expect.assertions(2);

      const e = await failureOf(async () => {
        await Order.delete("123", { condition: { $or: [] } });
      });

      expect(e).toBeInstanceOf(FilterError);
      expect(mockSend.mock.calls).toEqual([]);
    });

    it("throws a FilterError before any read for an undefined operand", async () => {
      expect.assertions(2);

      const maybeName: string | undefined = undefined;

      const e = await failureOf(async () => {
        await Customer.delete("123", { condition: { name: maybeName } });
      });

      expect(e).toBeInstanceOf(FilterError);
      expect(mockSend.mock.calls).toEqual([]);
    });
  });
});

@Table({
  name: "search-delete-table",
  defaultFields: {
    id: { alias: "Id" },
    type: { alias: "Type" },
    createdAt: { alias: "CreatedAt" },
    updatedAt: { alias: "UpdatedAt" }
  }
})
abstract class SearchDeleteTable extends DynaRecord {
  @PartitionKeyAttribute({ alias: "PK" })
  public readonly pk: PartitionKey;

  @SortKeyAttribute({ alias: "SK" })
  public readonly sk: SortKey;
}

@Entity
class DeletableStore extends SearchDeleteTable {
  declare readonly type: "DeletableStore";

  @StringAttribute({ alias: "Name" })
  public readonly name: string;

  @HasMany(() => DeletableListing, { foreignKey: "storeId" })
  public readonly listings: DeletableListing[];
}

@Entity
class DeletableListing extends SearchDeleteTable {
  declare readonly type: "DeletableListing";

  @Searchable()
  @StringAttribute({ alias: "Description" })
  public readonly description: SearchableText;

  @ForeignKeyAttribute(() => DeletableStore, {
    alias: "StoreId",
    nullable: true
  })
  public readonly storeId?: NullableForeignKey<DeletableStore>;

  @BelongsTo(() => DeletableStore, { foreignKey: "storeId" })
  public readonly store: DeletableStore;
}

SearchDeleteTable.vectorIndexes({
  deletableSearchIndex: {
    name: "deletable-search-index",
    vectorAttribute: "__dyna_vector",
    model: TitanTextEmbedV2,
    provider: mockEmbeddingProvider,
    members: [() => DeletableListing]
  }
});

describe("Delete searchable entities (vector write path)", () => {
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

  it("will never call the embedding provider when deleting a parent whose searchable children have their foreign keys nullified", async () => {
    expect.assertions(2);

    const store = {
      PK: "DeletableStore#123",
      SK: "DeletableStore",
      Id: "123",
      Type: "DeletableStore",
      Name: "Mock Store",
      CreatedAt: "2023-10-01T00:00:00.000Z",
      UpdatedAt: "2023-10-02T00:00:00.000Z"
    };

    // Searchable listing denormalized to the store partition
    const listingStoreLink = {
      PK: "DeletableStore#123",
      SK: "DeletableListing#456",
      Id: "456",
      Type: "DeletableListing",
      Description: "A listing description",
      StoreId: "123",
      CreatedAt: "2023-10-03T00:00:00.000Z",
      UpdatedAt: "2023-10-04T00:00:00.000Z"
    };

    // Initial prefetch of the store partition
    mockQuery.mockResolvedValueOnce({ Items: [store, listingStoreLink] });

    // Nullification prefetch of the listing partition — the canonical row
    // carries vector attributes
    const listing = {
      ...listingStoreLink,
      PK: "DeletableListing#456",
      SK: "DeletableListing",
      __dyna_vector: [0.1, 0.2]
    };
    mockQuery.mockResolvedValueOnce({ Items: [listing] });

    await DeletableStore.delete("123");

    // The FK-nullification path can never enter the embedding branch
    expect(mockEmbeddingProviderCalls).toEqual([]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              // Delete the store
              Delete: {
                TableName: "search-delete-table",
                Key: { PK: "DeletableStore#123", SK: "DeletableStore" }
              }
            },
            {
              // Nullify the listing's foreign key without vector clauses —
              // the listing's searchable value is untouched, so its vector
              // stays valid
              Update: {
                TableName: "search-delete-table",
                Key: { PK: "DeletableListing#456", SK: "DeletableListing" },
                ConditionExpression: "attribute_exists(PK)",
                UpdateExpression: "SET #UpdatedAt = :UpdatedAt REMOVE #StoreId",
                ExpressionAttributeNames: {
                  "#StoreId": "StoreId",
                  "#UpdatedAt": "UpdatedAt"
                },
                ExpressionAttributeValues: {
                  ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                }
              }
            },
            {
              // Delete the denormalized store from the listing partition
              Delete: {
                TableName: "search-delete-table",
                Key: { PK: "DeletableListing#456", SK: "DeletableStore" }
              }
            },
            {
              // Delete the denormalized listing from the store partition
              Delete: {
                TableName: "search-delete-table",
                Key: { PK: "DeletableStore#123", SK: "DeletableListing#456" }
              }
            }
          ]
        }
      ]
    ]);
  });
});
