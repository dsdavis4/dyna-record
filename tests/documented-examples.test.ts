import DynaRecord from "../index.js";
import {
  Table,
  Entity,
  PartitionKeyAttribute,
  SortKeyAttribute,
  StringAttribute,
  NumberAttribute,
  DateAttribute,
  ObjectAttribute,
  EnumAttribute,
  ForeignKeyAttribute,
  HasMany,
  BelongsTo,
  HasAndBelongsToMany
} from "../src/decorators/index.js";
import type {
  ObjectSchema,
  InferObjectSchema
} from "../src/decorators/index.js";
import type { PartitionKey, SortKey, ForeignKey } from "../src/types.js";
import { JoinTable } from "../src/relationships/index.js";
import {
  TransactionWriteFailedError,
  WriteConditionFailedError
} from "../src/dynamo-utils/errors.js";
import type { JoinTableCondition } from "../src/relationships/JoinTable.js";
import type {
  CreateCondition,
  ForeignKeyTargetGuard,
  RelatedEntityCondition,
  TargetCondition,
  WriteCondition
} from "../src/operations/WriteCondition/index.js";

/**
 * The examples in the README and in the public TSDoc, compiled against the real
 * types.
 *
 * A documented example that no longer compiles is a defect a reader meets
 * before any test does: the TSDoc blocks become IDE typeahead and a published
 * docs site, and the README is the first thing a consumer reads. Nothing else
 * in the suite reaches either, because nothing imports them.
 *
 * The bodies are never executed — what is under test is that this file
 * typechecks, so asserting the function exists is enough. `@ts-expect-error` is
 * how a documented *rejection* is pinned: if a claim about what the types
 * refuse stops being true, the directive goes unused and `npm run typecheck`
 * fails.
 *
 * The entities mirror the README's storefront schema, so an example can be
 * copied out of the docs without adjustment.
 */
const addressSchema = {
  street: { type: "string" },
  city: { type: "string" },
  tags: { type: "array", items: { type: "string" } },
  contacts: {
    type: "array",
    items: {
      type: "object",
      fields: { name: { type: "string" }, phone: { type: "string" } }
    }
  },
  geo: { type: "object", fields: { lat: { type: "number" } } }
} as const satisfies ObjectSchema;

@Table({
  name: "docs-table",
  defaultFields: {
    id: { alias: "Id" },
    type: { alias: "Type" },
    createdAt: { alias: "CreatedAt" },
    updatedAt: { alias: "UpdatedAt" }
  }
})
abstract class DocsTable extends DynaRecord {
  @PartitionKeyAttribute({ alias: "PK" })
  public readonly pk: PartitionKey;

  @SortKeyAttribute({ alias: "SK" })
  public readonly sk: SortKey;
}

@Entity
class Order extends DocsTable {
  declare readonly type: "Order";

  @DateAttribute({ alias: "OrderDate" })
  public readonly orderDate: Date;

  @NumberAttribute({ alias: "Total" })
  public readonly total: number;

  @ForeignKeyAttribute(() => Customer, { alias: "CustomerId" })
  public readonly customerId: ForeignKey<Customer>;

  @BelongsTo(() => Customer, { foreignKey: "customerId" })
  public readonly customer: Customer;

  // The README's write-condition schema additions
  @EnumAttribute({
    alias: "Status",
    values: ["pending", "shipped", "cancelled"]
  })
  public readonly status: "pending" | "shipped" | "cancelled";

  @StringAttribute({ alias: "TrackingNumber", nullable: true })
  public readonly trackingNumber?: string;

  @ForeignKeyAttribute(() => Store, { alias: "StoreId" })
  public readonly storeId: ForeignKey<Store>;
}

@Entity
class Customer extends DocsTable {
  declare readonly type: "Customer";

  @StringAttribute({ alias: "Name" })
  public readonly name: string;

  @StringAttribute({ alias: "Phone", nullable: true })
  public readonly phone?: string;

