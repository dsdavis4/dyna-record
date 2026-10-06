import {
  TransactionCanceledException,
  type CancellationReason
} from "@aws-sdk/client-dynamodb";
import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import DynaRecord from "../../../index.js";
import {
  Entity,
  HasAndBelongsToMany,
  PartitionKeyAttribute,
  SortKeyAttribute,
  StringAttribute,
  Table
} from "../../../src/decorators/index.js";
import DynamoClient from "../../../src/dynamo-utils/DynamoClient.js";
import TransactWriteBuilder from "../../../src/dynamo-utils/TransactWriteBuilder.js";
import {
  TransactionWriteFailedError,
  WriteConditionFailedError
} from "../../../src/dynamo-utils/index.js";
import { FilterError } from "../../../src/errors.js";
import {
  attachJoinTableCondition,
  attachWriteCondition,
  compileJoinTableCondition,
  compileWriteCondition,
  type CompiledWriteCondition,
  type CompileWriteConditionProps
} from "../../../src/operations/utils/index.js";
import { JoinTable } from "../../../src/relationships/index.js";
import type { ForeignKey, PartitionKey, SortKey } from "../../../src/types.js";
import { tableItemToEntity } from "../../../src/utils.js";
import {
  ContactInformation,
  Customer,
  Employee,
  Order,
  Organization,
  Profile,
  StudentCourse,
  User,
  Website
} from "../../integration/mockModels.js";

vi.mock("@aws-sdk/lib-dynamodb", () => {
  return {
    TransactWriteCommand: vi.fn().mockImplementation(input => {
      return { name: "TransactWriteCommand", input };
    })
  };
});

const mockedTransactWriteCommand = vi.mocked(TransactWriteCommand);
const mockSend = vi.fn();

const cutoff = new Date("2026-01-01T00:00:00.000Z");

@Table({ name: "storefront-table", delimiter: "#" })
abstract class StorefrontTable extends DynaRecord {
  @PartitionKeyAttribute({ alias: "PK" })
  public readonly pk: PartitionKey;

  @SortKeyAttribute({ alias: "SK" })
  public readonly sk: SortKey;
}

@Entity
class Shopper extends StorefrontTable {
  declare readonly type: "Shopper";

  @StringAttribute({ alias: "Name" })
  public readonly name: string;

  @HasAndBelongsToMany(() => Shop, {
    targetKey: "favoritedBy",
    through: () => ({ joinTable: ShopperFavoriteShop, foreignKey: "shopperId" })
  })
  public readonly favoriteShops: Shop[];

  @HasAndBelongsToMany(() => Shop, {
    targetKey: "visitors",
    through: () => ({ joinTable: ShopperVisitedShop, foreignKey: "shopperId" })
  })
  public readonly visitedShops: Shop[];
}

@Entity
class Shop extends StorefrontTable {
  declare readonly type: "Shop";

  @StringAttribute({ alias: "Status" })
  public readonly status: string;

  @HasAndBelongsToMany(() => Shopper, {
    targetKey: "favoriteShops",
    through: () => ({ joinTable: ShopperFavoriteShop, foreignKey: "shopId" })
  })
  public readonly favoritedBy: Shopper[];

  @HasAndBelongsToMany(() => Shopper, {
    targetKey: "visitedShops",
    through: () => ({ joinTable: ShopperVisitedShop, foreignKey: "shopId" })
  })
  public readonly visitors: Shopper[];
}

class ShopperFavoriteShop extends JoinTable<Shopper, Shop> {
  public readonly shopperId: ForeignKey<Shopper>;
  public readonly shopId: ForeignKey<Shop>;
}

class ShopperVisitedShop extends JoinTable<Shopper, Shop> {
  public readonly shopperId: ForeignKey<Shopper>;
  public readonly shopId: ForeignKey<Shop>;
}

const newBuilder = (): TransactWriteBuilder =>
  new TransactWriteBuilder(
    new DynamoClient({ send: async command => await mockSend(command) })
  );

type CompileInput = Omit<CompileWriteConditionProps, "transactionBuilder">;

/**
 * Compiles a condition against a fresh builder, as a plain JavaScript caller
 * would pass it: untyped
 */
const compile = (
  props: CompileInput,
  builder: TransactWriteBuilder = newBuilder()
): CompiledWriteCondition =>
  compileWriteCondition({ ...props, transactionBuilder: builder });

/**
 * Asserts that compiling throws a FilterError whose message includes `text`
 */
const expectFilterError = (props: CompileInput, text: string): void => {
  expect(() => compile(props)).toThrow(FilterError);
  expect(() => compile(props)).toThrow(text);
};

/**
 * Returns the TransactionWriteFailedError a call throws, rethrowing anything
 * else
 */
const failureOf = async (
  run: () => unknown
): Promise<TransactionWriteFailedError> => {
  try {
    await run();
  } catch (e) {
    if (e instanceof TransactionWriteFailedError) return e;
    throw e;
  }
  throw new Error("Expected a TransactionWriteFailedError");
};

/**
 * Rejects the next send with a cancellation carrying the given reasons
 */
const cancelWith = (reasons: CancellationReason[]): void => {
  mockSend.mockRejectedValueOnce(
    new TransactionCanceledException({
      message: "MockMessage",
      CancellationReasons: reasons,
      $metadata: {}
    })
  );
};

/**
 * Sends the builder's transaction and returns the items it sent
 */
