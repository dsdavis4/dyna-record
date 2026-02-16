import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  Customer,
  PaymentMethod,
  Order,
  PaymentMethodProvider,
  Book,
  Author,
  Course,
  Teacher,
  Assignment,
  Student,
  ContactInformation,
  Pet,
  Address,
  PhoneBook
} from "./mockModels";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand
} from "@aws-sdk/lib-dynamodb";
import Logger from "../../src/Logger";
import {
  type OtherTableEntityTableItem,
  type MockTableEntityTableItem
} from "./utils";

const mockGet = jest.fn();
const mockSend = jest.fn();
const mockQuery = jest.fn();
const mockedDynamoDBClient = jest.mocked(DynamoDBClient);
const mockedDynamoDBDocumentClient = jest.mocked(DynamoDBDocumentClient);
const mockedGetCommand = jest.mocked(GetCommand);
const mockedQueryCommand = jest.mocked(QueryCommand);

jest.mock("@aws-sdk/client-dynamodb", () => {
  return {
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
            if (command.name === "QueryCommand") {
              return await Promise.resolve(mockQuery());
            }
          })
        };
      })
    },
    GetCommand: jest.fn().mockImplementation(() => {
      return { name: "GetCommand" };
    }),
    QueryCommand: jest.fn().mockImplementation(() => {
      return { name: "QueryCommand" };
    })
  };
});