  @HasMany(() => Order, { foreignKey: "customerId" })
  public readonly orders: Order[];

  // The README's write-condition schema additions
  @EnumAttribute({ alias: "Status", values: ["active", "suspended"] })
  public readonly status: "active" | "suspended";

  @HasAndBelongsToMany(() => Store, {
    targetKey: "customers",
    through: () => ({ joinTable: CustomerStore, foreignKey: "customerId" })
  })
  public readonly stores: Store[];
}

@Entity
class Store extends DocsTable {
  declare readonly type: "Store";

  @StringAttribute({ alias: "Name" })
  public readonly name: string;

  @ObjectAttribute({ alias: "Address", schema: addressSchema })
  public readonly address: InferObjectSchema<typeof addressSchema>;

  // The README's write-condition schema additions
  @EnumAttribute({ alias: "Status", values: ["open", "closed"] })
  public readonly status: "open" | "closed";

  @HasAndBelongsToMany(() => Customer, {
    targetKey: "stores",
    through: () => ({ joinTable: CustomerStore, foreignKey: "storeId" })
  })
  public readonly customers: Customer[];
}

@Entity
class PaymentMethod extends DocsTable {
  declare readonly type: "PaymentMethod";

  @StringAttribute({ alias: "LastFour" })
  public readonly lastFour: string;

  // References its Customer without a BelongsTo
  @ForeignKeyAttribute(() => Customer, { alias: "CustomerId" })
  public readonly customerId: ForeignKey<Customer>;
}

class CustomerStore extends JoinTable<Customer, Store> {
  public readonly customerId: ForeignKey<Customer>;
  public readonly storeId: ForeignKey<Store>;
}

