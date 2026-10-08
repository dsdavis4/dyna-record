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
  HasOne,
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
  ConditionalCheckFailedError,
  type WriteConditionGuard
} from "../src/dynamo-utils/errors.js";
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
import type {
  CreateOperationOptions,
  DeleteOperationOptions,
  EntityAttributesInstance,
  ExtractEntityFromSK,
  SKScopedFilterParams,
  TypedFilterParams,
  UpdateOperationOptions
} from "../src/operations/index.js";

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
      fields: {
        name: { type: "string" },
        phone: { type: "string", nullable: true }
      }
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

  @HasOne(() => ContactInformation, { foreignKey: "customerId" })
  public readonly contactInformation: ContactInformation;

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

@Entity
class ContactInformation extends DocsTable {
  declare readonly type: "ContactInformation";

  @StringAttribute({ alias: "Email" })
  public readonly email: string;

  @ForeignKeyAttribute(() => Customer, { alias: "CustomerId" })
  public readonly customerId: ForeignKey<Customer>;

  @BelongsTo(() => Customer, { foreignKey: "customerId" })
  public readonly customer: Customer;
}

@Entity
class Product extends DocsTable {
  declare readonly type: "Product";

  @StringAttribute({ alias: "Description" })
  public readonly description: string;
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

  it("README: null in whole values", () => {
    const examples = async (): Promise<void> => {
      // "The Store whose first contact is Jane, with no phone"
      await Store.query("123", {
        filter: { "address.contacts[0]": { name: "Jane", phone: null } }
      });

      // "A Store with a contact named Jane who has no phone"
      const result = await Store.query("123", {
        filter: {
          "address.contacts": { $contains: { name: "Jane", phone: null } }
        }
      });
      expect(result).toBeDefined();

      // "null is offered only on a field declared nullable"
      // @ts-expect-error name is not nullable, so it is never "not set"
      await Store.query("123", {
        filter: { "address.contacts[0]": { name: null, phone: null } }
      });
    };

    expect(examples).toBeDefined();
  });

  it("README: enum ranges", () => {
    const examples = async (): Promise<void> => {
      // "a range on one takes any two of its members as bounds"
      await Order.query("123", {
        filter: { status: { $between: ["cancelled", "pending"] } }
      });

      // "A bound outside the enum is a compile error"
      // @ts-expect-error refunded is not a member of the enum
      await Order.query("123", {
        filter: { status: { $between: ["cancelled", "refunded"] } }
      });
    };

    expect(examples).toBeDefined();
  });

  it("README: sort key return type narrowing", () => {
    const examples = async (): Promise<void> => {
      // skCondition narrows the return type
      const orders = await Customer.query("123", { skCondition: "Order" });
      // orders is Array<EntityAttributesInstance<Order>>

      const orders2 = await Customer.query("123", {
        skCondition: { $beginsWith: "Order" }
      });
      // orders2 is Array<EntityAttributesInstance<Order>>

      // A value that runs past the entity name does not narrow
      const specific = await Customer.query("123", {
        skCondition: "Order#123"
      });
      // specific is QueryResults<Customer> (full union)

      const fromPrefix = await Customer.query("123", {
        skCondition: { $beginsWith: "Order#" }
      });
      // fromPrefix is QueryResults<Customer> (full union)

      const narrowed: Array<EntityAttributesInstance<Order>> = orders;
      const narrowed2: Array<EntityAttributesInstance<Order>> = orders2;
      // @ts-expect-error a value past the entity name does not narrow
      const notNarrowed: Array<EntityAttributesInstance<Order>> = specific;
      // @ts-expect-error a prefix past the entity name does not narrow
      const notNarrowed2: Array<EntityAttributesInstance<Order>> = fromPrefix;

      expect([narrowed, narrowed2, notNarrowed, notNarrowed2]).toHaveLength(4);
    };

    expect(examples).toBeDefined();
  });

