import { AuthorBook, StudentCourse } from "../integration/mockModels";
import { v4 as uuidv4 } from "uuid";
import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { ConditionalCheckFailedError } from "../../src/dynamo-utils";

jest.mock("uuid");

const mockTransactWriteCommand = jest.mocked(TransactWriteCommand);
const mockSend = jest.fn();
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
          })
        };
      })
    },

    TransactWriteCommand: jest.fn().mockImplementation(() => {
      return { name: "TransactWriteCommand" };
    })
  };
});

describe("JoinTable", () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("create", () => {
    it("will create a BelongsToLink entry for each item in a HasAndBelongsToMany relationship", async () => {
      expect.assertions(3);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedUuidv4.mockReturnValueOnce("uuid1").mockReturnValueOnce("uuid2");

      // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
      expect(await AuthorBook.create({ authorId: "1", bookId: "2" })).toEqual(
        undefined
      );
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                // Create BelongsToLink to link Book to Author
                Put: {
                  TableName: "mock-table",
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: {
                    PK: "Author#1",
                    SK: "Book#2",
                    Id: "uuid1",
                    ForeignKey: "2",
                    ForeignEntityType: "Book",
                    Type: "BelongsToLink",
                    CreatedAt: "2023-10-16T03:31:35.918Z",
                    UpdatedAt: "2023-10-16T03:31:35.918Z"
                  }
                }
              },
              // Check that the author exists
              {
                ConditionCheck: {
                  TableName: "mock-table",
                  ConditionExpression: "attribute_exists(PK)",
                  Key: { PK: "Author#1", SK: "Author" }
                }
              },
              {
                // Create BelongsToLink to link Book to Author
                Put: {
                  TableName: "mock-table",
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: {
                    PK: "Book#2",
                    SK: "Author#1",
                    Id: "uuid2",
                    ForeignKey: "1",
                    ForeignEntityType: "Author",
                    Type: "BelongsToLink",
                    CreatedAt: "2023-10-16T03:31:35.918Z",
                    UpdatedAt: "2023-10-16T03:31:35.918Z"
                  }
                }
              },
              {
                // Check that the book exists
                ConditionCheck: {
                  TableName: "mock-table",
                  ConditionExpression: "attribute_exists(PK)",
                  Key: { PK: "Book#2", SK: "Book" }
                }
              }
            ]
          }
        ]
      ]);
    });

    it("alternate table style - will create a BelongsToLink entry for each item in a HasAndBelongsToMany relationship", async () => {
      expect.assertions(3);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedUuidv4.mockReturnValueOnce("uuid1").mockReturnValueOnce("uuid2");

      // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
      const res = await StudentCourse.create({ studentId: "1", courseId: "2" });

      expect(res).toEqual(undefined);
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Put: {
                  TableName: "other-table",
                  ConditionExpression: "attribute_not_exists(myPk)",
                  Item: {
                    myPk: "Course|2",
                    mySk: "Student|1",
                    id: "uuid1",
                    type: "BelongsToLink",
                    foreignKey: "1",
                    foreignEntityType: "Student",
                    createdAt: "2023-10-16T03:31:35.918Z",
                    updatedAt: "2023-10-16T03:31:35.918Z"
                  }
                }
              },
              {
                ConditionCheck: {
                  Key: { myPk: "Course|2", mySk: "Course" },
                  TableName: "other-table",
                  ConditionExpression: "attribute_exists(myPk)"
                }
              },
              {
                Put: {
                  TableName: "other-table",
                  ConditionExpression: "attribute_not_exists(myPk)",
                  Item: {
                    myPk: "Student|1",
                    mySk: "Course|2",
                    id: "uuid2",
                    type: "BelongsToLink",
                    foreignKey: "2",
                    foreignEntityType: "Course",
                    createdAt: "2023-10-16T03:31:35.918Z",
                    updatedAt: "2023-10-16T03:31:35.918Z"
                  }
                }
              },
              {
                ConditionCheck: {
                  TableName: "other-table",
                  Key: { myPk: "Student|1", mySk: "Student" },
                  ConditionExpression: "attribute_exists(myPk)"
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