describe("documented examples compile", () => {
  it("README: comparison and range conditions", () => {
    const examples = async (): Promise<void> => {
      // "Everything created in January"
      await Order.query("123", {
        filter: {
          createdAt: {
            $gte: new Date("2026-01-01"),
            $lt: new Date("2026-02-01")
          }
        }
      });

      // "An inclusive range, as a single condition"
      await Store.query("123", {
        filter: { "address.geo.lat": { $between: [40, 41] } }
      });
    };

    expect(examples).toBeDefined();
  });

  it("README: whole values and fragments", () => {
    const examples = async (): Promise<void> => {
      // A whole value: createdAt is declared as a Date, so the operand is one
      await Order.query("123", {
        filter: { createdAt: { $gte: new Date("2026-01-01") } }
      });

      // A fragment: a prefix of the ISO string the table stores
      await Order.query("123", {
        filter: { createdAt: { $beginsWith: "2026" } }
      });
    };

    expect(examples).toBeDefined();
  });

  it("README: which operators an attribute offers", () => {
    const examples = async (): Promise<void> => {
      // The table's rows, as claims about what compiles
      await Store.query("123", {
        filter: {
          name: { $beginsWith: "Main" },
          "address.tags": { $contains: "home" },
          "address.geo.lat": { $gt: 40 }
        }
      });

      // "A number attribute offers the comparators but not $beginsWith"
      // @ts-expect-error a number has no prefix for begins_with to test
      await Store.query("123", {
        filter: { "address.geo.lat": { $beginsWith: "4" } }
      });

      // ...and no substring for contains to test either
      // @ts-expect-error a number has no substring
      await Order.query("123", {
        filter: { total: { $contains: 1 } }
      });

      // "A List has no prefix", from the dot-path paragraph
      // @ts-expect-error a List has no prefix
      await Store.query("123", {
        filter: { "address.tags": { $beginsWith: "ho" } }
      });
    };

    expect(examples).toBeDefined();
  });

  it("README: ranges in key conditions", () => {
    const examples = async (): Promise<void> => {
      // "Reads only the Orders in this range"
      await Customer.query("123", {
        skCondition: { $between: ["Order#100", "Order#200"] }
      });

      // "The comparison operators therefore do not compose here"
      // @ts-expect-error a sort key takes exactly one condition
      await Customer.query("123", {
        skCondition: { $gte: "Order#100", $lt: "Order#200" }
      });
    };

    expect(examples).toBeDefined();
  });

  it("TSDoc: DynaRecord.query filter and sort key ranges", () => {
    const examples = async (): Promise<void> => {
      // @example SK-scoped filter
      await Customer.query("123", {
        skCondition: { $beginsWith: "Order" },
        filter: { type: "Order", orderDate: new Date("2023-01-01") }
      });

      // @example Filtering on a range
      await Customer.query("123", {
        filter: {
          type: "Order",
          orderDate: {
            $gte: new Date("2026-01-01"),
            $lt: new Date("2026-02-01")
          }
        }
      });
      await Customer.query("123", {
        filter: {
          orderDate: {
            $between: [new Date("2026-01-01"), new Date("2026-12-31")]
          }
        }
      });

      // @example Narrowing the read with a sort key range
      await Customer.query("123", {
        skCondition: { $between: ["Order#100", "Order#200"] }
      });
    };

    expect(examples).toBeDefined();
  });

  it("TSDoc: the condition type examples", () => {
    const examples = async (): Promise<void> => {
      // FilterTypes
      await Order.query("123", { filter: { total: { $gte: 50, $lt: 100 } } });
      await Order.query("123", { filter: { total: { $between: [50, 100] } } });
      await Order.query("123", {
        filter: { createdAt: { $beginsWith: "2026" } }
      });

      // BeginsWithFilter
      await Store.query("123", {
        filter: { "address.street": { $beginsWith: "123" } }
      });
      await Customer.query("123", { skCondition: { $beginsWith: "Order" } });

      // SingleComparisonFilter
      await Customer.query("123", { skCondition: { $gte: "Order#100" } });

      // ContainsFilter
      await Store.query("123", {
        filter: { "address.tags": { $contains: "home" } }
      });
      await Store.query("123", { filter: { name: { $contains: "john" } } });
    };

    expect(examples).toBeDefined();
  });

  it("README: list elements", () => {
    const examples = async (): Promise<void> => {
      // "One element of a list of scalars"
      await Store.query("123", {
        filter: { "address.tags[0]": "home" }
      });

      // "A field of one element of a list of objects"
      await Store.query("123", {
        filter: { "address.contacts[0].name": "Jane" }
      });
    };

    expect(examples).toBeDefined();
  });

  it("TSDoc: @ObjectAttribute filtering", () => {
    const examples = async (): Promise<void> => {
      await Store.query("123", { filter: { "address.city": "Springfield" } });
      await Store.query("123", {
        filter: { "address.tags": { $contains: "home" } }
      });
      await Store.query("123", {
        filter: { "address.geo.lat": { $between: [40, 41] } }
      });
      await Store.query("123", {
        filter: { "address.contacts[0].name": "Jane" }
      });
    };

    expect(examples).toBeDefined();
  });

  it("README: write conditions", () => {
    const examples = async (): Promise<void> => {
      // "Cancel an Order only while it is still pending"
      await Order.update(
        "order-1",
        { status: "cancelled" },
        { condition: { status: "pending" } }
      );

      // "Update only if nothing has written the Order since it was read"
      const order = await Order.findById("order-1");
      if (order !== undefined) {
        await Order.update(
          "order-1",
          { total: 90 },
          { condition: { updatedAt: order.updatedAt } }
        );
      }

      // "Ship an Order only if it has no tracking number yet"
      await Order.update(
        "order-1",
        { status: "shipped", trackingNumber: "1Z999" },
        { condition: { trackingNumber: null } }
      );

      // "Cancel an Order that is pending or has no tracking number yet"
      await Order.update(
        "order-1",
        { status: "cancelled" },
        {
          condition: { $or: [{ status: "pending" }, { trackingNumber: null }] }
        }
      );

      // "null is offered only on a nullable attribute"
      await Order.update(
        "order-1",
        { status: "cancelled" },
        // @ts-expect-error total is not nullable, so it is never "not set"
        { condition: { total: null } }
      );

      // "Change an Order only while its Customer is active"
      await Order.update(
        "order-1",
        { total: 90 },
        { condition: { total: { $lt: 100 }, customer: { status: "active" } } }
      );

      // "Guard two of a Customer's related rows by id"
      await Customer.update(
        "customer-1",
        { name: "Jane Doe" },
        {
          condition: {
            orders: [{ id: "order-1", condition: { status: "pending" } }],
            stores: [{ id: "store-1", condition: { status: "open" } }]
          }
        }
      );

      // "Move an Order to another Customer only if that Customer is active"
      await Order.update(
        "order-1",
        { customerId: "customer-2" },
        { condition: { customer: { status: "active" } } }
      );

      // "An existence-only guard"
      await Order.update(
        "order-1",
        { total: 90 },
        { condition: { customer: {} } }
      );

      // "$or stays within one row"
      await Order.update(
        "order-1",
        { status: "cancelled" },
        {
          condition: {
            $or: [{ status: "pending" }, { total: { $lt: 50 } }],
            customer: {
              $or: [{ status: "active" }, { name: { $beginsWith: "VIP" } }]
            }
          }
        }
      );
      await Order.update(
        "order-1",
        { status: "cancelled" },
        {
          condition: {
            // @ts-expect-error a $or branch names the Order's own attributes only
            $or: [{ status: "pending" }, { customer: { status: "active" } }]
          }
        }
      );

      // "A standalone foreign key guards its row through target"
      await Order.update(
        "order-1",
        { total: 90 },
        { condition: { storeId: { target: { status: "open" } } } }
      );

      // "A value condition on the key goes in a $or branch"
      await Order.update(
        "order-1",
        { total: 90 },
        {
          condition: {
            storeId: { target: { status: "open" } },
            $or: [{ storeId: "store-1" }, { storeId: "store-2" }]
          }
        }
      );

      // "A foreign key that backs a BelongsTo is guarded under the relationship"
      await Order.update(
        "order-1",
        { total: 90 },
        // @ts-expect-error customerId backs the customer relationship
        { condition: { customerId: { target: { status: "active" } } } }
      );

      // "Catching a failed write condition"
      try {
        await Order.update(
          "order-1",
          { status: "cancelled" },
          { condition: { status: "pending" } }
        );
      } catch (error) {
        if (error instanceof TransactionWriteFailedError) {
          for (const cause of error.errors) {
            if (cause instanceof WriteConditionFailedError) {
              // cause.entity === "Order", cause.id === "order-1",
              // cause.guards is [{ kind: "self" }]
              console.log(cause.entity, cause.id, cause.guards);
            }
          }
        }
        throw error;
      }

      // Create: "Place an Order only for an active Customer at an open Store"
      // (the README's Order declares orderDate as a string; this mirror's
      // declares a Date)
      await Order.create(
        {
          orderDate: new Date("2026-10-06"),
          total: 40,
          status: "pending",
          customerId: "customer-1",
          storeId: "store-1"
        },
        {
          condition: {
            customer: { status: "active" },
            storeId: { target: { status: "open" } }
          }
        }
      );

      // Create: "no condition on the new row's own attributes"
      await Order.create(
        {
          orderDate: new Date("2026-10-06"),
          total: 40,
          status: "pending",
          customerId: "customer-1",
          storeId: "store-1"
        },
        // @ts-expect-error a create takes no condition on its own row
        { condition: { status: "pending" } }
      );

      // Update: "A guarded touch"
      await Order.update("order-1", {}, { condition: { status: "pending" } });

      // Update: the instance method
      if (order !== undefined) {
        await order.update(
          { status: "cancelled" },
          { condition: { status: "pending" } }
        );
      }

      // Delete: "Delete an Order only while it is pending and its Customer is active"
      await Order.delete("order-1", {
        condition: { status: "pending", customer: { status: "active" } }
      });

      // Join tables: link and unlink, guarded
      await CustomerStore.create(
        { customerId: "customer-1", storeId: "store-1" },
        {
          condition: {
            customerId: { target: { status: "active" } },
            storeId: { target: { status: "open" } }
          }
        }
      );
      await CustomerStore.delete(
        { customerId: "customer-1", storeId: "store-1" },
        { condition: { storeId: { target: { status: "open" } } } }
      );
    };

    expect(examples).toBeDefined();
  });

  it("README: typed foreign keys on a join table", () => {
    class UntypedCustomerStore extends JoinTable<Customer, Store> {
      public readonly customerId: ForeignKey;
      public readonly storeId: ForeignKey;
    }

    const examples = async (): Promise<void> => {
      await UntypedCustomerStore.create(
        { customerId: "customer-1", storeId: "store-1" },
        // @ts-expect-error a bare ForeignKey carries no target to guard
        { condition: { storeId: { target: { status: "open" } } } }
      );
    };

    expect(examples).toBeDefined();
  });

  it("TSDoc: write conditions on the write methods", () => {
    const examples = async (orderDate: Date): Promise<void> => {
      // DynaRecord.create
      await Order.create(
        {
          orderDate,
          total: 40,
          status: "pending",
          customerId: "customer-1",
          storeId: "store-1"
        },
        {
          condition: {
            customer: { status: "active" },
            storeId: { target: { status: "open" } }
          }
        }
      );

      // static DynaRecord.update
      await Order.update(
        "order-1",
        { status: "cancelled" },
        { condition: { status: "pending", customer: { status: "active" } } }
      );

      // instance DynaRecord.update
      const order = await Order.findById("order-1");
      if (order !== undefined) {
        const cancelled = await order.update(
          { status: "cancelled" },
          { condition: { status: "pending" } }
        );
        expect(cancelled).toBeDefined();
      }

      // DynaRecord.delete
      await Order.delete("order-1", { condition: { status: "pending" } });

      // JoinTable.create
      await CustomerStore.create({
        customerId: "customer-1",
        storeId: "store-1"
      });
      await CustomerStore.create(
        { customerId: "customer-1", storeId: "store-1" },
        {
          condition: {
            customerId: { target: { status: "active" } },
            storeId: { target: { status: "open" } }
          }
        }
      );

      // JoinTable.delete
      await CustomerStore.delete({
        customerId: "customer-1",
        storeId: "store-1"
      });
      await CustomerStore.delete(
        { customerId: "customer-1", storeId: "store-1" },
        { condition: { storeId: { target: { status: "open" } } } }
      );
    };

    expect(examples).toBeDefined();
  });

  it("TSDoc: the write-condition types", () => {
    // TargetCondition
    const customer: TargetCondition<Customer> = {
      $or: [{ name: "Jane" }, { name: { $beginsWith: "J" } }]
    };

    // RelatedEntityCondition
    const order: RelatedEntityCondition<Order> = {
      id: "order-1",
      condition: { total: { $lt: 100 } }
    };

    // ForeignKeyTargetGuard
    const paymentMethod: WriteCondition<PaymentMethod> = {
      customerId: { target: { name: "Jane" } }
    };
    const guard: ForeignKeyTargetGuard<Customer> = { target: { name: "Jane" } };

    // WriteCondition
    const update: WriteCondition<Order> = {
      total: { $lt: 100 },
      customer: { name: "Jane" }
    };
    const remove: WriteCondition<Customer> = {
      orders: [
        {
          id: "order-1",
          condition: { orderDate: { $lt: new Date("2026-01-01") } }
        }
      ]
    };

    // CreateCondition
    const create: CreateCondition<Order> = { customer: { name: "Jane" } };

    // JoinTableCondition
    const link: JoinTableCondition<CustomerStore> = {
      storeId: { target: { "address.city": "Springfield" } }
    };

    expect([
      customer,
      order,
      paymentMethod,
      guard,
      update,
      remove,
      create,
      link
    ]).toHaveLength(8);
  });
});