  it("README: reusing a filter", () => {
    const examples = async (): Promise<void> => {
      // satisfies checks the filter and keeps its literal type
      const ordersIn2026 = {
        type: "Order",
        orderDate: { $beginsWith: "2026" }
      } satisfies TypedFilterParams<Customer>;

      const orders = await Customer.query("123", { filter: ordersIn2026 });
      // orders is Array<EntityAttributesInstance<Order>>

      // An annotated parameter is accepted, but widens the filter
      async function customerRecords(filter: TypedFilterParams<Customer>) {
        return await Customer.query("123", { filter });
      }

      const results = await customerRecords({ type: "Order" });
      // results is QueryResults<Customer> (full union)

      const narrowed: Array<EntityAttributesInstance<Order>> = orders;
      // @ts-expect-error the annotation widens the filter, so nothing narrows
      const widened: Array<EntityAttributesInstance<Order>> = results;

      // "satisfies also keeps every check a literal gets"
      const undeclared = {
        // @ts-expect-error region is not an attribute of the partition
        region: "west"
      } satisfies TypedFilterParams<Customer>;

      expect([narrowed, widened, undeclared]).toHaveLength(3);
    };

    expect(examples).toBeDefined();
  });

  it("README: reusing a filter beside an skCondition", () => {
    const examples = async (): Promise<void> => {
      async function ordersFor(
        customerId: string,
        filter: SKScopedFilterParams<Customer, "Order">
      ) {
        // The skCondition narrows the results to Order
        return await Customer.query(customerId, {
          skCondition: "Order",
          filter
        });
      }

      await ordersFor("123", { orderDate: { $beginsWith: "2026" } });

      // "A partition-wide TypedFilterParams<T> is refused there"
      async function refused(filter: TypedFilterParams<Customer>) {
        // @ts-expect-error the partition-wide filter offers keys no Order row has
        return await Customer.query("123", { skCondition: "Order", filter });
      }

      expect(refused).toBeDefined();
    };

    expect(examples).toBeDefined();
  });

  it("README: a nullable field inside a list element", () => {
    const examples = async (): Promise<void> => {
      // Replaces the contacts; the second is stored without a phone
      await Store.update("123", {
        address: {
          contacts: [
            { name: "Jane", phone: "555-0100" },
            { name: "Sam", phone: null }
          ]
        }
      });

      // "create takes no null: a nullable field is omitted on create"
      await Store.create({
        name: "Main Street",
        status: "open",
        address: {
          street: "1 Main St",
          city: "Springfield",
          tags: [],
          // @ts-expect-error a nullable field is omitted on create, not nulled
          contacts: [{ name: "Sam", phone: null }],
          geo: { lat: 40 }
        }
      });
    };

    expect(examples).toBeDefined();
  });

  it("README: write conditions on dot paths and list elements", () => {
    const examples = async (): Promise<void> => {
      // Close a Store only while it is in Springfield and its first contact is Jane
      await Store.update(
        "store-1",
        { status: "closed" },
        {
          condition: {
            "address.city": "Springfield",
            "address.contacts[0].name": "Jane"
          }
        }
      );

      // Close a Store only while its first contact is Jane, with no phone
      await Store.update(
        "store-1",
        { status: "closed" },
        { condition: { "address.contacts[0]": { name: "Jane", phone: null } } }
      );
    };

    expect(examples).toBeDefined();
  });

  it("TSDoc: DynaRecord.query reusing a filter", () => {
    const examples = async (): Promise<void> => {
      // @example Reusing a filter: satisfies keeps narrowing, an annotation widens
      const ordersIn2026 = {
        type: "Order",
        orderDate: { $gte: new Date("2026-01-01") }
      } satisfies TypedFilterParams<Customer>;

      const orders = await Customer.query("123", { filter: ordersIn2026 });
      // orders is Array<EntityAttributesInstance<Order>>

      async function customerRecords(filter: TypedFilterParams<Customer>) {
        // Accepted, but the annotation widens the filter: QueryResults<Customer>
        return await Customer.query("123", { filter });
      }

      const narrowed: Array<EntityAttributesInstance<Order>> = orders;
      const results = await customerRecords({ type: "Order" });
      // @ts-expect-error the annotation widens the filter
      const widened: Array<EntityAttributesInstance<Order>> = results;
      expect([narrowed, widened]).toHaveLength(2);
    };

    expect(examples).toBeDefined();
  });

  it("TSDoc: DynaRecord.query and SKScopedFilterParams beside an skCondition", () => {
    const examples = async (): Promise<void> => {
      // @example Reusing a filter beside an skCondition that names an entity
      async function ordersFor(
        customerId: string,
        filter: SKScopedFilterParams<Customer, "Order">
      ) {
        // Array<EntityAttributesInstance<Order>>
        return await Customer.query(customerId, {
          skCondition: "Order",
          filter
        });
      }

      await ordersFor("123", { orderDate: { $gte: new Date("2026-01-01") } });

      // SKScopedFilterParams: "A filter scoped to Order cannot name a
      // ContactInformation attribute"
      // @ts-expect-error email is a ContactInformation attribute
      await ordersFor("123", { email: "jane@example.com" }); // Compile error

      const narrowed: Array<EntityAttributesInstance<Order>> = await ordersFor(
        "123",
        {}
      );
      expect(narrowed).toBeDefined();
    };

    expect(examples).toBeDefined();
  });

