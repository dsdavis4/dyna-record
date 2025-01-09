import {
  Author,
  AuthorBook,
  Book,
  Course,
  Student,
  StudentCourse,
  User,
  UserWebsite,
  Website
} from "../integration/mockModels";
import { v4 as uuidv4 } from "uuid";
import {
  TransactWriteCommand,
  TransactGetCommand
} from "@aws-sdk/lib-dynamodb";
import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { ConditionalCheckFailedError } from "../../src/dynamo-utils";
import {
  MockTableEntityTableItem,
  OtherTableEntityTableItem
} from "../integration/utils";

jest.mock("uuid"); // TODO delete

const mockTransactWriteCommand = jest.mocked(TransactWriteCommand);
const mockTransactGetCommand = jest.mocked(TransactGetCommand);

const mockSend = jest.fn();
const mockTransactGetItems = jest.fn();

const mockedUuidv4 = jest.mocked(uuidv4); // TODO delete

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
          })
        };
      })
    },
    TransactGetCommand: jest.fn().mockImplementation(() => {
      return { name: "TransactGetCommand" };
    }),
    TransactWriteCommand: jest.fn().mockImplementation(() => {
      return { name: "TransactWriteCommand" };
    })
  };
});

describe("JoinTable", () => {
  beforeAll(() => {
    // TODO delete
    jest.useFakeTimers();
  });

  afterAll(() => {
    // TODO delete
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();

    mockSend.mockReset();
    mockTransactGetItems.mockReset();
  });

  describe("create", () => {
    it("will denormalize links for each item in a HasAndBelongsToMany relationship", async () => {
      expect.assertions(4);

      const author: MockTableEntityTableItem<Author> = {
        PK: "Author#1",
        SK: "Author",
        Id: "1",
        Type: "Author",
        Name: "Author-1",
        CreatedAt: "2024-02-27T03:19:52.667Z",
        UpdatedAt: "2024-02-27T03:19:52.667Z"
      };

      const book: MockTableEntityTableItem<Book> = {
        PK: "Book#2",
        SK: "Book",
        Id: "2",
        Type: "Book",
        Name: "Some Name",
        NumPages: 100,
        CreatedAt: "2021-10-15T08:31:15.148Z",
        UpdatedAt: "2022-10-15T08:31:15.148Z"
      };

      mockTransactGetItems.mockResolvedValue({
        Responses: [{ Item: author }, { Item: book }]
      });

      // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
      expect(await AuthorBook.create({ authorId: "1", bookId: "2" })).toEqual(
        undefined
      );
      expect(mockSend.mock.calls).toEqual([
        [{ name: "TransactGetCommand" }],
        [{ name: "TransactWriteCommand" }]
      ]);
      expect(mockTransactGetCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Get: {
                  TableName: "mock-table",
                  Key: { PK: "Author#1", SK: "Author" }
                }
              },
              {
                Get: {
                  TableName: "mock-table",
                  Key: { PK: "Book#2", SK: "Book" }
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
                Put: {
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: {
                    PK: "Author#1",
                    SK: "Book#2",
                    Id: "2",
                    Type: "Book",
                    Name: "Some Name",
                    NumPages: 100,
                    CreatedAt: "2021-10-15T08:31:15.148Z",
                    UpdatedAt: "2022-10-15T08:31:15.148Z"
                  },
                  TableName: "mock-table"
                }
              },
              {
                ConditionCheck: {
                  ConditionExpression: "attribute_exists(PK)",
                  Key: {
                    PK: "Author#1",
                    SK: "Author"
                  },
                  TableName: "mock-table"
                }
              },
              {
                Put: {
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: {
                    PK: "Book#2",
                    SK: "Author#1",
                    Id: "1",
                    Type: "Author",
                    Name: "Author-1",
                    CreatedAt: "2024-02-27T03:19:52.667Z",
                    UpdatedAt: "2024-02-27T03:19:52.667Z"
                  },
                  TableName: "mock-table"
                }
              },
              {
                ConditionCheck: {
                  ConditionExpression: "attribute_exists(PK)",
                  Key: {
                    PK: "Book#2",
                    SK: "Book"
                  },
                  TableName: "mock-table"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("alternate table style - will create a BelongsToLink entry for each item in a HasAndBelongsToMany relationship", async () => {
      expect.assertions(4);

      const student: OtherTableEntityTableItem<Student> = {
        myPk: "Student|1",
        mySk: "Student",
        id: "1",
        type: "Student",
        name: "MockName",
        createdAt: "2024-03-01T00:00:00.000Z",
        updatedAt: "2024-03-02T00:00:00.000Z"
      };

      const course: OtherTableEntityTableItem<Course> = {
        myPk: "Course|2",
        mySk: "Course",
        id: "2",
        type: "Course",
        name: "Math",
        teacherId: "001",
        createdAt: "2023-01-15T12:12:18.123Z",
        updatedAt: "2023-02-15T08:31:15.148Z"
      };

      mockTransactGetItems.mockResolvedValue({
        Responses: [{ Item: student }, { Item: course }]
      });

      // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
      const res = await StudentCourse.create({ studentId: "1", courseId: "2" });

      expect(res).toEqual(undefined);
      expect(mockSend.mock.calls).toEqual([
        [{ name: "TransactGetCommand" }],
        [{ name: "TransactWriteCommand" }]
      ]);
      expect(mockTransactGetCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Get: {
                  TableName: "other-table",
                  Key: { myPk: "Course|2", mySk: "Course" }
                }
              },
              {
                Get: {
                  TableName: "other-table",
                  Key: { myPk: "Student|1", mySk: "Student" }
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
                Put: {
                  ConditionExpression: "attribute_not_exists(myPk)",
                  Item: {
                    myPk: "Course|2",
                    mySk: "Student|1",
                    id: "1",
                    type: "Student",
                    name: "MockName",
                    createdAt: "2024-03-01T00:00:00.000Z",
                    updatedAt: "2024-03-02T00:00:00.000Z"
                  },
                  TableName: "other-table"
                }
              },
              {
                ConditionCheck: {
                  ConditionExpression: "attribute_exists(myPk)",
                  Key: {
                    myPk: "Course|2",
                    mySk: "Course"
                  },
                  TableName: "other-table"
                }
              },
              {
                Put: {
                  ConditionExpression: "attribute_not_exists(myPk)",
                  Item: {
                    myPk: "Student|1",
                    mySk: "Course|2",
                    id: "2",
                    type: "Course",
                    name: "Math",
                    teacherId: "001",
                    createdAt: "2023-01-15T12:12:18.123Z",
                    updatedAt: "2023-02-15T08:31:15.148Z"
                  },
                  TableName: "other-table"
                }
              },
              {
                ConditionCheck: {
                  ConditionExpression: "attribute_exists(myPk)",
                  Key: {
                    myPk: "Student|1",
                    mySk: "Student"
                  },
                  TableName: "other-table"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("with custom id field - will create a BelongsToLink entry for each item in a HasAndBelongsToMany relationship", async () => {
      expect.assertions(4);

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
        PK: "Website#2",
        SK: "Website",
        Id: "2",
        Type: "Website",
        Name: "Website-1",
        CreatedAt: "2024-02-27T03:19:52.667Z",
        UpdatedAt: "2024-02-27T03:19:52.667Z"
      };

      mockTransactGetItems.mockResolvedValue({
        Responses: [{ Item: user }, { Item: website }]
      });

      expect(
        // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
        await UserWebsite.create({ userId: "email@email.com", websiteId: "2" })
      ).toEqual(undefined);
      expect(mockSend.mock.calls).toEqual([
        [{ name: "TransactGetCommand" }],
        [{ name: "TransactWriteCommand" }]
      ]);
      expect(mockTransactGetCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Get: {
                  TableName: "mock-table",
                  Key: { PK: "Website#2", SK: "Website" }
                }
              },
              {
                Get: {
                  TableName: "mock-table",
                  Key: { PK: "User#email@email.com", SK: "User" }
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
                Put: {
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: {
                    PK: "Website#2",
                    SK: "User#email@email.com",
                    Id: "email@email.com",
                    Type: "User",
                    Name: "Some Name",
                    Email: "test@test.com",
                    CreatedAt: "2021-10-15T08:31:15.148Z",
                    UpdatedAt: "2022-10-15T08:31:15.148Z"
                  },
                  TableName: "mock-table"
                }
              },
              {
                ConditionCheck: {
                  ConditionExpression: "attribute_exists(PK)",
                  Key: {
                    PK: "Website#2",
                    SK: "Website"
                  },
                  TableName: "mock-table"
                }
              },
              {
                Put: {
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: {
                    PK: "User#email@email.com",
                    SK: "Website#2",
                    Id: "2",
                    Type: "Website",
                    Name: "Website-1",
                    CreatedAt: "2024-02-27T03:19:52.667Z",
                    UpdatedAt: "2024-02-27T03:19:52.667Z"
                  },
                  TableName: "mock-table"
                }
              },
              {
                ConditionCheck: {
                  ConditionExpression: "attribute_exists(PK)",
                  Key: {
                    PK: "User#email@email.com",
                    SK: "User"
                  },
                  TableName: "mock-table"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("throws an error if the request fails because the entities are already linked", async () => {
      expect.assertions(2);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedUuidv4.mockReturnValueOnce("uuid1").mockReturnValueOnce("uuid2");

      mockSend.mockImplementationOnce(() => {
        throw new TransactionCanceledException({
          message: "MockMessage",
          CancellationReasons: [
            { Code: "ConditionalCheckFailed" },
            { Code: "None" },
            { Code: "ConditionalCheckFailed" },
            { Code: "None" }
          ],
          $metadata: {}
        });
      });

      try {
        await AuthorBook.create({ authorId: "1", bookId: "2" });
      } catch (e: any) {
        expect(e.constructor.name).toEqual("TransactionWriteFailedError");
        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Author with ID 1 is already linked to Book with ID 2"
          ),
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Book with ID 2 is already linked to Author with ID 1"
          )
        ]);
      }
    });

    it("throws an error if either of the entities do not exist", async () => {
      expect.assertions(2);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedUuidv4.mockReturnValueOnce("uuid1").mockReturnValueOnce("uuid2");

      mockSend.mockImplementationOnce(() => {
        throw new TransactionCanceledException({
          message: "MockMessage",
          CancellationReasons: [
            { Code: "None" },
            { Code: "ConditionalCheckFailed" },
            { Code: "None" },
            { Code: "ConditionalCheckFailed" }
          ],
          $metadata: {}
        });
      });

      try {
        await AuthorBook.create({ authorId: "1", bookId: "2" });
      } catch (e: any) {
        expect(e.constructor.name).toEqual("TransactionWriteFailedError");
        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Author with ID 1 does not exist"
          ),
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Book with ID 2 does not exist"
          )
        ]);
      }
    });
  });

  describe("delete", () => {
    it("will delete a BelongsToLink entry for each item in a HasAndBelongsToMany relationship", async () => {
      expect.assertions(3);

      // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
      expect(await AuthorBook.delete({ authorId: "1", bookId: "2" })).toEqual(
        undefined
      );
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                // Create BelongsToLink to link Book to Author
                Delete: {
                  TableName: "mock-table",
                  ConditionExpression: "attribute_exists(PK)",
                  Key: {
                    PK: "Author#1",
                    SK: "Book#2"
                  }
                }
              },
              {
                // Create BelongsToLink to link Book to Author
                Delete: {
                  TableName: "mock-table",
                  ConditionExpression: "attribute_exists(PK)",
                  Key: {
                    PK: "Book#2",
                    SK: "Author#1"
                  }
                }
              }
            ]
          }
        ]
      ]);
    });

    it("alternate table style - will delete a BelongsToLink for each item in a HasAndBelongsToMany relationship", async () => {
      expect.assertions(3);

      // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
      const res = await StudentCourse.delete({ studentId: "1", courseId: "2" });

      expect(res).toEqual(undefined);
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Delete: {
                  TableName: "other-table",
                  Key: { myPk: "Course|2", mySk: "Student|1" },
                  ConditionExpression: "attribute_exists(myPk)"
                }
              },
              {
                Delete: {
                  TableName: "other-table",
                  Key: { myPk: "Student|1", mySk: "Course|2" },
                  ConditionExpression: "attribute_exists(myPk)"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("with custom id field - will delete a BelongsToLink entry for each item in a HasAndBelongsToMany relationship", async () => {
      expect.assertions(3);

      expect(
        // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
        await UserWebsite.delete({ userId: "email@email.com", websiteId: "2" })
      ).toEqual(undefined);
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Delete: {
                  ConditionExpression: "attribute_exists(PK)",
                  Key: { PK: "Website#2", SK: "User#email@email.com" },
                  TableName: "mock-table"
                }
              },
              {
                Delete: {
                  ConditionExpression: "attribute_exists(PK)",
                  Key: { PK: "User#email@email.com", SK: "Website#2" },
                  TableName: "mock-table"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("will throw an error if the request fails because the entities are not linked", async () => {
      expect.assertions(2);

      mockSend.mockImplementationOnce(() => {
        throw new TransactionCanceledException({
          message: "MockMessage",
          CancellationReasons: [
            { Code: "ConditionalCheckFailed" },
            { Code: "ConditionalCheckFailed" }
          ],
          $metadata: {}
        });
      });

      try {
        await AuthorBook.delete({ authorId: "1", bookId: "2" });
      } catch (e: any) {
        expect(e.constructor.name).toEqual("TransactionWriteFailedError");
        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Author with ID 1 is not linked to Book with ID 2"
          ),
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Book with ID 2 is not linked to Author with ID 1"
          )
        ]);
      }
    });
  });

  describe("types", () => {
    describe("create", () => {
      it("will not have type errors when the signature includes one of the joined models and all foreign keys", async () => {
        // @ts-expect-no-error: Signature includes model on join table, and all foreign keys
        await AuthorBook.create({ authorId: "123", bookId: "456" });
      });

      it("has an error if either of the foreign keys are missing", async () => {
        // @ts-expect-error: Missing a foreign key
        await AuthorBook.create({ bookId: "456" });
        // @ts-expect-error: Missing a foreign key
        await AuthorBook.create({ authorId: "123" });
      });

      it("has an error if foreign keys are not valid keys", async () => {
        // @ts-expect-error: Invalid key
        await AuthorBook.create({ bad: "123", bookId: "456" });
      });

      it("has an error if the foreign keys are not strings", async () => {
        // @ts-expect-error: Invalid key value
        await AuthorBook.create({ authorId: 1, bookId: "456" });

        // @ts-expect-error: Invalid key value
        await AuthorBook.create({ authorId: true, bookId: "456" });

        // @ts-expect-error: Invalid key value
        await AuthorBook.create({ authorId: false, bookId: "456" });

        // @ts-expect-error: Invalid key value
        await AuthorBook.create({ authorId: null, bookId: "456" });
      });
    });

    describe("delete", () => {
      it("will not have type errors when the signature includes one of the joined models and all foreign keys", async () => {
        // @ts-expect-no-error: Signature includes model on join table, and all foreign keys
        await AuthorBook.delete({ authorId: "123", bookId: "456" });
      });

      it("has an error if either of the foreign keys are missing", async () => {
        // @ts-expect-error: Missing a foreign key
        await AuthorBook.delete({ bookId: "456" });
        // @ts-expect-error: Missing a foreign key
        await AuthorBook.delete({ authorId: "123" });
      });

      it("has an error if foreign keys are not valid keys", async () => {
        // @ts-expect-error: Invalid key
        await AuthorBook.delete({ bad: "123", bookId: "456" });
      });

      it("has an error if the foreign keys are not strings", async () => {
        // @ts-expect-error: Invalid key value
        await AuthorBook.delete({ authorId: 1, bookId: "456" });

        // @ts-expect-error: Invalid key value
        await AuthorBook.delete({ authorId: true, bookId: "456" });

        // @ts-expect-error: Invalid key value
        await AuthorBook.delete({ authorId: false, bookId: "456" });

        // @ts-expect-error: Invalid key value
        await AuthorBook.delete({ authorId: null, bookId: "456" });
      });
    });
  });
});
