import {
  Author,
  Book,
  Customer,
  ContactInformation,
  Employee,
  Founder,
  MockTable,
  MyClassWithAllAttributeTypes,
  Order,
  Organization,
  PaymentMethod,
  Profile,
  StudentCourse
} from "../integration/mockModels.js";
import { JoinTable } from "../../src/relationships/index.js";
import type {
  JoinTableCondition,
  JoinTableCreateOptions,
  JoinTableDeleteOptions
} from "../../src/relationships/JoinTable.js";
import type {
  CreateCondition,
  WriteCondition
} from "../../src/operations/WriteCondition/index.js";
import type { CreateOperationOptions } from "../../src/operations/Create/index.js";
import type { UpdateOperationOptions } from "../../src/operations/Update/index.js";
import type { DeleteOperationOptions } from "../../src/operations/Delete/index.js";
import type { ForeignKey } from "../../src/types.js";

/**
 * The write-condition key sets stay closed, and each key takes exactly the
 * shape its role allows.
 *
 * A write condition is one object whose keys play three roles: the entity's
 * own attributes, its relationships by property name, and its foreign keys,
 * which may guard the row they reference through a `target` wrapper. Every
 * role is derived from the entity's declared types, so this file asks the
 * same questions of every shape that changes the derivation: is the right key
 * offered, does it take the right value, and is everything else refused.
 *
 * ## Why typed object literals, and not the write methods
 *
 * The option types are named and exported, and an object literal assigned to
 * one is checked for excess properties exactly as a call argument is. The
 * assertions here hold against the types themselves, whichever method
 * signature later carries them.
 *
 * ## Why local entities
 *
 * The shared models declare every foreign key with its target type, except
 * the join tables. The entities below fill the gaps: a BelongsTo whose foreign
 * key is bare, and a join table whose foreign keys are typed. They are
 * type-only — never decorated or registered — because nothing here runs.
 *
 * ## What is enforced at run time only, by design
 *
 * Some rules depend on values the types cannot see, so no case here covers
 * them. Each is a `FilterError` thrown before anything is sent:
 *
 * - An `undefined` operand, which would otherwise drop a condition and loosen
 *   the guard — the write-condition filter context (U1). An optional key also
 *   types as `undefined`, so the type cannot refuse it.
 * - An empty `$or` — the write-condition filter context (U1). An empty array
 *   types the same as a full one.
 * - The same guard listed twice, and a guard whose target the caller's own
 *   payload rules out — the condition compiler (U4). Both depend on ids and
 *   payload values.
 * - A target missing from stored state fails the write with the
 *   consumer-condition error rather than a `FilterError`, also in U4.
 */

/** True only for `any`: nothing else absorbs an intersection this way. */
type IsAny<T> = 0 extends 1 & T ? true : false;

/**
 * Compiles only when `T` is `true`.
 *
 * The unused-looking parameter is what puts `T` in a value position, the same
 * shape `assertExact` uses in `types.test.ts`. Callers never pass an argument.
 */
const assertNotAny = <T extends true>(_assertion?: T): void => {};

/**
 * An Order whose BelongsTo is backed by a foreign key declared without its
 * target type, so nothing at compile time links `customerId` to Customer.
 */
class LooseOrder extends MockTable {
  declare readonly type: "LooseOrder";
  declare readonly total: number;
  declare readonly customerId: ForeignKey;
  declare readonly customer: Customer;
}

/**
 * An entity with a HasOne to PaymentMethod and, separately, a typed foreign key
 * to PaymentMethod that backs no BelongsTo.
 *
 * The types tell a BelongsTo from a HasOne only by whether a typed foreign key
 * to the same entity exists, and here one does, so `paymentMethod` reads as a
 * BelongsTo backed by `backupPaymentMethodId`. That misclassification is a
 * known limit of the type-level derivation: the condition compiler (U4) reads
 * the relationship metadata and throws a `FilterError` for both shapes the
 * types get wrong.
 */
class Kiosk extends MockTable {
  declare readonly type: "Kiosk";
  declare readonly backupPaymentMethodId: ForeignKey<PaymentMethod>;
  declare readonly paymentMethod: PaymentMethod;
}

/** A join table whose foreign keys carry their target types. */
class TypedAuthorBook extends JoinTable<Author, Book> {
  declare readonly authorId: ForeignKey<Author>;
  declare readonly bookId: ForeignKey<Book>;
}