  it("TSDoc: DynaRecord.query with a prefix past the entity name", () => {
    const examples = async (): Promise<void> => {
      // @example A prefix past the entity name does not narrow
      const results = await Customer.query("123", {
        skCondition: { $beginsWith: "Order#" }
      });
      // results is QueryResults<Customer> — the types cannot see the delimiter

      // @ts-expect-error the prefix runs past the entity name, so nothing narrows
      const notNarrowed: Array<EntityAttributesInstance<Order>> = results;
      expect(notNarrowed).toBeDefined();
    };

    expect(examples).toBeDefined();
  });

  it("TSDoc: TypedFilterParams", () => {
    const examples = async (): Promise<void> => {
      // @example Reuse a filter with satisfies to keep narrowing
      const ordersIn2026 = {
        type: "Order",
        orderDate: { $gte: new Date("2026-01-01") }
      } satisfies TypedFilterParams<Customer>;

      const orders = await Customer.query("123", { filter: ordersIn2026 });
      // orders is Array<EntityAttributesInstance<Order>>

      // @example An annotated parameter is accepted, but does not narrow
      async function customerRecords(filter: TypedFilterParams<Customer>) {
        // QueryResults<Customer>: the whole partition
        return await Customer.query("123", { filter });
      }

      const narrowed: Array<EntityAttributesInstance<Order>> = orders;
      expect([narrowed, customerRecords]).toHaveLength(2);
    };

    expect(examples).toBeDefined();
  });

  it("TSDoc: ExtractEntityFromSK", () => {
    type One = ExtractEntityFromSK<Customer, "Order">; // "Order"
    type Prefix = ExtractEntityFromSK<Customer, { $beginsWith: "C" }>; // "Customer" | "ContactInformation"
    type None = ExtractEntityFromSK<Customer, { $beginsWith: "Order#" }>; // never: no narrowing

    const one: One = "Order";
    const prefix: Array<Prefix> = ["Customer", "ContactInformation"];
    // @ts-expect-error Order is not among the names "C" starts
    const notPrefix: Prefix = "Order";
    // @ts-expect-error a prefix past the entity name narrows to no name
    const none: None = "Order";

    expect([one, prefix, notPrefix, none]).toHaveLength(4);
  });

  it("TSDoc: BetweenConditionFor on an enum", () => {
    const examples = async (): Promise<void> => {
      // An enum is stored as a string, so any two members bound a range,
      // ordered lexicographically
      await Order.query("123", {
        filter: { status: { $between: ["cancelled", "pending"] } }
      });

      // The same range composed from two comparisons
      await Order.query("123", {
        filter: { status: { $gte: "cancelled", $lte: "pending" } }
      });
    };

    expect(examples).toBeDefined();
  });

