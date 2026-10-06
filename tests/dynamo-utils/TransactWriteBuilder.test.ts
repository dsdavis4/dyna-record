import TransactWriteBuilder, {
  type ConsumerGuard
} from "../../src/dynamo-utils/TransactWriteBuilder.js";
import DynamoClient from "../../src/dynamo-utils/DynamoClient.js";
import {
  ConditionalCheckFailedError,
  TransactionWriteFailedError,
  WriteConditionFailedError
} from "../../src/dynamo-utils/index.js";
import Logger from "../../src/Logger.js";
import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import {
  TransactionCanceledException,
  type CancellationReason
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";

const mockSend = vi.fn();

vi.mock("@aws-sdk/lib-dynamodb", () => {
  return {
    TransactWriteCommand: vi.fn().mockImplementation(input => {
      return { name: "TransactWriteCommand", input };
    })
  };
});

const mockedTransactWriteCommand = vi.mocked(TransactWriteCommand);

const tableName = "mock-table";

const orderKey = { PK: "Order#o1", SK: "Order" };
const otherOrderKey = { PK: "Order#o2", SK: "Order" };
const customerKey = { PK: "Customer#c1", SK: "Customer" };
const storeKey = { PK: "Store#s1", SK: "Store" };
const linkKey = { PK: "Student#st1", SK: "Course#co1" };
const courseKey = { PK: "Course#co1", SK: "Course" };

const orderNotFound = "Order with ID 'o1' does not exist";
const customerNotFound = "Customer with ID 'c1' does not exist";
const orderMoved =
  "Order with ID 'o1' was moved to a different Customer by a concurrent write";
const orderNotRelated =
  "Order with ID 'o2' is not related to Customer with ID 'c1' through 'orders'";
const courseNotLinked =
  "Course with ID 'co1' is not related to Student with ID 'st1' through 'courses'";

const newBuilder = (): TransactWriteBuilder =>
  new TransactWriteBuilder(
    new DynamoClient({ send: async command => await mockSend(command) })
  );

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
 * Executes the transaction and returns what it threw
 */
const executeAndCatch = async (builder: TransactWriteBuilder): Promise<any> => {
  try {
    await builder.executeTransaction();
  } catch (e) {
    return e;
  }
  throw new Error("Expected the transaction to throw");
};

describe("TransactWriteBuilder", () => {
  beforeEach(() => {
    mockSend.mockResolvedValue({});
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockSend.mockReset();
  });

  describe("placeholder prefixes", () => {
    it("vends a distinct value placeholder prefix on every call", () => {
      expect.assertions(1);

      const builder = newBuilder();

      expect([
        builder.nextPlaceholderPrefix(),
        builder.nextPlaceholderPrefix(),
        builder.nextPlaceholderPrefix()
      ]).toEqual(["wc1_", "wc2_", "wc3_"]);
    });
  });

  describe("merging guards by row", () => {
    it("ANDs a parenthesized fragment onto a queued Update into fresh maps", async () => {
      expect.assertions(3);

      const names = { "#Status": "Status", "#UpdatedAt": "UpdatedAt" };
      const values = { ":Status": "cancelled", ":UpdatedAt": "2023-10-16" };

      const builder = newBuilder();
      builder.addUpdate(
        {
          TableName: tableName,
          Key: orderKey,
          UpdateExpression: "SET #Status = :Status, #UpdatedAt = :UpdatedAt",
          ConditionExpression: "attribute_exists(PK)",
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values
        },
        orderNotFound
      );
      builder.addGuard(
        {
          TableName: tableName,
          Key: orderKey,
          missingRowMessage: orderNotFound
        },
        {
          entity: "Order",
          id: "o1",
          guard: { kind: "self" },
          condition: {
            ConditionExpression:
              "#Status = :wc1_Status1 OR #Total > :wc1_Total2",
            ExpressionAttributeNames: {
              "#Status": "Status",
              "#Total": "Total"
            },
            ExpressionAttributeValues: {
              ":wc1_Status1": "pending",
              ":wc1_Total2": 5
            }
          }
        }
      );

      await builder.executeTransaction();

      expect(mockedTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  TableName: tableName,
                  Key: orderKey,
                  UpdateExpression:
                    "SET #Status = :Status, #UpdatedAt = :UpdatedAt",
                  ConditionExpression:
                    "attribute_exists(PK) AND (#Status = :wc1_Status1 OR #Total > :wc1_Total2)",
                  ExpressionAttributeNames: {
                    "#Status": "Status",
                    "#UpdatedAt": "UpdatedAt",
                    "#Total": "Total"
                  },
                  ExpressionAttributeValues: {
                    ":Status": "cancelled",
                    ":UpdatedAt": "2023-10-16",
                    ":wc1_Status1": "pending",
                    ":wc1_Total2": 5
                  },
                  ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                }
              }
            ]
          }
        ]
      ]);
      // The canonical update's maps are shared with its link-row updates, so
      // the merge must never write into them
      expect(names).toEqual({ "#Status": "Status", "#UpdatedAt": "UpdatedAt" });
      expect(values).toEqual({
        ":Status": "cancelled",
        ":UpdatedAt": "2023-10-16"
      });
    });

    it("merges onto a queued Put, Delete and ConditionCheck, attaching maps only when the fragment has them", async () => {
      expect.assertions(1);

      const builder = newBuilder();
      builder.addPut(
        {
          TableName: tableName,
          Item: { ...orderKey, Id: "o1", Status: "pending" },
          ConditionExpression: "attribute_not_exists(PK)"
        },
        "Order with ID 'o1' already exists"
      );
      builder.addDelete({ TableName: tableName, Key: otherOrderKey });
      builder.addConditionCheck(
        {
          TableName: tableName,
          Key: customerKey,
          ConditionExpression: "attribute_exists(PK)"
        },
        customerNotFound
      );

      builder.addGuard(
        {
          TableName: tableName,
          Key: orderKey,
          missingRowMessage: orderNotFound
        },
        {
          entity: "Order",
          id: "o1",
          guard: { kind: "self" },
          condition: {
            ConditionExpression: "#Status = :wc1_Status1",
            ExpressionAttributeNames: { "#Status": "Status" },
            ExpressionAttributeValues: { ":wc1_Status1": "pending" }
          }
        }
      );
      builder.addGuard(
        {
          TableName: tableName,
          Key: otherOrderKey,
          missingRowMessage: "Order with ID 'o2' does not exist"
        },
        {
          entity: "Order",
          id: "o2",
          guard: { kind: "self" },
          condition: { ConditionExpression: "attribute_exists(PK)" }
        }
      );
      builder.addGuard(
        {
          TableName: tableName,
          Key: customerKey,
          missingRowMessage: customerNotFound
        },
        {
          entity: "Order",
          id: "o1",
          guard: { kind: "relationship", name: "customer" },
          condition: {
            ConditionExpression: "#Status = :wc2_Status1",
            ExpressionAttributeNames: { "#Status": "Status" },
            ExpressionAttributeValues: { ":wc2_Status1": "active" }
          }
        }
      );

      await builder.executeTransaction();

      expect(mockedTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Put: {
                  TableName: tableName,
                  Item: { ...orderKey, Id: "o1", Status: "pending" },
                  ConditionExpression:
                    "attribute_not_exists(PK) AND (#Status = :wc1_Status1)",
                  ExpressionAttributeNames: { "#Status": "Status" },
                  ExpressionAttributeValues: { ":wc1_Status1": "pending" },
                  ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                }
              },
              {
                Delete: {
                  TableName: tableName,
                  Key: otherOrderKey,
                  ConditionExpression: "(attribute_exists(PK))",
                  ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                }
              },
              {
                ConditionCheck: {
                  TableName: tableName,
                  Key: customerKey,
                  ConditionExpression:
                    "attribute_exists(PK) AND (#Status = :wc2_Status1)",
                  ExpressionAttributeNames: { "#Status": "Status" },
                  ExpressionAttributeValues: { ":wc2_Status1": "active" },
                  ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("adds a ConditionCheck requiring the row's existence when nothing is queued on the row", async () => {
      expect.assertions(1);

      const builder = newBuilder();
      builder.addUpdate({
        TableName: tableName,
        Key: orderKey,
        UpdateExpression: "SET #Status = :Status",
        ExpressionAttributeNames: { "#Status": "Status" },
        ExpressionAttributeValues: { ":Status": "cancelled" }
      });
      builder.addGuard(
        {
          TableName: tableName,
          Key: customerKey,
          missingRowMessage: customerNotFound
        },
        {
          entity: "Order",
          id: "o1",
          guard: { kind: "relationship", name: "customer" },
          condition: {
            ConditionExpression: "#Status = :wc1_Status1",
            ExpressionAttributeNames: { "#Status": "Status" },
            ExpressionAttributeValues: { ":wc1_Status1": "active" }
          }
        }
      );

      await builder.executeTransaction();

      expect(mockedTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  TableName: tableName,
                  Key: orderKey,
                  UpdateExpression: "SET #Status = :Status",
                  ExpressionAttributeNames: { "#Status": "Status" },
                  ExpressionAttributeValues: { ":Status": "cancelled" }
                }
              },
              {
                ConditionCheck: {
                  TableName: tableName,
                  Key: customerKey,
                  ConditionExpression:
                    "attribute_exists(PK) AND (#Status = :wc1_Status1)",
                  ExpressionAttributeNames: { "#Status": "Status" },
                  ExpressionAttributeValues: { ":wc1_Status1": "active" },
                  ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("parenthesizes each of two fragments on one row and keeps both operands of the same attribute", async () => {
      expect.assertions(1);

      const builder = newBuilder();
      const customerRow = {
        TableName: tableName,
        Key: customerKey,
        missingRowMessage: customerNotFound
      };
      builder.addGuard(customerRow, {
        entity: "Order",
        id: "o1",
        guard: { kind: "relationship", name: "customer" },
        condition: {
          ConditionExpression: "#Status = :wc1_Status1 OR #Tier = :wc1_Tier2",
          ExpressionAttributeNames: { "#Status": "Status", "#Tier": "Tier" },
          ExpressionAttributeValues: {
            ":wc1_Status1": "active",
            ":wc1_Tier2": "gold"
          }
        }
      });
      builder.addGuard(customerRow, {
        entity: "Order",
        id: "o1",
        guard: { kind: "foreignKey", name: "billingCustomerId" },
        condition: {
          ConditionExpression: "#Status <> :wc2_Status1",
          ExpressionAttributeNames: { "#Status": "Status" },
          ExpressionAttributeValues: { ":wc2_Status1": "suspended" }
        }
      });

      await builder.executeTransaction();

      expect(mockedTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                ConditionCheck: {
                  TableName: tableName,
                  Key: customerKey,
                  ConditionExpression:
                    "attribute_exists(PK) AND (#Status = :wc1_Status1 OR #Tier = :wc1_Tier2) AND (#Status <> :wc2_Status1)",
                  ExpressionAttributeNames: {
                    "#Status": "Status",
                    "#Tier": "Tier"
                  },
                  ExpressionAttributeValues: {
                    ":wc1_Status1": "active",
                    ":wc1_Tier2": "gold",
                    ":wc2_Status1": "suspended"
                  },
                  ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("merges a library pin as an equality on a fresh placeholder", async () => {
      expect.assertions(1);

      const builder = newBuilder();
      builder.addUpdate(
        {
          TableName: tableName,
          Key: orderKey,
          UpdateExpression: "SET #Status = :Status",
          ConditionExpression: "attribute_exists(PK)",
          ExpressionAttributeNames: { "#Status": "Status" },
          ExpressionAttributeValues: { ":Status": "cancelled" }
        },
        orderNotFound
      );
      builder.addPin(
        {
          TableName: tableName,
          Key: orderKey,
          missingRowMessage: orderNotFound
        },
        { attribute: "CustomerId", value: "c1", failureMessage: orderMoved }
      );

      await builder.executeTransaction();

      expect(mockedTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  TableName: tableName,
                  Key: orderKey,
                  UpdateExpression: "SET #Status = :Status",
                  ConditionExpression:
                    "attribute_exists(PK) AND (#CustomerId = :wc1_CustomerId)",
                  ExpressionAttributeNames: {
                    "#Status": "Status",
                    "#CustomerId": "CustomerId"
                  },
                  ExpressionAttributeValues: {
                    ":Status": "cancelled",
                    ":wc1_CustomerId": "c1"
                  },
                  ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("throws rather than rebind a queued value placeholder to a different value", () => {
      expect.assertions(1);

      const builder = newBuilder();
      builder.addUpdate({
        TableName: tableName,
        Key: orderKey,
        UpdateExpression: "SET #Line = :Line1",
        ExpressionAttributeNames: { "#Line": "Line" },
        ExpressionAttributeValues: { ":Line1": "updated" }
      });

      expect(() => {
        builder.addGuard(
          {
            TableName: tableName,
            Key: orderKey,
            missingRowMessage: orderNotFound
          },
          {
            entity: "Order",
            id: "o1",
            guard: { kind: "self" },
            condition: {
              ConditionExpression: "#Line = :Line1",
              ExpressionAttributeNames: { "#Line": "Line" },
              ExpressionAttributeValues: { ":Line1": "original" }
            }
          }
        );
      }).toThrow(
        new Error(
          'Write condition merge would rebind \':Line1\' on the item for key {"PK":"Order#o1","SK":"Order"} to a different value'
        )
      );
    });

    it("throws rather than rebind a queued name placeholder to a different attribute", () => {
      expect.assertions(1);

      const builder = newBuilder();
      builder.addUpdate({
        TableName: tableName,
        Key: orderKey,
        UpdateExpression: "SET #Status = :Status",
        ExpressionAttributeNames: { "#Status": "Status" },
        ExpressionAttributeValues: { ":Status": "cancelled" }
      });

      expect(() => {
        builder.addGuard(
          {
            TableName: tableName,
            Key: orderKey,
            missingRowMessage: orderNotFound
          },
          {
            entity: "Order",
            id: "o1",
            guard: { kind: "self" },
            condition: {
              ConditionExpression: "#Status = :wc1_State1",
              ExpressionAttributeNames: { "#Status": "State" },
              ExpressionAttributeValues: { ":wc1_State1": "open" }
            }
          }
        );
      }).toThrow(
        new Error(
          'Write condition merge would rebind \'#Status\' on the item for key {"PK":"Order#o1","SK":"Order"} to a different value'
        )
      );
    });

    it("throws when a library item is queued onto a row holding a guard-only ConditionCheck", () => {
      expect.assertions(2);

      const builder = newBuilder();
      builder.addGuard(
        {
          TableName: tableName,
          Key: customerKey,
          missingRowMessage: customerNotFound
        },
        {
          entity: "Order",
          id: "o1",
          guard: { kind: "relationship", name: "customer" },
          condition: { ConditionExpression: "attribute_exists(PK)" }
        }
      );

      const expected = new Error(
        'Cannot queue a second operation on the item for key {"PK":"Customer#c1","SK":"Customer"}, which already holds a write condition check'
      );
      expect(() => {
        builder.addUpdate({
          TableName: tableName,
          Key: customerKey,
          UpdateExpression: "SET #Name = :Name",
          ExpressionAttributeNames: { "#Name": "Name" },
          ExpressionAttributeValues: { ":Name": "renamed" }
        });
      }).toThrow(expected);
      expect(() => {
        builder.addPut({
          TableName: tableName,
          Item: { ...customerKey, Name: "renamed" }
        });
      }).toThrow(expected);
    });

    it("throws when a guard names a pin row that holds no queued item", () => {
      expect.assertions(1);

      const builder = newBuilder();

      expect(() => {
        builder.addGuard(
          {
            TableName: tableName,
            Key: customerKey,
            missingRowMessage: customerNotFound
          },
          {
            entity: "Order",
            id: "o1",
            guard: { kind: "relationship", name: "customer" },
            condition: { ConditionExpression: "attribute_exists(PK)" },
            pinnedBy: { TableName: tableName, Key: orderKey }
          }
        );
      }).toThrow(
        new Error(
          'A write condition\'s pin must be queued before its guard: no item for key {"PK":"Order#o1","SK":"Order"}'
        )
      );
    });
  });

  describe("attributing a cancellation", () => {
    /**
     * Queues the canonical update of Order o1, the way Update does, with
     * the given pins and guards merged onto it
     */
    const queueOrderUpdate = (builder: TransactWriteBuilder): void => {
      builder.addUpdate(
        {
          TableName: tableName,
          Key: orderKey,
          UpdateExpression: "SET #Status = :Status",
          ConditionExpression: "attribute_exists(PK)",
          ExpressionAttributeNames: { "#Status": "Status" },
          ExpressionAttributeValues: { ":Status": "cancelled" }
        },
        orderNotFound
      );
    };

    const orderRow = {
      TableName: tableName,
      Key: orderKey,
      missingRowMessage: orderNotFound
    };
    const customerRow = {
      TableName: tableName,
      Key: customerKey,
      missingRowMessage: customerNotFound
    };

    const selfGuard: ConsumerGuard = {
      entity: "Order",
      id: "o1",
      guard: { kind: "self" },
      condition: {
        ConditionExpression: "#Status = :wc1_Status1",
        ExpressionAttributeNames: { "#Status": "Status" },
        ExpressionAttributeValues: { ":wc1_Status1": "pending" }
      }
    };

    const customerGuard: ConsumerGuard = {
      entity: "Order",
      id: "o1",
      guard: { kind: "relationship", name: "customer" },
      condition: {
        ConditionExpression: "#Status = :wc2_Status1",
        ExpressionAttributeNames: { "#Status": "Status" },
        ExpressionAttributeValues: { ":wc2_Status1": "active" }
      },
      pinnedBy: { TableName: tableName, Key: orderKey }
    };

    const customerPin = {
      attribute: "CustomerId",
      value: "c1",
      failureMessage: orderMoved
    };

    it("reports a guarded own row that no longer exists as not found", async () => {
      expect.assertions(3);

      const builder = newBuilder();
      queueOrderUpdate(builder);
      builder.addGuard(orderRow, selfGuard);
      cancelWith([{ Code: "ConditionalCheckFailed" }]);

      const error = await executeAndCatch(builder);

      expect(error).toBeInstanceOf(TransactionWriteFailedError);
      expect(error.errors).toEqual([
        new ConditionalCheckFailedError(
          `ConditionalCheckFailed: ${orderNotFound}`
        )
      ]);
      expect(error.errors[0]).not.toBeInstanceOf(WriteConditionFailedError);
    });

    it("reports a guarded related row that does not exist as a referential-integrity failure", async () => {
      expect.assertions(2);

      const builder = newBuilder();
      queueOrderUpdate(builder);
      builder.addGuard(customerRow, {
        ...customerGuard,
        pinnedBy: undefined
      });
      cancelWith([{ Code: "None" }, { Code: "ConditionalCheckFailed" }]);

      const error = await executeAndCatch(builder);

      expect(error.errors).toEqual([
        new ConditionalCheckFailedError(
          `ConditionalCheckFailed: ${customerNotFound}`
        )
      ]);
      expect(error.errors[0]).not.toBeInstanceOf(WriteConditionFailedError);
    });

    it("reports a failed foreign-key pin as a concurrent change, not the consumer-condition error", async () => {
      expect.assertions(2);

      const builder = newBuilder();
      queueOrderUpdate(builder);
      builder.addPin(orderRow, customerPin);
      builder.addGuard(orderRow, selfGuard);
      cancelWith([
        {
          Code: "ConditionalCheckFailed",
          Item: marshall({ ...orderKey, Status: "pending", CustomerId: "c2" })
        }
      ]);

      const error = await executeAndCatch(builder);

      expect(error.errors).toEqual([
        new ConditionalCheckFailedError(`ConditionalCheckFailed: ${orderMoved}`)
      ]);
      expect(error.errors[0]).not.toBeInstanceOf(WriteConditionFailedError);
    });

    it("reports a failed membership pin as a not-related failure naming the relationship and id", async () => {
      expect.assertions(2);

      const builder = newBuilder();
      const childRow = {
        TableName: tableName,
        Key: otherOrderKey,
        missingRowMessage: orderNotRelated
      };
      builder.addPin(childRow, {
        attribute: "CustomerId",
        value: "c1",
        failureMessage: orderNotRelated
      });
      builder.addGuard(childRow, {
        entity: "Customer",
        id: "c1",
        guard: { kind: "relationship", name: "orders", id: "o2" },
        condition: {
          ConditionExpression: "#Status = :wc2_Status1",
          ExpressionAttributeNames: { "#Status": "Status" },
          ExpressionAttributeValues: { ":wc2_Status1": "pending" }
        }
      });
      cancelWith([
        {
          Code: "ConditionalCheckFailed",
          Item: marshall({
            ...otherOrderKey,
            Status: "pending",
            CustomerId: "c9"
          })
        }
      ]);

      const error = await executeAndCatch(builder);

      expect(error.errors).toEqual([
        new ConditionalCheckFailedError(
          `ConditionalCheckFailed: ${orderNotRelated}`
        )
      ]);
      expect(error.errors[0]).not.toBeInstanceOf(WriteConditionFailedError);
    });

    it("reports a failed guard whose pins hold as a WriteConditionFailedError naming the guard", async () => {
      expect.assertions(6);

      const builder = newBuilder();
      queueOrderUpdate(builder);
      builder.addPin(orderRow, customerPin);
      builder.addGuard(orderRow, selfGuard);
      cancelWith([
        {
          Code: "ConditionalCheckFailed",
          Item: marshall({ ...orderKey, Status: "shipped", CustomerId: "c1" })
        }
      ]);

      const error = await executeAndCatch(builder);

      expect(error).toBeInstanceOf(TransactionWriteFailedError);
      expect(error.errors).toHaveLength(1);
      const [failure] = error.errors;
      expect(failure).toBeInstanceOf(WriteConditionFailedError);
      expect(failure.message).toEqual(
        "ConditionalCheckFailed: Write condition failed on Order with ID 'o1': its own row"
      );
      expect(failure.code).toEqual("WriteConditionFailedError");
      expect({
        entity: failure.entity,
        id: failure.id,
        guards: failure.guards
      }).toEqual({ entity: "Order", id: "o1", guards: [{ kind: "self" }] });
    });

    it("names every consumer guard on a failed row", async () => {
      expect.assertions(3);

      const builder = newBuilder();
      builder.addGuard(customerRow, {
        ...customerGuard,
        pinnedBy: undefined
      });
      builder.addGuard(customerRow, {
        entity: "Order",
        id: "o1",
        guard: { kind: "foreignKey", name: "billingCustomerId", id: "c1" },
        condition: {
          ConditionExpression: "#Tier = :wc3_Tier1",
          ExpressionAttributeNames: { "#Tier": "Tier" },
          ExpressionAttributeValues: { ":wc3_Tier1": "gold" }
        }
      });
      cancelWith([
        {
          Code: "ConditionalCheckFailed",
          Item: marshall({ ...customerKey, Status: "active", Tier: "silver" })
        }
      ]);

      const error = await executeAndCatch(builder);

      const [failure] = error.errors;
      expect(failure).toBeInstanceOf(WriteConditionFailedError);
      expect(failure.message).toEqual(
        "ConditionalCheckFailed: Write condition failed on Order with ID 'o1': relationship 'customer', foreign key 'billingCustomerId' (ID 'c1')"
      );
      expect(failure.guards).toEqual([
        { kind: "relationship", name: "customer" },
        { kind: "foreignKey", name: "billingCustomerId", id: "c1" }
      ]);
    });

    it("reads the raw returned row but never logs it or keeps it on the error", async () => {
      expect.assertions(5);

      const logSpy = vi.spyOn(Logger, "log");
      const errorSpy = vi.spyOn(Logger, "error");
      const vector = [0.918273645, 0.192837465, 0.564738291];

      const builder = newBuilder();
      queueOrderUpdate(builder);
      builder.addPin(orderRow, customerPin);
      builder.addGuard(orderRow, selfGuard);
      cancelWith([
        {
          Code: "ConditionalCheckFailed",
          Item: marshall({
            ...orderKey,
            Status: "shipped",
            CustomerId: "c1",
            __dyna_vector: vector
          })
        }
      ]);

      const error = await executeAndCatch(builder);

      // The pin held, which is only knowable from the unmarshalled row
      expect(error.errors[0]).toBeInstanceOf(WriteConditionFailedError);
      expect(error.cause).toBeInstanceOf(TransactionCanceledException);
      expect(error.cause.CancellationReasons).toEqual([
        { Code: "ConditionalCheckFailed" }
      ]);
      const logged = JSON.stringify([logSpy.mock.calls, errorSpy.mock.calls]);
      expect(logged).not.toContain("918273645");
      expect(JSON.stringify(error.errors)).not.toContain("918273645");
    });

    it("reports a pin-only own row whose pin fails as a concurrent change, not as not found", async () => {
      expect.assertions(2);

      const builder = newBuilder();
      queueOrderUpdate(builder);
      builder.addPin(orderRow, customerPin);
      cancelWith([
        {
          Code: "ConditionalCheckFailed",
          Item: marshall({ ...orderKey, Status: "pending" })
        }
      ]);

      const error = await executeAndCatch(builder);

      expect(error.errors).toEqual([
        new ConditionalCheckFailedError(`ConditionalCheckFailed: ${orderMoved}`)
      ]);
      expect(error.errors[0]).not.toBeInstanceOf(WriteConditionFailedError);
    });

    it("reports a pin-only row whose pins hold with its library message", async () => {
      expect.assertions(1);

      const builder = newBuilder();
      queueOrderUpdate(builder);
      builder.addPin(orderRow, customerPin);
      cancelWith([
        {
          Code: "ConditionalCheckFailed",
          Item: marshall({ ...orderKey, Status: "pending", CustomerId: "c1" })
        }
      ]);

      const error = await executeAndCatch(builder);

      expect(error.errors).toEqual([
        new ConditionalCheckFailedError(
          `ConditionalCheckFailed: ${orderNotFound}`
        )
      ]);
    });

    it("reports only the concurrent change when the foreign-key pin and the parent guard both fail", async () => {
      expect.assertions(1);

      const builder = newBuilder();
      queueOrderUpdate(builder);
      builder.addPin(orderRow, customerPin);
      builder.addGuard(customerRow, customerGuard);
      cancelWith([
        {
          Code: "ConditionalCheckFailed",
          Item: marshall({ ...orderKey, Status: "pending", CustomerId: "c2" })
        },
        {
          Code: "ConditionalCheckFailed",
          Item: marshall({ ...customerKey, Status: "suspended" })
        }
      ]);

      const error = await executeAndCatch(builder);

      expect(error.errors).toEqual([
        new ConditionalCheckFailedError(`ConditionalCheckFailed: ${orderMoved}`)
      ]);
    });

    it("still reports a parent guard when its pin row failed only on a consumer guard", async () => {
      expect.assertions(3);

      const builder = newBuilder();
      queueOrderUpdate(builder);
      builder.addPin(orderRow, customerPin);
      builder.addGuard(orderRow, selfGuard);
      builder.addGuard(customerRow, customerGuard);
      cancelWith([
        {
          Code: "ConditionalCheckFailed",
          Item: marshall({ ...orderKey, Status: "shipped", CustomerId: "c1" })
        },
        {
          Code: "ConditionalCheckFailed",
          Item: marshall({ ...customerKey, Status: "suspended" })
        }
      ]);

      const error = await executeAndCatch(builder);

      expect(error.errors).toHaveLength(2);
      expect(
        error.errors.map((e: WriteConditionFailedError) => e.guards)
      ).toEqual([
        [{ kind: "self" }],
        [{ kind: "relationship", name: "customer" }]
      ]);
      expect(
        error.errors.every(
          (e: unknown) => e instanceof WriteConditionFailedError
        )
      ).toBe(true);
    });

    it("reports only the not-related failure when a join link is missing and the partner guard fails", async () => {
      expect.assertions(1);

      const builder = newBuilder();
      builder.addDelete({ TableName: tableName, Key: linkKey });
      const linkRow = {
        TableName: tableName,
        Key: linkKey,
        missingRowMessage: courseNotLinked
      };
      builder.addPin(linkRow, {
        attribute: "Id",
        value: "co1",
        failureMessage: courseNotLinked
      });
      builder.addGuard(
        {
          TableName: tableName,
          Key: courseKey,
          missingRowMessage: "Course with ID 'co1' does not exist"
        },
        {
          entity: "Student",
          id: "st1",
          guard: { kind: "relationship", name: "courses", id: "co1" },
          condition: {
            ConditionExpression: "#Status = :wc2_Status1",
            ExpressionAttributeNames: { "#Status": "Status" },
            ExpressionAttributeValues: { ":wc2_Status1": "open" }
          },
          pinnedBy: { TableName: tableName, Key: linkKey }
        }
      );
      cancelWith([
        { Code: "ConditionalCheckFailed" },
        {
          Code: "ConditionalCheckFailed",
          Item: marshall({ ...courseKey, Status: "closed" })
        }
      ]);

      const error = await executeAndCatch(builder);

      expect(error.errors).toEqual([
        new ConditionalCheckFailedError(
          `ConditionalCheckFailed: ${courseNotLinked}`
        )
      ]);
    });

    it("passes a cancellation without a failed condition through unchanged", async () => {
      expect.assertions(1);

      const builder = newBuilder();
      queueOrderUpdate(builder);
      builder.addGuard(orderRow, selfGuard);
      const conflict = new TransactionCanceledException({
        message: "MockMessage",
        CancellationReasons: [{ Code: "TransactionConflict" }],
        $metadata: {}
      });
      mockSend.mockRejectedValueOnce(conflict);

      const error = await executeAndCatch(builder);

      expect(error).toBe(conflict);
    });

    it("keeps today's messages and commands for items without a guard or pin", async () => {
      expect.assertions(3);

      const builder = newBuilder();
      queueOrderUpdate(builder);
      builder.addConditionCheck(
        {
          TableName: tableName,
          Key: storeKey,
          ConditionExpression: "attribute_exists(PK)"
        },
        "Store with ID 's1' does not exist"
      );
      builder.addDelete({ TableName: tableName, Key: otherOrderKey });
      builder.addGuard(customerRow, { ...customerGuard, pinnedBy: undefined });
      cancelWith([
        { Code: "ConditionalCheckFailed" },
        { Code: "ConditionalCheckFailed" },
        {
          Code: "ConditionalCheckFailed",
          Message: "The conditional request failed"
        },
        { Code: "None" }
      ]);

      const error = await executeAndCatch(builder);

      expect(error.errors).toEqual([
        new ConditionalCheckFailedError(
          `ConditionalCheckFailed: ${orderNotFound}`
        ),
        new ConditionalCheckFailedError(
          "ConditionalCheckFailed: Store with ID 's1' does not exist"
        ),
        new ConditionalCheckFailedError(
          "ConditionalCheckFailed: The conditional request failed"
        )
      ]);
      expect(
        error.errors.some(
          (e: unknown) => e instanceof WriteConditionFailedError
        )
      ).toBe(false);
      expect(mockedTransactWriteCommand.mock.calls).toEqual([
        [
          {
            TransactItems: [
              {
                Update: {
                  TableName: tableName,
                  Key: orderKey,
                  UpdateExpression: "SET #Status = :Status",
                  ConditionExpression: "attribute_exists(PK)",
                  ExpressionAttributeNames: { "#Status": "Status" },
                  ExpressionAttributeValues: { ":Status": "cancelled" }
                }
              },
              {
                ConditionCheck: {
                  TableName: tableName,
                  Key: storeKey,
                  ConditionExpression: "attribute_exists(PK)"
                }
              },
              { Delete: { TableName: tableName, Key: otherOrderKey } },
              {
                ConditionCheck: {
                  TableName: tableName,
                  Key: customerKey,
                  ConditionExpression:
                    "attribute_exists(PK) AND (#Status = :wc2_Status1)",
                  ExpressionAttributeNames: { "#Status": "Status" },
                  ExpressionAttributeValues: { ":wc2_Status1": "active" },
                  ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                }
              }
            ]
          }
        ]
      ]);
    });

    it("reports an overridden message for a queued update", async () => {
      expect.assertions(1);

      const builder = newBuilder();
      const update = {
        TableName: tableName,
        Key: orderKey,
        UpdateExpression: "SET #Status = :Status",
        ConditionExpression: "attribute_exists(PK)",
        ExpressionAttributeNames: { "#Status": "Status" },
        ExpressionAttributeValues: { ":Status": "cancelled" }
      };
      builder.addUpdate(update, orderNotFound);
      builder.overrideConditionFailedMsg(update, "searchable value changed");
      cancelWith([{ Code: "ConditionalCheckFailed" }]);

      const error = await executeAndCatch(builder);

      expect(error.errors).toEqual([
        new ConditionalCheckFailedError(
          "ConditionalCheckFailed: searchable value changed"
        )
      ]);
    });
  });
});