const sentItems = async (builder: TransactWriteBuilder): Promise<unknown> => {
  await builder.executeTransaction();
  expect(mockSend.mock.calls).toHaveLength(1);
  expect(mockedTransactWriteCommand.mock.calls).toHaveLength(1);
  return mockSend.mock.calls[0][0];
};

const transaction = (items: unknown[]): unknown => ({
  name: "TransactWriteCommand",
  input: { TransactItems: items }
});

const orderUpdate = {
  Update: {
    TableName: "mock-table",
    Key: { PK: "Order#o1", SK: "Order" },
    UpdateExpression: "SET #UpdatedAt = :UpdatedAt",
    ExpressionAttributeNames: { "#UpdatedAt": "UpdatedAt" },
    ExpressionAttributeValues: { ":UpdatedAt": "2026-10-05T00:00:00.000Z" },
    ConditionExpression: "attribute_exists(PK)"
  }
};

/**
 * Queues the library's canonical update of Order o1, as Update would
 */
const queueOrderUpdate = (builder: TransactWriteBuilder): void => {
  builder.addUpdate(
    structuredClone(orderUpdate.Update),
    "Order with ID 'o1' does not exist"
  );
};

const storedOrder = (attributes: Record<string, unknown>): Order =>
  tableItemToEntity(Order, {
    PK: "Order#o1",
    SK: "Order",
    Id: "o1",
    Type: "Order",
    ...attributes
  });