describe("FindById", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("will initialize a Dynamo client", async () => {
    expect.assertions(3);

    mockGet.mockResolvedValueOnce({});

    await Customer.findById("123");

    expect(mockedDynamoDBClient).toHaveBeenCalledWith({ region: "us-west-2" });
    expect(mockedDynamoDBClient).toHaveBeenCalledTimes(1);
    expect(mockedDynamoDBDocumentClient.from.mock.calls).toEqual([
      [{ key: "MockDynamoDBClient" }]
    ]);
  });

  describe("findById only", () => {
    it("will find an Entity by id and serialize it to the model", async () => {
      expect.assertions(5);

      mockGet.mockResolvedValueOnce({
        Item: {
          PK: "Customer#123",
          SK: "Customer",
          Id: "123",
          Name: "Some Customer",
          Address: "11 Some St",
          Type: "Customer",
          UpdatedAt: "2023-09-15T04:26:31.148Z"
        }
      });

      const result = await Customer.findById("123");

      expect(result).toBeInstanceOf(Customer);
      expect(result).toEqual({
        type: "Customer",
        pk: "Customer#123",
        sk: "Customer",
        id: "123",
        name: "Some Customer",
        address: "11 Some St",
        updatedAt: new Date("2023-09-15T04:26:31.148Z")
      });
      expect(result?.mockCustomInstanceMethod()).toEqual("Some Customer-123");
      expect(mockedGetCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            Key: { PK: "Customer#123", SK: "Customer" },
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "GetCommand" }]]);
    });

    it("consistentRead - will find an Entity by id and serialize it to the model", async () => {
      expect.assertions(5);

      mockGet.mockResolvedValueOnce({
        Item: {
          PK: "Customer#123",
          SK: "Customer",
          Id: "123",
          Name: "Some Customer",
          Address: "11 Some St",
          Type: "Customer",
          UpdatedAt: "2023-09-15T04:26:31.148Z"
        }
      });

      const result = await Customer.findById("123", { consistentRead: true });

      expect(result).toBeInstanceOf(Customer);
      expect(result).toEqual({
        type: "Customer",
        pk: "Customer#123",
        sk: "Customer",
        id: "123",
        name: "Some Customer",
        address: "11 Some St",
        updatedAt: new Date("2023-09-15T04:26:31.148Z")
      });
      expect(result?.mockCustomInstanceMethod()).toEqual("Some Customer-123");
      expect(mockedGetCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            Key: { PK: "Customer#123", SK: "Customer" },
            ConsistentRead: true
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "GetCommand" }]]);
    });

    it("the returned model will have a instance method for update", async () => {
      expect.assertions(1);

      mockGet.mockResolvedValueOnce({
        Item: {
          PK: "Customer#123",
          SK: "Customer",
          Id: "123",
          Name: "Some Customer",
          Address: "11 Some St",
          Type: "Customer",
          UpdatedAt: "2023-09-15T04:26:31.148Z"
        }
      });

      const result = await Customer.findById("123");

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(result?.update).toBeInstanceOf(Function);
    });

    it("will serialize an entity with a nullable date attribute", async () => {
      expect.assertions(4);

      mockGet.mockResolvedValueOnce({
        Item: {
          PK: "Pet#123",
          SK: "Pet",
          Id: "123",
          Name: "Fido",
          Type: "Pet",
          CreatedAt: "2023-03-15T04:26:31.148Z",
          UpdatedAt: "2023-09-15T04:26:31.148Z",
          AdoptedDate: "2023-09-15T04:26:31.148Z"
        }
      });

      const result = await Pet.findById("123");

      expect(result).toBeInstanceOf(Pet);
      expect(result).toEqual({
        type: "Pet",
        pk: "Pet#123",
        sk: "Pet",
        id: "123",
        name: "Fido",
        createdAt: new Date("2023-03-15T04:26:31.148Z"),
        updatedAt: new Date("2023-09-15T04:26:31.148Z"),
        adoptedDate: new Date("2023-09-15T04:26:31.148Z")
      });
      expect(mockedGetCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            Key: { PK: "Pet#123", SK: "Pet" },
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "GetCommand" }]]);
    });

    it("will return undefined if it doesn't find the record", async () => {
      expect.assertions(4);

      mockGet.mockResolvedValueOnce({});

      const result = await Customer.findById("123");

      expect(result).toEqual(undefined);
      expect(mockedGetCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            Key: { PK: "Customer#123", SK: "Customer" },
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockGet.mock.calls).toEqual([[]]);
      expect(mockSend.mock.calls).toEqual([[{ name: "GetCommand" }]]);
    });
  });

  describe("findBbyId with includes", () => {
    it("will return undefined if it doesn't find the record", async () => {
      expect.assertions(4);

      mockQuery.mockResolvedValueOnce({ Items: [] });

      const result = await Customer.findById("123", {
        include: [{ association: "orders" }]
      });

      expect(result).toEqual(undefined);
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            ExpressionAttributeNames: { "#PK": "PK", "#Type": "Type" },
            ExpressionAttributeValues: {
              ":PK3": "Customer#123",
              ":Type1": "Customer",
              ":Type2": "Order"
            },
            FilterExpression: "(#Type IN (:Type1,:Type2))",
            KeyConditionExpression: "#PK = :PK3",
            TableName: "mock-table",
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockQuery.mock.calls).toEqual([[]]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("will find an entity with included HasMany associations", async () => {
      expect.assertions(6);

      const customer: MockTableEntityTableItem<Customer> = {
        PK: "Customer#123",
        SK: "Customer",
        Id: "123",
        Type: "Customer",
        Name: "Some Customer",
        Address: "11 Some St",
        CreatedAt: "2022-09-14T04:26:31.148Z",
        UpdatedAt: "2022-09-15T04:26:31.148Z"
      };

      // Denormalized Order records denormalized in the Customer partition
      const orders: Array<MockTableEntityTableItem<Order>> = [
        {
          PK: customer.PK,
          SK: "Order#001",
          Id: "001",
          Type: "Order",
          CustomerId: customer.Id,
          PaymentMethodId: "008",
          OrderDate: "2022-10-14T09:31:15.148Z",
          CreatedAt: "2022-10-15T09:31:15.148Z",
          UpdatedAt: "2022-10-16T09:31:15.148Z"
        },
        {
          PK: customer.PK,
          SK: "Order#003",
          Id: "003",
          Type: "Order",
          CustomerId: customer.Id,
          PaymentMethodId: "008",
          OrderDate: "2022-11-01T23:31:21.148Z",
          CreatedAt: "2022-11-02T23:31:21.148Z",
          UpdatedAt: "2022-11-03T23:31:21.148Z"
        },
        {
          PK: customer.PK,
          SK: "Order#004",
          Id: "004",
          Type: "Order",
          CustomerId: customer.Id,
          PaymentMethodId: "008",
          OrderDate: "2022-09-01T23:31:21.148Z",
          CreatedAt: "2022-09-02T23:31:21.148Z",
          UpdatedAt: "2022-09-03T23:31:21.148Z"
        }
      ];

      // Denormalized PaymentMethod records denormalized in the Customer partition
      const paymentMethods: Array<MockTableEntityTableItem<PaymentMethod>> = [
        {
          PK: customer.PK,
          SK: "PaymentMethod#007",
          Id: "007",
          Type: "PaymentMethod",
          CustomerId: customer.Id,
          LastFour: "1234",
          CreatedAt: "2022-10-01T12:31:21.148Z",
          UpdatedAt: "2022-10-02T12:31:21.148Z"
        },
        {
          PK: customer.PK,
          SK: "PaymentMethod#008",
          Id: "008",
          Type: "PaymentMethod",
          CustomerId: customer.Id,
          LastFour: "5678",
          CreatedAt: "2022-11-20T12:31:21.148Z",
          UpdatedAt: "2022-11-21T12:31:21.148Z"
        }
      ];

      mockQuery.mockResolvedValueOnce({
        Items: [customer, ...orders, ...paymentMethods]
      });

      const result = await Customer.findById("123", {
        include: [{ association: "orders" }, { association: "paymentMethods" }]
      });

      expect(result).toEqual({
        pk: "Customer#123",
        sk: "Customer",
        id: "123",
        type: "Customer",
        address: "11 Some St",
        name: "Some Customer",
        createdAt: new Date("2022-09-14T04:26:31.148Z"),
        updatedAt: new Date("2022-09-15T04:26:31.148Z"),
        orders: [
          {
            pk: "Customer#123",
            sk: "Order#001",
            id: "001",
            type: "Order",
            customerId: "123",
            orderDate: new Date("2022-10-14T09:31:15.148Z"),
            paymentMethodId: "008",
            createdAt: new Date("2022-10-15T09:31:15.148Z"),
            updatedAt: new Date("2022-10-16T09:31:15.148Z")
          },
          {
            pk: "Customer#123",
            sk: "Order#003",
            id: "003",
            type: "Order",
            customerId: "123",
            orderDate: new Date("2022-11-01T23:31:21.148Z"),
            paymentMethodId: "008",
            createdAt: new Date("2022-11-02T23:31:21.148Z"),
            updatedAt: new Date("2022-11-03T23:31:21.148Z")
          },
          {
            pk: "Customer#123",
            sk: "Order#004",
            id: "004",
            type: "Order",
            customerId: "123",
            orderDate: new Date("2022-09-01T23:31:21.148Z"),
            paymentMethodId: "008",
            createdAt: new Date("2022-09-02T23:31:21.148Z"),
            updatedAt: new Date("2022-09-03T23:31:21.148Z")
          }
        ],
        paymentMethods: [
          {
            pk: "Customer#123",
            sk: "PaymentMethod#007",
            id: "007",
            type: "PaymentMethod",
            customerId: "123",
            lastFour: "1234",
            createdAt: new Date("2022-10-01T12:31:21.148Z"),
            updatedAt: new Date("2022-10-02T12:31:21.148Z")
          },
          {
            pk: "Customer#123",
            sk: "PaymentMethod#008",
            id: "008",
            type: "PaymentMethod",
            customerId: "123",
            lastFour: "5678",
            createdAt: new Date("2022-11-20T12:31:21.148Z"),
            updatedAt: new Date("2022-11-21T12:31:21.148Z")
          }
        ]
      });
      expect(result).toBeInstanceOf(Customer);
      expect(result?.orders.every(order => order instanceof Order)).toEqual(
        true
      );
      expect(
        result?.paymentMethods.every(
          paymentMethod => paymentMethod instanceof PaymentMethod
        )
      ).toEqual(true);
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK4",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#Type": "Type"
            },
            ExpressionAttributeValues: {
              ":PK4": "Customer#123",
              ":Type1": "Customer",
              ":Type2": "Order",
              ":Type3": "PaymentMethod"
            },
            FilterExpression: "(#Type IN (:Type1,:Type2,:Type3))",
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("will find an entity with included HasOne associations", async () => {
      expect.assertions(5);

      const customer: MockTableEntityTableItem<Customer> = {
        PK: "Customer#123",
        SK: "Customer",
        Id: "123",
        Type: "Customer",
        Name: "Some Customer",
        Address: "11 Some St",
        CreatedAt: "2022-09-14T04:26:31.148Z",
        UpdatedAt: "2022-09-15T04:26:31.148Z"
      };

      const contactInformation: MockTableEntityTableItem<ContactInformation> = {
        PK: customer.PK,
        SK: "ContactInformation",
        Id: "456",
        Type: "ContactInformation",
        CustomerId: customer.Id,
        Email: "test@test.com",
        Phone: "555-555-5555",
        CreatedAt: "2022-09-16T04:26:31.148Z",
        UpdatedAt: "2022-09-17T04:26:31.148Z"
      };

      mockQuery.mockResolvedValueOnce({
        Items: [customer, contactInformation]
      });

      const result = await Customer.findById("123", {
        include: [{ association: "contactInformation" }]
      });

      expect(result).toEqual({
        pk: "Customer#123",
        sk: "Customer",
        id: "123",
        type: "Customer",
        address: "11 Some St",
        name: "Some Customer",
        createdAt: new Date("2022-09-14T04:26:31.148Z"),
        updatedAt: new Date("2022-09-15T04:26:31.148Z"),
        contactInformation: {
          pk: "Customer#123",
          sk: "ContactInformation",
          id: "456",
          type: "ContactInformation",
          customerId: "123",
          email: "test@test.com",
          phone: "555-555-5555",
          createdAt: new Date("2022-09-16T04:26:31.148Z"),
          updatedAt: new Date("2022-09-17T04:26:31.148Z")
        }
      });
      expect(result).toBeInstanceOf(Customer);
      expect(result?.contactInformation).toBeInstanceOf(ContactInformation);
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK3",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#Type": "Type"
            },
            ExpressionAttributeValues: {
              ":PK3": "Customer#123",
              ":Type1": "Customer",
              ":Type2": "ContactInformation"
            },
            FilterExpression: "(#Type IN (:Type1,:Type2))",
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("will find an entity with included BelongsTo associations", async () => {
      expect.assertions(5);

      // Denormalized Customer record denormalized in the ContactInformation partition
      const customer: MockTableEntityTableItem<Customer> = {
        PK: "ContactInformation#123",
        SK: "Customer",
        Id: "456",
        Type: "Customer",
        Name: "Some Customer",
        Address: "11 Some St",
        CreatedAt: "2022-09-14T04:26:31.148Z",
        UpdatedAt: "2022-09-15T04:26:31.148Z"
      };

      // Entity being queried
      const contactInformation: MockTableEntityTableItem<ContactInformation> = {
        PK: "ContactInformation#123",
        SK: "ContactInformation",
        Id: "123",
        Type: "ContactInformation",
        Email: "test@test.com",
        Phone: "555-555-5555",
        CustomerId: customer.Id,
        CreatedAt: "2022-09-16T04:26:31.148Z",
        UpdatedAt: "2022-09-17T04:26:31.148Z"
      };

      mockQuery.mockResolvedValueOnce({
        Items: [customer, contactInformation]
      });

      const result = await ContactInformation.findById("123", {
        include: [{ association: "customer" }]
      });

      expect(result).toEqual({
        pk: "ContactInformation#123",
        sk: "ContactInformation",
        id: "123",
        type: "ContactInformation",
        email: "test@test.com",
        phone: "555-555-5555",
        customerId: "456",
        createdAt: new Date("2022-09-16T04:26:31.148Z"),
        updatedAt: new Date("2022-09-17T04:26:31.148Z"),
        customer: {
          pk: "ContactInformation#123",
          sk: "Customer",
          id: "456",
          type: "Customer",
          name: "Some Customer",
          address: "11 Some St",
          createdAt: new Date("2022-09-14T04:26:31.148Z"),
          updatedAt: new Date("2022-09-15T04:26:31.148Z")
        }
      });
      expect(result).toBeInstanceOf(ContactInformation);
      expect(result?.customer).toBeInstanceOf(Customer);
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK3",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#Type": "Type"
            },
            ExpressionAttributeValues: {
              ":PK3": "ContactInformation#123",
              ":Type1": "ContactInformation",
              ":Type2": "Customer"
            },
            FilterExpression: "(#Type IN (:Type1,:Type2))",
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("will find an entity included HasAndBelongsToMany associations", async () => {
      expect.assertions(5);

      const book: MockTableEntityTableItem<Book> = {
        PK: "Book#789",
        SK: "Book",
        Id: "789",
        Type: "Book",
        Name: "BookAbc",
        NumPages: 589,
        CreatedAt: "2023-01-15T12:12:18.123Z",
        UpdatedAt: "2023-02-15T08:31:15.148Z"
      };

      // Author entities denormalized to Book partition via associations
      const authors: Array<MockTableEntityTableItem<Author>> = [
        {
          PK: "Book#789",
          SK: "Author#001",
          Id: "001",
          Type: "Author",
          Name: "Author-1",
          CreatedAt: "2022-10-14T09:31:15.148Z",
          UpdatedAt: "2022-10-15T09:31:15.148Z"
        },
        {
          PK: "Book#789",
          SK: "Author#002",
          Id: "002",
          Type: "Author",
          Name: "Author-2",
          CreatedAt: "2022-10-16T09:31:15.148Z",
          UpdatedAt: "2022-10-17T09:31:15.148Z"
        },
        {
          PK: "Book#789",
          SK: "Author#003",
          Id: "003",
          Type: "Author",
          Name: "Author-3",
          CreatedAt: "2022-10-18T09:31:15.148Z",
          UpdatedAt: "2022-10-19T09:31:15.148Z"
        }
      ];

      mockQuery.mockResolvedValueOnce({
        Items: [book, ...authors]
      });

      const result = await Book.findById("789", {
        include: [{ association: "authors" }]
      });

      expect(result).toEqual({
        pk: "Book#789",
        sk: "Book",
        id: "789",
        type: "Book",
        name: "BookAbc",
        numPages: 589,
        createdAt: new Date("2023-01-15T12:12:18.123Z"),
        updatedAt: new Date("2023-02-15T08:31:15.148Z"),
        authors: [
          {
            pk: "Book#789",
            sk: "Author#001",
            id: "001",
            type: "Author",
            name: "Author-1",
            createdAt: new Date("2022-10-14T09:31:15.148Z"),
            updatedAt: new Date("2022-10-15T09:31:15.148Z")
          },
          {
            pk: "Book#789",
            sk: "Author#002",
            id: "002",
            type: "Author",
            name: "Author-2",
            createdAt: new Date("2022-10-16T09:31:15.148Z"),
            updatedAt: new Date("2022-10-17T09:31:15.148Z")
          },
          {
            pk: "Book#789",
            sk: "Author#003",
            id: "003",
            type: "Author",
            name: "Author-3",
            createdAt: new Date("2022-10-18T09:31:15.148Z"),
            updatedAt: new Date("2022-10-19T09:31:15.148Z")
          }
        ]
      });
      expect(result).toBeInstanceOf(Book);
      expect(result?.authors.every(order => order instanceof Author)).toEqual(
        true
      );
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK3",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#Type": "Type"
            },
            ExpressionAttributeValues: {
              ":PK3": "Book#789",
              ":Type1": "Book",
              ":Type2": "Author"
            },
            FilterExpression: "(#Type IN (:Type1,:Type2))",
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("will find a model with multiple (HasMany, HasAndBelongsMany and BelongsTo) relationships", async () => {
      expect.assertions(7);

      // BelongsTo -  Teacher entities denormalized to Course partition via associations
      const teacher: OtherTableEntityTableItem<Teacher> = {
        myPk: "Course|123",
        mySk: "Teacher",
        id: "004",
        type: "Teacher",
        name: "Teacher-1",
        createdAt: "2023-02-20T08:31:15.148Z",
        updatedAt: "2023-02-21T08:31:15.148Z"
      };

      // Entity being queried for
      const course: OtherTableEntityTableItem<Course> = {
        myPk: "Course|123",
        mySk: "Course",
        id: "123",
        type: "Course",
        name: "Math",
        teacherId: teacher.id,
        createdAt: "2023-01-15T12:12:18.123Z",
        updatedAt: "2023-02-15T08:31:15.148Z"
      };

      // HasAndBelongsToMany -  Student entities denormalized to Course partition via associations
      const students: Array<OtherTableEntityTableItem<Student>> = [
        {
          myPk: "Course|123",
          mySk: "Student|001",
          id: "001",
          type: "Student",
          name: "Student-1",
          createdAt: "2023-01-15T12:12:18.123Z",
          updatedAt: "2023-02-15T08:31:15.148Z"
        },
        {
          myPk: "Course|123",
          mySk: "Student|002",
          id: "002",
          type: "Student",
          name: "Student-2",
          createdAt: "2023-01-16T12:12:18.123Z",
          updatedAt: "2023-02-17T08:31:15.148Z"
        }
      ];

      // HasMany -  Assignment entities denormalized to Course partition via associations
      const assignments: Array<OtherTableEntityTableItem<Assignment>> = [
        {
          myPk: "Course|123",
          mySk: "Assignment|003",
          id: "003",
          type: "Assignment",
          title: "Assignment-1",
          courseId: course.id,
          createdAt: "2023-01-18T12:12:18.123Z",
          updatedAt: "2023-02-19T08:31:15.148Z"
        }
      ];

      mockQuery.mockResolvedValueOnce({
        Items: [course, ...students, ...assignments, teacher]
      });

      const result = await Course.findById("123", {
        include: [
          { association: "teacher" },
          { association: "assignments" },
          { association: "students" }
        ]
      });

      expect(result).toEqual({
        myPk: "Course|123",
        mySk: "Course",
        id: "123",
        type: "Course",
        name: "Math",
        teacherId: "004",
        createdAt: new Date("2023-01-15T12:12:18.123Z"),
        updatedAt: new Date("2023-02-15T08:31:15.148Z"),
        assignments: [
          {
            myPk: "Course|123",
            mySk: "Assignment|003",
            id: "003",
            type: "Assignment",
            courseId: "123",
            title: "Assignment-1",
            createdAt: new Date("2023-01-18T12:12:18.123Z"),
            updatedAt: new Date("2023-02-19T08:31:15.148Z")
          }
        ],
        students: [
          {
            myPk: "Course|123",
            mySk: "Student|001",
            id: "001",
            type: "Student",
            name: "Student-1",
            createdAt: new Date("2023-01-15T12:12:18.123Z"),
            updatedAt: new Date("2023-02-15T08:31:15.148Z")
          },
          {
            myPk: "Course|123",
            mySk: "Student|002",
            id: "002",
            type: "Student",
            name: "Student-2",
            createdAt: new Date("2023-01-16T12:12:18.123Z"),
            updatedAt: new Date("2023-02-17T08:31:15.148Z")
          }
        ],
        teacher: {
          myPk: "Course|123",
          mySk: "Teacher",
          id: "004",
          type: "Teacher",
          name: "Teacher-1",
          createdAt: new Date("2023-02-20T08:31:15.148Z"),
          updatedAt: new Date("2023-02-21T08:31:15.148Z")
        }
      });
      expect(result).toBeInstanceOf(Course);
      expect(result?.teacher).toBeInstanceOf(Teacher);
      expect(
        result?.assignments.every(
          assignment => assignment instanceof Assignment
        )
      ).toEqual(true);
      expect(
        result?.students.every(student => student instanceof Student)
      ).toEqual(true);
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "other-table",
            KeyConditionExpression: "#myPk = :myPk5",
            ExpressionAttributeNames: {
              "#myPk": "myPk",
              "#type": "type"
            },
            ExpressionAttributeValues: {
              ":myPk5": "Course|123",
              ":type1": "Course",
              ":type2": "Teacher",
              ":type3": "Assignment",
              ":type4": "Student"
            },
            FilterExpression: "(#type IN (:type1,:type2,:type3,:type4))",
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("will set included HasMany associations to an empty array if it doesn't find any", async () => {
      expect.assertions(3);

      const customer: MockTableEntityTableItem<Customer> = {
        PK: "Customer#123",
        SK: "Customer",
        Id: "123",
        Name: "Some Customer",
        Address: "11 Some St",
        Type: "Customer",
        CreatedAt: "2022-09-14T04:26:31.148Z",
        UpdatedAt: "2022-09-15T04:26:31.148Z"
      };

      mockQuery.mockResolvedValueOnce({
        Items: [customer]
      });

      const result = await Customer.findById("123", {
        include: [{ association: "orders" }, { association: "paymentMethods" }]
      });

      expect(result).toEqual({
        pk: "Customer#123",
        sk: "Customer",
        id: "123",
        type: "Customer",
        address: "11 Some St",
        name: "Some Customer",
        createdAt: new Date("2022-09-14T04:26:31.148Z"),
        updatedAt: new Date("2022-09-15T04:26:31.148Z"),
        orders: [],
        paymentMethods: []
      });
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK4",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#Type": "Type"
            },
            ExpressionAttributeValues: {
              ":PK4": "Customer#123",
              ":Type1": "Customer",
              ":Type2": "Order",
              ":Type3": "PaymentMethod"
            },
            FilterExpression: "(#Type IN (:Type1,:Type2,:Type3))",
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("will set included HasAndBelongsToMany associations to an empty array if it doesn't find any", async () => {
      expect.assertions(3);

      const book: MockTableEntityTableItem<Book> = {
        PK: "Book#789",
        SK: "Book",
        Id: "789",
        Type: "Book",
        Name: "BookAbc",
        NumPages: 589,
        CreatedAt: "2023-01-15T12:12:18.123Z",
        UpdatedAt: "2023-02-15T08:31:15.148Z"
      };

      mockQuery.mockResolvedValueOnce({
        Items: [book]
      });

      const result = await Book.findById("789", {
        include: [{ association: "authors" }]
      });

      expect(result).toEqual({
        pk: "Book#789",
        sk: "Book",
        id: "789",
        type: "Book",
        name: "BookAbc",
        numPages: 589,
        createdAt: new Date("2023-01-15T12:12:18.123Z"),
        updatedAt: new Date("2023-02-15T08:31:15.148Z"),
        authors: []
      });
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK3",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#Type": "Type"
            },
            ExpressionAttributeValues: {
              ":PK3": "Book#789",
              ":Type1": "Book",
              ":Type2": "Author"
            },
            FilterExpression: "(#Type IN (:Type1,:Type2))",
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("will set included HasOne associations to undefined if it doesn't find any", async () => {
      expect.assertions(3);

      const paymentMethod: MockTableEntityTableItem<PaymentMethod> = {
        PK: "PaymentMethod#789",
        SK: "PaymentMethod",
        Id: "789",
        Type: "PaymentMethod",
        LastFour: "0000",
        CustomerId: "123",
        CreatedAt: "2023-02-14T08:31:15.148Z",
        UpdatedAt: "2023-02-15T08:31:15.148Z"
      };

      mockQuery.mockResolvedValueOnce({
        Items: [paymentMethod]
      });

      const result = await PaymentMethod.findById("789", {
        include: [{ association: "paymentMethodProvider" }]
      });

      expect(result).toEqual({
        pk: "PaymentMethod#789",
        sk: "PaymentMethod",
        id: "789",
        type: "PaymentMethod",
        lastFour: "0000",
        customerId: "123",
        createdAt: new Date("2023-02-14T08:31:15.148Z"),
        updatedAt: new Date("2023-02-15T08:31:15.148Z"),
        paymentMethodProvider: undefined
      });
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK3",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#Type": "Type"
            },
            ExpressionAttributeValues: {
              ":PK3": "PaymentMethod#789",
              ":Type1": "PaymentMethod",
              ":Type2": "PaymentMethodProvider"
            },
            FilterExpression: "(#Type IN (:Type1,:Type2))",
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("will set included BelongsTo associations to undefined if it doesn't find any", async () => {
      expect.assertions(3);

      const contactInformation: MockTableEntityTableItem<ContactInformation> = {
        PK: "ContactInformation#123",
        SK: "ContactInformation",
        Id: "123",
        Type: "ContactInformation",
        CustomerId: undefined,
        Email: "test@example.com",
        Phone: "555-555-5555",
        CreatedAt: "2023-09-15T04:26:31.148Z",
        UpdatedAt: "2023-09-15T04:26:31.148Z"
      };

      mockQuery.mockResolvedValueOnce({
        Items: [contactInformation]
      });

      const result = await ContactInformation.findById("123", {
        include: [{ association: "customer" }]
      });

      expect(result).toEqual({
        pk: "ContactInformation#123",
        sk: "ContactInformation",
        id: "123",
        type: "ContactInformation",
        customerId: undefined,
        email: "test@example.com",
        phone: "555-555-5555",
        createdAt: new Date("2023-09-15T04:26:31.148Z"),
        updatedAt: new Date("2023-09-15T04:26:31.148Z"),
        customer: undefined
      });
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "mock-table",
            KeyConditionExpression: "#PK = :PK3",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#Type": "Type"
            },
            ExpressionAttributeValues: {
              ":PK3": "ContactInformation#123",
              ":Type1": "ContactInformation",
              ":Type2": "Customer"
            },
            FilterExpression: "(#Type IN (:Type1,:Type2))",
            ConsistentRead: false
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });

    it("will findById with includes using consistent reads", async () => {
      expect.assertions(7);

      // BelongsTo -  Teacher entities denormalized to Course partition via associations
      const teacher: OtherTableEntityTableItem<Teacher> = {
        myPk: "Course|123",
        mySk: "Teacher",
        id: "004",
        type: "Teacher",
        name: "Teacher-1",
        createdAt: "2023-02-20T08:31:15.148Z",
        updatedAt: "2023-02-21T08:31:15.148Z"
      };

      // Entity being queried for
      const course: OtherTableEntityTableItem<Course> = {
        myPk: "Course|123",
        mySk: "Course",
        id: "123",
        type: "Course",
        name: "Math",
        teacherId: teacher.id,
        createdAt: "2023-01-15T12:12:18.123Z",
        updatedAt: "2023-02-15T08:31:15.148Z"
      };

      // HasAndBelongsToMany -  Student entities denormalized to Course partition via associations
      const students: Array<OtherTableEntityTableItem<Student>> = [
        {
          myPk: "Course|123",
          mySk: "Student|001",
          id: "001",
          type: "Student",
          name: "Student-1",
          createdAt: "2023-01-15T12:12:18.123Z",
          updatedAt: "2023-02-15T08:31:15.148Z"
        },
        {
          myPk: "Course|123",
          mySk: "Student|002",
          id: "002",
          type: "Student",
          name: "Student-2",
          createdAt: "2023-01-16T12:12:18.123Z",
          updatedAt: "2023-02-17T08:31:15.148Z"
        }
      ];

      // HasMany -  Assignment entities denormalized to Course partition via associations
      const assignments: Array<OtherTableEntityTableItem<Assignment>> = [
        {
          myPk: "Course|123",
          mySk: "Assignment|003",
          id: "003",
          type: "Assignment",
          title: "Assignment-1",
          courseId: course.id,
          createdAt: "2023-01-18T12:12:18.123Z",
          updatedAt: "2023-02-19T08:31:15.148Z"
        }
      ];

      mockQuery.mockResolvedValueOnce({
        Items: [course, ...students, ...assignments, teacher]
      });

      const result = await Course.findById("123", {
        consistentRead: true,
        include: [
          { association: "teacher" },
          { association: "assignments" },
          { association: "students" }
        ]
      });

      expect(result).toEqual({
        myPk: "Course|123",
        mySk: "Course",
        id: "123",
        type: "Course",
        name: "Math",
        teacherId: "004",
        createdAt: new Date("2023-01-15T12:12:18.123Z"),
        updatedAt: new Date("2023-02-15T08:31:15.148Z"),
        assignments: [
          {
            myPk: "Course|123",
            mySk: "Assignment|003",
            id: "003",
            type: "Assignment",
            courseId: "123",
            title: "Assignment-1",
            createdAt: new Date("2023-01-18T12:12:18.123Z"),
            updatedAt: new Date("2023-02-19T08:31:15.148Z")
          }
        ],
        students: [
          {
            myPk: "Course|123",
            mySk: "Student|001",
            id: "001",
            type: "Student",
            name: "Student-1",
            createdAt: new Date("2023-01-15T12:12:18.123Z"),
            updatedAt: new Date("2023-02-15T08:31:15.148Z")
          },
          {
            myPk: "Course|123",
            mySk: "Student|002",
            id: "002",
            type: "Student",
            name: "Student-2",
            createdAt: new Date("2023-01-16T12:12:18.123Z"),
            updatedAt: new Date("2023-02-17T08:31:15.148Z")
          }
        ],
        teacher: {
          myPk: "Course|123",
          mySk: "Teacher",
          id: "004",
          type: "Teacher",
          name: "Teacher-1",
          createdAt: new Date("2023-02-20T08:31:15.148Z"),
          updatedAt: new Date("2023-02-21T08:31:15.148Z")
        }
      });
      expect(result).toBeInstanceOf(Course);
      expect(result?.teacher).toBeInstanceOf(Teacher);
      expect(
        result?.assignments.every(
          assignment => assignment instanceof Assignment
        )
      ).toEqual(true);
      expect(
        result?.students.every(student => student instanceof Student)
      ).toEqual(true);
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "other-table",
            KeyConditionExpression: "#myPk = :myPk5",
            ExpressionAttributeNames: {
              "#myPk": "myPk",
              "#type": "type"
            },
            ExpressionAttributeValues: {
              ":myPk5": "Course|123",
              ":type1": "Course",
              ":type2": "Teacher",
              ":type3": "Assignment",
              ":type4": "Student"
            },
            FilterExpression: "(#type IN (:type1,:type2,:type3,:type4))",
            ConsistentRead: true
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "QueryCommand" }]]);
    });
  });

  describe("types", () => {
    describe("findById without includes", () => {
      beforeEach(() => {
        mockGet.mockResolvedValueOnce({});
      });

      it("will allow id id with no options", async () => {
        // @ts-expect-no-error: Second parameter 'options' is optional
        await PaymentMethod.findById("789");
      });

      it("will only infer attribute types and not included relationships", async () => {
        const result = await PaymentMethod.findById("789");

        if (result !== undefined) {
          // @ts-expect-no-error: Attributes are allowed
          Logger.log(result.id);

          // @ts-expect-no-error: Attributes are allowed
          Logger.log(result.lastFour);

          // @ts-expect-error: Relationship properties are not allowed
          Logger.log(result.customer);

          // @ts-expect-error: Relationship properties are not allowed
          Logger.log(result.orders);

          // @ts-expect-error: Relationship properties are not allowed
          Logger.log(result.paymentMethodProvider);
        }
      });

      it("results have entity functions", async () => {
        const result = await PaymentMethod.findById("789");

        if (result !== undefined) {
          // @ts-expect-no-error: Functions are allowed
          Logger.log(result.update);
        }
      });

      it("will accept consistentRead as a boolean true", async () => {
        // @ts-expect-no-error: consistentRead can be true
        await PaymentMethod.findById("789", { consistentRead: true });
      });

      it("will accept consistentRead as a boolean false", async () => {
        // @ts-expect-no-error: consistentRead can be false
        await PaymentMethod.findById("789", { consistentRead: false });
      });

      it("will not consistentRead as a non-boolean", async () => {
        // @ts-expect-error: consistentRead must be a boolean
        await PaymentMethod.findById("789", { consistentRead: "not-boolean" });
      });
    });

    describe("findById with includes", () => {
      beforeEach(() => {
        mockQuery.mockResolvedValueOnce({ Items: [] });
      });

      it("results have entity functions", async () => {
        const result = await Customer.findById("123", {
          include: [{ association: "contactInformation" }]
        });

        if (result !== undefined) {
          // @ts-expect-no-error: Functions are allowed
          Logger.log(result.update);
        }
      });

      it("will accept consistentRead as a boolean true", async () => {
        // @ts-expect-no-error: consistentRead can be true
        await Customer.findById("123", {
          consistentRead: true,
          include: [{ association: "contactInformation" }]
        });
      });

      it("will accept consistentRead as a boolean false", async () => {
        // @ts-expect-no-error: consistentRead can be false
        await Customer.findById("123", {
          consistentRead: false,
          include: [{ association: "contactInformation" }]
        });
      });

      it("will not consistentRead as a non-boolean", async () => {
        // @ts-expect-error: consistentRead must be a boolean
        await Customer.findById("123", {
          consistentRead: "non-boolean",
          include: [{ association: "contactInformation" }]
        });
      });
    });

    describe("operation results", () => {
      it("HasOne - when including an optional property, the returned type is optional", async () => {
        expect.assertions(1);

        mockQuery.mockResolvedValueOnce({ Items: [] });

        const result = await Customer.findById("123", {
          include: [{ association: "contactInformation" }]
        });

        try {
          // @ts-expect-error ContactInformation could be undefined
          // eslint-disable-next-line @typescript-eslint/no-unused-expressions
          result.contactInformation.id;
        } catch (_e) {
          expect(true).toEqual(true);
        }
      });
    });

    it("will allow options with include options that are associations/relationships defined on the model", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });

      await PaymentMethod.findById("789", {
        include: [
          // @ts-expect-no-error: Can include BelongsTo relationships which are defined on the model
          { association: "customer" },
          // @ts-expect-no-error: Can include HasOne relationships which are defined on the model
          { association: "paymentMethodProvider" },
          // @ts-expect-no-error: Can include HasMAny relationships which are defined on the model
          { association: "orders" }
        ]
      });
    });

    it("will not allow include options with attributes that do not exist on the entity", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });

      // @ts-expect-error: Cannot include association using a key not defined on the model
      await PaymentMethod.findById("789", {
        include: [{ association: "nonExistent" }]
      });
    });

    it("(BelongsTo HasMany) - results of a findById with include will not allow any types which were not included in the query", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });

      const paymentMethod = await PaymentMethod.findById("789", {
        include: [{ association: "customer" }]
      });

      if (paymentMethod !== undefined) {
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.pk);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.sk);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.id);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.lastFour);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.customerId);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.updatedAt);
        // @ts-expect-no-error: Included associations are allowed
        Logger.log(paymentMethod.customer);
        // @ts-expect-error: Not included associations are not allowed
        Logger.log(paymentMethod.orders);
        // @ts-expect-error: Not included associations are not allowed
        Logger.log(paymentMethod.paymentMethodProvider);
      }
    });

    it("(BelongsTo) - included single association is typed as related entity attributes, not parent", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });

      const paymentMethod = await PaymentMethod.findById("789", {
        include: [{ association: "customer" }]
      });

      if (paymentMethod !== undefined) {
        // Type assertions validated when running test/test:watch (tsconfig.dev.json type-checks test files).
        // @ts-expect-no-error: Included BelongsTo has related entity (Customer) attributes
        Logger.log(paymentMethod.customer.name);
        // @ts-expect-error: Included BelongsTo does not have parent (PaymentMethod) attributes
        Logger.log(paymentMethod.customer.lastFour);
      }
    });

    it("(BelongsTo HasOne) - results of a findById with include will not allow any types which were not included in the query", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });

      const paymentMethod = await PaymentMethodProvider.findById("789", {
        include: [{ association: "paymentMethod" }]
      });

      if (paymentMethod !== undefined) {
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.pk);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.sk);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.id);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.name);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.paymentMethodId);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.updatedAt);
        // @ts-expect-no-error: Included associations are allowed
        Logger.log(paymentMethod.paymentMethod);
      }
    });

    it("(HasOne) - results of a findById with include will not allow any types which were not included in the query", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });

      const paymentMethod = await PaymentMethod.findById("789", {
        include: [{ association: "paymentMethodProvider" }]
      });

      if (paymentMethod !== undefined) {
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.pk);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.sk);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.id);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.lastFour);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.customerId);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.updatedAt);
        // @ts-expect-error: Not included associations are not allowed
        Logger.log(paymentMethod.customer);
        // @ts-expect-error: Not included associations are not allowed
        Logger.log(paymentMethod.orders);
        // @ts-expect-no-error: Included associations are allowed
        Logger.log(paymentMethod.paymentMethodProvider);
      }
    });

    it("(HasOne) - included single association is typed as related entity attributes, not parent", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });

      const paymentMethod = await PaymentMethod.findById("789", {
        include: [{ association: "paymentMethodProvider" }]
      });

      if (paymentMethod !== undefined) {
        // Type assertions validated when running test/test:watch (tsconfig.dev.json type-checks test files).
        // @ts-expect-no-error: Included HasOne has related entity (PaymentMethodProvider) attributes
        Logger.log(paymentMethod.paymentMethodProvider.name);
        // @ts-expect-error: Included HasOne does not have parent (PaymentMethod) attributes
        Logger.log(paymentMethod.paymentMethodProvider.lastFour);
      }
    });

    it("(HasMany) - results of a findById with include will not allow any types which were not included in the query", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });

      const paymentMethod = await PaymentMethod.findById("789", {
        include: [{ association: "orders" }]
      });

      if (paymentMethod !== undefined) {
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.pk);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.sk);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.id);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.lastFour);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.customerId);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(paymentMethod.updatedAt);
        // @ts-expect-error: Not included associations are not allowed
        Logger.log(paymentMethod.customer);
        // @ts-expect-no-error: Included associations are allowed
        Logger.log(paymentMethod.orders);
        // @ts-expect-error: Not included associations are not allowed
        Logger.log(paymentMethod.paymentMethodProvider);
      }
    });

    it("(HasAndBelongsToMany) - results of a findById with include will not allow any types which were not included in the query", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });

      const book = await Book.findById("789", {
        include: [{ association: "authors" }]
      });

      if (book !== undefined) {
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(book.pk);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(book.sk);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(book.id);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(book.type);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(book.name);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(book.numPages);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(book.ownerId);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(book.createdAt);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(book.updatedAt);
        // @ts-expect-error: Not included associations are not allowed
        Logger.log(book.customer);
        // @ts-expect-no-error: Included associations are allowed
        Logger.log(book.authors);
        // @ts-expect-error: Not included associations are not allowed
        Logger.log(book.owner);
      }
    });

    it("(BelongsTo) - included relationships should not include any of their associations", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });

      const paymentMethod = await PaymentMethod.findById("789", {
        include: [{ association: "customer" }]
      });

      if (paymentMethod !== undefined) {
        // @ts-expect-error: Included relationships should not include associations
        Logger.log(paymentMethod.customer?.orders);
        // @ts-expect-no-error: Entity attributes should include entity attributes
        Logger.log(paymentMethod.customer?.id);
      }
    });

    it("(HasMany) - included relationships should not include any of their associations", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });

      const paymentMethod = await PaymentMethod.findById("789", {
        include: [{ association: "orders" }]
      });

      if (paymentMethod !== undefined && paymentMethod.orders?.length > 0) {
        // @ts-expect-error: Included relationships should not include associations
        Logger.log(paymentMethod.orders[0].customer);
        // @ts-expect-no-error: Entity attributes should include entity attributes
        Logger.log(paymentMethod.orders[0].id);
      }
    });

    it("(HasAndBelongsToMany) - included relationships should not include any of their associations", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });

      const book = await Book.findById("789", {
        include: [{ association: "authors" }]
      });

      if (book !== undefined && book.authors?.length > 0) {
        // @ts-expect-error: Included relationships should not include associations
        Logger.log(book.authors[0].books);
        // @ts-expect-no-error: Entity attributes should include entity attributes
        Logger.log(book.authors[0].id);
      }
    });

    it("BelongsTo includes from NullableForeignKeys might be undefined", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });

      const pet = await Pet.findById("789", {
        include: [{ association: "owner" }]
      });

      if (pet !== undefined) {
        // @ts-expect-error: BelongsTo includes from NullableForeignKeys might be undefined
        Logger.log(pet.owner.id);
      }
    });

    it("BelongsTo includes from (non-nullable) ForeignKeys will not be undefined", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });

      const address = await Address.findById("123", {
        include: [{ association: "home" }]
      });

      if (address !== undefined) {
        // @ts-expect-no-error: BelongsTo includes from (non-nullable) ForeignKeys will not be undefined
        Logger.log(address.home.id);
      }
    });

    it("included HasMany relationships will be an array", async () => {
      mockQuery.mockResolvedValueOnce({ Items: [] });

      const phoneBook = await PhoneBook.findById("123", {
        include: [{ association: "addresses" }]
      });

      if (phoneBook !== undefined) {
        // @ts-expect-no-error: included HasMany relationships will be an array
        Logger.log(phoneBook.addresses.length);

        // @ts-expect-error: included HasMany relationships do not have attributes of the parent class instance
        Logger.log(phoneBook.addresses.some(address => address.edition));

        // @ts-expect-no-error: included HasMany relationships only have attributes of the included relationship entity class instance
        Logger.log(phoneBook.addresses.some(address => address.homeId));
      }
    });
  });
});
