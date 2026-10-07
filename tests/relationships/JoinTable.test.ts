import {
  type Accessory,
  type Author,
  AuthorBook,
  type Book,
  CompatibleAccessory,
  type Course,
  type Customer,
  MockTable,
  type MyClassWithAllAttributeTypes,
  type Student,
  StudentCourse,
  type User,
  UserWebsite,
  type Website
} from "../integration/mockModels.js";
import {
  TransactWriteCommand,
  TransactGetCommand
} from "@aws-sdk/lib-dynamodb";
import {
  TransactionCanceledException,
  type CancellationReason
} from "@aws-sdk/client-dynamodb";
import {
  ConditionalCheckFailedError,
  TransactionWriteFailedError,
  WriteConditionFailedError
} from "../../src/dynamo-utils/index.js";
import {
  type MockTableEntityTableItem,
  type OtherTableEntityTableItem
} from "../integration/utils.js";
import { NotFoundError } from "../../src/index.js";
import { FilterError } from "../../src/errors.js";
import {
  Entity,
  EnumAttribute,
  HasAndBelongsToMany,
  NumberAttribute,
  ObjectAttribute,
  StringAttribute
} from "../../src/decorators/index.js";
import type {
  InferObjectSchema,
  ObjectSchema
} from "../../src/decorators/index.js";
import { JoinTable } from "../../src/relationships/index.js";
import type { ForeignKey } from "../../src/types.js";
import Logger from "../../src/Logger.js";

const mockTransactWriteCommand = vi.mocked(TransactWriteCommand);
const mockTransactGetCommand = vi.mocked(TransactGetCommand);

const mockSend = vi.fn();
const mockTransactGetItems = vi.fn();
const mockTransactWriteItems = vi.fn();

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
            if (command.name === "TransactGetCommand") {
              return await Promise.resolve(mockTransactGetItems());
            }

            if (command.name === "TransactWriteCommand") {
              return await Promise.resolve(mockTransactWriteItems());
            }
          })
        };
      })
    },
    TransactGetCommand: vi.fn().mockImplementation(() => {
      return { name: "TransactGetCommand" };
    }),
    TransactWriteCommand: vi.fn().mockImplementation(() => {
      return { name: "TransactWriteCommand" };
    })
  };
});

// The shared join tables declare bare foreign keys, which take no guards. This
// one declares its keys with their target types, so its links can be guarded
@Entity
class Product extends MockTable {
  declare readonly type: "Product";

  @StringAttribute({ alias: "Name" })
  public readonly name: string;

  @NumberAttribute({ alias: "Price" })
  public readonly price: number;

  @HasAndBelongsToMany(() => Supplier, {
    targetKey: "products",
    through: () => ({ joinTable: ProductSupplier, foreignKey: "productId" })
  })
  public readonly suppliers: Supplier[];
}

@Entity
class Supplier extends MockTable {
  declare readonly type: "Supplier";

  @StringAttribute({ alias: "Name" })
  public readonly name: string;

  @EnumAttribute({ alias: "Status", values: ["active", "suspended"] })
  public readonly status: "active" | "suspended";

  @HasAndBelongsToMany(() => Product, {
    targetKey: "suppliers",
    through: () => ({ joinTable: ProductSupplier, foreignKey: "supplierId" })
  })
  public readonly products: Product[];
}

class ProductSupplier extends JoinTable<Product, Supplier> {
  public readonly productId: ForeignKey<Product>;
  public readonly supplierId: ForeignKey<Supplier>;
}

// A join table whose target carries an object attribute, so a target guard can
// compare it whole
const depotAddressSchema = {
  city: { type: "string" },
  zip: { type: "string", nullable: true }
} as const satisfies ObjectSchema;

@Entity
class Kiosk extends MockTable {
  declare readonly type: "Kiosk";

  @StringAttribute({ alias: "Name" })
  public readonly name: string;

  @HasAndBelongsToMany(() => Depot, {
    targetKey: "kiosks",
    through: () => ({ joinTable: KioskDepot, foreignKey: "kioskId" })
  })
  public readonly depots: Depot[];
}

@Entity
class Depot extends MockTable {
  declare readonly type: "Depot";

  @ObjectAttribute({ alias: "Address", schema: depotAddressSchema })
  public readonly address: InferObjectSchema<typeof depotAddressSchema>;

  @HasAndBelongsToMany(() => Kiosk, {
    targetKey: "depots",
    through: () => ({ joinTable: KioskDepot, foreignKey: "depotId" })
  })
  public readonly kiosks: Kiosk[];
}

class KioskDepot extends JoinTable<Kiosk, Depot> {
  public readonly kioskId: ForeignKey<Kiosk>;
  public readonly depotId: ForeignKey<Depot>;
}

