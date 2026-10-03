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
  ForeignKeyAttribute,
  HasMany,
  BelongsTo
} from "../src/decorators/index.js";
import type {
  ObjectSchema,
  InferObjectSchema
} from "../src/decorators/index.js";
import type { PartitionKey, SortKey, ForeignKey } from "../src/types.js";

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
}

@Entity
class Customer extends DocsTable {
  declare readonly type: "Customer";

  @StringAttribute({ alias: "Name" })
  public readonly name: string;

  @HasMany(() => Order, { foreignKey: "customerId" })
  public readonly orders: Order[];
}

@Entity
class Store extends DocsTable {
  declare readonly type: "Store";

  @StringAttribute({ alias: "Name" })
  public readonly name: string;

  @ObjectAttribute({ alias: "Address", schema: addressSchema })
  public readonly address: InferObjectSchema<typeof addressSchema>;
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
});