  it("TSDoc: DynaRecord.create", () => {
    const examples = async (): Promise<void> => {
      // @example Basic usage
      const customer = await Customer.create({
        name: "Jane Doe",
        status: "active"
      });

      // @example With relationships
      // Denormalizes the Order into its Customer's partition
      const order = await Order.create({
        orderDate: new Date("2026-10-06"),
        total: 40,
        status: "pending",
        customerId: "customer-1",
        storeId: "store-1"
      });

      // @example With referential integrity check disabled
      const unchecked = await Order.create(
        {
          orderDate: new Date("2026-10-06"),
          total: 40,
          status: "pending",
          customerId: "customer-1",
          storeId: "store-1"
        },
        { referentialIntegrityCheck: false }
      );

      // @example With a write condition on the rows the new entity references
      // Place an Order only for an active Customer at an open Store
      const guarded = await Order.create(
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

      expect([customer, order, unchecked, guarded]).toHaveLength(4);
    };

    expect(examples).toBeDefined();
  });

  it("TSDoc: static DynaRecord.update", () => {
    const examples = async (description: string): Promise<void> => {
      // @example Updating an entity
      await Customer.update("customer-1", {
        name: "Jane Smith",
        status: "suspended"
      });

      // @example Removing a nullable attribute
      await Customer.update("customer-1", { phone: null });

      // @example Changing a foreign key, with the referential integrity check disabled
      await Order.update(
        "order-1",
        { customerId: "customer-2" },
        { referentialIntegrityCheck: false }
      );

      // @example Partial update of an ObjectAttribute
      await Store.update("store-1", { address: { city: "Springfield" } });

      // @example Force a searchable entity to re-embed
      await Product.update("product-1", { description }, { forceEmbed: true });

      // @example With a write condition
      // Cancel an Order only while it is still pending and its Customer is active
      await Order.update(
        "order-1",
        { status: "cancelled" },
        { condition: { status: "pending", customer: { status: "active" } } }
      );

      // Ship an Order only if it has no tracking number yet: null means "not set"
      await Order.update(
        "order-1",
        { status: "shipped", trackingNumber: "1Z999" },
        { condition: { trackingNumber: null } }
      );
    };

    expect(examples).toBeDefined();
  });

  it("TSDoc: instance DynaRecord.update", () => {
    const examples = async (
      customer: Customer,
      store: Store,
      order: Order
    ): Promise<void> => {
      // @example Updating an entity
      const updated = await customer.update({ name: "Jane Smith" });

      // @example Removing a nullable attribute
      const removed = await customer.update({ phone: null });
      // updated.phone is undefined

      // @example Partial ObjectAttribute update with deep merge
      // store.address.city is "Springfield"
      const merged = await store.update({ address: { street: "456 Oak Ave" } });
      // updated.address.street is "456 Oak Ave"; updated.address.city is still "Springfield"

      // @example With referential integrity check disabled
      const unchecked = await order.update(
        { customerId: "customer-2" },
        { referentialIntegrityCheck: false }
      );

      // @example With a write condition
      const cancelled = await order.update(
        { status: "cancelled" },
        { condition: { status: "pending" } }
      );

      expect([updated, removed, merged, unchecked, cancelled]).toHaveLength(5);
    };

    expect(examples).toBeDefined();
  });

  it("TSDoc: DynaRecord.delete", () => {
    const examples = async (): Promise<void> => {
      // @example Delete an entity
      await Order.delete("order-1");

      // @example With a write condition
      // Delete an Order only while it is still pending and its Customer is active
      await Order.delete("order-1", {
        condition: { status: "pending", customer: { status: "active" } }
      });
    };

    expect(examples).toBeDefined();
  });

  it("TSDoc: the write options types", () => {
    const examples = async (): Promise<void> => {
      // CreateOperationOptions
      // Place an Order only for an active Customer at an open Store
      const createOptions: CreateOperationOptions<Order> = {
        condition: {
          customer: { status: "active" },
          storeId: { target: { status: "open" } }
        }
      };

      // UpdateOperationOptions
      // Cancel an Order only while it is still pending and its Customer is active
      const options: UpdateOperationOptions<Order> = {
        condition: { status: "pending", customer: { status: "active" } }
      };

      await Order.update("order-1", { status: "cancelled" }, options);

      // DeleteOperationOptions
      // Delete an Order only while it is still pending
      const deleteOptions: DeleteOperationOptions<Order> = {
        condition: { status: "pending" }
      };

      await Order.delete("order-1", deleteOptions);

      expect(createOptions).toBeDefined();
    };

    expect(examples).toBeDefined();
  });

  it("TSDoc: UpdateOptions", () => {
    const examples = async (): Promise<void> => {
      // @example
      await Customer.update("customer-1", {
        name: "Jane Smith", // Sets new value
        phone: null // Removes the value. A compile error if the attribute is not nullable
      });

      // "A compile error if the attribute is not nullable"
      // @ts-expect-error name is not nullable
      await Customer.update("customer-1", { name: null });

      // @example Partial ObjectAttribute update
      await Store.update("store-1", {
        address: { street: "456 Oak Ave" } // Only updates street, preserves other fields
      });

      // @example A nullable field inside a list element
      // Replaces the contacts; Sam's is stored without a phone
      await Store.update("store-1", {
        address: { contacts: [{ name: "Sam", phone: null }] }
      });
    };

    expect(examples).toBeDefined();
  });

  it("TSDoc: the write-condition error surfaces", () => {
    // UntypedForeignKeyTargetError
    class CustomerStore extends JoinTable<Customer, Store> {
      public readonly customerId: ForeignKey<Customer>;
      public readonly storeId: ForeignKey; // bare: no target type
    }

    const examples = async (): Promise<void> => {
      await CustomerStore.create(
        { customerId: "customer-1", storeId: "store-1" },
        // Compile error naming this surface: declare storeId as ForeignKey<Store>
        // @ts-expect-error a bare ForeignKey carries no target to guard
        { condition: { storeId: { target: { status: "open" } } } }
      );

      // BelongsToForeignKeyTargetError
      // Order declares customerId: ForeignKey<Customer> and a BelongsTo customer
      await Order.update(
        "order-1",
        { total: 90 },
        // Compile error naming this surface, with relationship: "customer"
        // @ts-expect-error customerId backs the customer relationship
        { condition: { customerId: { target: { status: "active" } } } }
      );

      // Guard the Customer under the relationship instead
      await Order.update(
        "order-1",
        { total: 90 },
        { condition: { customer: { status: "active" } } }
      );

      // CreateRelationshipConditionError
      // Customer declares @HasOne(() => ContactInformation, ...) contactInformation
      await Customer.create(
        { name: "Jane Doe", status: "active" },
        // Compile error naming this surface: a new Customer has no contact yet
        // @ts-expect-error a new Customer has no HasOne child to guard
        { condition: { contactInformation: { email: "jane@example.com" } } }
      );
    };

    expect(examples).toBeDefined();
  });

  it("TSDoc: the write-condition types, added examples", () => {
    const examples = async (): Promise<void> => {
      // TargetCondition
      // An active Customer with no phone on file
      const reachable: TargetCondition<Customer> = {
        status: "active",
        phone: null
      };

      // Any existing Customer
      const exists: TargetCondition<Customer> = {};

      // RelatedEntityCondition
      // Rename a Customer only while order-1 is theirs and still pending
      await Customer.update(
        "customer-1",
        { name: "Jane Smith" },
        {
          condition: {
            orders: [{ id: "order-1", condition: { status: "pending" } }]
          }
        }
      );

      // ForeignKeyTargetGuard
      // Order declares a standalone storeId: ForeignKey<Store>
      await Order.update(
        "order-1",
        { total: 90 },
        { condition: { storeId: { target: { status: "open" } } } }
      );

      // WriteCondition: @example Null means "not set", and $or stays within the written row
      // Ship an Order that has no tracking number yet, while it is pending or
      // under 50, and while its Store is open
      await Order.update(
        "order-1",
        { status: "shipped", trackingNumber: "1Z999" },
        {
          condition: {
            trackingNumber: null,
            $or: [{ status: "pending" }, { total: { $lt: 50 } }],
            storeId: { target: { status: "open" } }
          }
        }
      );

      // WriteCondition: @example Dot paths and list-index paths into an object attribute
      // Close a Store only while it is in Springfield and its first contact,
      // compared whole, is Jane with no phone
      await Store.update(
        "store-1",
        { status: "closed" },
        {
          condition: {
            "address.city": "Springfield",
            "address.contacts[0]": { name: "Jane", phone: null }
          }
        }
      );

      // CreateCondition
      // Place an Order only for an active Customer at an open Store
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

      expect([reachable, exists]).toHaveLength(2);
    };

    expect(examples).toBeDefined();
  });

  it("TSDoc: the error classes", () => {
    const examples = async (): Promise<void> => {
      // ConditionalCheckFailedError
      try {
        await Order.update("order-1", { total: 90 });
      } catch (error) {
        if (error instanceof TransactionWriteFailedError) {
          const libraryCheckFailed = error.errors.some(
            cause =>
              cause instanceof ConditionalCheckFailedError &&
              !(cause instanceof WriteConditionFailedError)
          );
          console.log(libraryCheckFailed);
        }
      }

      // WriteConditionFailedError
      try {
        await Order.update(
          "order-1",
          { status: "cancelled" },
          { condition: { status: "pending", customer: { status: "active" } } }
        );
      } catch (error) {
        if (error instanceof TransactionWriteFailedError) {
          for (const cause of error.errors) {
            if (cause instanceof WriteConditionFailedError) {
              // cause.entity === "Order", cause.id === "order-1", and cause.guards
              // names the failed row's guards: [{ kind: "self" }] or
              // [{ kind: "relationship", name: "customer" }]
              console.log(cause.entity, cause.id, cause.guards);
            }
          }
        }
        throw error;
      }
    };

    // WriteConditionGuard
    const guards: WriteConditionGuard[] = [
      { kind: "self" },
      { kind: "relationship", name: "customer" },
      { kind: "relationship", name: "orders", id: "order-1" },
      { kind: "foreignKey", name: "storeId" }
    ];

    expect(examples).toBeDefined();
    expect(guards).toHaveLength(4);
  });
});
