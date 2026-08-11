# Dyna-Record

[API Documentation](https://docs.dyna-record.com/)

[Medium Article](https://medium.com/@drewdavis888/unlock-relational-data-modeling-in-dynamodb-with-dyna-record-5b9cce27c3ce)

Dyna-Record is a strongly typed Data Modeler and ORM (Object-Relational Mapping) tool designed for modeling and interacting with data stored in DynamoDB in a structured and type-safe manner. It simplifies the process of defining data models (entities), performing CRUD operations, and handling complex queries. To support relational data, dyna-record implements a flavor of the [single-table design pattern](https://aws.amazon.com/blogs/compute/creating-a-single-table-design-with-amazon-dynamodb/) and the [adjacency list design pattern](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-adjacency-graphs.html). All operations are [ACID compliant transactions\*](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html)\. To enforce data integrity beyond the type system, schema validation is performed at runtime.

Note: ACID compliant according to DynamoDB [limitations](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html)

## Table of Contents

- [Getting Started](#getting-started)
  - [Installation](#installation)
  - [Configuration](#configuration)
- [Defining Entities](#defining-entities)
  - [Entity inheritance and shared base classes](#entity-inheritance-and-shared-base-classes)
  - [Attributes](#attributes)
  - [Relationships](#relationships)
- [CRUD Operations](#crud-operations)
  - [Create](#create)
  - [FindById](#findbyid)
  - [Query](#query)
    - [Filtering on Object Attributes](#filtering-on-object-attributes)
    - [Typed Query Filters](#typed-query-filters)
  - [Update](#update)
    - [Updating Object Attributes](#updating-object-attributes)
  - [Delete](#delete)
- [Vector Search](#vector-search)
  - [Declaring searchable entities](#declaring-searchable-entities)
  - [Defining a vector index](#defining-a-vector-index)
  - [How writes embed](#how-writes-embed)
  - [Searching](#searching)
  - [Filters, scoping, and tenant isolation](#filters-scoping-and-tenant-isolation)
  - [Provisioning](#provisioning)
  - [Permissions and networking](#permissions-and-networking)
  - [Cost model](#cost-model)
- [Type Safety Features](#type-safety-features)
- [Best Practices](#best-practices)
- [Debug Logging](#debug-logging)

## Getting Started

### Installation

Requires Node.js `>=22` and TypeScript `>=6`.

```bash
npm install dyna-record
# or
yarn add dyna-record
# or
pnpm add dyna-record
```

dyna-record is **ESM-only** as of 0.7.0:

```ts
// ESM
import DynaRecord, { Entity, Table } from "dyna-record";
```

If your project is still on CommonJS, use a dynamic import:

```js
// CommonJS (any modern Node) via dynamic import
const { default: DynaRecord, Entity, Table } = await import("dyna-record");
```

Direct `require("dyna-record")` only works on Node 22.12+ via Node's stabilized `require(esm)` and is not an officially supported contract — prefer dynamic `import()` for portability.

> dyna-record uses **TC39 Stage 3 decorators** (the TypeScript 5+/6 default). Do **not** enable `experimentalDecorators` in your `tsconfig.json`.

## Defining Entities

Entities in Dyna-Record represent your DynamoDB table structure and relationships. Think of each entity as a table in a relational database, even though they will be represented on a single table.

### Table

[Docs](https://docs.dyna-record.com/functions/Table.html)

Create a table class that extends [DynaRecord base class](https://docs.dyna-record.com/classes/default.html) and is decorated with the [Table decorator](https://docs.dyna-record.com/functions/Table.html). At a minimum, the table class must define the [PartitionKeyAttribute](https://docs.dyna-record.com/functions/PartitionKeyAttribute.html) and [SortKeyAttribute](https://docs.dyna-record.com/functions/SortKeyAttribute.html).

#### Basic usage

```typescript
import DynaRecord, {
  Table,
  PartitionKeyAttribute,
  SortKeyAttribute,
  PartitionKey,
  SortKey
} from "dyna-record";

@Table({ name: "my-table" })
abstract class MyTable extends DynaRecord {
  @PartitionKeyAttribute({ alias: "PK" })
  public readonly pk: PartitionKey;

  @SortKeyAttribute({ alias: "SK" })
  public readonly sk: SortKey;
}
```

#### Customizing the default field table aliases or delimiter

```typescript
import DynaRecord, {
  Table,
  PartitionKeyAttribute,
  SortKeyAttribute,
  PartitionKey,
  SortKey
} from "dyna-record";

@Table({
  name: "mock-table",
  delimiter: "|",
  defaultFields: {
    id: { alias: "Id" },
    type: { alias: "Type" },
    createdAt: { alias: "CreatedAt" },
    updatedAt: { alias: "UpdatedAt" }
  }
})
abstract class MyTable extends DynaRecord {
  @PartitionKeyAttribute({ alias: "PK" })
  public readonly pk: PartitionKey;

  @SortKeyAttribute({ alias: "SK" })
  public readonly sk: SortKey;
}
```

### Entity

[Docs](https://docs.dyna-record.com/functions/Entity.html)

Each entity must extend the Table class. To support single table design patterns, they must extend the same tables class.

Each entity **must** declare its `type` property as a string literal matching the class name. This enables compile-time type safety for query filters and return types. Omitting this declaration will produce a compile error at the `@Entity` decorator.

By default, each entity will have [default attributes](https://docs.dyna-record.com/types/_internal_.DefaultFields.html)

- The partition key defined on the [table](#table) class
- The sort key defined on the [table](#table) class
- [id](https://docs.dyna-record.com/classes/default.html#id) - The id for the model. This will be an autogenerated UUID (v4, via Node's built-in `crypto.randomUUID()`) unless [IdAttribute](<(https://docs.dyna-record.com/functions/IdAttribute.html)>) is set on a non-nullable entity attribute.
- [type](https://docs.dyna-record.com/classes/default.html#type) - The type of the entity. Value is the entity class name. Must be declared as a string literal via `declare readonly type: "ClassName"`.
- [createdAt](https://docs.dyna-record.com/classes/default.html#createdAt) - The timestamp of when the entity was created
- [updatedAt](https://docs.dyna-record.com/classes/default.html#updatedAt) - Timestamp of when the entity was updated last

```typescript
import { Entity } from "dyna-record";

@Entity
class Student extends MyTable {
  declare readonly type: "Student";
  // ...
}

@Entity
class Course extends MyTable {
  declare readonly type: "Course";
  // ...
}
```

> **Note:** `declare readonly type` is a pure TypeScript type annotation with zero runtime impact. The ORM sets `type` to the class name automatically. The declaration simply tells TypeScript the exact literal type, enabling typed query filters and return type narrowing.

#### Entity inheritance and shared base classes

Entities do not have to extend the table class directly. The `@Entity` decorator resolves an entity's table by walking the class hierarchy until it finds a class decorated with `@Table`, so shared attributes and relationships can live in an abstract base class between the table and the concrete entities:

```typescript
import {
  Entity,
  StringAttribute,
  NumberAttribute,
  BooleanAttribute
} from "dyna-record";

// Not decorated with @Entity — this class is never registered as an entity,
// never appears in table metadata, and no records of its own type exist
abstract class Vehicle extends MyTable {
  @StringAttribute({ alias: "Make" })
  public readonly make: string;

  @NumberAttribute({ alias: "Year" })
  public readonly year: number;
}

@Entity
class Car extends Vehicle {
  declare readonly type: "Car";

  @NumberAttribute({ alias: "Doors" })
  public readonly doors: number;
}

@Entity
class Motorcycle extends Vehicle {
  declare readonly type: "Motorcycle";

  @BooleanAttribute({ alias: "HasSidecar" })
  public readonly hasSidecar: boolean;
}
```

`Car` and `Motorcycle` are full entities of `MyTable`: each inherits `make` and `year` (including runtime schema validation for them), and all CRUD operations work as if the attributes were declared on the entity itself. The abstract base class is only a container for shared code — it cannot be queried or persisted.

A few things to keep in mind:

- If an entity class does not extend a class decorated with `@Table` anywhere in its hierarchy, the `@Entity` decorator throws at class definition time.
- Extending a **concrete** entity (e.g. `class Pickup extends Truck`) is supported at runtime, but TypeScript will not allow the subclass to narrow the inherited `type` literal (`"Pickup"` is not assignable to `"Truck"`). Prefer abstract base classes for shared attributes.
- There is no polymorphic querying: entities are stored and queried by their exact class name. Querying `Car` will never return `Motorcycle` records, even though they share a base class.
- A base class couples its subclasses to one table, since it must extend a specific table class. To share a shape across entities in different tables, use a TypeScript interface instead (each entity must still declare its own decorated attributes).

### Attributes

Use the attribute decorators below to define attributes on a model. The decorator maps class properties to DynamoDB table attributes.

- Attribute decorators

  - [@StringAttribute](https://docs.dyna-record.com/functions/StringAttribute.html)
  - [@NumberAttribute](https://docs.dyna-record.com/functions/NumberAttribute.html)
  - [@BooleanAttribute](https://docs.dyna-record.com/functions/BooleanAttribute.html)
  - [@DateAttribute](https://docs.dyna-record.com/functions/DateAttribute.html)
  - [@EnumAttribute](https://docs.dyna-record.com/functions/EnumAttribute.html)
  - [@IdAttribute](https://docs.dyna-record.com/functions/IdAttribute.html)
  - [@ObjectAttribute](https://docs.dyna-record.com/functions/ObjectAttribute.html)

- The [alias](https://docs.dyna-record.com/interfaces/AttributeOptions.html#alias) option allows you to specify the attribute name as it appears in the DynamoDB table, different from your class property name.
- Set nullable attributes as optional for optimal type safety
- Attempting to remove a non-nullable attribute will result in a [NullConstrainViolationError](https://docs.dyna-record.com/classes/NullConstraintViolationError.html)

```typescript
import { Entity, Attribute } from "dyna-record";

@Entity
class Student extends MyTable {
  declare readonly type: "Student";

  @StringAttribute({ alias: "Username" }) // Sets alias if field in Dynamo is different then on the model
  public username: string;

  @StringAttribute() // Dynamo field and entity field are the same
  public email: string;

  @NumberAttribute({ nullable: true })
  public someAttribute?: number; // Mark as optional
}
```

#### @ObjectAttribute

Use `@ObjectAttribute` to define structured, typed object attributes on an entity. Objects are validated at runtime and stored as native DynamoDB Map types.

Define the shape using an `ObjectSchema` and derive the TypeScript type with `InferObjectSchema`:

```typescript
import { Entity, ObjectAttribute } from "dyna-record";
import type { ObjectSchema, InferObjectSchema } from "dyna-record";

const addressSchema = {
  street: { type: "string" },
  city: { type: "string" },
  zip: { type: "number", nullable: true },
  tags: { type: "array", items: { type: "string" } },
  category: { type: "enum", values: ["home", "work", "other"] },
  createdDate: { type: "date" },
  geo: {
    type: "object",
    fields: {
      lat: { type: "number" },
      lng: { type: "number" }
    }
  }
} as const satisfies ObjectSchema;

@Entity
class Store extends MyTable {
  declare readonly type: "Store";

  @ObjectAttribute({ alias: "Address", schema: addressSchema })
  public readonly address: InferObjectSchema<typeof addressSchema>;
}
```

- **Supported field types:** `"string"`, `"number"`, `"boolean"`, `"date"` (stored as ISO strings, exposed as `Date` objects), `"enum"` (via `values`), nested `"object"` (via `fields`), `"array"` (via `items`), and `"discriminatedUnion"` (via `discriminator` + `variants`)
- **Nullable fields:** Set `nullable: true` on individual non-object fields within the schema to make them optional
- **Object attributes are never nullable:** DynamoDB cannot update nested document paths (e.g., `address.geo.lat`) if the parent object does not exist. To prevent this, `@ObjectAttribute` fields always exist as at least an empty object `{}`. Nested object fields within the schema are also never nullable. Non-object fields (primitives, enums, dates, arrays) can still be nullable.
- **Alias support:** Use the `alias` option to map to a different DynamoDB attribute name
- **Storage:** Objects are stored as native DynamoDB Map types
- **Partial updates:** Updates are partial — only the fields you provide are modified. Omitted fields are preserved. Nested objects are recursively merged. See [Updating Object Attributes](#updating-object-attributes)
- **Filtering:** Object attributes support dot-path filtering in queries — see [Filtering on Object Attributes](#filtering-on-object-attributes)

##### Enum fields

Use `{ type: "enum", values: [...] }` to define a field that only accepts specific string values. The TypeScript type is inferred as a union of the provided values, and invalid values are rejected at runtime via Zod validation.

Enum fields can appear at any nesting level — top-level, inside nested objects, or as array items:

```typescript
const schema = {
  // Top-level enum: inferred as "active" | "inactive"
  status: { type: "enum", values: ["active", "inactive"] },

  // Nullable enum: inferred as "home" | "work" | "other" | undefined
  category: { type: "enum", values: ["home", "work", "other"], nullable: true },

  // Enum inside a nested object
  geo: {
    type: "object",
    fields: {
      accuracy: { type: "enum", values: ["precise", "approximate"] }
    }
  },

  // Array of enum values: inferred as ("admin" | "user")[]
  roles: { type: "array", items: { type: "enum", values: ["admin", "user"] } }
} as const satisfies ObjectSchema;
```

The schema must be declared with `as const satisfies ObjectSchema` so TypeScript preserves the literal string values for type inference. At runtime, providing an invalid value (e.g., `status: "unknown"`) throws a `ValidationError`.

##### Discriminated union fields

Use `{ type: "discriminatedUnion", discriminator: "...", variants: { ... } }` to define a field that is a tagged union of object types. Each variant is an `ObjectSchema` keyed by its discriminator value. The discriminator key is automatically included in each variant's inferred type as a string literal.

```typescript
const drawingSchema = {
  shape: {
    type: "discriminatedUnion",
    discriminator: "kind",
    variants: {
      circle: { radius: { type: "number" } },
      square: { side: { type: "number" } }
    }
  }
} as const satisfies ObjectSchema;

@Entity
class Drawing extends MyTable {
  declare readonly type: "Drawing";

  @ObjectAttribute({ alias: "Drawing", schema: drawingSchema })
  public readonly drawing: InferObjectSchema<typeof drawingSchema>;
}

// TypeScript infers:
// drawing.shape → { kind: "circle"; radius: number } | { kind: "square"; side: number }
```

Unlike nested `"object"` fields, discriminated union fields **can be nullable** (`nullable: true`) because they always use **full replacement** on update rather than document path expressions:

```typescript
// Replaces the entire shape field — no partial merge
await Drawing.update("123", {
  drawing: { shape: { kind: "square", side: 10 } }
});
```

##### Arrays of discriminated unions

Discriminated unions can be used as array items. Each element in the array is validated and serialized using variant-aware logic:

```typescript
const dashboardSchema = {
  widgets: {
    type: "array",
    items: {
      type: "discriminatedUnion",
      discriminator: "type",
      variants: {
        "metric-card": {
          label: { type: "string" },
          value: { type: "number" }
        },
        chart: {
          title: { type: "string" },
          chartType: { type: "enum", values: ["bar", "line", "pie"] }
        }
      }
    }
  }
} as const satisfies ObjectSchema;

// TypeScript infers:
// dashboard.widgets → Array<
//   | { type: "metric-card"; label: string; value: number }
//   | { type: "chart"; title: string; chartType: "bar" | "line" | "pie" }
// >
```

Arrays of discriminated unions use **full replacement** on update (the entire array is replaced), consistent with all array fields.

**Scoping constraints:**

- Supported at the ObjectAttribute root level, as fields within an ObjectSchema, and as array items
- Not supported nested inside other discriminated unions

### Foreign Keys

Define foreign keys in order to support [@BelongsTo](https://docs.dyna-record.com/functions/BelongsTo.html) relationships. A foreign key is required for [@HasOne](https://docs.dyna-record.com/functions/HasOne.html) and [@HasMany](https://docs.dyna-record.com/functions/HasMany.html) relationships.

- The [alias](https://docs.dyna-record.com/interfaces/AttributeOptions.html#alias) option allows you to specify the attribute name as it appears in the DynamoDB table, different from your class property name.
- Set nullable foreign key attributes as optional for optimal type safety
- Attempting to remove an entity from a non-nullable foreign key will result in a [NullConstrainViolationError](https://docs.dyna-record.com/classes/NullConstraintViolationError.html)
- Always provide the referenced entity class to `@ForeignKeyAttribute` (for example `@ForeignKeyAttribute(() => Customer)`); this allows DynaRecord to enforce referential integrity even when no relationship decorator is defined.
- `Create` and `Update` automatically add DynamoDB condition checks for standalone foreign keys (those without a relationship decorator) to ensure the referenced entity exists, enabling referential integrity even when no denormalised access pattern is required.

```typescript
import {
  Entity,
  ForeignKeyAttribute,
  ForeignKey,
  NullableForeignKey,
  BelongsTo
} from "dyna-record";

@Entity
class Assignment extends MyTable {
  declare readonly type: "Assignment";

  @ForeignKeyAttribute(() => Course)
  public readonly courseId: ForeignKey<Course>;

  @BelongsTo(() => Course, { foreignKey: "courseId" })
  public readonly course: Course;
}

@Entity
class Course extends MyTable {
  declare readonly type: "Course";

  @ForeignKeyAttribute(() => Teacher, { nullable: true })
  public readonly teacherId?: NullableForeignKey<Teacher>; // Set as optional

  @BelongsTo(() => Teacher, { foreignKey: "teacherId" })
  public readonly teacher?: Teacher; // Set as optional because its linked through NullableForeignKey
}
```

### Relationships

Dyna-Record supports defining relationships between entities such as [@HasOne](https://docs.dyna-record.com/functions/HasOne.html), [@HasMany](https://docs.dyna-record.com/functions/HasMany.html), [@BelongsTo](https://docs.dyna-record.com/functions/BelongsTo.html) and [@HasAndBelongsToMany](https://docs.dyna-record.com/functions/HasAndBelongsToMany.html). It does this by de-normalizing records to each of its related entities partitions.

A relationship can be defined as nullable or non-nullable. Non-nullable relationships will be enforced via transactions and violations will result in [NullConstraintViolationError](https://docs.dyna-record.com/classes/NullConstraintViolationError.html)

- [@ForeignKeyAttribute](https://docs.dyna-record.com/functions/ForeignKeyAttribute.html) is used to define a foreign key that links to another entity
- Relationship decorators ([@HasOne](#hasone), [@HasMany](#hasmany), [@BelongsTo](https://docs.dyna-record.com/functions/BelongsTo.html), [@HasAndBelongsToMany](#hasandbelongstomany)) define how entities relate to each other.

#### HasOne

[Docs](https://docs.dyna-record.com/functions/HasOne.html)

```typescript
import {
  Entity,
  ForeignKeyAttribute,
  ForeignKey,
  BelongsTo,
  HasOne
} from "dyna-record";

@Entity
class Assignment extends MyTable {
  declare readonly type: "Assignment";

  // 'assignmentId' must be defined on associated model
  @HasOne(() => Grade, { foreignKey: "assignmentId" })
  public readonly grade: Grade;
}

@Entity
class Grade extends MyTable {
  declare readonly type: "Grade";

  @ForeignKeyAttribute(() => Assignment)
  public readonly assignmentId: ForeignKey<Assignment>;

  // 'assignmentId' Must be defined on self as ForeignKey or NullableForeignKey
  @BelongsTo(() => Assignment, { foreignKey: "assignmentId" })
  public readonly assignment: Assignment;
}
```

### HasMany

[Docs](https://docs.dyna-record.com/functions/HasMany.html)

```typescript
import { Entity, NullableForeignKey, BelongsTo, HasMany } from "dyna-record";

@Entity
class Teacher extends MyTable {
  declare readonly type: "Teacher";

  // 'teacherId' must be defined on associated model
  @HasMany(() => Course, { foreignKey: "teacherId" })
  public readonly courses: Course[];
}

@Entity
class Course extends MyTable {
  declare readonly type: "Course";

  @ForeignKeyAttribute(() => Teacher, { nullable: true })
  public readonly teacherId?: NullableForeignKey<Teacher>; // Mark as optional

  // 'teacherId' Must be defined on self as ForeignKey or NullableForeignKey
  @BelongsTo(() => Teacher, { foreignKey: "teacherId" })
  public readonly teacher?: Teacher;
}
```

By default, a HasMany relationship is bi-directional—records are denormalized into both the parent and child entity partitions. This setup supports access patterns that allow each entity to retrieve its associated records. However, updating a HasMany entity requires updating its denormalized record in every associated partition, which can lead to issues given DynamoDB's 100-item transaction limit.

To mitigate this, you can specify uniDirectional in the HasMany decorator and remove the BelongsTo relationship from the child entity. With this configuration, only the parent-to-child access pattern is supported.

```typescript
import { Entity, NullableForeignKey, BelongsTo, HasMany } from "dyna-record";

@Entity
class Teacher extends MyTable {
  declare readonly type: "Teacher";

  // 'teacherId' must be defined on associated model
  @HasMany(() => Course, { foreignKey: "teacherId", uniDirectional: true })
  public readonly courses: Course[];
}

@Entity
class Course extends MyTable {
  declare readonly type: "Course";

  @ForeignKeyAttribute(() => Teacher, { nullable: true })
  public readonly teacherId?: NullableForeignKey<Teacher>; // Mark as optional
}
```

### HasAndBelongsToMany

[Docs](https://docs.dyna-record.com/functions/HasAndBelongsToMany.html)

HasAndBelongsToMany relationships require a [JoinTable](https://docs.dyna-record.com/classes/JoinTable.html) class. This represents a virtual table to support the relationship

```typescript
import {
  Entity,
  JoinTable,
  ForeignKey,
  HasAndBelongsToMany
} from "dyna-record";

class StudentCourse extends JoinTable<Student, Course> {
  public readonly studentId: ForeignKey;
  public readonly courseId: ForeignKey;
}

@Entity
class Course extends MyTable {
  declare readonly type: "Course";

  @HasAndBelongsToMany(() => Student, {
    targetKey: "courses",
    through: () => ({ joinTable: StudentCourse, foreignKey: "courseId" })
  })
  public readonly students: Student[];
}

@Entity
class Student extends OtherTable {
  declare readonly type: "Student";

  @HasAndBelongsToMany(() => Course, {
    targetKey: "students",
    through: () => ({ joinTable: StudentCourse, foreignKey: "studentId" })
  })
  public readonly courses: Course[];
}
```

## CRUD Operations

### Create

[Docs](https://docs.dyna-record.com/classes/default.html#create)

The create method is used to insert a new record into a DynamoDB table. This method automatically handles key generation (using v4 UUIDs or a custom id field if [IdAttribute](<(https://docs.dyna-record.com/functions/IdAttribute.html)>) is set), timestamps for [createdAt](https://docs.dyna-record.com/classes/default.html#createdAt) and [updatedAt](https://docs.dyna-record.com/classes/default.html#updatedAt) fields, and the management of relationships between entities. It leverages AWS SDK's [TransactWriteCommand](https://www.google.com/search?q=aws+transact+write+command&oq=aws+transact+write+command&gs_lcrp=EgZjaHJvbWUyBggAEEUYOTIGCAEQRRg7MgYIAhBFGDvSAQgzMjAzajBqN6gCALACAA&sourceid=chrome&ie=UTF-8) for transactional integrity, ensuring either complete success or rollback in case of any failure. The method handles conditional checks to ensure data integrity and consistency during creation. If a foreignKey is set on create, dyna-record will de-normalize the data required in order to support the relationship

To use the create method, call it on the model class you wish to create a new record for. Pass the properties of the new record as an object argument to the method. Only attributes defined on the model can be configured, and will be enforced via types and runtime schema validation.

#### Basic Usage

```typescript
const myModel: MyModel = await MyModel.create({
  someAttr: "123",
  otherAttr: 456,
  someDate: new Date("2024-01-01")
});
```

#### Example: Creating an Entity with Relationships

```typescript
const grade: Grade = await Grade.create({
  gradeValue: "A+",
  assignmentId: "123",
  studentId: "456"
});
```

#### Skipping Referential Integrity Checks

By default, when creating entities with foreign key references, dyna-record performs condition checks to ensure that referenced entities exist. This prevents creating entities with invalid foreign key references. However, in high-contention or high-throughput systems where the same foreign key may be referenced in parallel operations, these condition checks can fail due to transaction conflicts. In scenarios such as bulk imports or when you've already verified the references, you may want to skip these checks to prevent such failures.

To skip referential integrity checks, pass an options object as the second parameter with `referentialIntegrityCheck: false`:

```typescript
const grade: Grade = await Grade.create(
  {
    gradeValue: "A+",
    assignmentId: "123",
    studentId: "456"
  },
  { referentialIntegrityCheck: false }
);
```

**Note:** When `referentialIntegrityCheck` is set to `false`, the condition checks that verify foreign key references exist are skipped. This means you can create entities even if the referenced entities don't exist, which may lead to data integrity issues. Use this option with caution.

#### Error handling

The method is designed to throw errors under various conditions, such as transaction cancellation due to failed conditional checks. For instance, if you attempt to create a `Grade` for an `Assignment` that already has one, the method throws a [TransactionWriteFailedError](https://docs.dyna-record.com/classes/TransactionWriteFailedError.html).

#### Notes

- Automatic Timestamp Management: The [createdAt](https://docs.dyna-record.com/classes/default.html#createdAt) and [updatedAt](https://docs.dyna-record.com/classes/default.html#updatedAt) fields are managed automatically and reflect the time of creation and the last update, respectively.
- Automatic ID Generation: Each entity created gets a unique [id](https://docs.dyna-record.com/classes/default.html#id) as a v4 uuid.
  - This can be customized [IdAttribute](<(https://docs.dyna-record.com/functions/IdAttribute.html)>) to support custom id attributes
- Relationship Management: The ORM manages entity relationships through DynamoDB's single-table design patterns, creating and maintaining the necessary links between related entities.
- Conditional Checks: To ensure data integrity, the create method performs various conditional checks, such as verifying the existence of entities that new records relate to.
- Error Handling: Errors during the creation process are handled gracefully, with specific errors thrown for different failure scenarios, such as conditional check failures or transaction cancellations.

### FindById

[Docs](https://docs.dyna-record.com/classes/default.html#findById)

Retrieve a single record by its primary key.

findById performs a direct lookup for an entity based on its primary key. It utilizes the GetCommand from AWS SDK's lib-dynamodb to execute a consistent read by default, ensuring the most recent data is fetched. Moreover, it supports eagerly loading related entities through the include option, making it easier to work with complex data relationships. `findById` provides strong typing for both the fetched entity and any included associations, aiding in development-time checks and editor autocompletion.

To retrieve an entity, simply call findById on the model class with the ID of the record you wish to find.

If no record is found matching the provided ID, findById returns undefined. This behavior is consistent across all usages, whether or not related entities are included in the fetch.

##### Find an entity by id

```typescript
const course = await Course.findById("123");

// user.id; - ok for any attribute
// user.teacher; - Error! teacher relationship was not included in query
// user.assignments; - Error! assignments relationship was not included in query
```

#### Including related entities

```typescript
const course = await Course.findById("123", {
  include: [{ association: "teacher" }, { association: "assignments" }]
});

// user.id; - ok for any attribute
// user.teacher - ok because teacher is in include
// user.assignments - ok because assignments is in include
```

### Query

[Docs](https://docs.dyna-record.com/classes/default.html#query)

The query method is a versatile tool for querying data from DynamoDB tables using primary key conditions and various optional filters. This method enables fetching multiple items that match specific criteria, making it ideal for situations where more than one item needs to be retrieved based on attributes of the primary key (partition key and sort key).

There are two main patterns; query by id and query by primary key

#### Basic usage

To query items using the id, simply pass the partition key value as the first parameter. This fetches all items that share the same partition key value.

The result will be an array of the entity or related entities that match the filters

##### Query by id

Querying using the id will abstract away setting up the partition key conditions.

```typescript
const customers = await Customer.query("123");
```

Query by partition key and sort key

```typescript
const result = await Customer.query("123", {
  skCondition: "Order"
});
```

##### Query by primary key

To be more precise to the underlying data, you can specify the partition key and sort key directly. The keys here will be the partition and sort keys defined on the [table](#table) class. The `sk` value is typed to only accept valid entity names from the partition.

```typescript
const orders = await Customer.query({
  pk: "Customer#123",
  sk: { $beginsWith: "Order" }
});
```

### Advanced usage

The query method supports advanced filtering using the filter option. This allows for more complex queries, such as filtering items by attributes other than the primary key.

```typescript
const result = await Course.query(
  {
    myPk: "Course|123"
  },
  {
    filter: {
      type: ["Assignment", "Teacher"],
      createdAt: { $beginsWith: "202" },
      $or: [
        {
          name: "Potions",
          updatedAt: { $beginsWith: "2023-02-15" }
        },
        {
          type: "Assignment",
          createdAt: { $beginsWith: "2021-09-15T" }
        },
        {
          id: "123"
        }
      ]
    }
  }
);
```

#### Filtering on Object Attributes

When using `@ObjectAttribute`, you can filter on nested Map fields using **dot-path notation** and check List membership using the **`$contains`** operator.

##### Dot-path filtering on nested fields

Use dot notation to filter on fields within an `@ObjectAttribute`. All standard filter operators work with dot-paths: equality, `$beginsWith`, and `IN` (array of values).

```typescript
// Equality on a nested field
const result = await Store.query("123", {
  filter: { "address.city": "Springfield" }
});

// $beginsWith on a nested field
const result = await Store.query("123", {
  filter: { "address.street": { $beginsWith: "123" } }
});

// IN on a nested field
const result = await Store.query("123", {
  filter: { "address.city": ["Springfield", "Shelbyville"] }
});

// Deeply nested fields
const result = await Store.query("123", {
  filter: { "address.geo.lat": 40 }
});
```

##### `$contains` operator

Use `$contains` to check if a List attribute contains a specific element, or if a string attribute contains a substring. Works on both top-level attributes and nested fields via dot-path.

```typescript
// Check if a List contains an element
const result = await Store.query("123", {
  filter: { "address.tags": { $contains: "home" } }
});

// Check if a top-level string contains a substring
const result = await Store.query("123", {
  filter: { name: { $contains: "john" } }
});
```

##### Combining dot-path and `$contains` with AND/OR

Dot-path filters and `$contains` work with all existing AND/OR filter combinations.

```typescript
const result = await Store.query("123", {
  filter: {
    "address.city": "Springfield",
    "address.geo.lat": 40,
    $or: [
      { "address.tags": { $contains: "home" } },
      { name: { $beginsWith: "Main" } }
    ]
  }
});
```

#### Typed Query Filters

Query filters are strongly typed based on the entities in the queried partition. A partition includes the entity itself plus all entities reachable through its declared relationships (`@HasMany`, `@HasOne`, `@BelongsTo`, `@HasAndBelongsToMany`). For example, if `Customer` has `@HasMany(() => Order)` and `@HasOne(() => ContactInformation)`, then Customer's partition entities are `Customer`, `Order`, and `ContactInformation`.

The type system validates:

- **Filter attribute keys**: Only attributes that exist on the entity or its related entities are accepted. Relationship property names, partition keys, and sort keys are excluded.
- **`type` field values**: The `type` field only accepts entity names from the partition — the entity itself and its declared relationships. Entities from other tables or unrelated entities on the same table are rejected.
- **Sort key values**: Both `skCondition` and the `sk` property in key conditions only accept entity names from the partition. This matches dyna-record's single-table design where sort key values always start with an entity class name.
- **SK-scoped filters**: When `skCondition` narrows to specific entities, the `filter` parameter is scoped to only those entities' attributes. For example, `skCondition: { $beginsWith: "Order" }` restricts the filter to Order's attributes — using `lastFour` (a PaymentMethod attribute) produces a compile error.
- **`type` narrowing in `$or`**: Each `$or` element is independently narrowed. When an `$or` block specifies `type: "Order"`, only Order's attributes are allowed in that block.
- **Dot-path keys**: Nested `@ObjectAttribute` fields are available as typed filter keys using dot notation (e.g., `"address.city"`).

##### Filter key validation

```typescript
// Valid: 'name' exists on Customer, 'lastFour' on PaymentMethod
await Customer.query("123", {
  filter: { name: "John", lastFour: "1234" }
});

// Error: 'nonExistent' is not an attribute on any entity in Customer's partition
await Customer.query("123", {
  filter: { nonExistent: "value" } // Compile error
});

// Error: 'orders' is a relationship property, not a filterable attribute
await Customer.query("123", {
  filter: { orders: "value" } // Compile error
});
```

##### Type field narrowing

```typescript
// Valid entity names only
await Customer.query("123", {
  filter: { type: "Order" } // OK: "Order" is in Customer's partition
});

await Customer.query("123", {
  filter: { type: "NonExistent" } // Compile error
});

// Array form (IN operator) accepts valid entity names
await Customer.query("123", {
  filter: { type: ["Order", "PaymentMethod"] }
});
```

##### $or element narrowing

Each `$or` element narrows independently based on its own `type` value:

```typescript
await Customer.query("123", {
  filter: {
    $or: [
      { type: "Order", orderDate: "2023" }, // OK: orderDate is on Order
      { type: "PaymentMethod", lastFour: "1234" } // OK: lastFour is on PaymentMethod
    ]
  }
});

// Error in $or: lastFour is not an attribute on Order
await Customer.query("123", {
  filter: {
    $or: [
      { type: "Order", lastFour: "1234" } // Compile error
    ]
  }
});
```

##### Return type narrowing

When querying a partition with no filter or sort key condition, the return type is a union of the entity itself and all its related entities:

```typescript
// Return type: Array<EntityAttributesInstance<Customer> | EntityAttributesInstance<Order>
//   | EntityAttributesInstance<PaymentMethod> | EntityAttributesInstance<ContactInformation>>
const results = await Customer.query("123");
```

When the filter specifies a `type` value, the return type automatically narrows to only the matching entities:

```typescript
// Return type: Array<EntityAttributesInstance<Order>>
const orders = await Customer.query("123", {
  filter: { type: "Order" }
});

orders[0]?.orderDate; // OK: orderDate is accessible

// Return type: Array<EntityAttributesInstance<Order> | EntityAttributesInstance<PaymentMethod>>
const mixed = await Customer.query("123", {
  filter: { type: ["Order", "PaymentMethod"] }
});
```

##### Sort key validation and narrowing

Sort key values are typed to only accept valid entity names from the partition, matching dyna-record's single-table design where SK values always start with an entity class name. This applies to both the `skCondition` option and the `sk` property in key conditions:

```typescript
// Both forms validate sort key values against partition entity names

// skCondition option (string form)
await Customer.query("123", { skCondition: "Order" }); // OK
await Customer.query("123", { skCondition: "Order#123" }); // OK
await Customer.query("123", { skCondition: { $beginsWith: "Order" } }); // OK
await Customer.query("123", { skCondition: "NonExistent" }); // Compile error

// sk property in key conditions (object form)
await Customer.query({ pk: "Customer#123", sk: "Order" }); // OK
await Customer.query({ pk: "Customer#123", sk: "Order#001" }); // OK
await Customer.query({ pk: "Customer#123", sk: { $beginsWith: "Order" } }); // OK
await Customer.query({ pk: "Customer#123", sk: "NonExistent" }); // Compile error
```

**Return type narrowing** works with `skCondition` when the value is an exact entity name or `$beginsWith` with an entity name:

```typescript
// skCondition narrows the return type
const orders = await Customer.query("123", { skCondition: "Order" });
// orders is Array<EntityAttributesInstance<Order>>

const orders2 = await Customer.query("123", {
  skCondition: { $beginsWith: "Order" }
});
// orders2 is Array<EntityAttributesInstance<Order>>

// Suffix prevents narrowing (delimiter is configurable)
const specific = await Customer.query("123", { skCondition: "Order#123" });
// specific is QueryResults<Customer> (full union)
```

##### `$beginsWith` prefix matching

`$beginsWith` also accepts partial entity name prefixes that match multiple entity types. When a prefix matches more than one entity name, the return type and filter are scoped to the union of all matching entities:

```typescript
// "C" matches both "Customer" and "ContactInformation"
const results = await Customer.query("123", {
  skCondition: { $beginsWith: "C" }
});
// results is Array<EntityAttributesInstance<Customer> | EntityAttributesInstance<ContactInformation>>

// When one entity name is a prefix of another (e.g., PaymentMethod / PaymentMethodProvider):
const results = await PaymentMethod.query("123", {
  skCondition: { $beginsWith: "PaymentMethod" }
});
// results includes both PaymentMethod and PaymentMethodProvider

// Longer prefix narrows further
const results = await PaymentMethod.query("123", {
  skCondition: { $beginsWith: "PaymentMethodP" }
});
// results is Array<EntityAttributesInstance<PaymentMethodProvider>>

// Prefixes that don't match any entity name are rejected
await Customer.query("123", {
  skCondition: { $beginsWith: "X" } // Compile error
});
```

##### SK-scoped filter validation

When `skCondition` narrows to specific entities, the `filter` parameter is automatically scoped to only those entities' attributes. This prevents filtering on attributes from entities that can't appear in the results:

```typescript
// SK narrows to Order — filter accepts only Order attributes (+ default fields)
await Customer.query("123", {
  skCondition: { $beginsWith: "Order" },
  filter: { orderDate: "2023", customerId: "c1" } // OK: both are Order attributes
});

// Error: lastFour is a PaymentMethod attribute, not available when SK scopes to Order
await Customer.query("123", {
  skCondition: { $beginsWith: "Order" },
  filter: { lastFour: "1234" } // Compile error
});

// $or blocks are also scoped by SK
await Customer.query("123", {
  skCondition: { $beginsWith: "Order" },
  filter: {
    $or: [
      { type: "Order", orderDate: "2023" }, // OK
      { type: "PaymentMethod", lastFour: "1234" } // Compile error: PaymentMethod outside SK scope
    ]
  }
});

// When $beginsWith matches multiple entities, filter accepts attributes from all matches
await Customer.query("123", {
  skCondition: { $beginsWith: "C" }, // matches Customer and ContactInformation
  filter: { name: "John", email: "j@test.com" } // OK: name is on Customer, email on ContactInformation
});
```

##### Object key form (`{ pk, sk }`)

When using the object key form, sort key values are **validated** but the return type is **not narrowed**. Use `filter: { type: "Order" }` alongside key conditions for return type narrowing:

```typescript
// sk is validated but does NOT narrow the return type
const results = await Customer.query({ pk: "Customer#123", sk: "Order" });
// results is QueryResults<Customer> (full union)

// Combine with filter type for return type narrowing
const orders = await Customer.query(
  { pk: "Customer#123", sk: { $beginsWith: "Order" } },
  { filter: { type: "Order" } }
);
// orders is Array<EntityAttributesInstance<Order>>
```

> **Note:** Return type narrowing applies to the top-level `type` filter field, `type` values within `$or` elements, and to the `skCondition` option. When `$or` elements specify `type` values, the return type narrows to the union of those entity types. The `sk` property in key conditions validates values but does not narrow return types. Index queries (`{ indexName: "..." }`) use untyped filters.
>
> **Filter key narrowing:** When no `type` is specified, the return type automatically narrows based on which entities have the filtered attributes. For example, `filter: { orderDate: "2023" }` narrows to `Order` if only `Order` has `orderDate`. In `$or` blocks, each element narrows independently — by `type` if present, or by filter keys otherwise — and the return type is the union across all blocks.
>
> **AND intersection:** Since DynamoDB ANDs top-level filter conditions with `$or` blocks, the return type reflects this. When both top-level conditions and `$or` blocks independently narrow to specific entity sets, the return type is their intersection. If no entity satisfies both (e.g., `{ orderDate: "2023", $or: [{ lastFour: "1234" }] }` where `orderDate` is on `Order` and `lastFour` is on `PaymentMethod`), the return type is `never[]` — correctly indicating that no records can match.
>
> **SK intersection:** `skCondition` is always intersected with filter-based narrowing because it is a DynamoDB key condition that physically limits which items are scanned. When both `skCondition` and a filter narrow to different entity sets, the return type is their intersection.

### Querying on an index

For querying based on secondary indexes, you can specify the index name in the options.

```typescript
const result = await Customer.query(
  {
    pk: "Customer#123",
    sk: { $beginsWith: "Order" }
  },
  { indexName: "myIndex" }
);
```

### Update

[Docs](https://docs.dyna-record.com/classes/default.html#update)

The update method enables modifications to existing items in a DynamoDB table. It supports updating simple attributes, handling nullable fields, and managing relationships between entities, including updating and removing foreign keys. Only attributes defined on the model can be updated, and will be enforced via types and runtime schema validation.

#### Updating simple attributes

```typescript
await Customer.update("123", {
  name: "New Name",
  address: "New Address"
});
```

#### Removing attributes

Note: Attempting to remove a non nullable attribute will result in a [NullConstraintViolationError](https://docs.dyna-record.com/classes/NullConstraintViolationError.html)

```typescript
await ContactInformation.update("123", {
  email: "new@example.com",
  phone: null
});
```

#### Updating Foreign Key References

To update the foreign key reference of an entity to point to a different entity, simply pass the new foreign key value

```typescript
await PaymentMethod.update("123", {
  customerId: "456"
});
```

#### Removing Foreign Key References

Nullable foreign key references can be removed by setting them to null

Note: Attempting to remove a non nullable foreign key will result in a [NullConstraintViolationError](https://docs.dyna-record.com/classes/NullConstraintViolationError.html)

```typescript
await Pet.update("123", {
  ownerId: null
});
```

#### Updating Object Attributes

Object attribute updates are **partial** — only the fields you provide are modified, and omitted fields are preserved. This uses DynamoDB document path expressions under the hood (e.g., `SET #address.#street = :address_street`) for efficient field-level updates.

```typescript
// Only updates street — city, zip, geo, etc. are preserved
await Store.update("123", {
  address: { street: "456 New St" }
});
```

**Nested objects** are recursively merged:

```typescript
// Only updates lat — lng and accuracy are preserved
await Store.update("123", {
  address: {
    geo: { lat: 42 }
  }
});
```

**Nullable fields** within the object can be removed by setting them to `null`:

```typescript
// Removes zip, preserves all other fields
await Store.update("123", {
  address: { zip: null }
});
```

**Arrays** within objects are **full replacement** (not merged):

```typescript
// Replaces the entire tags array
await Store.update("123", {
  address: { tags: ["new-tag-1", "new-tag-2"] }
});
```

**Discriminated unions** within objects are also **full replacement** (not merged):

```typescript
// Replaces the entire shape — switches from circle to square
await Drawing.update("123", {
  drawing: { shape: { kind: "square", side: 10 } }
});
```

The instance `update` method returns a deep-merged result, preserving existing fields:

```typescript
const updated = await storeInstance.update({
  address: { street: "New Street" }
});
// updated.address.city → still has the original value
```

#### Instance Method

There is an instance `update` method that has the same rules above, but returns the full updated instance.

```typescript
const updatedInstance = await petInstance.update({
  ownerId: null
});
```

#### Skipping Referential Integrity Checks

By default, when updating entities with foreign key references, dyna-record performs condition checks to ensure that referenced entities exist. This prevents updating entities with invalid foreign key references. However, in high-contention or high-throughput systems where the same foreign key may be referenced in parallel operations, these condition checks can fail due to transaction conflicts. In scenarios such as bulk updates or when you've already verified the references, you may want to skip these checks to prevent such failures.

To skip referential integrity checks, pass an options object as the third parameter with `referentialIntegrityCheck: false`:

```typescript
await PaymentMethod.update(
  "123",
  { customerId: "456" },
  { referentialIntegrityCheck: false }
);
```

For instance methods:

```typescript
const updatedInstance = await paymentMethodInstance.update(
  { customerId: "456" },
  { referentialIntegrityCheck: false }
);
```

**Note:** When `referentialIntegrityCheck` is set to `false`, the condition checks that verify foreign key references exist are skipped. This means you can update entities even if the referenced entities don't exist, which may lead to data integrity issues. Use this option with caution.

### Delete

[Docs](https://docs.dyna-record.com/classes/default.html#delete)

The delete method is used to remove an entity from a DynamoDB table, along with handling the deletion of associated items in relationships (like HasMany, HasOne, BelongsTo) to maintain the integrity of the database schema.

```typescript
await User.delete("user-id");
```

#### Handling HasMany and HasOne Relationships

When deleting entities involved in HasMany or HasOne relationships:

If a Pet belongs to an Owner (HasMany relationship), deleting the Pet will remove its denormalized records from the Owner's partition.
If a Home belongs to a Person (HasOne relationship), deleting the Home will remove its denormalized records from the Person's partition.

```typescript
await Home.delete("123");
```

This deletes the Home entity and its denormalized record with a Person.

#### Deleting Entities from HasAndBelongsToMany Relationships

For entities part of a HasAndBelongsToMany relationship, deleting one entity will remove the association links (join table entries) with the related entities.

If a Book has and belongs to many authors:

```typescript
await Book.delete("123");
```

This deletes a Book entity and its association links with Author entities.

#### Error Handling

If deleting an entity or its relationships fails due to database constraints or errors during transaction execution, a TransactionWriteFailedError is thrown, possibly with details such as ConditionalCheckFailedError or NullConstraintViolationError for more specific issues related to relationship constraints or nullability violations.

## Vector Search

dyna-record supports [DynamoDB vector search](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/VectorSearchWorkingWith.html): entities declare a searchable attribute, writes embed it automatically through an embedding provider you supply, and similarity searches run as exactly one `SearchVectors` operation returning complete typed entity instances. No separate vector store, no hydration pipeline — the vectors live on your table's canonical rows.

> **Requirements:** vector indexes are an AWS feature of **on-demand capacity mode** tables only, and searches require an `ACTIVE` index. dyna-record surfaces the AWS errors directly; it does not attempt workarounds.

### Declaring searchable entities

Mark exactly one attribute per entity as its searchable text with the layered `@Searchable()` decorator and the `Searchable` property brand. Attributes that searches may filter on are declared with `@SearchFilterable()` and the `SearchFilterable` brand — strings, numbers, booleans, enums, and foreign keys qualify (dates and objects do not):

```typescript
import DynaRecord, {
  Entity,
  Searchable,
  SearchFilterable,
  StringAttribute,
  ForeignKeyAttribute,
  BelongsTo,
  HasMany,
  type Searchable as SearchableText,
  type SearchFilterable as Filterable,
  type ForeignKey
} from "dyna-record";

@Entity
class Organization extends MyTable {
  declare readonly type: "Organization";

  @StringAttribute({ alias: "Name" })
  public readonly name: string;

  @HasMany(() => Product, { foreignKey: "organizationId" })
  public readonly products: Product[];
}

@Entity
class Product extends MyTable {
  declare readonly type: "Product";

  @Searchable()
  @StringAttribute({ alias: "Description" })
  public readonly description: SearchableText;

  @SearchFilterable()
  @StringAttribute({ alias: "Category" })
  public readonly category: Filterable;

  @SearchFilterable()
  @ForeignKeyAttribute(() => Brand, { alias: "BrandId" })
  public readonly brandId: Filterable<ForeignKey<Brand>>;

  @ForeignKeyAttribute(() => Organization, { alias: "OrganizationId" })
  public readonly organizationId: ForeignKey<Organization>;

  @BelongsTo(() => Organization, { foreignKey: "organizationId" })
  public readonly organization: Organization;
}
```

`Organization`'s searchable relationships (`products`) are what its search surfaces infer from — they define the parent-level `in:` values, result unions, and its scoped index's membership.

The brands add no friction at call sites — `create` and `update` accept plain values. An entity may declare at most one `@Searchable` attribute; a second is a compile error at the `@Entity` decorator and a runtime error at metadata initialization.

To search across multiple fields, compose them yourself into one searchable attribute. dyna-record does not auto-concatenate fields, deliberately: the composed text is exactly what gets embedded (and billed per embed), so field order, separators, and which fields participate all shape search quality — and any change to a composed field would silently trigger a re-embed. Owning the composition keeps the embedded text, and what causes it to change, visible in your code:

```typescript
await Product.create({
  name,
  summary,
  // Self-composed search text spanning several fields
  searchText: `${name}\n${summary}`
});
```

### Defining a vector index

Vector indexes are declared on the table class with `vectorIndex`. The returned construct is the index's search surface and its provisioning definition. The `provider` is **required** — dyna-record ships no embedding implementation and no embedding SDK dependency; you own the client, credentials, region, retry, and timeout posture:

```typescript
import { TitanTextEmbedV2, type EmbeddingProvider } from "dyna-record";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const bedrock = new BedrockRuntimeClient({ region: "us-west-2" });

const embed: EmbeddingProvider = async text => {
  const res = await bedrock.send(
    new InvokeModelCommand({
      modelId: TitanTextEmbedV2.name,
      body: JSON.stringify({ inputText: text })
    })
  );
  return JSON.parse(new TextDecoder().decode(res.body)).embedding;
};

// Scoped index: searches run within one scope value at a time
export const orgSearchIndex = MyTable.vectorIndex({
  name: "org-search-index",
  model: TitanTextEmbedV2,
  provider: embed,
  scopedBy: () => Organization,
  include: [() => Review] // members with the FK but no declared inverse relationship
});

// Global index: no scope; searches span the whole table's searchable entities
export const globalSearchIndex = MyTable.vectorIndex({
  name: "global-search-index",
  model: TitanTextEmbedV2,
  provider: embed
});
```

- **`scopedBy`** takes a thunk returning one of your dyna-record entity classes — the scope parent. The parent's foreign key becomes the index `HASH`, so every search runs within exactly one of that entity's ids. Multi-tenancy is the canonical use (scope by your tenant/organization entity), but any parent whose searches should never cross instances works the same way — a workspace, a project, a store. Index membership is the scope parent's searchable relationships union the `include:` list.
- **`include:`** adds searchable entities that carry the scoping foreign key but have no declared inverse relationship on the parent. It applies to scoped indexes only — a global index already spans every searchable entity of the table, so there is nothing to include.
- A **global** index (no `scopedBy`) has no `HASH` and searches the whole table's searchable entities.

### How writes embed

Creating or updating a searchable entity embeds the value synchronously through your provider and writes the vector onto the entity's canonical row inside the operation's single transaction — there is no second write, no eventual-consistency pipeline, and rows are searchable sub-second after the write acknowledges. Denormalized relationship copies never carry the vector.

- **Failure semantics:** if the provider rejects or returns the wrong dimensions, the whole write fails with `EmbeddingError` (the provider error on `cause`) — no row is ever written searchable-but-not-embedded. Error messages carry entity, attribute, model, and dimension identities only, never your text.
- **Unchanged values skip embedding:** updates compare the incoming searchable value against the stored one (read through the pre-update fetch) and skip the provider call and the vector write when it is unchanged. Exception: entities with no relationships have no pre-update fetch to supply the stored value, so an update carrying the searchable attribute embeds unconditionally rather than forcing a new read.
- **`forceEmbed` overrides the skip:** `update(id, { description }, { forceEmbed: true })` embeds even when the value appears unchanged. This is the affordance for indexing rows that predate searchability — loop a backfill over existing entities re-saving their own values — and for re-embedding a table after switching embedding models.
- **Clearing:** setting a nullable searchable attribute to `null` (or `""`) removes the vector — the row leaves the index. Empty text never reaches your provider.
- **Latency:** the provider call bounds write latency. Measured against Bedrock Titan V2: ~320 ms p50 / ~400 ms p90 per embed — roughly 7× the DynamoDB write it accompanies. The embed runs concurrently with the operation's existing reads where possible.

### Searching

Three surfaces, each compiling to exactly one `SearchVectors` operation. Results are ordered most-similar-first; each result carries the complete typed entity (`entity`), a `similarity` (higher is better, converted per the model's distance function — for COSINE, `1 − score`), and the raw AWS `score`.

The **parent surface** (`Parent.search(scopeId, query, options)`) is available when exactly one index is scoped by the class. Starting from the simplest call and adding one option at a time:

```typescript
// No options: searches the organization's whole scoped index — Products,
// and Reviews via the include list — returning the 10 most similar (the
// default topK). Results are typed by the searchable relationships
// (Product); an include-member result is discriminated via entity.type
const results = await Organization.search("orgId", "waterproof hiking boots");
// results is Array<SearchResult<Product>>

// in: narrows to one searchable relationship by its property name — only
// Products are searched, and the results are typed Product accordingly
const products = await Organization.search("orgId", "waterproof hiking boots", {
  in: "products"
});
// products is Array<SearchResult<Product>> — and with several searchable
// relationships, omitting in: widens results to the union of their targets

// filter: equality conditions on @SearchFilterable attributes, applied in
// the same single operation (no post-fetch filtering)
const footwear = await Organization.search("orgId", "waterproof hiking boots", {
  in: "products",
  filter: { category: "Footwear" }
});

// Filterable foreign keys narrow by relationship in the same way — products
// of one brand, within the organization's scope
const brandFootwear = await Organization.search("orgId", "hiking boots", {
  in: "products",
  filter: { category: "Footwear", brandId: "brand-id" }
});

// topK: how many results to return — default 10, max 100 (an AWS limit;
// there is no pagination)
const topFifty = await Organization.search("orgId", "hiking boots", {
  topK: 50
});

// Every result carries the typed entity, similarity, and raw score;
// discriminate on entity.type when the search spans multiple entity types
results.forEach(({ entity, similarity, score }) => {
  if (entity.type === "Product") console.log(entity.description, similarity);
});
```

The third surface is the **index construct** itself — the value `vectorIndex(...)` returned. It runs the same search as the parent surfaces, but is anchored on the index rather than an entity class, which makes it the right surface in three situations:

- **It is always unambiguous.** The parent surfaces exist only while exactly one index is scoped by that class; if a parent ever scopes a second index, they error with guidance and the construct — which names its index — is the way to search.
- **It is the only surface for global indexes**, which have no scope parent to hang a method off of.
- **It is the only surface where `include:` members are reachable by name.** Members added through `include:` have no relationship property on the scope parent, so the parent surfaces' `in:` (relationship names) cannot name them. The construct's `in:` takes **member entity names** instead — which covers them.

The signature follows the index's shape: scoped constructs take the scope value first (they are searchable only within one scope value); global constructs take the query first and reject a scope id.

```typescript
// Scoped construct, no options: same search as Organization.search("orgId", ...)
const all = await orgSearchIndex.search("orgId", "waterproof hiking boots");
// all is Array<SearchResult<Product> | SearchResult<Review>> — the full
// member union, include: members included

// Scoped construct with in: — note the vocabulary difference: member entity
// names here, not relationship property names. Review is an include: member,
// reachable by name only on this surface
const reviews = await orgSearchIndex.search("orgId", "sizing runs small", {
  in: "Review"
});
// reviews is Array<SearchResult<Review>>

// Filters compile identically on every surface
const filtered = await orgSearchIndex.search("orgId", "hiking boots", {
  in: "Product",
  filter: { category: "Footwear" }
});

// Global construct: query first, no scope id — searches every searchable
// entity of the table
const everything = await globalSearchIndex.search("hiking boots");
// everything is SearchResults — the base result type; a global index's
// member set is only known at runtime, so narrow via entity.type

// in: works on global indexes too. The member set is only known at runtime
// (any searchable entity of the table), so the name is validated at runtime
// rather than by the type system
const articles = await globalSearchIndex.search("hiking boots", {
  in: "Article"
});
```

Every surface also accepts a **precomputed vector** in place of query text: `{ vector: number[] }`. The embedding provider is not called — useful when you already hold an embedding (computed by a pipeline outside the request path, cached from an earlier query, or produced in a batch) or when reusing one query embedding across several searches, since each text search bills and waits for its own provider call:

```typescript
// Vector in place of text, on any surface — the provider is never called
await globalSearchIndex.search({ vector: myVector });

// One provider call, reused across searches
const vector = await embed("waterproof hiking boots");

await orgSearchIndex.search("orgId", { vector }, { in: "Product" });
await orgSearchIndex.search("orgId", { vector }, { in: "Review" });
```

The vector must come from the **same model and dimension count** the index was provisioned with — a different model's embedding produces meaningless similarity scores rather than an error, which dyna-record cannot detect. What it can detect, it does: a vector whose length differs from the index's declared dimensions is rejected with a `ValidationError` before any AWS call.

#### Typed end to end

Both sides of every search are inferred from your declarations — the same brand-driven inference that powers typed query filters:

- **Inputs:** `in:` accepts only the parent's searchable relationship names (the index construct accepts its member entity names — including `include:` members, which have no relationship property on the parent to name). `filter` keys narrow to exactly the searched entities' `@SearchFilterable` attributes, and narrow further when `in:` is present; non-filterable attributes and unsupported operator shapes are compile errors. Scoped index constructs require the scope value first; global constructs reject one. Calling `search` on a parent with no searchable relationships is a compile error (and a runtime error in plain JS).
- **Responses:** the return type is inferred, not declared. `in:` present → `Array<SearchResult<ThatEntity>>`; `in:` omitted → the widened union across every searched entity (`Array<SearchResult<A> | SearchResult<B>>`), where only shared attributes are accessible until you discriminate on `entity.type` — exactly like query result narrowing. Global index constructs return the base `SearchResults` type, since their member set is only known at runtime.

### Filters, scoping, and tenant isolation

DynamoDB's search condition grammar is an **equality-only conjunction**: `attribute = value` conditions joined by `AND`, at most one condition per attribute. This is an AWS constraint, not a library choice — `$or`, `$beginsWith`, `$contains`, `IN` arrays, and range operators are rejected at compile time and at runtime.

Two mechanisms narrow a search, and they are not interchangeable:

- **`scopedBy` is the enforced isolation boundary.** The `HASH` equality is set by the library on every search of a scoped index and cannot be omitted or overridden — a tenant-scoped index physically cannot search across tenants.
- **`filter` narrows within a boundary.** Filterable foreign keys enable sub-scope narrowing (products within a brand, within the organization scope) in the same single operation. **Never use `filter` as tenant separation on a global index** — it is a narrowing convenience, not an isolation mechanism.

Search filters are runtime-guarded for untrusted input: unknown keys, non-filterable attributes, unsupported operator shapes, and mistyped values are rejected before any AWS call. Still, **allowlist keys before spreading request input into `filter`** — a valid-but-unintended filterable key is indistinguishable from an intended one.

### Provisioning

Vector indexes are infrastructure. dyna-record declares and validates the configuration and executes searches, but does not create the index — provision it with your IaC tool using the serialized contract from `metadata()`:

```typescript
MyTable.metadata().vectorIndexes;
// [{
//   name: "org-search-index",
//   model: "amazon.titan-embed-text-v2:0",
//   vectorAttribute: "__dyna_vector",
//   dimensions: 1024,
//   distanceFunction: "COSINE",
//   projection: "ALL",
//   searchSchema: { hash: "OrganizationId", inlineFilters: ["Category", "Type"] },
//   fingerprint: "…",
//   scopedBy: "Organization"
// }]
```

Notes on the contract:

- Search-schema entries are **table aliases** (the names stored in DynamoDB), and each must also appear in the table's `AttributeDefinitions`. The entity `type` discriminator is auto-declared as an inline filter on every index; DynamoDB allows at most 18 inline filters per index (the `HASH` does not count).
- The provider never appears in serialized metadata — only the model descriptor's name. No credentials or client configuration can leak through `metadata()`.
- **Index configuration is immutable in DynamoDB.** Adding or removing any `@Searchable`/`@SearchFilterable` declaration on a live index is a **destructive re-provision**: the index must be deleted and recreated, and because vectors are written at write time, the recreated index's corpus recovers only as rows are re-written. The `fingerprint` field exists for IaC to detect that a decorator change implies replacement before it happens.
- **Adopting vector search on an existing table:** pre-existing rows have no vector and are unsearchable until their next write. dyna-record ships no backfill — re-write rows through `update` at your own pace to bring them into the index.
- Configuration is validated when metadata initializes (lazily, at the first operation, with the failure cached and re-thrown on every subsequent operation). Calling `MyTable.metadata()` during startup fails fast at deploy time instead of on the first live request.

### Permissions and networking

- **`dynamodb:SearchVectors` is a new IAM action** — existing policies granting DynamoDB read access do not include it. Roles that call `search` need it in addition to the usual read/write actions dyna-record already requires.
- **Your embedding provider needs its own permissions** — for the Bedrock example above, `bedrock:InvokeModel` on the model, with model access enabled in your account and region. dyna-record never touches these credentials; the provider function owns them.
- **`SearchVectors` resolves to a separate endpoint** (`search-dynamodb.<region>.amazonaws.com`, not the standard DynamoDB endpoint). If your network restricts egress through a VPC endpoint, proxy, or allowlist, permit the search hostname too — otherwise writes succeed and only searches fail, with a connection error that does not indicate the cause.

### Cost model

Vector search changes the write and read economics of searchable rows — dyna-record's design choices here exist to manage that, so it's worth understanding what they can and cannot save you:

- **Vector writes dominate, and the unchanged-value skip is the mitigation.** DynamoDB bills a full vector write (`max(1024, 4 × dimensions)` bytes — 4 KB at Titan's 1024 dimensions) on every material write to a vector-bearing row, even updates that don't touch the searchable attribute. dyna-record's unchanged-value comparison avoids the *embedding call* on unchanged values; the vector write billing on other updates is inherent to keeping the vector on the row.
- **dyna-record truncates embeddings to 7 significant digits** (float32 precision — verified zero effect on search results). This roughly halves the searchable row's storage and ordinary write-capacity footprint. It does **not** reduce vector billing — no precision trick does.
- **Searchable rows are permanently larger, and reads bill on full item size.** dyna-record excludes the vector from `findById`, `query`, and internal pre-fetches via projection, which saves bandwidth and latency — but DynamoDB bills reads on the full item regardless of projection, so every ordinary read of a searchable row costs more forever. Factor this in before marking high-read-traffic entities searchable.

## Type Safety Features

Dyna-Record integrates type safety into your DynamoDB interactions, reducing runtime errors and enhancing code quality.

- **Entity Type Declaration**: The `@Entity` decorator enforces that each entity declares `readonly type` as a string literal matching the class name (`declare readonly type: "MyEntity"`). This is required for compile-time query type safety.
- **Attribute Type Enforcement**: Ensures that the data types of attributes match their definitions in your entities.
- **Method Parameter Checking**: Validates method parameters against entity definitions, preventing invalid operations.
- **Relationship Integrity**: Automatically manages the consistency of relationships between entities, ensuring data integrity.
- **Typed Query Filters**: Query filter keys are validated against the attributes of entities in the partition. Invalid keys, relationship property names, and non-existent attributes produce compile errors. The `type` field only accepts valid entity class names.
- **Return Type Narrowing**: When a query filter specifies a `type` value, the return type is automatically narrowed to only the matching entity types instead of the full partition union.
- **`$or` Element Narrowing**: Each element in a `$or` filter array is independently type-checked based on its own `type` field, preventing attribute mismatches.
- **Searchable Brands**: `@Searchable()` and `@SearchFilterable()` require the `Searchable`/`SearchFilterable` property brands, so the searchable and filterable sets are known at compile time — search `in:` values, filter keys, and result unions all derive from them. A second `@Searchable` attribute on one entity is a compile error at the `@Entity` decorator.
- **Search Return Type Narrowing**: Search results are inferred from the searched membership — the union of searched entity types by default, narrowed to a single entity type when `in:` is present, mirroring query return type narrowing.
- **Search Surface Availability**: `search` is only callable on classes with at least one relationship to a searchable entity; scoped index constructs require the scope id first while global constructs reject one.

## Best Practices

- **Define Clear Entity Relationships**: Clearly define how your entities relate to each other for easier data retrieval and manipulation.
- **Use Type Aliases for Foreign Keys**: Utilize TypeScript's type aliases for foreign keys to enhance code readability and maintainability.
- **Leverage Type Safety**: Take advantage of Dyna-Record's type safety features to catch errors early in development.
- **Define Access Patterns**: Dynamo is not as flexible as a relational database. Try to define all access patterns up front.

## Debug logging

To enable debug logging set `process.env.DYNA_RECORD_LOGGING_ENABLED` to `"true"`. When enabled, dyna-record will log to console the dynamo operations it is performing.