describe("write condition key closure", () => {
  it("offers a real condition type for every shape", () => {
    expect.assertions(1);

    assertNotAny<
      IsAny<WriteCondition<MyClassWithAllAttributeTypes>> extends false
        ? true
        : false
    >();
    assertNotAny<
      IsAny<WriteCondition<Customer>> extends false ? true : false
    >();
    assertNotAny<IsAny<CreateCondition<Order>> extends false ? true : false>();
    assertNotAny<
      IsAny<JoinTableCondition<TypedAuthorBook>> extends false ? true : false
    >();

    expect(assertNotAny).toBeDefined();
  });

  describe("a self condition", () => {
    it("accepts every attribute kind with each operator it allows", () => {
      const condition: WriteCondition<MyClassWithAllAttributeTypes> = {
        stringAttribute: { $beginsWith: "a" },
        dateAttribute: { $gte: new Date("2026-01-01") },
        boolAttribute: true,
        numberAttribute: { $between: [1, 10] },
        enumAttribute: ["val-1", "val-2"],
        foreignKeyAttribute: "customer-1",
        "objectAttribute.name": { $contains: "Jane" },
        "objectAttribute.tags": { $contains: "vip" },
        "addressAttribute.geo.lat": { $lt: 41 },
        "addressAttribute.scores[0]": 5,
        $or: [
          { nullableStringAttribute: "a" },
          { nullableNumberAttribute: { $gt: 1 } }
        ]
      };

      expect(condition).toBeDefined();
    });

    it("accepts null on a nullable attribute, at any depth and inside $or", () => {
      const condition: WriteCondition<MyClassWithAllAttributeTypes> = {
        nullableStringAttribute: null,
        nullableDateAttribute: null,
        nullableBoolAttribute: null,
        nullableNumberAttribute: null,
        nullableEnumAttribute: null,
        nullableForeignKeyAttribute: null,
        "addressAttribute.zip": null,
        "objectAttribute.deletedAt": null,
        $or: [{ "addressAttribute.category": null }, { stringAttribute: "a" }]
      };

      expect(condition).toBeDefined();
    });

    it("refuses an attribute the entity does not declare", () => {
      const condition: WriteCondition<Order> = {
        // @ts-expect-error: name is a Customer attribute, not an Order one
        name: "Jane"
      };

      expect(condition).toBeDefined();
    });

    it("refuses type, which the write already fixes", () => {
      const condition: WriteCondition<Order> = {
        // @ts-expect-error: type is not a condition key
        type: "Order"
      };

      expect(condition).toBeDefined();
    });

    it("refuses an operator the attribute cannot take", () => {
      const condition: WriteCondition<MyClassWithAllAttributeTypes> = {
        // @ts-expect-error: a boolean has no prefix
        boolAttribute: { $beginsWith: "t" },
        // @ts-expect-error: a number has no substring
        numberAttribute: { $contains: 1 }
      };

      expect(condition).toBeDefined();
    });

    it("refuses null inside an IN array, nullable attribute or not", () => {
      const condition: WriteCondition<MyClassWithAllAttributeTypes> = {
        // @ts-expect-error: an IN list holds values; null is not one
        enumAttribute: ["val-1", null],
        // @ts-expect-error: null means "not set", which IN cannot express
        nullableEnumAttribute: ["val-1", null]
      };

      expect(condition).toBeDefined();
    });

    it("refuses null on a non-nullable attribute, at any depth", () => {
      const condition: WriteCondition<MyClassWithAllAttributeTypes> = {
        // @ts-expect-error: stringAttribute is not nullable
        stringAttribute: null,
        // @ts-expect-error: city is not nullable
        "addressAttribute.city": null,
        // @ts-expect-error: foreignKeyAttribute is not nullable
        $or: [{ foreignKeyAttribute: null }]
      };

      expect(condition).toBeDefined();
    });
  });

  describe("a relationship condition", () => {
    it("takes a target condition on a BelongsTo and a HasOne", () => {
      const order: WriteCondition<Order> = {
        customer: { name: "Jane", $or: [{ address: "A" }, { address: "B" }] },
        paymentMethod: { lastFour: { $beginsWith: "4" } }
      };
      const customer: WriteCondition<Customer> = {
        contactInformation: { phone: null, email: { $contains: "@" } }
      };

      expect(order).toBeDefined();
      expect(customer).toBeDefined();
    });

    it("takes an empty target condition, which requires the target to exist", () => {
      const condition: WriteCondition<Order> = { customer: {} };

      expect(condition).toBeDefined();
    });

    it("takes { id, condition } entries on a HasMany and a HasAndBelongsToMany", () => {
      const customer: WriteCondition<Customer> = {
        orders: [
          { id: "order-1", condition: { orderDate: { $gte: new Date() } } },
          { id: "order-2", condition: {} }
        ]
      };
      const book: WriteCondition<Book> = {
        authors: [{ id: "author-1", condition: { name: "Jane" } }]
      };

      expect(customer).toBeDefined();
      expect(book).toBeDefined();
    });

    it("refuses a relationship key inside $or (AE6)", () => {
      const condition: WriteCondition<Order> = {
        $or: [
          { orderDate: new Date() },
          // @ts-expect-error: $or branches take the entity's own attributes only
          { customer: { name: "Jane" } }
        ]
      };

      expect(condition).toBeDefined();
    });

    it("refuses { id, condition } on a single-valued relationship", () => {
      const condition: WriteCondition<Order> = {
        // @ts-expect-error: the library resolves a BelongsTo target itself
        customer: { id: "customer-1", condition: { name: "Jane" } }
      };

      expect(condition).toBeDefined();
    });

    it("refuses a plain condition on an array relationship", () => {
      const condition: WriteCondition<Customer> = {
        // @ts-expect-error: a HasMany takes { id, condition } entries
        orders: { orderDate: new Date() }
      };

      expect(condition).toBeDefined();
    });

    it("takes { id, condition } entries on the parent side of a one-way HasMany", () => {
      const condition: WriteCondition<Organization> = {
        employees: [{ id: "employee-1", condition: { name: "Jane" } }],
        founders: [{ id: "founder-1", condition: {} }]
      };

      expect(condition).toBeDefined();
    });

    it("refuses a malformed { id, condition } entry", () => {
      const condition: WriteCondition<Customer> = {
        orders: [
          // @ts-expect-error: the entry names its related entity by id
          { condition: {} },
          // @ts-expect-error: the entry carries the condition to check
          { id: "order-2" },
          // @ts-expect-error: an entry holds id and condition only
          { id: "order-3", condition: {}, orderDate: new Date() }
        ]
      };

      expect(condition).toBeDefined();
    });

    it("refuses a relationship key inside a target condition", () => {
      const order: WriteCondition<Order> = {
        // @ts-expect-error: a target condition names the related row's own attributes
        customer: { orders: [{ id: "order-1", condition: {} }] }
      };
      const customer: WriteCondition<Customer> = {
        orders: [
          // @ts-expect-error: nor the related entity's own relationships
          { id: "order-1", condition: { paymentMethod: {} } }
        ]
      };

      expect(order).toBeDefined();
      expect(customer).toBeDefined();
    });

    it("refuses a target guard inside a target condition", () => {
      const condition: WriteCondition<Organization> = {
        founders: [
          {
            id: "founder-1",
            // @ts-expect-error: the related row's foreign key takes its own value only
            condition: { organizationId: { target: { name: "Acme" } } }
          }
        ]
      };

      expect(condition).toBeDefined();
    });

    it("refuses an attribute the related entity does not declare", () => {
      const condition: WriteCondition<Order> = {
        // @ts-expect-error: orderDate is an Order attribute, not a Customer one
        customer: { orderDate: new Date() }
      };

      expect(condition).toBeDefined();
    });
  });

  describe("a foreign key target guard", () => {
    it("takes target on a typed standalone foreign key", () => {
      const all: WriteCondition<MyClassWithAllAttributeTypes> = {
        foreignKeyAttribute: { target: { name: "Jane" } },
        nullableForeignKeyAttribute: { target: {} }
      };
      const profile: WriteCondition<Profile> = {
        userId: { target: { name: { $beginsWith: "J" } } }
      };

      expect(all).toBeDefined();
      expect(profile).toBeDefined();
    });

    it("takes target on the child side of a one-way HasMany", () => {
      const founder: WriteCondition<Founder> = {
        organizationId: { target: { name: "Acme" } }
      };
      const employee: WriteCondition<Employee> = {
        organizationId: { target: { name: "Acme" } }
      };

      expect(founder).toBeDefined();
      expect(employee).toBeDefined();
    });

    it("keeps a value condition on the key, with the guard's value in $or", () => {
      const value: WriteCondition<Founder> = { organizationId: "org-1" };
      const both: WriteCondition<Founder> = {
        organizationId: { target: { name: "Acme" } },
        $or: [{ organizationId: "org-1" }, { name: "Jane" }]
      };

      expect(value).toBeDefined();
      expect(both).toBeDefined();
    });

    it("refuses target on a bare foreign key (AE18)", () => {
      const condition: WriteCondition<LooseOrder> = {
        // @ts-expect-error: customerId needs its target type to guard it
        customerId: { target: { name: "Jane" } }
      };

      expect(condition).toBeDefined();
    });

    it("refuses target on a foreign key backing a BelongsTo", () => {
      const condition: WriteCondition<Order> = {
        // @ts-expect-error: guard the Customer under the customer key
        customerId: { target: { name: "Jane" } }
      };

      expect(condition).toBeDefined();
    });

    it("refuses a value condition and target on the same key", () => {
      const condition: WriteCondition<Founder> = {
        // @ts-expect-error: a value condition alongside a guard goes in $or
        organizationId: { target: { name: "Acme" }, $beginsWith: "org" }
      };

      expect(condition).toBeDefined();
    });

    it("refuses a target attribute the referenced entity does not declare", () => {
      const condition: WriteCondition<Founder> = {
        // @ts-expect-error: lastFour is a PaymentMethod attribute
        organizationId: { target: { lastFour: "1234" } }
      };

      expect(condition).toBeDefined();
    });

    it("misclassifies a typed foreign key beside a HasOne to the same entity", () => {
      const condition: WriteCondition<Kiosk> = {
        // @ts-expect-error: known limit — read as backing a BelongsTo; U4 decides at run time
        backupPaymentMethodId: { target: { lastFour: "1234" } }
      };

      expect(condition).toBeDefined();
    });

    it("refuses target inside $or", () => {
      const condition: WriteCondition<Founder> = {
        // @ts-expect-error: $or branches hold conditions on this row only
        $or: [{ organizationId: { target: { name: "Acme" } } }]
      };

      expect(condition).toBeDefined();
    });
  });

  describe("a create condition", () => {
    it("takes BelongsTo keys backed by a typed foreign key", () => {
      const order: CreateCondition<Order> = {
        customer: { name: "Jane" },
        paymentMethod: {}
      };
      const contact: CreateCondition<ContactInformation> = {
        customer: { name: { $beginsWith: "J" } }
      };

      expect(order).toBeDefined();
      expect(contact).toBeDefined();
    });

    it("takes target on typed OwnedBy and standalone foreign keys", () => {
      const founder: CreateCondition<Founder> = {
        organizationId: { target: { name: "Acme" } }
      };
      const profile: CreateCondition<Profile> = {
        userId: { target: {} }
      };

      expect(founder).toBeDefined();
      expect(profile).toBeDefined();
    });

    it("refuses any condition on the entity's own row", () => {
      const order: CreateCondition<Order> = {
        // @ts-expect-error: create already requires the row to be absent
        orderDate: new Date()
      };
      const founder: CreateCondition<Founder> = {
        // @ts-expect-error: a value condition on the new row's own key
        organizationId: "org-1"
      };
      const or: CreateCondition<Order> = {
        // @ts-expect-error: $or holds conditions on the new row
        $or: [{ orderDate: new Date() }]
      };

      expect(order).toBeDefined();
      expect(founder).toBeDefined();
      expect(or).toBeDefined();
    });

    it("refuses HasOne, HasMany and HasAndBelongsToMany keys", () => {
      const hasOne: CreateCondition<Customer> = {
        // @ts-expect-error: a new entity has no HasOne child yet
        contactInformation: {}
      };
      const hasMany: CreateCondition<Customer> = {
        // @ts-expect-error: a new entity has no HasMany children yet
        orders: [{ id: "order-1", condition: {} }]
      };
      const habtm: CreateCondition<Book> = {
        // @ts-expect-error: a new entity has no link partners yet
        authors: [{ id: "author-1", condition: {} }]
      };

      expect(hasOne).toBeDefined();
      expect(hasMany).toBeDefined();
      expect(habtm).toBeDefined();
    });

    it("refuses the parent side of a one-way HasMany", () => {
      const condition: CreateCondition<Organization> = {
        // @ts-expect-error: a new entity has no HasMany children yet
        employees: [{ id: "employee-1", condition: {} }]
      };

      expect(condition).toBeDefined();
    });

    it("accepts a HasOne beside a typed foreign key to the same entity", () => {
      // Known limit: the HasOne reads as a BelongsTo backed by
      // backupPaymentMethodId, so the type accepts it. The condition compiler
      // (U4) refuses it at run time with a FilterError
      const condition: CreateCondition<Kiosk> = { paymentMethod: {} };

      expect(condition).toBeDefined();
    });

    it("refuses a BelongsTo whose foreign key is bare", () => {
      const condition: CreateCondition<LooseOrder> = {
        // @ts-expect-error: customerId needs its target type to guard it
        customer: { name: "Jane" }
      };

      expect(condition).toBeDefined();
    });

    it("refuses target on a foreign key backing a BelongsTo", () => {
      const condition: CreateCondition<Order> = {
        // @ts-expect-error: guard the Customer under the customer key
        customerId: { target: { name: "Jane" } }
      };

      expect(condition).toBeDefined();
    });
  });

  describe("a join table condition", () => {
    it("takes target on each typed foreign key, against its own entity", () => {
      const condition: JoinTableCondition<TypedAuthorBook> = {
        authorId: { target: { name: "Jane" } },
        bookId: { target: { numPages: { $gt: 100 } } }
      };

      expect(condition).toBeDefined();
    });

    it("refuses a target condition using the other entity's attributes", () => {
      const condition: JoinTableCondition<TypedAuthorBook> = {
        // @ts-expect-error: numPages is a Book attribute, and authorId is an Author
        authorId: { target: { numPages: 100 } }
      };

      expect(condition).toBeDefined();
    });

    it("refuses a value condition on the foreign key itself", () => {
      const condition: JoinTableCondition<TypedAuthorBook> = {
        // @ts-expect-error: a join table key takes a target guard only
        authorId: "author-1"
      };

      expect(condition).toBeDefined();
    });

    it("refuses target on a bare foreign key (AE18)", () => {
      const condition: JoinTableCondition<StudentCourse> = {
        // @ts-expect-error: courseId needs its target type to guard it
        courseId: { target: { name: "Algebra" } }
      };

      expect(condition).toBeDefined();
    });
  });

  describe("the options types", () => {
    it("carry the condition beside each write's existing options", () => {
      const create: CreateOperationOptions<Order> = {
        referentialIntegrityCheck: false,
        condition: { customer: { name: "Jane" } }
      };
      const update: UpdateOperationOptions<Order> = {
        forceEmbed: true,
        condition: { orderDate: { $lt: new Date() }, customer: {} }
      };
      const remove: DeleteOperationOptions<Customer> = {
        condition: { orders: [{ id: "order-1", condition: {} }] }
      };
      const joinCreate: JoinTableCreateOptions<TypedAuthorBook> = {
        referentialIntegrityCheck: true,
        condition: { bookId: { target: { name: "Dune" } } }
      };
      const joinDelete: JoinTableDeleteOptions<TypedAuthorBook> = {
        condition: { authorId: { target: {} } }
      };

      expect([create, update, remove, joinCreate, joinDelete]).toHaveLength(5);
    });

    it("type delete's condition as a write condition on the deleted entity", () => {
      const remove: DeleteOperationOptions<Customer> = {
        // @ts-expect-error: orderDate is an Order attribute, not a Customer one
        condition: { orderDate: new Date() }
      };

      expect(remove).toBeDefined();
    });

    it("refuses an option delete does not take", () => {
      const remove: DeleteOperationOptions<Customer> = {
        // @ts-expect-error: delete writes no foreign keys to check
        referentialIntegrityCheck: false
      };

      expect(remove).toBeDefined();
    });

    it("type create's condition as a create condition", () => {
      const create: CreateOperationOptions<Order> = {
        // @ts-expect-error: create takes no condition on its own row
        condition: { orderDate: new Date() }
      };

      expect(create).toBeDefined();
    });
  });
});