describe("writeConditions", () => {
  beforeEach(() => {
    mockSend.mockResolvedValue({});
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockSend.mockReset();
  });

  describe("compileWriteCondition", () => {
    it("splits a condition into self, BelongsTo, HasOne, HasMany, HasAndBelongsToMany and foreign-key parts", () => {
      expect.assertions(3);

      const builder = newBuilder();

      const customer = compile(
        {
          EntityClass: Customer,
          operation: "update",
          condition: {
            name: "Jane",
            contactInformation: { phone: null },
            orders: [{ id: "o1", condition: { orderDate: { $lt: cutoff } } }]
          }
        },
        builder
      );
      const user = compile(
        {
          EntityClass: User,
          operation: "delete",
          condition: {
            org: { name: "Acme" },
            websites: [{ id: "w1", condition: {} }]
          }
        },
        builder
      );
      const employee = compile(
        {
          EntityClass: Employee,
          operation: "update",
          condition: { organizationId: { target: { name: "Acme" } } },
          payload: { organizationId: "org2" }
        },
        builder
      );

      expect(customer).toEqual({
        EntityClass: Customer,
        self: {
          ConditionExpression: "#Name = :wc3_Name1",
          ExpressionAttributeNames: { "#Name": "Name" },
          ExpressionAttributeValues: { ":wc3_Name1": "Jane" }
        },
        guards: [
          {
            kind: "hasOne",
            guard: { kind: "relationship", name: "contactInformation" },
            target: ContactInformation,
            foreignKey: "customerId",
            condition: {
              ConditionExpression:
                "attribute_exists(PK) AND (attribute_not_exists(#Phone))",
              ExpressionAttributeNames: { "#Phone": "Phone" }
            }
          },
          {
            kind: "hasMany",
            guard: { kind: "relationship", name: "orders", id: "o1" },
            target: Order,
            id: "o1",
            foreignKey: "customerId",
            condition: {
              ConditionExpression:
                "attribute_exists(PK) AND (#OrderDate < :wc2_OrderDate1)",
              ExpressionAttributeNames: { "#OrderDate": "OrderDate" },
              ExpressionAttributeValues: {
                ":wc2_OrderDate1": cutoff.toISOString()
              }
            }
          }
        ],
        needsStoredRow: false
      });
      expect(user).toEqual({
        EntityClass: User,
        guards: [
          {
            kind: "parent",
            guard: { kind: "relationship", name: "org" },
            target: Organization,
            foreignKey: "orgId",
            condition: {
              ConditionExpression:
                "attribute_exists(PK) AND (#Name = :wc4_Name1)",
              ExpressionAttributeNames: { "#Name": "Name" },
              ExpressionAttributeValues: { ":wc4_Name1": "Acme" }
            }
          },
          {
            kind: "hasAndBelongsToMany",
            guard: { kind: "relationship", name: "websites", id: "w1" },
            target: Website,
            id: "w1",
            condition: { ConditionExpression: "attribute_exists(PK)" }
          }
        ],
        needsStoredRow: true
      });
      expect(employee).toEqual({
        EntityClass: Employee,
        guards: [
          {
            kind: "parent",
            guard: { kind: "foreignKey", name: "organizationId" },
            target: Organization,
            foreignKey: "organizationId",
            payloadForeignKey: "org2",
            condition: {
              ConditionExpression:
                "attribute_exists(PK) AND (#Name = :wc6_Name1)",
              ExpressionAttributeNames: { "#Name": "Name" },
              ExpressionAttributeValues: { ":wc6_Name1": "Acme" }
            }
          }
        ],
        needsStoredRow: false
      });
    });

    it("guards a standalone foreign key's target by the foreign key property", () => {
      expect.assertions(1);

      const compiled = compile({
        EntityClass: Profile,
        operation: "create",
        condition: { userId: { target: { name: "Ada" } } },
        payload: { userId: "s1", lastLogin: new Date() }
      });

      expect(compiled.guards).toEqual([
        {
          kind: "parent",
          guard: { kind: "foreignKey", name: "userId" },
          target: expect.any(Function),
          foreignKey: "userId",
          payloadForeignKey: "s1",
          condition: {
            ConditionExpression:
              "attribute_exists(myPk) AND (#name = :wc1_name1)",
            ExpressionAttributeNames: { "#name": "name" },
            ExpressionAttributeValues: { ":wc1_name1": "Ada" }
          }
        }
      ]);
    });

    it("compiles a self $or with its own attributes, including a foreign key's own value", () => {
      expect.assertions(1);

      const compiled = compile({
        EntityClass: Employee,
        operation: "update",
        condition: {
          $or: [{ organizationId: null }, { name: { $beginsWith: "A" } }]
        }
      });

      expect(compiled.self).toEqual({
        ConditionExpression:
          "attribute_not_exists(#OrganizationId) OR begins_with(#Name, :wc1_Name1)",
        ExpressionAttributeNames: {
          "#OrganizationId": "OrganizationId",
          "#Name": "Name"
        },
        ExpressionAttributeValues: { ":wc1_Name1": "A" }
      });
    });

    describe("degenerate shapes (R29)", () => {
      it("adds nothing for an empty condition or an empty HasMany array", () => {
        expect.assertions(2);

        expect(
          compile({ EntityClass: Customer, operation: "delete", condition: {} })
        ).toEqual({ EntityClass: Customer, guards: [], needsStoredRow: false });
        expect(
          compile({
            EntityClass: Customer,
            operation: "delete",
            condition: { orders: [], paymentMethods: [] }
          })
        ).toEqual({ EntityClass: Customer, guards: [], needsStoredRow: false });
      });

      it("compiles an empty relationship condition to an existence-only guard", () => {
        expect.assertions(1);

        const compiled = compile({
          EntityClass: Order,
          operation: "create",
          condition: { customer: {} },
          payload: { customerId: "c1" }
        });

        expect(compiled.guards).toEqual([
          {
            kind: "parent",
            guard: { kind: "relationship", name: "customer" },
            target: Customer,
            foreignKey: "customerId",
            payloadForeignKey: "c1",
            condition: { ConditionExpression: "attribute_exists(PK)" }
          }
        ]);
      });

      it.each([
        ["a condition that is not an object", "pending"],
        ["a null condition", null],
        ["an array condition", [{ name: "Jane" }]]
      ])("rejects %s", (_, condition) => {
        expect.assertions(2);

        expectFilterError(
          // A plain JavaScript caller can pass anything
          {
            EntityClass: Customer,
            operation: "delete",
            condition
          },
          "condition"
        );
      });

      it.each([
        ["not an array", { orders: { id: "o1", condition: {} } }],
        ["an entry that is not an object", { orders: ["o1"] }],
        ["an entry without an id", { orders: [{ condition: {} }] }],
        [
          "an entry with a non-string id",
          { orders: [{ id: 1, condition: {} }] }
        ],
        ["an entry with an empty id", { orders: [{ id: "", condition: {} }] }],
        ["an entry without a condition", { orders: [{ id: "o1" }] }],
        [
          "an entry with an array condition",
          { orders: [{ id: "o1", condition: [] }] }
        ],
        [
          "an entry with an unknown key",
          { orders: [{ id: "o1", condition: {}, status: "x" }] }
        ]
      ])("rejects a HasMany guard that is %s", (_, condition) => {
        expect.assertions(2);

        expectFilterError(
          { EntityClass: Customer, operation: "delete", condition },
          '"orders"'
        );
      });

      it.each([
        ["an array", []],
        ["null", null],
        ["undefined", undefined],
        ["a string", "Jane"]
      ])("rejects a BelongsTo or HasOne condition that is %s", (_, value) => {
        expect.assertions(4);

        expectFilterError(
          {
            EntityClass: Order,
            operation: "delete",
            condition: { customer: value }
          },
          '"customer"'
        );
        expectFilterError(
          {
            EntityClass: Customer,
            operation: "delete",
            condition: { contactInformation: value }
          },
          '"contactInformation"'
        );
      });

      it.each([
        ["an array", []],
        ["null", null],
        ["undefined", undefined],
        ["a string", "Acme"]
      ])("rejects a target that is %s", (_, target) => {
        expect.assertions(2);

        expectFilterError(
          {
            EntityClass: Employee,
            operation: "delete",
            condition: { organizationId: { target } }
          },
          '"organizationId"'
        );
      });

      it("rejects an empty $or in a relationship condition", () => {
        expect.assertions(2);

        expectFilterError(
          {
            EntityClass: Order,
            operation: "delete",
            condition: { customer: { $or: [] } }
          },
          "$or"
        );
      });
    });

    describe("key validation", () => {
      it("rejects an unknown key, naming it", () => {
        expect.assertions(2);

        expectFilterError(
          {
            EntityClass: Order,
            operation: "update",
            condition: { colour: "red" }
          },
          '"colour"'
        );
      });

      it.each(["type", "pk", "sk"])(
        "rejects the key %s on the entity's own row",
        key => {
          expect.assertions(2);

          expectFilterError(
            {
              EntityClass: Order,
              operation: "update",
              condition: { [key]: "x" }
            },
            `"${key}"`
          );
        }
      );

      it("rejects an unknown key in a relationship condition, naming it", () => {
        expect.assertions(2);

        expectFilterError(
          {
            EntityClass: Order,
            operation: "delete",
            condition: { customer: { colour: "red" } }
          },
          '"colour"'
        );
      });

      it("rejects type in a relationship condition", () => {
        expect.assertions(2);

        expectFilterError(
          {
            EntityClass: Order,
            operation: "delete",
            condition: { customer: { type: "Customer" } }
          },
          '"type"'
        );
      });

      it("rejects an undefined operand on the entity's own row", () => {
        expect.assertions(2);

        expectFilterError(
          {
            EntityClass: Customer,
            operation: "update",
            condition: { name: undefined }
          },
          '"name"'
        );
      });

      it("rejects a relationship inside $or, naming it (AE6)", () => {
        expect.assertions(2);

        expectFilterError(
          {
            EntityClass: Order,
            operation: "update",
            condition: {
              $or: [
                { orderDate: { $lt: cutoff } },
                { customer: { name: "Jane" } }
              ]
            }
          },
          '"customer"'
        );
      });

      it("rejects a target guard inside $or", () => {
        expect.assertions(2);

        expectFilterError(
          {
            EntityClass: Employee,
            operation: "update",
            condition: {
              $or: [{ organizationId: { target: {} } }, { name: "Ada" }]
            }
          },
          "organizationId"
        );
      });

      it("rejects a target on a foreign key that backs a BelongsTo, pointing at the relationship (R32)", () => {
        expect.assertions(2);

        expectFilterError(
          {
            EntityClass: Order,
            operation: "update",
            condition: { customerId: { target: { name: "Jane" } } }
          },
          '"customer"'
        );
      });

      it("rejects a value condition and a target on one key (R33)", () => {
        expect.assertions(2);

        expectFilterError(
          {
            EntityClass: Employee,
            operation: "update",
            condition: {
              organizationId: { target: {}, $beginsWith: "org" }
            }
          },
          '"organizationId"'
        );
      });

      it("rejects the same HasMany id twice, and accepts two different ids (AE13)", () => {
        expect.assertions(3);

        expectFilterError(
          {
            EntityClass: Customer,
            operation: "update",
            condition: {
              orders: [
                { id: "o1", condition: {} },
                { id: "o1", condition: { orderDate: { $lt: cutoff } } }
              ]
            }
          },
          '"o1"'
        );
        expect(
          compile({
            EntityClass: Customer,
            operation: "update",
            condition: {
              orders: [
                { id: "o1", condition: {} },
                { id: "o2", condition: {} }
              ]
            }
          }).guards.map(guard => guard.guard)
        ).toEqual([
          { kind: "relationship", name: "orders", id: "o1" },
          { kind: "relationship", name: "orders", id: "o2" }
        ]);
      });

      it("rejects the same HasAndBelongsToMany id twice", () => {
        expect.assertions(2);

        expectFilterError(
          {
            EntityClass: User,
            operation: "delete",
            condition: {
              websites: [
                { id: "w1", condition: {} },
                { id: "w1", condition: {} }
              ]
            }
          },
          '"w1"'
        );
      });
    });

    describe("create", () => {
      it.each([
        ["an attribute", { orderDate: { $lt: cutoff } }, '"orderDate"'],
        ["$or", { $or: [{ orderDate: { $lt: cutoff } }] }, '"$or"']
      ])(
        "rejects a condition on the entity's own row: %s",
        (_, condition, text) => {
          expect.assertions(2);

          expectFilterError(
            {
              EntityClass: Order,
              operation: "create",
              condition,
              payload: { customerId: "c1" }
            },
            text
          );
        }
      );

      it.each([
        ["HasMany", { orders: [{ id: "o1", condition: {} }] }, '"orders"'],
        ["HasOne", { contactInformation: {} }, '"contactInformation"']
      ])("rejects a %s relationship", (_, condition, text) => {
        expect.assertions(2);

        expectFilterError(
          {
            EntityClass: Customer,
            operation: "create",
            condition,
            payload: {}
          },
          text
        );
      });

      it("rejects a HasAndBelongsToMany relationship", () => {
        expect.assertions(2);

        expectFilterError(
          {
            EntityClass: User,
            operation: "create",
            condition: { websites: [] },
            payload: {}
          },
          '"websites"'
        );
      });

      it.each([
        ["absent from", {}],
        ["null in", { orgId: null }]
      ])(
        "rejects a BelongsTo guard whose foreign key is %s the payload (R28)",
        (_, payload) => {
          expect.assertions(2);

          expectFilterError(
            {
              EntityClass: User,
              operation: "create",
              condition: { org: {} },
              payload
            },
            '"org"'
          );
        }
      );

      it("rejects a target guard whose foreign key is absent from the payload (R28)", () => {
        expect.assertions(2);

        expectFilterError(
          {
            EntityClass: Employee,
            operation: "create",
            condition: { organizationId: { target: {} } },
            payload: { name: "Ada" }
          },
          '"organizationId"'
        );
      });
    });

    describe("payload contradictions on update (R28)", () => {
      it("rejects a guard on a relationship whose foreign key the update clears (AE16)", () => {
        expect.assertions(2);

        expectFilterError(
          {
            EntityClass: User,
            operation: "update",
            condition: { org: { name: "Acme" } },
            payload: { orgId: null }
          },
          '"org"'
        );
      });

      it("rejects a target guard on a foreign key the update clears", () => {
        expect.assertions(2);

        expectFilterError(
          {
            EntityClass: Employee,
            operation: "update",
            condition: { organizationId: { target: {} } },
            payload: { organizationId: null }
          },
          '"organizationId"'
        );
      });

      it("needs the stored row only for a parent guard whose foreign key the payload does not set", () => {
        expect.assertions(2);

        expect(
          compile({
            EntityClass: User,
            operation: "update",
            condition: { org: {} },
            payload: { orgId: "org2" }
          }).needsStoredRow
        ).toBe(false);
        expect(
          compile({
            EntityClass: User,
            operation: "update",
            condition: { org: {} },
            payload: { name: "Ada" }
          }).needsStoredRow
        ).toBe(true);
      });
    });

    it("draws every fragment's placeholders from the transaction's prefix counter", () => {
      expect.assertions(1);

      const builder = newBuilder();
      builder.nextPlaceholderPrefix();

      const compiled = compile(
        {
          EntityClass: Customer,
          operation: "delete",
          condition: { name: "Jane" }
        },
        builder
      );

      expect(compiled.self?.ExpressionAttributeValues).toEqual({
        ":wc2_Name1": "Jane"
      });
    });
  });

  describe("attachWriteCondition", () => {
    it("merges the self guard onto the entity's own queued item", async () => {
      expect.assertions(3);

      const builder = newBuilder();
      const compiled = compile(
        {
          EntityClass: Order,
          operation: "update",
          condition: { orderDate: { $lt: cutoff } }
        },
        builder
      );
      queueOrderUpdate(builder);

      attachWriteCondition({
        compiled,
        id: "o1",
        transactionBuilder: builder,
        stored: storedOrder({ CustomerId: "c1" })
      });

      expect(await sentItems(builder)).toEqual(
        transaction([
          {
            Update: {
              ...orderUpdate.Update,
              ConditionExpression:
                "attribute_exists(PK) AND (#OrderDate < :wc1_OrderDate1)",
              ExpressionAttributeNames: {
                "#UpdatedAt": "UpdatedAt",
                "#OrderDate": "OrderDate"
              },
              ExpressionAttributeValues: {
                ":UpdatedAt": "2026-10-05T00:00:00.000Z",
                ":wc1_OrderDate1": cutoff.toISOString()
              },
              ReturnValuesOnConditionCheckFailure: "ALL_OLD"
            }
          }
        ])
      );
    });

    it("guards the stored parent and pins the foreign key on the entity's own row when the payload leaves it unchanged (R14)", async () => {
      expect.assertions(3);

      const builder = newBuilder();
      const compiled = compile(
        {
          EntityClass: Order,
          operation: "update",
          condition: { customer: { name: "Jane" } },
          payload: { customerId: "c1" }
        },
        builder
      );
      queueOrderUpdate(builder);

      attachWriteCondition({
        compiled,
        id: "o1",
        transactionBuilder: builder,
        stored: storedOrder({ CustomerId: "c1" })
      });

      expect(await sentItems(builder)).toEqual(
        transaction([
          {
            Update: {
              ...orderUpdate.Update,
              ConditionExpression:
                "attribute_exists(PK) AND (#CustomerId = :wc2_CustomerId)",
              ExpressionAttributeNames: {
                "#UpdatedAt": "UpdatedAt",
                "#CustomerId": "CustomerId"
              },
              ExpressionAttributeValues: {
                ":UpdatedAt": "2026-10-05T00:00:00.000Z",
                ":wc2_CustomerId": "c1"
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
        ])
      );
    });

    it("attributes a failed guard on the stored parent to the pin when the foreign key moved concurrently", async () => {
      expect.assertions(1);

      const builder = newBuilder();
      const compiled = compile(
        {
          EntityClass: Order,
          operation: "delete",
          condition: { customer: {} }
        },
        builder
      );
      builder.addDelete({
        TableName: "mock-table",
        Key: { PK: "Order#o1", SK: "Order" }
      });
      attachWriteCondition({
        compiled,
        id: "o1",
        transactionBuilder: builder,
        stored: storedOrder({ CustomerId: "c1" })
      });
      cancelWith([
        {
          Code: "ConditionalCheckFailed",
          Item: marshall({ PK: "Order#o1", SK: "Order", CustomerId: "c2" })
        },
        { Code: "ConditionalCheckFailed" }
      ]);

      const error = await failureOf(async () => {
        await builder.executeTransaction();
      });

      expect(error.errors.map(e => e.message)).toEqual([
        "ConditionalCheckFailed: Order with ID 'o1' no longer references Customer with ID 'c1': its foreign key 'customerId' was changed by a concurrent write"
      ]);
    });

    it("guards the new parent, without a pin, when the payload changes the foreign key (R12)", async () => {
      expect.assertions(3);

      const builder = newBuilder();
      const compiled = compile(
        {
          EntityClass: Order,
          operation: "update",
          condition: { customer: { name: "Jane" } },
          payload: { customerId: "c2" }
        },
        builder
      );
      queueOrderUpdate(builder);
      builder.addConditionCheck(
        {
          TableName: "mock-table",
          Key: { PK: "Customer#c2", SK: "Customer" },
          ConditionExpression: "attribute_exists(PK)"
        },
        "Customer with ID 'c2' does not exist"
      );

      attachWriteCondition({
        compiled,
        id: "o1",
        transactionBuilder: builder,
        stored: storedOrder({ CustomerId: "c1" })
      });

      expect(await sentItems(builder)).toEqual(
        transaction([
          orderUpdate,
          {
            ConditionCheck: {
              TableName: "mock-table",
              Key: { PK: "Customer#c2", SK: "Customer" },
              ConditionExpression:
                "attribute_exists(PK) AND (attribute_exists(PK) AND (#Name = :wc1_Name1))",
              ExpressionAttributeNames: { "#Name": "Name" },
              ExpressionAttributeValues: { ":wc1_Name1": "Jane" },
              ReturnValuesOnConditionCheckFailure: "ALL_OLD"
            }
          }
        ])
      );
    });

    it("guards the payload's parent on create, merging onto the integrity check", async () => {
      expect.assertions(3);

      const builder = newBuilder();
      const compiled = compile(
        {
          EntityClass: Order,
          operation: "create",
          condition: { customer: {} },
          payload: { customerId: "c1" }
        },
        builder
      );
      builder.addConditionCheck(
        {
          TableName: "mock-table",
          Key: { PK: "Customer#c1", SK: "Customer" },
          ConditionExpression: "attribute_exists(PK)"
        },
        "Customer with ID 'c1' does not exist"
      );

      attachWriteCondition({ compiled, id: "o1", transactionBuilder: builder });

      expect(await sentItems(builder)).toEqual(
        transaction([
          {
            ConditionCheck: {
              TableName: "mock-table",
              Key: { PK: "Customer#c1", SK: "Customer" },
              ConditionExpression:
                "attribute_exists(PK) AND (attribute_exists(PK))",
              ReturnValuesOnConditionCheckFailure: "ALL_OLD"
            }
          }
        ])
      );
    });

    it("guards a uni-directional parent by its foreign key and pins it (R24)", async () => {
      expect.assertions(3);

      const builder = newBuilder();
      const compiled = compile(
        {
          EntityClass: Employee,
          operation: "delete",
          condition: { organizationId: { target: { name: "Acme" } } }
        },
        builder
      );
      builder.addDelete({
        TableName: "mock-table",
        Key: { PK: "Employee#e1", SK: "Employee" }
      });

      attachWriteCondition({
        compiled,
        id: "e1",
        transactionBuilder: builder,
        stored: tableItemToEntity(Employee, {
          Id: "e1",
          Type: "Employee",
          OrganizationId: "org1"
        })
      });

      expect(await sentItems(builder)).toEqual(
        transaction([
          {
            Delete: {
              TableName: "mock-table",
              Key: { PK: "Employee#e1", SK: "Employee" },
              ConditionExpression: "(#OrganizationId = :wc2_OrganizationId)",
              ExpressionAttributeNames: { "#OrganizationId": "OrganizationId" },
              ExpressionAttributeValues: { ":wc2_OrganizationId": "org1" },
              ReturnValuesOnConditionCheckFailure: "ALL_OLD"
            }
          },
          {
            ConditionCheck: {
              TableName: "mock-table",
              Key: { PK: "Organization#org1", SK: "Organization" },
              ConditionExpression:
                "attribute_exists(PK) AND (attribute_exists(PK) AND (#Name = :wc1_Name1))",
              ExpressionAttributeNames: { "#Name": "Name" },
              ExpressionAttributeValues: { ":wc1_Name1": "Acme" },
              ReturnValuesOnConditionCheckFailure: "ALL_OLD"
            }
          }
        ])
      );
    });

    it("checks a HasOne child resolved from the earlier read, pinning its foreign key", async () => {
      expect.assertions(3);

      const builder = newBuilder();
      const compiled = compile(
        {
          EntityClass: Customer,
          operation: "update",
          condition: { contactInformation: { phone: null } }
        },
        builder
      );

      attachWriteCondition({
        compiled,
        id: "c1",
        transactionBuilder: builder,
        stored: tableItemToEntity(Customer, { Id: "c1", Type: "Customer" }),
        related: [
          tableItemToEntity(Order, {
            Id: "o1",
            Type: "Order",
            CustomerId: "c1"
          }),
          tableItemToEntity(ContactInformation, {
            Id: "ci1",
            Type: "ContactInformation",
            CustomerId: "c1"
          })
        ]
      });

      expect(await sentItems(builder)).toEqual(
        transaction([
          {
            ConditionCheck: {
              TableName: "mock-table",
              Key: { PK: "ContactInformation#ci1", SK: "ContactInformation" },
              ConditionExpression:
                "attribute_exists(PK) AND (#CustomerId = :wc2_CustomerId) AND (attribute_exists(PK) AND (attribute_not_exists(#Phone)))",
              ExpressionAttributeNames: {
                "#CustomerId": "CustomerId",
                "#Phone": "Phone"
              },
              ExpressionAttributeValues: { ":wc2_CustomerId": "c1" },
              ReturnValuesOnConditionCheckFailure: "ALL_OLD"
            }
          }
        ])
      );
    });

    it("checks a HasMany child by the consumer's id, pinning its foreign key to this entity (R10)", async () => {
      expect.assertions(3);

      const builder = newBuilder();
      const compiled = compile(
        {
          EntityClass: Customer,
          operation: "update",
          condition: {
            orders: [{ id: "o2", condition: { orderDate: { $lt: cutoff } } }]
          }
        },
        builder
      );

      attachWriteCondition({
        compiled,
        id: "c1",
        transactionBuilder: builder,
        stored: tableItemToEntity(Customer, { Id: "c1", Type: "Customer" }),
        related: []
      });

      expect(await sentItems(builder)).toEqual(
        transaction([
          {
            ConditionCheck: {
              TableName: "mock-table",
              Key: { PK: "Order#o2", SK: "Order" },
              ConditionExpression:
                "attribute_exists(PK) AND (#CustomerId = :wc2_CustomerId) AND (attribute_exists(PK) AND (#OrderDate < :wc1_OrderDate1))",
              ExpressionAttributeNames: {
                "#CustomerId": "CustomerId",
                "#OrderDate": "OrderDate"
              },
              ExpressionAttributeValues: {
                ":wc2_CustomerId": "c1",
                ":wc1_OrderDate1": cutoff.toISOString()
              },
              ReturnValuesOnConditionCheckFailure: "ALL_OLD"
            }
          }
        ])
      );
    });

    it("checks a HasAndBelongsToMany link row's membership and the partner's own row", async () => {
      expect.assertions(4);

      const builder = newBuilder();
      const compiled = compile(
        {
          EntityClass: User,
          operation: "delete",
          condition: { websites: [{ id: "w1", condition: { name: "Shop" } }] }
        },
        builder
      );
      // Delete removes the link row in the partner's partition
      builder.addDelete({
        TableName: "mock-table",
        Key: { PK: "Website#w1", SK: "User#u1" }
      });

      attachWriteCondition({
        compiled,
        id: "u1",
        transactionBuilder: builder,
        stored: tableItemToEntity(User, { Id: "u1", Type: "User" }),
        related: []
      });

      expect(await sentItems(builder)).toEqual(
        transaction([
          {
            Delete: {
              TableName: "mock-table",
              Key: { PK: "Website#w1", SK: "User#u1" },
              ConditionExpression: "(#Id = :wc2_Id)",
              ExpressionAttributeNames: { "#Id": "Id" },
              ExpressionAttributeValues: { ":wc2_Id": "u1" },
              ReturnValuesOnConditionCheckFailure: "ALL_OLD"
            }
          },
          {
            ConditionCheck: {
              TableName: "mock-table",
              Key: { PK: "Website#w1", SK: "Website" },
              ConditionExpression:
                "attribute_exists(PK) AND (attribute_exists(PK) AND (#Name = :wc1_Name1))",
              ExpressionAttributeNames: { "#Name": "Name" },
              ExpressionAttributeValues: { ":wc1_Name1": "Shop" },
              ReturnValuesOnConditionCheckFailure: "ALL_OLD"
            }
          }
        ])
      );

      // The membership's failure is reported, not the partner guard's
      mockSend.mockReset();
      const failing = newBuilder();
      failing.addDelete({
        TableName: "mock-table",
        Key: { PK: "Website#w1", SK: "User#u1" }
      });
      attachWriteCondition({
        compiled: compile(
          {
            EntityClass: User,
            operation: "delete",
            condition: { websites: [{ id: "w1", condition: { name: "Shop" } }] }
          },
          failing
        ),
        id: "u1",
        transactionBuilder: failing,
        stored: tableItemToEntity(User, { Id: "u1", Type: "User" })
      });
      cancelWith([
        { Code: "ConditionalCheckFailed" },
        { Code: "ConditionalCheckFailed" }
      ]);
      const error = await failureOf(async () => {
        await failing.executeTransaction();
      });
      expect(error.errors.map(e => e.message)).toEqual([
        "ConditionalCheckFailed: Website with ID 'w1' is not linked to User with ID 'u1' through 'websites'"
      ]);
    });

    it("throws an internal error when a guard on the stored parent is attached without the stored row", () => {
      expect.assertions(1);

      const builder = newBuilder();
      const compiled = compile(
        {
          EntityClass: Order,
          operation: "delete",
          condition: { customer: {} }
        },
        builder
      );

      expect(() => {
        attachWriteCondition({
          compiled,
          id: "o1",
          transactionBuilder: builder
        });
      }).toThrow(
        "The write condition guard on relationship 'customer' of Order targets its stored parent, but no stored row was given"
      );
    });

    describe("a target missing from stored state (R13)", () => {
      /**
       * Attaches and returns what it threw, asserting nothing was sent
       */
      const attachAndCatch = async (
        attach: () => void
      ): Promise<TransactionWriteFailedError> => {
        const error = await failureOf(attach);
        expect(mockSend).not.toHaveBeenCalled();
        return error;
      };

      it("fails before send with WriteConditionFailedError when the stored BelongsTo foreign key is absent (AE8)", async () => {
        expect.assertions(3);

        const builder = newBuilder();
        const compiled = compile(
          {
            EntityClass: User,
            operation: "update",
            condition: { org: { name: "Acme" } },
            payload: { name: "Ada" }
          },
          builder
        );

        const error = await attachAndCatch(() => {
          attachWriteCondition({
            compiled,
            id: "u1",
            transactionBuilder: builder,
            stored: tableItemToEntity(User, { Id: "u1", Type: "User" })
          });
        });

        expect(error.errors).toEqual([
          new WriteConditionFailedError(
            "Write condition failed on User with ID 'u1': relationship 'org' references no Organization",
            {
              entity: "User",
              id: "u1",
              guards: [{ kind: "relationship", name: "org" }]
            }
          )
        ]);
        expect(error.errors[0]).toBeInstanceOf(WriteConditionFailedError);
      });

      it("fails before send when there is no HasOne child in the earlier read", async () => {
        expect.assertions(2);

        const builder = newBuilder();
        const compiled = compile(
          {
            EntityClass: Customer,
            operation: "delete",
            condition: { contactInformation: {} }
          },
          builder
        );

        const error = await attachAndCatch(() => {
          attachWriteCondition({
            compiled,
            id: "c1",
            transactionBuilder: builder,
            stored: tableItemToEntity(Customer, { Id: "c1", Type: "Customer" }),
            related: [
              // Another customer's contact information is not this one's
              tableItemToEntity(ContactInformation, {
                Id: "ci2",
                Type: "ContactInformation",
                CustomerId: "c2"
              })
            ]
          });
        });

        expect(error.errors).toEqual([
          new WriteConditionFailedError(
            "Write condition failed on Customer with ID 'c1': relationship 'contactInformation' references no ContactInformation",
            {
              entity: "Customer",
              id: "c1",
              guards: [{ kind: "relationship", name: "contactInformation" }]
            }
          )
        ]);
      });
    });
  });

  describe("join tables", () => {
    it("maps each foreign key to the entity it references, in both directions", async () => {
      expect.assertions(4);

      const builder = newBuilder();
      const compiled = compileJoinTableCondition({
        joinTableName: StudentCourse.name,
        condition: {
          courseId: { target: { name: "Algebra" } },
          studentId: { target: {} }
        },
        transactionBuilder: builder
      });

      expect(
        compiled.guards.map(({ foreignKey, target }) => [
          foreignKey,
          target.name
        ])
      ).toEqual([
        ["courseId", "Course"],
        ["studentId", "Student"]
      ]);

      attachJoinTableCondition({
        compiled,
        keys: { studentId: "s1", courseId: "c1" },
        transactionBuilder: builder
      });

      expect(await sentItems(builder)).toEqual(
        transaction([
          {
            ConditionCheck: {
              TableName: "other-table",
              Key: { myPk: "Course|c1", mySk: "Course" },
              ConditionExpression:
                "attribute_exists(myPk) AND (attribute_exists(myPk) AND (#name = :wc1_name1))",
              ExpressionAttributeNames: { "#name": "name" },
              ExpressionAttributeValues: { ":wc1_name1": "Algebra" },
              ReturnValuesOnConditionCheckFailure: "ALL_OLD"
            }
          },
          {
            ConditionCheck: {
              TableName: "other-table",
              Key: { myPk: "Student|s1", mySk: "Student" },
              ConditionExpression:
                "attribute_exists(myPk) AND (attribute_exists(myPk))",
              ReturnValuesOnConditionCheckFailure: "ALL_OLD"
            }
          }
        ])
      );
    });

    it.each([ShopperFavoriteShop, ShopperVisitedShop])(
      "maps the foreign keys of %o, one of two join tables over the same entities",
      JoinTableClass => {
        expect.assertions(1);

        const compiled = compileJoinTableCondition({
          joinTableName: JoinTableClass.name,
          condition: {
            shopperId: { target: {} },
            shopId: { target: { status: "open" } }
          },
          transactionBuilder: newBuilder()
        });

        expect(
          compiled.guards.map(({ foreignKey, target, guard }) => [
            foreignKey,
            target,
            guard
          ])
        ).toEqual([
          ["shopperId", Shopper, { kind: "foreignKey", name: "shopperId" }],
          ["shopId", Shop, { kind: "foreignKey", name: "shopId" }]
        ]);
      }
    );

    it("names the join table and its keys as the write a failed guard belongs to", async () => {
      expect.assertions(1);

      const builder = newBuilder();
      attachJoinTableCondition({
        compiled: compileJoinTableCondition({
          joinTableName: StudentCourse.name,
          condition: { courseId: { target: { name: "Algebra" } } },
          transactionBuilder: builder
        }),
        keys: { studentId: "s1", courseId: "c1" },
        transactionBuilder: builder
      });
      cancelWith([
        {
          Code: "ConditionalCheckFailed",
          Item: marshall({ myPk: "Course|c1", mySk: "Course", name: "Art" })
        }
      ]);

      const error = await failureOf(async () => {
        await builder.executeTransaction();
      });

      expect(error.errors).toEqual([
        new WriteConditionFailedError(
          "ConditionalCheckFailed: Write condition failed on StudentCourse with ID 'courseId=c1, studentId=s1': foreign key 'courseId'",
          {
            entity: "StudentCourse",
            id: "courseId=c1, studentId=s1",
            guards: [{ kind: "foreignKey", name: "courseId" }]
          }
        )
      ]);
    });

    it("rejects a join-table key without an id to guard", () => {
      expect.assertions(2);

      const builder = newBuilder();
      const attach = (): void => {
        attachJoinTableCondition({
          compiled: compileJoinTableCondition({
            joinTableName: StudentCourse.name,
            condition: { courseId: { target: {} } },
            transactionBuilder: builder
          }),
          keys: { studentId: "s1" },
          transactionBuilder: builder
        });
      };

      expect(attach).toThrow(FilterError);
      expect(attach).toThrow('"courseId"');
    });

    it.each([
      ["an unknown key", { teacherId: { target: {} } }, '"teacherId"'],
      ["a value without target", { courseId: "c1" }, '"courseId"'],
      [
        "a value condition beside target",
        { courseId: { target: {}, $beginsWith: "c" } },
        '"courseId"'
      ],
      [
        "a target that is not an object",
        { courseId: { target: "open" } },
        '"courseId"'
      ],
      ["an undefined guard", { courseId: undefined }, '"courseId"'],
      ["a condition that is not an object", "open", "condition"],
      [
        "an unknown key in the target",
        { courseId: { target: { colour: "red" } } },
        '"colour"'
      ]
    ])("rejects %s", (_, condition, text) => {
      expect.assertions(2);

      const compileCondition = (): unknown =>
        compileJoinTableCondition({
          joinTableName: StudentCourse.name,
          condition,
          transactionBuilder: newBuilder()
        });

      expect(compileCondition).toThrow(FilterError);
      expect(compileCondition).toThrow(text);
    });
  });
});