describe("JoinTable", () => {
  afterEach(() => {
    vi.clearAllMocks();

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

      mockTransactGetItems.mockResolvedValueOnce({
        Responses: [{ Item: author }, { Item: book }]
      });

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

    it("will strip the embedding vector from denormalized link records", async () => {
      expect.assertions(2);

      // Raw prefetched canonical rows bypass entity serialization, so rows of
      // searchable entities carry the vector — the link records must strip
      // it; the vector lives on canonical rows only
      const author = {
        PK: "Author#1",
        SK: "Author",
        Id: "1",
        Type: "Author",
        Name: "Author-1",
        CreatedAt: "2024-02-27T03:19:52.667Z",
        UpdatedAt: "2024-02-27T03:19:52.667Z",
        // Two per-index attributes: stripping is by reserved prefix, not by
        // one literal name
        __dyna_vector: [0.5, 0.5],
        __dyna_vector_articles: [0.6, 0.6]
      };

      const book = {
        PK: "Book#2",
        SK: "Book",
        Id: "2",
        Type: "Book",
        Name: "Some Name",
        NumPages: 100,
        CreatedAt: "2021-10-15T08:31:15.148Z",
        UpdatedAt: "2022-10-15T08:31:15.148Z",
        __dyna_vector: [0.25, 0.25],
        __dyna_vector_help: [0.35, 0.35]
      };

      mockTransactGetItems.mockResolvedValueOnce({
        Responses: [{ Item: author }, { Item: book }]
      });

      expect(await AuthorBook.create({ authorId: "1", bookId: "2" })).toEqual(
        undefined
      );
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

    it("alternate table style - will create a denormalized record entry for each item in a HasAndBelongsToMany relationship", async () => {
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

      mockTransactGetItems.mockResolvedValueOnce({
        Responses: [{ Item: student }, { Item: course }]
      });

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

    it("with custom id field - will create a denormalized record for each item in a HasAndBelongsToMany relationship", async () => {
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

      mockTransactGetItems.mockResolvedValueOnce({
        Responses: [{ Item: user }, { Item: website }]
      });

      expect(
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

      mockTransactGetItems.mockResolvedValueOnce({
        Responses: [{ Item: author }, { Item: book }]
      });

      mockTransactWriteItems.mockImplementationOnce(() => {
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

    describe("NotFoundError - when either of the entities are missing at pre fetch", () => {
      it("first entity of join table missing", async () => {
        expect.assertions(2);

        const author: MockTableEntityTableItem<Author> = {
          PK: "Author#1",
          SK: "Author",
          Id: "1",
          Type: "Author",
          Name: "Author-1",
          CreatedAt: "2024-02-27T03:19:52.667Z",
          UpdatedAt: "2024-02-27T03:19:52.667Z"
        };

        mockTransactGetItems.mockResolvedValueOnce({
          Responses: [{ Item: author }]
        });

        try {
          await AuthorBook.create({ authorId: "1", bookId: "2" });
        } catch (e) {
          expect(e).toEqual(new NotFoundError("Entities not found: (Book: 2)"));
          expect(mockSend.mock.calls).toEqual([
            [{ name: "TransactGetCommand" }]
          ]);
        }
      });

      it("second entity of join table missing", async () => {
        expect.assertions(2);

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

        mockTransactGetItems.mockResolvedValueOnce({
          Responses: [{ Item: book }]
        });

        try {
          await AuthorBook.create({ authorId: "1", bookId: "2" });
        } catch (e) {
          expect(e).toEqual(
            new NotFoundError("Entities not found: (Author: 1)")
          );
          expect(mockSend.mock.calls).toEqual([
            [{ name: "TransactGetCommand" }]
          ]);
        }
      });

      it("both entities of join table missing", async () => {
        expect.assertions(2);

        mockTransactGetItems.mockResolvedValueOnce({
          Responses: []
        });

        try {
          await AuthorBook.create({ authorId: "1", bookId: "2" });
        } catch (e) {
          expect(e).toEqual(
            new NotFoundError("Entities not found: (Author: 1), (Book: 2)")
          );
          expect(mockSend.mock.calls).toEqual([
            [{ name: "TransactGetCommand" }]
          ]);
        }
      });

      it("other table style - throws an error if the entity does not exist at pre fetch", async () => {
        expect.assertions(2);

        const course: OtherTableEntityTableItem<Course> = {
          myPk: "Course|456",
          mySk: "Course",
          id: "456",
          type: "Course",
          name: "Math",
          teacherId: "001",
          createdAt: "2023-01-15T12:12:18.123Z",
          updatedAt: "2023-02-15T08:31:15.148Z"
        };

        mockTransactGetItems.mockResolvedValueOnce({
          Responses: [{ Item: course }]
        });

        try {
          await StudentCourse.create({ studentId: "123", courseId: "456" });
        } catch (e) {
          expect(e).toEqual(
            new NotFoundError("Entities not found: (Student: 123)")
          );
          expect(mockSend.mock.calls).toEqual([
            [{ name: "TransactGetCommand" }]
          ]);
        }
      });
    });

    it("throws an error if both of the entities existed at pre fetch but were deleted before the transaction ran", async () => {
      expect.assertions(2);

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

      mockTransactGetItems.mockResolvedValueOnce({
        Responses: [{ Item: author }, { Item: book }]
      });

      mockTransactWriteCommand.mockImplementationOnce(() => {
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
    it("will delete a denormalized record entry for each item in a HasAndBelongsToMany relationship", async () => {
      expect.assertions(3);

      expect(await AuthorBook.delete({ authorId: "1", bookId: "2" })).toEqual(
        undefined
      );
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                // Create denormalized record to link Book to Author
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
                // Create denormalized record to link Book to Author
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

    it("alternate table style - will delete a denormalized record for each item in a HasAndBelongsToMany relationship", async () => {
      expect.assertions(3);

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

    it("with custom id field - will delete a denormalized record entry for each item in a HasAndBelongsToMany relationship", async () => {
      expect.assertions(3);

      expect(
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

  describe("referentialIntegrityCheck option", () => {
    describe("with referentialIntegrityCheck: false", () => {
      it("will create a join table entry without condition checks", async () => {
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

        mockTransactGetItems.mockResolvedValueOnce({
          Responses: [{ Item: author }, { Item: book }]
        });

        expect(
          await AuthorBook.create(
            { authorId: "1", bookId: "2" },
            { referentialIntegrityCheck: false }
          )
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
                }
              ]
            }
          ]
        ]);
      });
    });
  });

  describe("write conditions", () => {
    const product: MockTableEntityTableItem<Product> = {
      PK: "Product#p1",
      SK: "Product",
      Id: "p1",
      Type: "Product",
      Name: "Mug",
      Price: 12,
      CreatedAt: "2024-02-27T03:19:52.667Z",
      UpdatedAt: "2024-02-27T03:19:52.667Z"
    };

    const supplier: MockTableEntityTableItem<Supplier> = {
      PK: "Supplier#s1",
      SK: "Supplier",
      Id: "s1",
      Type: "Supplier",
      Name: "Acme",
      Status: "active",
      CreatedAt: "2021-10-15T08:31:15.148Z",
      UpdatedAt: "2022-10-15T08:31:15.148Z"
    };

    const keys = { productId: "p1", supplierId: "s1" };

    const preReadGet = [
      [
        {
          TransactItems: [
            {
              Get: {
                TableName: "mock-table",
                Key: { PK: "Supplier#s1", SK: "Supplier" }
              }
            },
            {
              Get: {
                TableName: "mock-table",
                Key: { PK: "Product#p1", SK: "Product" }
              }
            }
          ]
        }
      ]
    ];

    // The Supplier denormalized into the Product's partition
    const supplierLinkPut = {
      Put: {
        TableName: "mock-table",
        ConditionExpression: "attribute_not_exists(PK)",
        Item: { ...supplier, PK: "Product#p1", SK: "Supplier#s1" }
      }
    };

    // The Product denormalized into the Supplier's partition
    const productLinkPut = {
      Put: {
        TableName: "mock-table",
        ConditionExpression: "attribute_not_exists(PK)",
        Item: { ...product, PK: "Supplier#s1", SK: "Product#p1" }
      }
    };

    const productCheck = {
      ConditionCheck: {
        TableName: "mock-table",
        Key: { PK: "Product#p1", SK: "Product" },
        ConditionExpression: "attribute_exists(PK)"
      }
    };

    const supplierCheck = {
      ConditionCheck: {
        TableName: "mock-table",
        Key: { PK: "Supplier#s1", SK: "Supplier" },
        ConditionExpression: "attribute_exists(PK)"
      }
    };

    const productLinkDelete = {
      Delete: {
        TableName: "mock-table",
        Key: { PK: "Product#p1", SK: "Supplier#s1" },
        ConditionExpression: "attribute_exists(PK)"
      }
    };

    const supplierLinkDelete = {
      Delete: {
        TableName: "mock-table",
        Key: { PK: "Supplier#s1", SK: "Product#p1" },
        ConditionExpression: "attribute_exists(PK)"
      }
    };

    const cancelTransactWrite = (reasons: CancellationReason[]): void => {
      mockTransactWriteItems.mockImplementationOnce(() => {
        throw new TransactionCanceledException({
          message: "MockMessage",
          CancellationReasons: reasons,
          $metadata: {}
        });
      });
    };

    /**
     * Runs a write expected to fail and returns its error
     */
    const failureOf = async (write: () => Promise<unknown>): Promise<any> => {
      try {
        await write();
      } catch (e: unknown) {
        return e;
      }
      throw new Error("Expected the write to fail");
    };

    afterEach(() => {
      mockTransactWriteItems.mockReset();
    });

    describe("on create", () => {
      beforeEach(() => {
        mockTransactGetItems.mockResolvedValueOnce({
          Responses: [{ Item: product }, { Item: supplier }]
        });
      });

      describe("an unconditioned create", () => {
        const unconditionedItems = [
          productLinkPut,
          supplierCheck,
          supplierLinkPut,
          productCheck
        ];

        it("sends exactly today's commands without options", async () => {
          expect.assertions(3);

          await ProductSupplier.create(keys);

          expect(mockSend.mock.calls).toEqual([
            [{ name: "TransactGetCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockTransactGetCommand.mock.calls).toEqual(preReadGet);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [{ TransactItems: unconditionedItems }]
          ]);
        });

        it("sends exactly today's command for an empty condition (R29)", async () => {
          expect.assertions(1);

          await ProductSupplier.create(keys, { condition: {} });

          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [{ TransactItems: unconditionedItems }]
          ]);
        });

        it("sends exactly today's command with only referentialIntegrityCheck: false", async () => {
          expect.assertions(1);

          await ProductSupplier.create(keys, {
            referentialIntegrityCheck: false
          });

          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [{ TransactItems: [productLinkPut, supplierLinkPut] }]
          ]);
        });
      });

      describe("a target guard (AE9)", () => {
        const create = async (): Promise<void> => {
          await ProductSupplier.create(keys, {
            condition: { supplierId: { target: { status: "active" } } }
          });
        };

        const sentItems = [
          productLinkPut,
          {
            // One check on the Supplier's row carries both the library's
            // existence check and the guard
            ConditionCheck: {
              TableName: "mock-table",
              Key: { PK: "Supplier#s1", SK: "Supplier" },
              ConditionExpression:
                "attribute_exists(PK) AND (attribute_exists(PK) AND (#Status = :wc1_Status1))",
              ExpressionAttributeNames: { "#Status": "Status" },
              ExpressionAttributeValues: { ":wc1_Status1": "active" },
              ReturnValuesOnConditionCheckFailure: "ALL_OLD"
            }
          },
          supplierLinkPut,
          productCheck
        ];

        it("merges into the referenced entity's referential-integrity check", async () => {
          expect.assertions(3);

          await create();

          expect(mockSend.mock.calls).toEqual([
            [{ name: "TransactGetCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockTransactGetCommand.mock.calls).toEqual(preReadGet);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [{ TransactItems: sentItems }]
          ]);
        });

        it("reports a failed guard as a WriteConditionFailedError naming the foreign key, writing neither link row", async () => {
          expect.assertions(6);

          cancelTransactWrite([
            { Code: "None" },
            {
              Code: "ConditionalCheckFailed",
              Item: {
                PK: { S: "Supplier#s1" },
                SK: { S: "Supplier" },
                Status: { S: "suspended" }
              }
            },
            { Code: "None" },
            { Code: "None" }
          ]);

          const e = await failureOf(create);

          expect(e).toBeInstanceOf(TransactionWriteFailedError);
          expect(e.message).toEqual("Failed Conditional Checks");
          expect(e.errors).toEqual([
            new WriteConditionFailedError(
              "ConditionalCheckFailed: Write condition failed on ProductSupplier with ID 'productId=p1, supplierId=s1': foreign key 'supplierId'",
              {
                entity: "ProductSupplier",
                id: "productId=p1, supplierId=s1",
                guards: [{ kind: "foreignKey", name: "supplierId" }]
              }
            )
          ]);
          expect(e.errors[0].guards).toEqual([
            { kind: "foreignKey", name: "supplierId" }
          ]);
          expect(e.cause.CancellationReasons[1]).toEqual({
            Code: "ConditionalCheckFailed"
          });
          // Both link rows were in the one cancelled transaction
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [{ TransactItems: sentItems }]
          ]);
        });

        it("reports an entity deleted after the pre-read as a referential-integrity failure, not the guard", async () => {
          expect.assertions(2);

          cancelTransactWrite([
            { Code: "None" },
            { Code: "ConditionalCheckFailed" },
            { Code: "None" },
            { Code: "None" }
          ]);

          const e = await failureOf(create);

          expect(e.errors).toEqual([
            new ConditionalCheckFailedError(
              "ConditionalCheckFailed: Supplier with ID s1 does not exist"
            )
          ]);
          expect(e.errors[0]).not.toBeInstanceOf(WriteConditionFailedError);
        });

        it("reports an existing link with the link row's own message", async () => {
          expect.assertions(2);

          cancelTransactWrite([
            { Code: "ConditionalCheckFailed" },
            { Code: "None" },
            { Code: "None" },
            { Code: "None" }
          ]);

          const e = await failureOf(create);

          expect(e.errors).toEqual([
            new ConditionalCheckFailedError(
              "ConditionalCheckFailed: Supplier with ID s1 is already linked to Product with ID p1"
            )
          ]);
          expect(e.errors[0]).not.toBeInstanceOf(WriteConditionFailedError);
        });

        it("passes a TransactionConflict-only cancellation through unchanged", async () => {
          expect.assertions(3);

          const reasons = [
            { Code: "None" },
            { Code: "TransactionConflict" },
            { Code: "None" },
            { Code: "None" }
          ];
          cancelTransactWrite(reasons);

          const e = await failureOf(create);

          expect(e).toBeInstanceOf(TransactionCanceledException);
          expect(e.CancellationReasons).toEqual(reasons);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [{ TransactItems: sentItems }]
          ]);
        });
      });

      it("merges a guard on each foreign key into each entity's integrity check", async () => {
        expect.assertions(1);

        await ProductSupplier.create(keys, {
          condition: {
            productId: {
              target: {
                price: { $lt: 20 },
                $or: [{ name: "Mug" }, { name: "Cup" }]
              }
            },
            supplierId: { target: {} }
          }
        });

        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                productLinkPut,
                {
                  ConditionCheck: {
                    TableName: "mock-table",
                    Key: { PK: "Supplier#s1", SK: "Supplier" },
                    ConditionExpression:
                      "attribute_exists(PK) AND (attribute_exists(PK))",
                    ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                  }
                },
                supplierLinkPut,
                {
                  ConditionCheck: {
                    TableName: "mock-table",
                    Key: { PK: "Product#p1", SK: "Product" },
                    ConditionExpression:
                      "attribute_exists(PK) AND (attribute_exists(PK) AND ((#Name = :wc1_Name1 OR #Name = :wc1_Name2) AND (#Price < :wc1_Price3)))",
                    ExpressionAttributeNames: {
                      "#Name": "Name",
                      "#Price": "Price"
                    },
                    ExpressionAttributeValues: {
                      ":wc1_Name1": "Mug",
                      ":wc1_Name2": "Cup",
                      ":wc1_Price3": 20
                    },
                    ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                  }
                }
              ]
            }
          ]
        ]);
      });

      describe("with referentialIntegrityCheck: false (R18)", () => {
        const create = async (): Promise<void> => {
          await ProductSupplier.create(keys, {
            referentialIntegrityCheck: false,
            condition: { supplierId: { target: { status: "active" } } }
          });
        };

        const sentItems = [
          productLinkPut,
          supplierLinkPut,
          {
            ConditionCheck: {
              TableName: "mock-table",
              Key: { PK: "Supplier#s1", SK: "Supplier" },
              ConditionExpression:
                "attribute_exists(PK) AND (attribute_exists(PK) AND (#Status = :wc1_Status1))",
              ExpressionAttributeNames: { "#Status": "Status" },
              ExpressionAttributeValues: { ":wc1_Status1": "active" },
              ReturnValuesOnConditionCheckFailure: "ALL_OLD"
            }
          }
        ];

        it("adds its own check on the referenced entity's row", async () => {
          expect.assertions(1);

          await create();

          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [{ TransactItems: sentItems }]
          ]);
        });

        it("reports an entity deleted after the pre-read as a referential-integrity failure (R27)", async () => {
          expect.assertions(2);

          cancelTransactWrite([
            { Code: "None" },
            { Code: "None" },
            { Code: "ConditionalCheckFailed" }
          ]);

          const e = await failureOf(create);

          expect(e.errors).toEqual([
            new ConditionalCheckFailedError(
              "ConditionalCheckFailed: Supplier with ID s1 does not exist"
            )
          ]);
          expect(e.errors[0]).not.toBeInstanceOf(WriteConditionFailedError);
        });

        it("reports a failed guard naming the foreign key", async () => {
          expect.assertions(1);

          cancelTransactWrite([
            { Code: "None" },
            { Code: "None" },
            {
              Code: "ConditionalCheckFailed",
              Item: {
                PK: { S: "Supplier#s1" },
                SK: { S: "Supplier" },
                Status: { S: "suspended" }
              }
            }
          ]);

          const e = await failureOf(create);

          expect(e.errors).toEqual([
            new WriteConditionFailedError(
              "ConditionalCheckFailed: Write condition failed on ProductSupplier with ID 'productId=p1, supplierId=s1': foreign key 'supplierId'",
              {
                entity: "ProductSupplier",
                id: "productId=p1, supplierId=s1",
                guards: [{ kind: "foreignKey", name: "supplierId" }]
              }
            )
          ]);
        });
      });
    });

    describe("a missing entity at the pre-read", () => {
      it.each([true, false])(
        "throws NotFoundError before any guard is sent (referentialIntegrityCheck: %s)",
        async referentialIntegrityCheck => {
          expect.assertions(2);

          mockTransactGetItems.mockResolvedValueOnce({
            Responses: [{ Item: product }]
          });

          const e = await failureOf(async () => {
            await ProductSupplier.create(keys, {
              referentialIntegrityCheck,
              condition: { supplierId: { target: { status: "active" } } }
            });
          });

          expect(e).toEqual(
            new NotFoundError("Entities not found: (Supplier: s1)")
          );
          expect(mockSend.mock.calls).toEqual([
            [{ name: "TransactGetCommand" }]
          ]);
        }
      );
    });

    // DynamoDB's TransactGetItems returns one Responses entry per Get, in Get
    // order (Supplier, then Product), with `{}` for an item that does not exist
    describe("a missing entity in DynamoDB's real pre-read response shape (R27)", () => {
      describe.each([
        [
          "the first entity is missing",
          [{ Item: supplier }, {}],
          "Entities not found: (Product: p1)"
        ],
        [
          "the second entity is missing",
          [{}, { Item: product }],
          "Entities not found: (Supplier: s1)"
        ],
        [
          "both entities are missing",
          [{}, {}],
          "Entities not found: (Supplier: s1), (Product: p1)"
        ]
      ])("when %s", (_missing, responses, message) => {
        describe.each([
          ["without a condition", undefined],
          [
            "with a condition",
            {
              productId: { target: { name: "Mug" } },
              supplierId: { target: { status: "active" as const } }
            }
          ]
        ])("%s", (_label, condition) => {
          it.each([true, false])(
            "throws NotFoundError and sends only the pre-read (referentialIntegrityCheck: %s)",
            async referentialIntegrityCheck => {
              expect.assertions(4);

              mockTransactGetItems.mockResolvedValueOnce({
                Responses: responses
              });

              const e = await failureOf(async () => {
                await ProductSupplier.create(keys, {
                  referentialIntegrityCheck,
                  condition
                });
              });

              expect(e).toEqual(new NotFoundError(message));
              expect(mockSend.mock.calls).toEqual([
                [{ name: "TransactGetCommand" }]
              ]);
              expect(mockTransactGetCommand.mock.calls).toEqual(preReadGet);
              expect(mockTransactWriteCommand.mock.calls).toEqual([]);
            }
          );
        });
      });
    });

    describe("on a self-referential join table", () => {
      const accessory = (id: string): MockTableEntityTableItem<Accessory> => ({
        PK: `Accessory#${id}`,
        SK: "Accessory",
        Id: id,
        Type: "Accessory",
        Name: `Accessory-${id}`,
        CreatedAt: "2024-02-27T03:19:52.667Z",
        UpdatedAt: "2024-02-27T03:19:52.667Z"
      });

      const accessoryCheck = (
        id: string,
        placeholder: string,
        name: string
      ): Record<string, unknown> => ({
        ConditionCheck: {
          TableName: "mock-table",
          Key: { PK: `Accessory#${id}`, SK: "Accessory" },
          ConditionExpression: `attribute_exists(PK) AND (attribute_exists(PK) AND (#Name = ${placeholder}))`,
          ExpressionAttributeNames: { "#Name": "Name" },
          ExpressionAttributeValues: { [placeholder]: name },
          ReturnValuesOnConditionCheckFailure: "ALL_OLD"
        }
      });

      const linkPut = (
        partitionId: string,
        linkedId: string
      ): Record<string, unknown> => ({
        Put: {
          TableName: "mock-table",
          ConditionExpression: "attribute_not_exists(PK)",
          Item: {
            ...accessory(linkedId),
            PK: `Accessory#${partitionId}`,
            SK: `Accessory#${linkedId}`
          }
        }
      });

      const create = async (): Promise<void> => {
        await CompatibleAccessory.create(
          { accessoryId: "a1", compatibleAccessoryId: "a2" },
          {
            condition: {
              accessoryId: { target: { name: "Accessory-a1" } },
              compatibleAccessoryId: { target: { name: "Accessory-a2" } }
            }
          }
        );
      };

      beforeEach(() => {
        mockTransactGetItems.mockResolvedValueOnce({
          Responses: [{ Item: accessory("a1") }, { Item: accessory("a2") }]
        });
      });

      it("linking two different ids with both keys guarded checks both rows", async () => {
        expect.assertions(1);

        await create();

        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                linkPut("a2", "a1"),
                accessoryCheck("a2", ":wc2_Name1", "Accessory-a2"),
                linkPut("a1", "a2"),
                accessoryCheck("a1", ":wc1_Name1", "Accessory-a1")
              ]
            }
          ]
        ]);
      });

      it("names the foreign key whose entity failed its guard", async () => {
        expect.assertions(1);

        cancelTransactWrite([
          { Code: "None" },
          {
            Code: "ConditionalCheckFailed",
            Item: {
              PK: { S: "Accessory#a2" },
              SK: { S: "Accessory" },
              Name: { S: "Renamed" }
            }
          },
          { Code: "None" },
          { Code: "None" }
        ]);

        const e = await failureOf(create);

        expect(e.errors).toEqual([
          new WriteConditionFailedError(
            "ConditionalCheckFailed: Write condition failed on CompatibleAccessory with ID 'accessoryId=a1, compatibleAccessoryId=a2': foreign key 'compatibleAccessoryId'",
            {
              entity: "CompatibleAccessory",
              id: "accessoryId=a1, compatibleAccessoryId=a2",
              guards: [{ kind: "foreignKey", name: "compatibleAccessoryId" }]
            }
          )
        ]);
      });
    });

    // Caller-supplied ids (`@IdAttribute`) let entities of different types
    // share an id string. Each partition must still receive a copy of the
    // other entity, never of itself
    describe("linking two entities of different types that share an id (R15)", () => {
      const sharedProduct: MockTableEntityTableItem<Product> = {
        ...product,
        PK: "Product#shared",
        Id: "shared"
      };

      const sharedSupplier: MockTableEntityTableItem<Supplier> = {
        ...supplier,
        PK: "Supplier#shared",
        Id: "shared"
      };

      const sharedKeys = { productId: "shared", supplierId: "shared" };

      // The Supplier denormalized into the Product's partition
      const sharedSupplierLinkPut = {
        Put: {
          TableName: "mock-table",
          ConditionExpression: "attribute_not_exists(PK)",
          Item: {
            PK: "Product#shared",
            SK: "Supplier#shared",
            Id: "shared",
            Type: "Supplier",
            Name: "Acme",
            Status: "active",
            CreatedAt: "2021-10-15T08:31:15.148Z",
            UpdatedAt: "2022-10-15T08:31:15.148Z"
          }
        }
      };

      // The Product denormalized into the Supplier's partition
      const sharedProductLinkPut = {
        Put: {
          TableName: "mock-table",
          ConditionExpression: "attribute_not_exists(PK)",
          Item: {
            PK: "Supplier#shared",
            SK: "Product#shared",
            Id: "shared",
            Type: "Product",
            Name: "Mug",
            Price: 12,
            CreatedAt: "2024-02-27T03:19:52.667Z",
            UpdatedAt: "2024-02-27T03:19:52.667Z"
          }
        }
      };

      const sharedProductCheck = {
        ConditionCheck: {
          TableName: "mock-table",
          Key: { PK: "Product#shared", SK: "Product" },
          ConditionExpression: "attribute_exists(PK)"
        }
      };

      const sharedSupplierGuardCheck = {
        ConditionCheck: {
          TableName: "mock-table",
          Key: { PK: "Supplier#shared", SK: "Supplier" },
          ConditionExpression:
            "attribute_exists(PK) AND (attribute_exists(PK) AND (#Status = :wc1_Status1))",
          ExpressionAttributeNames: { "#Status": "Status" },
          ExpressionAttributeValues: { ":wc1_Status1": "active" },
          ReturnValuesOnConditionCheckFailure: "ALL_OLD"
        }
      };

      const sharedPreReadGet = [
        [
          {
            TransactItems: [
              {
                Get: {
                  TableName: "mock-table",
                  Key: { PK: "Supplier#shared", SK: "Supplier" }
                }
              },
              {
                Get: {
                  TableName: "mock-table",
                  Key: { PK: "Product#shared", SK: "Product" }
                }
              }
            ]
          }
        ]
      ];

      describe("when both entities exist", () => {
        // DynamoDB's real response shape: one entry per Get, in Get order
        beforeEach(() => {
          mockTransactGetItems.mockResolvedValueOnce({
            Responses: [{ Item: sharedSupplier }, { Item: sharedProduct }]
          });
        });

        it("denormalizes each entity into the other's partition", async () => {
          expect.assertions(3);

          await ProductSupplier.create(sharedKeys);

          expect(mockSend.mock.calls).toEqual([
            [{ name: "TransactGetCommand" }],
            [{ name: "TransactWriteCommand" }]
          ]);
          expect(mockTransactGetCommand.mock.calls).toEqual(sharedPreReadGet);
          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [
              {
                TransactItems: [
                  sharedProductLinkPut,
                  {
                    ConditionCheck: {
                      TableName: "mock-table",
                      Key: { PK: "Supplier#shared", SK: "Supplier" },
                      ConditionExpression: "attribute_exists(PK)"
                    }
                  },
                  sharedSupplierLinkPut,
                  sharedProductCheck
                ]
              }
            ]
          ]);
        });

        it("denormalizes each entity into the other's partition with a target guard", async () => {
          expect.assertions(1);

          await ProductSupplier.create(sharedKeys, {
            condition: { supplierId: { target: { status: "active" } } }
          });

          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [
              {
                TransactItems: [
                  sharedProductLinkPut,
                  sharedSupplierGuardCheck,
                  sharedSupplierLinkPut,
                  sharedProductCheck
                ]
              }
            ]
          ]);
        });

        it("denormalizes each entity into the other's partition with referentialIntegrityCheck: false and a target guard", async () => {
          expect.assertions(1);

          await ProductSupplier.create(sharedKeys, {
            referentialIntegrityCheck: false,
            condition: { supplierId: { target: { status: "active" } } }
          });

          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [
              {
                TransactItems: [
                  sharedProductLinkPut,
                  sharedSupplierLinkPut,
                  sharedSupplierGuardCheck
                ]
              }
            ]
          ]);
        });

        it("denormalizes each entity into the other's partition with referentialIntegrityCheck: false", async () => {
          expect.assertions(1);

          await ProductSupplier.create(sharedKeys, {
            referentialIntegrityCheck: false
          });

          expect(mockTransactWriteCommand.mock.calls).toEqual([
            [{ TransactItems: [sharedProductLinkPut, sharedSupplierLinkPut] }]
          ]);
        });
      });

      describe.each([
        [
          "the Product is missing",
          [{ Item: sharedSupplier }, {}],
          "Entities not found: (Product: shared)"
        ],
        [
          "the Supplier is missing",
          [{}, { Item: sharedProduct }],
          "Entities not found: (Supplier: shared)"
        ]
      ])("when %s", (_missing, responses, message) => {
        it("throws NotFoundError naming only the missing entity and sends only the pre-read", async () => {
          expect.assertions(3);

          mockTransactGetItems.mockResolvedValueOnce({ Responses: responses });

          const e = await failureOf(async () => {
            await ProductSupplier.create(sharedKeys);
          });

          expect(e).toEqual(new NotFoundError(message));
          expect(mockSend.mock.calls).toEqual([
            [{ name: "TransactGetCommand" }]
          ]);
          expect(mockTransactWriteCommand.mock.calls).toEqual([]);
        });
      });
    });

    describe("on delete", () => {
      const remove = async (): Promise<void> => {
        await ProductSupplier.delete(keys, {
          condition: { supplierId: { target: { status: "active" } } }
        });
      };

      const sentItems = [
        supplierLinkDelete,
        productLinkDelete,
        {
          ConditionCheck: {
            TableName: "mock-table",
            Key: { PK: "Supplier#s1", SK: "Supplier" },
            ConditionExpression:
              "attribute_exists(PK) AND (attribute_exists(PK) AND (#Status = :wc1_Status1))",
            ExpressionAttributeNames: { "#Status": "Status" },
            ExpressionAttributeValues: { ":wc1_Status1": "active" },
            ReturnValuesOnConditionCheckFailure: "ALL_OLD"
          }
        }
      ];

      it("sends exactly today's command when unconditioned, with or without an empty condition", async () => {
        expect.assertions(2);

        await ProductSupplier.delete(keys);
        await ProductSupplier.delete(keys, { condition: {} });

        expect(mockSend.mock.calls).toEqual([
          [{ name: "TransactWriteCommand" }],
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [{ TransactItems: [supplierLinkDelete, productLinkDelete] }],
          [{ TransactItems: [supplierLinkDelete, productLinkDelete] }]
        ]);
      });

      it("adds a check on the referenced entity's row, with no read", async () => {
        expect.assertions(2);

        await remove();

        expect(mockSend.mock.calls).toEqual([
          [{ name: "TransactWriteCommand" }]
        ]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [{ TransactItems: sentItems }]
        ]);
      });

      it("checks both entities when both keys are guarded", async () => {
        expect.assertions(1);

        await ProductSupplier.delete(keys, {
          condition: {
            productId: { target: { name: { $beginsWith: "M" } } },
            supplierId: { target: {} }
          }
        });

        expect(mockTransactWriteCommand.mock.calls).toEqual([
          [
            {
              TransactItems: [
                supplierLinkDelete,
                productLinkDelete,
                {
                  ConditionCheck: {
                    TableName: "mock-table",
                    Key: { PK: "Product#p1", SK: "Product" },
                    ConditionExpression:
                      "attribute_exists(PK) AND (attribute_exists(PK) AND (begins_with(#Name, :wc1_Name1)))",
                    ExpressionAttributeNames: { "#Name": "Name" },
                    ExpressionAttributeValues: { ":wc1_Name1": "M" },
                    ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                  }
                },
                {
                  ConditionCheck: {
                    TableName: "mock-table",
                    Key: { PK: "Supplier#s1", SK: "Supplier" },
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

      it("reports a failed guard naming the foreign key", async () => {
        expect.assertions(2);

        cancelTransactWrite([
          { Code: "None" },
          { Code: "None" },
          {
            Code: "ConditionalCheckFailed",
            Item: {
              PK: { S: "Supplier#s1" },
              SK: { S: "Supplier" },
              Status: { S: "suspended" }
            }
          }
        ]);

        const e = await failureOf(remove);

        expect(e).toBeInstanceOf(TransactionWriteFailedError);
        expect(e.errors).toEqual([
          new WriteConditionFailedError(
            "ConditionalCheckFailed: Write condition failed on ProductSupplier with ID 'productId=p1, supplierId=s1': foreign key 'supplierId'",
            {
              entity: "ProductSupplier",
              id: "productId=p1, supplierId=s1",
              guards: [{ kind: "foreignKey", name: "supplierId" }]
            }
          )
        ]);
      });

      it("still reports a missing link as not linked", async () => {
        expect.assertions(1);

        cancelTransactWrite([
          { Code: "ConditionalCheckFailed" },
          { Code: "ConditionalCheckFailed" },
          { Code: "None" }
        ]);

        const e = await failureOf(remove);

        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Supplier with ID s1 is not linked to Product with ID p1"
          ),
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Product with ID p1 is not linked to Supplier with ID s1"
          )
        ]);
      });

      it("reports a missing guarded entity as a referential-integrity failure (R27)", async () => {
        expect.assertions(2);

        cancelTransactWrite([
          { Code: "None" },
          { Code: "None" },
          { Code: "ConditionalCheckFailed" }
        ]);

        const e = await failureOf(remove);

        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Supplier with ID s1 does not exist"
          )
        ]);
        expect(e.errors[0]).not.toBeInstanceOf(WriteConditionFailedError);
      });

      it("passes a TransactionConflict-only cancellation through unchanged", async () => {
        expect.assertions(2);

        const reasons = [
          { Code: "TransactionConflict" },
          { Code: "None" },
          { Code: "None" }
        ];
        cancelTransactWrite(reasons);

        const e = await failureOf(remove);

        expect(e).toBeInstanceOf(TransactionCanceledException);
        expect(e.CancellationReasons).toEqual(reasons);
      });
    });

    describe("an invalid condition", () => {
      it("throws a FilterError before any read for a key that is not a foreign key of the join table", async () => {
        expect.assertions(3);

        const e = await failureOf(async () => {
          await ProductSupplier.create(keys, {
            // @ts-expect-error: a plain JavaScript caller's unknown key
            condition: { storeId: { target: {} } }
          });
        });

        expect(e).toBeInstanceOf(FilterError);
        expect(e.message).toEqual(
          `Invalid write condition key "storeId": it is not a foreign key of ProductSupplier. Valid keys are: productId, supplierId`
        );
        expect(mockSend.mock.calls).toEqual([]);
      });

      it("throws a FilterError before any read for a value that is not a target guard", async () => {
        expect.assertions(5);

        const value = await failureOf(async () => {
          await ProductSupplier.create(keys, {
            // @ts-expect-error: a plain JavaScript caller's value condition on the key
            condition: { supplierId: "s1" }
          });
        });
        const besideTarget = await failureOf(async () => {
          await ProductSupplier.create(keys, {
            condition: {
              // @ts-expect-error: a plain JavaScript caller's value condition beside the guard
              supplierId: { target: {}, $beginsWith: "s" }
            }
          });
        });

        expect(value).toBeInstanceOf(FilterError);
        expect(value.message).toEqual(
          `Invalid write condition for "supplierId": a join-table foreign key takes a target guard, { target: condition }, on the entity it references`
        );
        expect(besideTarget).toBeInstanceOf(FilterError);
        expect(besideTarget.message).toEqual(
          `Invalid write condition for "supplierId": a foreign key holds either a condition on its own value or a target guard, never both (found $beginsWith beside target). Put the value condition in a $or branch`
        );
        expect(mockSend.mock.calls).toEqual([]);
      });

      it("throws a FilterError before any read for an empty $or, null in IN, an undefined operand and an attribute the target does not declare (R29, R6)", async () => {
        expect.assertions(5);

        const emptyOr = await failureOf(async () => {
          await ProductSupplier.create(keys, {
            condition: { supplierId: { target: { $or: [] } } }
          });
        });
        const nullInIn = await failureOf(async () => {
          await ProductSupplier.create(keys, {
            // @ts-expect-error: a plain JavaScript caller's null inside IN
            condition: { supplierId: { target: { name: ["Acme", null] } } }
          });
        });
        const maybeName: string | undefined = undefined;
        const undefinedOperand = await failureOf(async () => {
          await ProductSupplier.create(keys, {
            condition: { supplierId: { target: { name: maybeName } } }
          });
        });
        const otherEntity = await failureOf(async () => {
          await ProductSupplier.create(keys, {
            // @ts-expect-error: a plain JavaScript caller's Product attribute on the Supplier
            condition: { supplierId: { target: { price: 12 } } }
          });
        });

        expect(emptyOr).toBeInstanceOf(FilterError);
        expect(nullInIn).toBeInstanceOf(FilterError);
        expect(undefinedOperand).toBeInstanceOf(FilterError);
        expect(otherEntity).toBeInstanceOf(FilterError);
        expect(mockSend.mock.calls).toEqual([]);
      });

      it("throws a FilterError on delete before anything is sent", async () => {
        expect.assertions(4);

        const unknownKey = await failureOf(async () => {
          await ProductSupplier.delete(keys, {
            // @ts-expect-error: a plain JavaScript caller's join table property
            condition: { type1: { target: {} } }
          });
        });
        const malformed = await failureOf(async () => {
          await ProductSupplier.delete(keys, {
            // @ts-expect-error: a plain JavaScript caller's guard without target
            condition: { productId: { name: "Mug" } }
          });
        });
        const emptyOr = await failureOf(async () => {
          await ProductSupplier.delete(keys, {
            condition: { productId: { target: { $or: [] } } }
          });
        });

        expect(unknownKey).toBeInstanceOf(FilterError);
        expect(malformed).toBeInstanceOf(FilterError);
        expect(emptyOr).toBeInstanceOf(FilterError);
        expect(mockSend.mock.calls).toEqual([]);
      });
    });

    describe("a whole-value object operand naming a field its schema does not declare (R30, R15)", () => {
      // Before this was refused, the operand was converted to its stored form,
      // which strips a field the schema does not declare: `{ ..., region: "west" }`
      // was sent as `{ ... }`, so the guard held against a Depot holding no
      // region at all and let through the link the caller meant to stop
      const undeclared = new FilterError(
        'Invalid filter value for attribute "address": "region" is not a field the attribute declares. An object is compared whole, so no stored value can equal this operand'
      );
      const depotKeys = { kioskId: "k1", depotId: "d1" };
      const address = { city: "Denver", zip: "80202" };

      it("throws a FilterError on create before anything is sent", async () => {
        expect.assertions(4);

        const e = await failureOf(async () => {
          await KioskDepot.create(depotKeys, {
            condition: {
              depotId: {
                target: {
                  address: {
                    ...address,
                    // @ts-expect-error: a plain JavaScript caller's undeclared field
                    region: "west"
                  }
                }
              }
            }
          });
        });

        expect(e).toEqual(undeclared);
        expect(mockSend.mock.calls).toEqual([]);
        expect(mockTransactGetCommand.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([]);
      });

      it("throws a FilterError on delete before anything is sent, including inside an IN element", async () => {
        expect.assertions(4);

        const e = await failureOf(async () => {
          await KioskDepot.delete(depotKeys, {
            condition: {
              depotId: {
                target: {
                  address: [
                    address,
                    {
                      ...address,
                      // @ts-expect-error: a plain JavaScript caller's undeclared field
                      region: "west"
                    }
                  ]
                }
              }
            }
          });
        });

        expect(e).toEqual(undeclared);
        expect(mockSend.mock.calls).toEqual([]);
        expect(mockTransactGetCommand.mock.calls).toEqual([]);
        expect(mockTransactWriteCommand.mock.calls).toEqual([]);
      });
    });
  });

  describe("types", () => {
    describe("create", () => {
      it("will not have type errors when the signature includes one of the joined models and all foreign keys", async () => {
        // @ts-expect-no-error: Signature includes model on join table, and all foreign keys
        await AuthorBook.create({ authorId: "123", bookId: "456" }).catch(
          () => {
            Logger.log("Testing types");
          }
        );
      });

      it("has an error if either of the foreign keys are missing", async () => {
        // @ts-expect-error: Missing a foreign key
        await AuthorBook.create({ bookId: "456" }).catch(() => {
          Logger.log("Testing types");
        });
        // @ts-expect-error: Missing a foreign key
        await AuthorBook.create({ authorId: "123" }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("has an error if foreign keys are not valid keys", async () => {
        // @ts-expect-error: Invalid key
        await AuthorBook.create({ bad: "123", bookId: "456" }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("has an error if the foreign keys are not strings", async () => {
        // @ts-expect-error: Invalid key value
        await AuthorBook.create({ authorId: 1, bookId: "456" }).catch(() => {
          Logger.log("Testing types");
        });

        // @ts-expect-error: Invalid key value
        await AuthorBook.create({ authorId: true, bookId: "456" }).catch(() => {
          Logger.log("Testing types");
        });

        // @ts-expect-error: Invalid key value
        await AuthorBook.create({ authorId: false, bookId: "456" }).catch(
          () => {
            Logger.log("Testing types");
          }
        );

        // @ts-expect-error: Invalid key value
        await AuthorBook.create({ authorId: null, bookId: "456" }).catch(() => {
          Logger.log("Testing types");
        });
      });

      it("will accept referentialIntegrityCheck option", async () => {
        // @ts-expect-no-error referentialIntegrityCheck option is accepted
        await AuthorBook.create(
          { authorId: "123", bookId: "456" },
          { referentialIntegrityCheck: false }
        ).catch(() => {
          Logger.log("Testing types");
        });

        // @ts-expect-no-error referentialIntegrityCheck option is optional
        await AuthorBook.create(
          { authorId: "123", bookId: "456" },
          { referentialIntegrityCheck: true }
        ).catch(() => {
          Logger.log("Testing types");
        });

        // @ts-expect-no-error options parameter is optional
        await AuthorBook.create({ authorId: "123", bookId: "456" }).catch(
          () => {
            Logger.log("Testing types");
          }
        );
      });

      it("will not accept invalid options", async () => {
        await AuthorBook.create(
          { authorId: "123", bookId: "456" },
          // @ts-expect-error invalid option property
          { invalidOption: true }
        ).catch(() => {
          Logger.log("Testing types");
        });
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

    describe("write conditions", () => {
      // A join table whose typed foreign keys reference the entity with every
      // attribute kind and a Customer, so a target condition can be audited
      // across every kind. Type-only, never registered: its calls reject at
      // run time, which each call's .catch absorbs
      class SourceCustomer extends JoinTable<
        MyClassWithAllAttributeTypes,
        Customer
      > {
        declare readonly sourceId: ForeignKey<MyClassWithAllAttributeTypes>;
        declare readonly customerId: ForeignKey<Customer>;
      }

      const keys = { productId: "p1", supplierId: "s1" };
      const sourceKeys = { sourceId: "s1", customerId: "c1" };

      describe("create", () => {
        it("takes target on each typed foreign key, against its own entity", async () => {
          await ProductSupplier.create(keys, {
            condition: {
              // @ts-expect-no-error: a ForeignKey<Product> guards its Product
              productId: { target: { price: { $lt: 20 } } },
              // @ts-expect-no-error: a ForeignKey<Supplier> guards its Supplier
              supplierId: { target: { status: "active" } }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await CompatibleAccessory.create(
            { accessoryId: "a1", compatibleAccessoryId: "a2" },
            {
              condition: {
                // @ts-expect-no-error: a self-referential join table guards either key
                accessoryId: { target: { name: "Lamp" } },
                // @ts-expect-no-error: both keys reference an Accessory
                compatibleAccessoryId: {
                  target: { name: { $beginsWith: "L" } }
                }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await ProductSupplier.create(keys, {
            // @ts-expect-no-error: one key guarded alone
            condition: { supplierId: { target: { name: "Acme" } } }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("takes an empty target, which requires the entity to exist, and an empty condition", async () => {
          await ProductSupplier.create(keys, {
            // @ts-expect-no-error: {} guards only that each entity exists
            condition: { productId: { target: {} }, supplierId: { target: {} } }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await ProductSupplier.create(keys, {
            // @ts-expect-no-error: an empty condition guards nothing
            condition: {}
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("takes every operator each attribute kind allows in a target", async () => {
          await SourceCustomer.create(sourceKeys, {
            condition: {
              // @ts-expect-no-error: each attribute takes the operators its kind supports
              sourceId: {
                target: {
                  stringAttribute: { $beginsWith: "a" },
                  dateAttribute: { $gte: new Date("2026-01-01") },
                  boolAttribute: true,
                  numberAttribute: { $between: [1, 10] },
                  enumAttribute: ["val-1", "val-2"],
                  foreignKeyAttribute: "customer-1",
                  nullableStringAttribute: { $contains: "a" },
                  nullableNumberAttribute: { $lte: 5 }
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await SourceCustomer.create(sourceKeys, {
            condition: {
              // @ts-expect-no-error: comparisons, IN lists and stored-form prefixes per kind
              sourceId: {
                target: {
                  stringAttribute: { $gt: "a", $lte: "m" },
                  numberAttribute: [1, 2],
                  dateAttribute: { $beginsWith: "2026" },
                  enumAttribute: { $beginsWith: "val" },
                  foreignKeyAttribute: { $gt: "customer-1" },
                  boolAttribute: [true, false],
                  nullableDateAttribute: {
                    $between: [new Date("2026-01-01"), new Date("2026-12-31")]
                  },
                  nullableForeignKeyAttribute: { $beginsWith: "customer-" }
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("takes an enum range across two of its members in a target", async () => {
          await SourceCustomer.create(sourceKeys, {
            condition: {
              // @ts-expect-no-error: both bounds are members of the enum, at the top level and nested
              sourceId: {
                target: {
                  enumAttribute: { $between: ["val-1", "val-2"] },
                  nullableEnumAttribute: { $gte: "val-1", $lte: "val-2" },
                  "objectAttribute.status": {
                    $between: ["active", "inactive"]
                  },
                  "addressAttribute.category": { $gt: "home", $lt: "work" }
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("takes dot paths and list-index paths in a target", async () => {
          await SourceCustomer.create(sourceKeys, {
            condition: {
              // @ts-expect-no-error: dot paths reach the target's nested fields at any depth
              sourceId: {
                target: {
                  "objectAttribute.name": { $contains: "Jane" },
                  "objectAttribute.tags": { $contains: "vip" },
                  "addressAttribute.geo.lat": { $lt: 41 },
                  "addressAttribute.scores[0]": 5
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("takes null on a nullable target attribute, at any depth and inside $or", async () => {
          await SourceCustomer.create(sourceKeys, {
            condition: {
              // @ts-expect-no-error: null means "not set" on a nullable attribute
              sourceId: {
                target: {
                  nullableStringAttribute: null,
                  nullableDateAttribute: null,
                  nullableBoolAttribute: null,
                  nullableNumberAttribute: null,
                  nullableEnumAttribute: null,
                  nullableForeignKeyAttribute: null,
                  "addressAttribute.zip": null,
                  "objectAttribute.deletedAt": null,
                  $or: [
                    { "addressAttribute.category": null },
                    { nullableStringAttribute: null }
                  ]
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("takes $or within a target, on that entity's own attributes", async () => {
          await SourceCustomer.create(sourceKeys, {
            condition: {
              // @ts-expect-no-error: $or combines blocks on the Customer's row
              customerId: {
                target: {
                  address: "1 Main St",
                  $or: [{ name: "Jane" }, { name: { $beginsWith: "J" } }]
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("takes referentialIntegrityCheck beside condition, either alone, or no options", async () => {
          await ProductSupplier.create(keys, {
            // @ts-expect-no-error: both options together
            referentialIntegrityCheck: false,
            condition: { supplierId: { target: { status: "active" } } }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await ProductSupplier.create(keys, {
            // @ts-expect-no-error: condition alone
            condition: { productId: { target: {} } }
          }).catch(() => {
            Logger.log("Testing types");
          });

          // @ts-expect-no-error: the options argument may be empty
          await ProductSupplier.create(keys, {}).catch(() => {
            Logger.log("Testing types");
          });

          // @ts-expect-no-error: the options argument is optional
          await ProductSupplier.create(keys).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses target on a bare foreign key (AE18)", async () => {
          await StudentCourse.create(
            { studentId: "st1", courseId: "c1" },
            {
              condition: {
                // @ts-expect-error: courseId needs its target type to guard it
                courseId: { target: { name: "Algebra" } }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await AuthorBook.create(
            { authorId: "a1", bookId: "b1" },
            {
              condition: {
                // @ts-expect-error: even an existence-only guard needs the target type
                authorId: { target: {} }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses a value condition on a foreign key", async () => {
          await ProductSupplier.create(keys, {
            condition: {
              // @ts-expect-error: a join table key takes a target guard only
              supplierId: "s1"
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await ProductSupplier.create(keys, {
            condition: {
              // @ts-expect-error: nor an operator on its value
              supplierId: { $beginsWith: "s" }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await ProductSupplier.create(keys, {
            condition: {
              // @ts-expect-error: nor a value condition beside the guard
              supplierId: { target: { status: "active" }, $beginsWith: "s" }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses a key that is not a foreign key of the join table", async () => {
          await ProductSupplier.create(keys, {
            condition: {
              // @ts-expect-error: type1 is the join table's own property, not a foreign key
              type1: { target: {} }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await ProductSupplier.create(keys, {
            condition: {
              // @ts-expect-error: type2 is the join table's own property, not a foreign key
              type2: { target: {} }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await ProductSupplier.create(keys, {
            condition: {
              // @ts-expect-error: storeId is not a key of the join table
              storeId: { target: {} }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await ProductSupplier.create(keys, {
            condition: {
              // @ts-expect-error: $or never spans the two rows a join table links
              $or: [{ supplierId: { target: {} } }]
            }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses an attribute the referenced entity does not declare", async () => {
          await ProductSupplier.create(keys, {
            condition: {
              // @ts-expect-error: status is a Supplier attribute, and productId references a Product
              productId: { target: { status: "active" } }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await SourceCustomer.create(sourceKeys, {
            condition: {
              // @ts-expect-error: stringAttribute is on the other entity, not the Customer
              customerId: { target: { stringAttribute: "a" } }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await CompatibleAccessory.create(
            { accessoryId: "a1", compatibleAccessoryId: "a2" },
            {
              condition: {
                // @ts-expect-error: price is a Product attribute, not an Accessory one
                accessoryId: { target: { price: 12 } }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses type in a target", async () => {
          await ProductSupplier.create(keys, {
            condition: {
              // @ts-expect-error: the target's type is fixed by the foreign key's target type
              supplierId: { target: { type: "Supplier" } }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses a dot path naming no declared field, at each depth", async () => {
          await SourceCustomer.create(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: objectAttribute declares no such field
                  "objectAttribute.nope": 1
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await SourceCustomer.create(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: geo declares lat, lng and accuracy, not this
                  "addressAttribute.geo.nope": 1
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await SourceCustomer.create(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: stringAttribute is not an object attribute
                  "stringAttribute.x": "a"
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await SourceCustomer.create(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: name is a string, not a list
                  "objectAttribute.name[0]": "J"
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses a value an attribute cannot hold in a target", async () => {
          await SourceCustomer.create(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: stringAttribute is a string
                  stringAttribute: 1
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await SourceCustomer.create(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: numberAttribute is a number
                  numberAttribute: "5"
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await SourceCustomer.create(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: dateAttribute is compared as a Date
                  dateAttribute: "2026-01-01"
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await SourceCustomer.create(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: enumAttribute takes val-1 or val-2
                  enumAttribute: "val-3"
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await SourceCustomer.create(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: boolAttribute is a boolean
                  boolAttribute: "true"
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await SourceCustomer.create(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: geo.lat is a number
                  "addressAttribute.geo.lat": "41"
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await SourceCustomer.create(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  $or: [
                    // @ts-expect-error: a $or branch is typed the same way
                    { numberAttribute: "5" }
                  ]
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses an operator an attribute cannot take in a target", async () => {
          await SourceCustomer.create(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: a boolean has no prefix
                  boolAttribute: { $beginsWith: "t" }
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await SourceCustomer.create(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: a number has no substring
                  numberAttribute: { $contains: 1 }
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await SourceCustomer.create(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: a boolean has no ordering
                  boolAttribute: { $gt: true }
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await SourceCustomer.create(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: a list has no ordering
                  "objectAttribute.tags": { $gt: "a" }
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses a bad range operand in a target", async () => {
          await SourceCustomer.create(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: both bounds are numbers
                  numberAttribute: { $between: [1, "10"] }
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await SourceCustomer.create(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: $between takes a pair
                  numberAttribute: { $between: [1] }
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await SourceCustomer.create(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: a date compares against a Date
                  dateAttribute: { $gte: "2026-01-01" }
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await SourceCustomer.create(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: val-3 is not one of the enum's values
                  enumAttribute: { $between: ["val-1", "val-3"] }
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await SourceCustomer.create(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: archived is not one of the nested enum's values
                  "objectAttribute.status": { $gte: "active", $lte: "archived" }
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await SourceCustomer.create(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: a range bound is never null, nullable enum or not
                  nullableEnumAttribute: { $between: [null, "val-2"] }
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses null on a non-nullable target attribute, at any depth", async () => {
          await SourceCustomer.create(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: stringAttribute is not nullable
                  stringAttribute: null
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await SourceCustomer.create(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: city is not nullable
                  "addressAttribute.city": null
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await SourceCustomer.create(sourceKeys, {
            condition: {
              customerId: {
                target: {
                  $or: [
                    // @ts-expect-error: a Customer's name is not nullable
                    { name: null }
                  ]
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses null inside an IN array in a target, nullable attribute or not", async () => {
          await SourceCustomer.create(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: an IN list holds values; null is not one
                  enumAttribute: ["val-1", null]
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await SourceCustomer.create(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: null means "not set", which IN cannot express
                  nullableEnumAttribute: ["val-1", null]
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses a relationship key inside a target", async () => {
          await SourceCustomer.create(sourceKeys, {
            condition: {
              customerId: {
                target: {
                  // @ts-expect-error: a target names the referenced entity's own attributes, not its relationships
                  orders: [{ id: "order-1", condition: {} }]
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await ProductSupplier.create(keys, {
            condition: {
              supplierId: {
                target: {
                  // @ts-expect-error: nor its HasAndBelongsToMany
                  products: [{ id: "p1", condition: {} }]
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses a nested guard inside a target", async () => {
          await SourceCustomer.create(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: the referenced entity's foreign key takes its own value only
                  foreignKeyAttribute: { target: {} }
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await SourceCustomer.create(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: a nullable one too
                  nullableForeignKeyAttribute: { target: { name: "Jane" } }
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses a malformed guard shape", async () => {
          await ProductSupplier.create(keys, {
            condition: {
              // @ts-expect-error: a guard wraps its condition in target
              supplierId: { status: "active" }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await ProductSupplier.create(keys, {
            condition: {
              // @ts-expect-error: target holds a condition object, not an id
              supplierId: { target: "s1" }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await ProductSupplier.create(keys, {
            condition: {
              // @ts-expect-error: target holds a condition object, not null
              supplierId: { target: null }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await ProductSupplier.create(keys, {
            condition: {
              // @ts-expect-error: the keys argument already names the row, so a guard takes no id
              supplierId: { id: "s1", condition: { status: "active" } }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await ProductSupplier.create(keys, {
            condition: {
              // @ts-expect-error: a key takes one guard, not a list
              supplierId: [{ target: {} }]
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await ProductSupplier.create(keys, {
            condition: {
              // @ts-expect-error: a key takes a guard, not null
              supplierId: null
            }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses an option create does not take", async () => {
          await ProductSupplier.create(keys, {
            condition: { supplierId: { target: {} } },
            // @ts-expect-error: create has no such option
            conditions: { supplierId: { target: {} } }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await ProductSupplier.create(keys, {
            // @ts-expect-error: a join table link embeds nothing
            forceEmbed: true
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses an option value of the wrong type", async () => {
          await ProductSupplier.create(keys, {
            // @ts-expect-error: referentialIntegrityCheck is a boolean
            referentialIntegrityCheck: "no"
          }).catch(() => {
            Logger.log("Testing types");
          });

          await ProductSupplier.create(keys, {
            // @ts-expect-error: condition is an object of guards
            condition: "x"
          }).catch(() => {
            Logger.log("Testing types");
          });

          await ProductSupplier.create(keys, {
            // @ts-expect-error: condition is one object, not a list of them
            condition: [{ supplierId: { target: {} } }]
          }).catch(() => {
            Logger.log("Testing types");
          });
        });
      });

      describe("delete", () => {
        it("takes target on each typed foreign key, against its own entity", async () => {
          await ProductSupplier.delete(keys, {
            condition: {
              // @ts-expect-no-error: a ForeignKey<Product> guards its Product
              productId: { target: { price: { $gte: 5 } } },
              // @ts-expect-no-error: a ForeignKey<Supplier> guards its Supplier
              supplierId: { target: { status: ["active", "suspended"] } }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await CompatibleAccessory.delete(
            { accessoryId: "a1", compatibleAccessoryId: "a2" },
            {
              condition: {
                // @ts-expect-no-error: a self-referential join table guards either key
                accessoryId: { target: {} },
                // @ts-expect-no-error: both keys reference an Accessory
                compatibleAccessoryId: { target: { name: "Lamp" } }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("takes an empty target and an empty condition", async () => {
          await ProductSupplier.delete(keys, {
            // @ts-expect-no-error: {} guards only that the entity exists
            condition: { supplierId: { target: {} } }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await ProductSupplier.delete(keys, {
            // @ts-expect-no-error: an empty condition guards nothing
            condition: {}
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("takes the full vocabulary in a target", async () => {
          await SourceCustomer.delete(sourceKeys, {
            condition: {
              // @ts-expect-no-error: operators per kind, dot paths, enum ranges, null and $or in a guard
              sourceId: {
                target: {
                  stringAttribute: { $between: ["a", "m"] },
                  numberAttribute: { $gte: 1, $lt: 10 },
                  dateAttribute: [new Date("2026-01-01")],
                  boolAttribute: false,
                  enumAttribute: { $between: ["val-1", "val-2"] },
                  foreignKeyAttribute: { $beginsWith: "customer-" },
                  nullableBoolAttribute: null,
                  "objectAttribute.createdDate": {
                    $gte: new Date("2026-01-01")
                  },
                  "objectAttribute.tags": { $contains: "vip" },
                  "addressAttribute.geo.accuracy": { $beginsWith: "pre" },
                  "addressAttribute.scores[0]": { $gt: 1 },
                  $or: [
                    { "addressAttribute.zip": null },
                    { nullableStringAttribute: { $contains: "a" } }
                  ]
                }
              },
              // @ts-expect-no-error: the other key's target is typed against its own entity
              customerId: { target: { name: { $beginsWith: "J" } } }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("takes condition alone, empty options, or no options", async () => {
          await ProductSupplier.delete(keys, {
            // @ts-expect-no-error: condition is delete's one option
            condition: { productId: { target: { name: "Mug" } } }
          }).catch(() => {
            Logger.log("Testing types");
          });

          // @ts-expect-no-error: the options argument may be empty
          await ProductSupplier.delete(keys, {}).catch(() => {
            Logger.log("Testing types");
          });

          // @ts-expect-no-error: the options argument is optional
          await ProductSupplier.delete(keys).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses target on a bare foreign key (AE18)", async () => {
          await StudentCourse.delete(
            { studentId: "st1", courseId: "c1" },
            {
              condition: {
                // @ts-expect-error: courseId needs its target type to guard it
                courseId: { target: { name: "Algebra" } }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });

          await UserWebsite.delete(
            { userId: "u1", websiteId: "w1" },
            {
              condition: {
                // @ts-expect-error: even an existence-only guard needs the target type
                websiteId: { target: {} }
              }
            }
          ).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses a value condition on a foreign key", async () => {
          await ProductSupplier.delete(keys, {
            condition: {
              // @ts-expect-error: a join table key takes a target guard only
              productId: "p1"
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await ProductSupplier.delete(keys, {
            condition: {
              // @ts-expect-error: nor a value condition beside the guard
              productId: { target: {}, $beginsWith: "p" }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses a key that is not a foreign key of the join table", async () => {
          await ProductSupplier.delete(keys, {
            condition: {
              // @ts-expect-error: type1 is the join table's own property, not a foreign key
              type1: { target: {} }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await ProductSupplier.delete(keys, {
            condition: {
              // @ts-expect-error: type2 is the join table's own property, not a foreign key
              type2: { target: {} }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await ProductSupplier.delete(keys, {
            condition: {
              // @ts-expect-error: storeId is not a key of the join table
              storeId: { target: {} }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses an attribute the referenced entity does not declare", async () => {
          await ProductSupplier.delete(keys, {
            condition: {
              // @ts-expect-error: price is a Product attribute, and supplierId references a Supplier
              supplierId: { target: { price: 12 } }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await ProductSupplier.delete(keys, {
            condition: {
              supplierId: {
                target: {
                  // @ts-expect-error: the target's type is fixed by the foreign key's target type
                  type: "Supplier"
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses an invalid target condition", async () => {
          await SourceCustomer.delete(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: geo declares lat, lng and accuracy, not this
                  "addressAttribute.geo.nope": 1
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await SourceCustomer.delete(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: numberAttribute is a number
                  numberAttribute: "5"
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await SourceCustomer.delete(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: a boolean has no ordering
                  boolAttribute: { $between: [false, true] }
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await SourceCustomer.delete(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: a guard's range bounds are typed the same way
                  "addressAttribute.geo.lat": { $between: [1, "2"] }
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await SourceCustomer.delete(sourceKeys, {
            condition: {
              customerId: {
                target: {
                  // @ts-expect-error: a Customer's name is not nullable
                  name: null
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await SourceCustomer.delete(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: null is not a value an IN list holds
                  nullableNumberAttribute: [1, null]
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await SourceCustomer.delete(sourceKeys, {
            condition: {
              customerId: {
                target: {
                  // @ts-expect-error: a target names the referenced entity's own attributes, not its relationships
                  contactInformation: {}
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await SourceCustomer.delete(sourceKeys, {
            condition: {
              sourceId: {
                target: {
                  // @ts-expect-error: a guard's condition holds no further guard
                  foreignKeyAttribute: { target: {} }
                }
              }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses a malformed guard shape", async () => {
          await ProductSupplier.delete(keys, {
            condition: {
              // @ts-expect-error: a guard wraps its condition in target
              productId: { name: "Mug" }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });

          await ProductSupplier.delete(keys, {
            condition: {
              // @ts-expect-error: target holds a condition object, not an id
              productId: { target: "p1" }
            }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses an option delete does not take", async () => {
          await ProductSupplier.delete(keys, {
            // @ts-expect-error: an unlink writes no foreign keys to check
            referentialIntegrityCheck: false
          }).catch(() => {
            Logger.log("Testing types");
          });

          await ProductSupplier.delete(keys, {
            condition: { supplierId: { target: {} } },
            // @ts-expect-error: delete has no such option
            conditions: { supplierId: { target: {} } }
          }).catch(() => {
            Logger.log("Testing types");
          });
        });

        it("refuses an option value of the wrong type", async () => {
          await ProductSupplier.delete(keys, {
            // @ts-expect-error: condition is an object of guards
            condition: "x"
          }).catch(() => {
            Logger.log("Testing types");
          });

          await ProductSupplier.delete(keys, {
            // @ts-expect-error: condition is one object, not a list of them
            condition: [{ productId: { target: {} } }]
          }).catch(() => {
            Logger.log("Testing types");
          });
        });
      });
    });
  });
});
