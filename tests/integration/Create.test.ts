import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
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
import {
  Attribute,
  BelongsTo,
  Entity,
  HasOne,
  NullableForeignKeyAttribute
} from "../../src/decorators";
import type { NullableForeignKey } from "../../src/types";

// TODO is everything awaited properly in these tests? Do I need to mock resolved value in other tests?
//      Check all operations tests...
//      Look at what I did in Update tests for 'return await Promise.resolve(mockTransact());
// I might need to add below to the mockSend (see update)
// if (command.name === "TransactWriteCommand") {
//   return await Promise.resolve(mockTransact());
// }

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

// TODO add test for creating entity without relationships
describe("Create", () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("will create an entity that BelongsTo an entity who HasMany of it (checks parents exists and creates BelongsToLinks)", async () => {
    expect.assertions(4);

    jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
    mockedUuidv4
      .mockReturnValueOnce("uuid1")
      .mockReturnValueOnce("uuid2")
      .mockReturnValueOnce("uuid3");

    const order = await Order.create({
      customerId: "123",
      paymentMethodId: "456",
      orderDate: new Date("2024-01-01")
    });

    expect(order).toEqual({
      createdAt: "2023-10-16T03:31:35.918Z",
      customerId: "123",
      id: "uuid1",
      orderDate: "2024-01-01T00:00:00.000Z",
      paymentMethodId: "456",
      pk: "Order#uuid1",
      sk: "Order",
      type: "Order",
      updatedAt: "2023-10-16T03:31:35.918Z"
    });
    expect(order).toBeInstanceOf(Order);
    expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            // Create the Order if it does not already exist
            {
              Put: {
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "Order#uuid1",
                  SK: "Order",
                  Type: "Order",
                  Id: "uuid1",
                  CustomerId: "123",
                  PaymentMethodId: "456",
                  OrderDate: "2024-01-01T00:00:00.000Z",
                  CreatedAt: "2023-10-16T03:31:35.918Z",
                  UpdatedAt: "2023-10-16T03:31:35.918Z"
                },
                TableName: "mock-table"
              }
            },
            // Check that the Customer the Order BelongsTo exists
            {
              ConditionCheck: {
                ConditionExpression: "attribute_exists(PK)",
                Key: { PK: "Customer#123", SK: "Customer" },
                TableName: "mock-table"
              }
            },
            // Create the BelongsToLink to link Customer HasMany Order if the link does dot exist
            {
              Put: {
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "Customer#123",
                  SK: "Order#uuid1",
                  Id: "uuid2",
                  ForeignKey: "uuid1",
                  ForeignEntityType: "Order",
                  Type: "BelongsToLink",
                  CreatedAt: "2023-10-16T03:31:35.918Z",
                  UpdatedAt: "2023-10-16T03:31:35.918Z"
                },
                TableName: "mock-table"
              }
            },
            // Check that the PaymentMethod the Order BelongsTo exists
            {
              ConditionCheck: {
                ConditionExpression: "attribute_exists(PK)",
                Key: {
                  PK: "PaymentMethod#456",
                  SK: "PaymentMethod"
                },
                TableName: "mock-table"
              }
            },
            // Create the BelongsToLink to link PaymentMethod HasMany Order if the link does dot exist
            {
              Put: {
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "PaymentMethod#456",
                  SK: "Order#uuid1",
                  Id: "uuid3",
                  ForeignKey: "uuid1",
                  ForeignEntityType: "Order",
                  Type: "BelongsToLink",
                  CreatedAt: "2023-10-16T03:31:35.918Z",
                  UpdatedAt: "2023-10-16T03:31:35.918Z"
                },
                TableName: "mock-table"
              }
            }
          ]
        }
      ]
    ]);
  });

  describe("entity BelongsTo an entity who HasOne of it", () => {
    it("will create the entity if the parent is not already associated to an entity of this type", async () => {
      expect.assertions(4);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedUuidv4.mockReturnValueOnce("uuid1").mockReturnValueOnce("uuid2");

      const paymentMethodProvider = await PaymentMethodProvider.create({
        name: "provider-1",
        paymentMethodId: "123"
      });

      expect(paymentMethodProvider).toEqual({
        pk: "PaymentMethodProvider#uuid1",
        sk: "PaymentMethodProvider",
        id: "uuid1",
        name: "provider-1",
        createdAt: "2023-10-16T03:31:35.918Z",
        paymentMethod: undefined,
        paymentMethodId: "123",
        type: "PaymentMethodProvider",
        updatedAt: "2023-10-16T03:31:35.918Z"
      });
      expect(paymentMethodProvider).toBeInstanceOf(PaymentMethodProvider);
      expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
      expect(mockTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              // Create the PaymentMethodProvider if it does not exist
              {
                Put: {
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: {
                    PK: "PaymentMethodProvider#uuid1",
                    SK: "PaymentMethodProvider",
                    Type: "PaymentMethodProvider",
                    Id: "uuid1",
                    Name: "provider-1",
                    PaymentMethodId: "123",
                    CreatedAt: "2023-10-16T03:31:35.918Z",
                    UpdatedAt: "2023-10-16T03:31:35.918Z"
                  },
                  TableName: "mock-table"
                }
              },
              // Check that the PaymentMethod the PaymentMethodProvider BelongsTo exists
              {
                ConditionCheck: {
                  ConditionExpression: "attribute_exists(PK)",
                  Key: { PK: "PaymentMethod#123", SK: "PaymentMethod" },
                  TableName: "mock-table"
                }
              },
              // Create the BelongsToLink for PaymentMethod HasOne PaymentMethodProvider if it does not exist
              {
                Put: {
                  ConditionExpression: "attribute_not_exists(PK)",
                  Item: {
                    PK: "PaymentMethod#123",
                    SK: "PaymentMethodProvider",
                    Id: "uuid2",
                    ForeignKey: "uuid1",
                    ForeignEntityType: "PaymentMethodProvider",
                    Type: "BelongsToLink",
                    CreatedAt: "2023-10-16T03:31:35.918Z",
                    UpdatedAt: "2023-10-16T03:31:35.918Z"
                  },
                  TableName: "mock-table"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("throws an error if the request fails because the parent already has an entity of this type associated with it", async () => {
      expect.assertions(2);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedUuidv4.mockReturnValueOnce("uuid1").mockReturnValueOnce("uuid2");

      mockSend.mockImplementationOnce(() => {
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
        await PaymentMethodProvider.create({
          name: "provider-1",
          paymentMethodId: "123"
        });
      } catch (e: any) {
        expect(e.constructor.name).toEqual("AggregateError");
        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: PaymentMethod with id: 123 already has an associated PaymentMethodProvider"
          )
        ]);
      }
    });
  });

  describe("error handling", () => {
    it("will return an AggregateError for a failed conditional check", async () => {
      expect.assertions(2);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedUuidv4
        .mockReturnValueOnce("uuid1")
        .mockReturnValueOnce("uuid2")
        .mockReturnValueOnce("uuid3");

      mockSend.mockImplementationOnce(() => {
        throw new TransactionCanceledException({
          message: "MockMessage",
          CancellationReasons: [
            { Code: "None" },
            { Code: "ConditionalCheckFailed" },
            { Code: "None" },
            { Code: "None" },
            { Code: "None" }
          ],
          $metadata: {}
        });
      });

      try {
        await Order.create({
          customerId: "123",
          paymentMethodId: "456",
          orderDate: new Date("2024-01-01")
        });
      } catch (e: any) {
        expect(e.constructor.name).toEqual("AggregateError");
        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Customer with ID '123' does not exist"
          )
        ]);
      }
    });

    it("will return an AggregateError for multiple failed conditional checks", async () => {
      expect.assertions(2);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedUuidv4
        .mockReturnValueOnce("uuid1")
        .mockReturnValueOnce("uuid2")
        .mockReturnValueOnce("uuid3");

      mockSend.mockImplementationOnce(() => {
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
        await Order.create({
          customerId: "123",
          paymentMethodId: "456",
          orderDate: new Date("2024-01-01")
        });
      } catch (e: any) {
        expect(e.constructor.name).toEqual("AggregateError");
        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: Customer with ID '123' does not exist"
          ),
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: PaymentMethod with ID '456' does not exist"
          )
        ]);
      }
    });

    it("will use the default error message is a conditional check does not have a custom error message", async () => {
      expect.assertions(2);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedUuidv4
        .mockReturnValueOnce("uuid1")
        .mockReturnValueOnce("uuid2")
        .mockReturnValueOnce("uuid3");

      mockSend.mockImplementationOnce(() => {
        throw new TransactionCanceledException({
          message: "MockMessage",
          CancellationReasons: [
            { Code: "ConditionalCheckFailed", Message: "something happened" },
            { Code: "None" },
            { Code: "None" },
            { Code: "None" },
            { Code: "None" }
          ],
          $metadata: {}
        });
      });

      try {
        await Order.create({
          customerId: "123",
          paymentMethodId: "456",
          orderDate: new Date("2024-01-01")
        });
      } catch (e: any) {
        expect(e.constructor.name).toEqual("AggregateError");
        expect(e.errors).toEqual([
          new ConditionalCheckFailedError(
            "ConditionalCheckFailed: something happened"
          )
        ]);
      }
    });

    it("will throw the original error if the type is TransactionCanceledException but there are no ConditionalCheckFailed reasons", async () => {
      expect.assertions(1);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedUuidv4
        .mockReturnValueOnce("uuid1")
        .mockReturnValueOnce("uuid2")
        .mockReturnValueOnce("uuid3");

      mockSend.mockImplementationOnce(() => {
        throw new TransactionCanceledException({
          message: "MockMessage",
          CancellationReasons: [
            { Code: "None" },
            { Code: "None" },
            { Code: "MockCode" },
            { Code: "None" },
            { Code: "None" }
          ],
          $metadata: {}
        });
      });

      try {
        await Order.create({
          customerId: "123",
          paymentMethodId: "456",
          orderDate: new Date("2024-01-01")
        });
      } catch (e: any) {
        expect(e).toEqual(
          new TransactionCanceledException({
            message: "MockMessage",
            CancellationReasons: [
              { Code: "None" },
              { Code: "None" },
              { Code: "MockCode" },
              { Code: "None" },
              { Code: "None" }
            ],
            $metadata: {}
          })
        );
      }
    });

    it("allows non TransactionCanceledException errors to bubble up", async () => {
      expect.assertions(1);

      jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
      mockedUuidv4
        .mockReturnValueOnce("uuid1")
        .mockReturnValueOnce("uuid2")
        .mockReturnValueOnce("uuid3");

      mockSend.mockImplementationOnce(() => {
        throw new Error("something bad");
      });

      try {
        await Order.create({
          customerId: "123",
          paymentMethodId: "456",
          orderDate: new Date("2024-01-01")
        });
      } catch (e) {
        expect(e).toEqual(new Error("something bad"));
      }
    });
  });

  describe("types", () => {
    it("will not accept relationship attributes on create", async () => {
      await Order.create({
        orderDate: new Date(),
        paymentMethodId: "123",
        customerId: "456",
        // @ts-expect-error relationship attributes are not allowed
        customer: new Customer()
      });
    });

    it("will not accept function attributes on create", async () => {
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
        await MyModel.create({
          myAttribute: "someVal",
          // @ts-expect-error function attributes are not allowed
          someMethod: () => "123"
        });
      } catch (e) {
        expect(true).toEqual(true);
      }
    });

    it("optional attributes are not required", async () => {
      expect.assertions(1);

      @Entity
      class SomeModel extends MockTable {
        @Attribute({ alias: "MyAttribute1" })
        public myAttribute1: string;

        @Attribute({ alias: "mMAttribute2" })
        public myAttribute2?: string;
      }

      try {
        await SomeModel.create({
          // @ts-expect-no-error Optional attributes do not have to be included
          myAttribute1: "someVal"
        });
      } catch (e) {
        expect(true).toEqual(true);
      }
    });

    it("will allow ForeignKey attributes to be passed at their inferred type without casting to type ForeignKey", async () => {
      await Order.create({
        orderDate: new Date(),
        // @ts-expect-no-error ForeignKey is of type string so it can be passed as such without casing to ForeignKey
        paymentMethodId: "123",
        // @ts-expect-no-error ForeignKey is of type string so it can be passed as such without casing to ForeignKey
        customerId: "456"
      });
    });

    it("will allow NullableForeignKey attributes to be passed at their inferred type without casting to type NullableForeignKey", async () => {
      await ContactInformation.create({
        email: "test@example.com",
        phone: "555-555-5555",
        // @ts-expect-no-error NullableForeignKey is of type string so it can be passed as such without casing to NullableForeignKey
        customerId: "123"
      });
    });

    it("will allow NullableForeignKey attributes to be passed at undefined", async () => {
      await ContactInformation.create({
        email: "test@example.com",
        phone: "555-555-5555",
        // @ts-expect-no-error NullableForeignKey can be passed as undefined
        customerId: undefined
      });
    });

    it("will allow a NullableForeignKey attribute to be omitted if its defined as optional on the model", async () => {
      @Entity
      class ContactInformationLocal extends MockTable {
        @Attribute({ alias: "Email" })
        public email: string;

        @Attribute({ alias: "Phone" })
        public phone: string;

        @NullableForeignKeyAttribute({ alias: "CustomerId" })
        public customerId?: NullableForeignKey;

        @BelongsTo(() => CustomerLocal, { foreignKey: "customerId" })
        public customer: CustomerLocal;

        // mock method
        public static override create(bla: any): any {
          return "bla " as any;
        }
      }

      @Entity
      class CustomerLocal extends MockTable {
        @HasOne(() => ContactInformation, { foreignKey: "customerId" })
        public contactInformation?: ContactInformation;
      }

      // @ts-expect-no-error NullableForeignKey can be omitted if its defined as optional
      await ContactInformationLocal.create({
        email: "test@example.com",
        phone: "555-555-5555"
      });
    });

    it("will not accept DefaultFields on create because they are managed by no-orm", async () => {
      await Order.create({
        // @ts-expect-error default fields are not accepted on create, they are managed by no-orm
        id: "123"
      });

      await Order.create({
        // @ts-expect-error default fields are not accepted on create, they are managed by no-orm
        type: "456"
      });

      await Order.create({
        // @ts-expect-error default fields are not accepted on create, they are managed by no-orm
        createdAt: new Date()
      });

      await Order.create({
        // @ts-expect-error default fields are not accepted on create, they are managed by no-orm
        updatedAt: new Date()
      });
    });
  });
});
