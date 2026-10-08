# Dyna-Record

[Home Page](https://www.dyna-record.com/) | [API Documentation](https://docs.dyna-record.com/)

### Articles

- [Unlock Relational Data Modeling in DynamoDB with dyna-record](https://medium.com/@drewdavis888/unlock-relational-data-modeling-in-dynamodb-with-dyna-record-5b9cce27c3ce)
- [DynamoDB Deserves a Real ORM: Meet dyna-record](https://medium.com/@drewdavis888/dynamodb-deserves-a-real-orm-meet-dyna-record-22e93fb9b557)
- [Type-Safe Vector Search Comes to DynamoDB: Meet dyna-record 2.0](https://medium.com/@drewdavis888/type-safe-vector-search-comes-to-dynamodb-meet-dyna-record-2-0-e773c205bc4b)

Dyna-Record is a strongly typed Data Modeler and ORM (Object-Relational Mapping) tool designed for modeling and interacting with data stored in DynamoDB in a structured and type-safe manner. It simplifies the process of defining data models (entities), performing CRUD operations, and handling complex queries. To support relational data, dyna-record implements a flavor of the [single-table design pattern](https://aws.amazon.com/blogs/compute/creating-a-single-table-design-with-amazon-dynamodb/) and the [adjacency list design pattern](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-adjacency-graphs.html). All operations are [ACID compliant transactions\*](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html)\. To enforce data integrity beyond the type system, schema validation is performed at runtime.

Note: ACID compliant according to DynamoDB [limitations](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html)

## Table of Contents

- [Getting Started](#getting-started)
  - [Installation](#installation)
  - [Configuration](#configuration)
    - [Configuring one table](#configuring-one-table)
    - [Supplying your own client](#supplying-your-own-client)
    - [Binding a client late](#binding-a-client-late)
- [Defining Entities](#defining-entities)
  - [Entity inheritance and shared base classes](#entity-inheritance-and-shared-base-classes)
  - [Attributes](#attributes)
  - [Relationships](#relationships)
- [CRUD Operations](#crud-operations)
  - [Create](#create)
  - [FindById](#findbyid)
  - [Query](#query)
    - [Comparison and range conditions](#comparison-and-range-conditions)
    - [Filtering on Object Attributes](#filtering-on-object-attributes)
    - [Typed Query Filters](#typed-query-filters)
    - [Reusing a filter](#reusing-a-filter)
  - [Update](#update)
    - [Updating Object Attributes](#updating-object-attributes)
  - [Delete](#delete)
  - [Write conditions](#write-conditions)
    - [The entity's own row](#the-entitys-own-row)
    - [Related entities](#related-entities)
    - [Foreign keys and `target`](#foreign-keys-and-target)
    - [Conditions on create](#conditions-on-create)
    - [Join tables](#join-tables)
    - [When a condition fails](#when-a-condition-fails)
    - [Limits](#limits)
- [Vector Search](#vector-search)
  - [Declaring searchable entities](#declaring-searchable-entities)
  - [Defining vector indexes](#defining-vector-indexes)
  - [How writes embed](#how-writes-embed)
  - [Searching](#searching)
  - [Filters, scoping, and tenant isolation](#filters-scoping-and-tenant-isolation)
  - [Provisioning](#provisioning)
  - [Migrating from 2.x](#migrating-from-2x)
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

> Set **`"strictPropertyInitialization": false`** in your `tsconfig.json`. Entity attributes are assigned by the decorators at runtime rather than in a constructor, so under `strict: true` (which turns this check on) every attribute you declare reports `Property 'x' has no initializer and is not definitely assigned in the constructor`. The rest of `strict` is fully supported and recommended — this is the one flag to turn off:
>
> ```jsonc
> {
>   "compilerOptions": {
>     "strict": true,
>     "strictPropertyInitialization": false // attributes are decorator-assigned
>   }
> }
> ```

### Configuration

dyna-record constructs its DynamoDB client on first use, with no configuration of its own. Region, credentials, and endpoint resolve exactly the way they do for any other AWS SDK consumer:

- **Region** — `AWS_REGION`, then `AWS_DEFAULT_REGION`, then the region on the shared config profile.
- **Credentials** — the standard provider chain: environment variables, SSO and shared config profiles, then the container or instance role. On Lambda, ECS, and EC2 this needs no configuration.
- **Endpoint** — `AWS_ENDPOINT_URL_DYNAMODB`, then `AWS_ENDPOINT_URL`.

So a local DynamoDB needs no dyna-record feature at all, only the environment variable the SDK already reads:

```bash
AWS_ENDPOINT_URL_DYNAMODB=http://localhost:8000 npm test
```

#### Configuring one table

When the environment is not where the answer belongs — a table in a fixed region, or two tables in different regions — declare it on the table:

```typescript
@Table({ name: "my-table", clientConfig: { region: "us-east-1" } })
abstract class MyTable extends DynaRecord {
  @PartitionKeyAttribute({ alias: "PK" })
  public readonly pk: PartitionKey;

  @SortKeyAttribute({ alias: "SK" })
  public readonly sk: SortKey;
}
```

`clientConfig` takes the AWS SDK's `DynamoDBClientConfig`, so anything the client accepts — `endpoint`, `credentials`, `maxAttempts`, `requestHandler` — belongs here. dyna-record builds the document client from it, once, and every operation on that table uses it.

#### Supplying your own client

To share a client with the rest of your application, instrument one, or substitute a fake in tests, pass it directly. `client` and `clientConfig` are mutually exclusive — `clientConfig` configures the client dyna-record builds, `client` replaces it:

```typescript
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const documentClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: "us-east-1" })
);

@Table({ name: "my-table", client: documentClient })
abstract class MyTable extends DynaRecord {
  @PartitionKeyAttribute({ alias: "PK" })
  public readonly pk: PartitionKey;

  @SortKeyAttribute({ alias: "SK" })
  public readonly sk: SortKey;
}
```

Commands are built from dyna-record's own copy of `@aws-sdk/lib-dynamodb`, but **marshalling follows the client you supply**: the AWS SDK hands each command the sending client's config, and lib-dynamodb reads `translateConfig` from it. Build the client you pass with the SDK's default marshalling.

A client with `unmarshallOptions.wrapNumbers` enabled is rejected where the table is declared, because every number attribute would come back as a wrapper object and fail its attribute schema on the first read. If your application needs a document client configured that way, keep it, and give dyna-record its own:

```typescript
@Table({ name: "my-table", clientConfig: { region: "us-east-1" } })
```

The option is typed structurally: anything that can send a command satisfies it, including a test double. That is deliberate. The SDK's `DynamoDBDocumentClient` is a nominal type, so naming it here would reject a perfectly good client built from a second copy of the AWS SDK — a common outcome when your project's lockfile pins an older version than dyna-record's. A client that cannot send commands is rejected where the table is declared, naming the table class.

If you inject a client, build it from `@aws-sdk/lib-dynamodb` **3.1103.0 or later** — the release that introduced `SearchVectorsCommand`, which dyna-record constructs. Consumers who configure nothing, or who use `clientConfig`, are unaffected by their own SDK version.

#### Binding a client late

Decorators evaluate at module load, before your application's bootstrap runs, so a client built during startup is not available where the table is declared. Pass one that delegates to it instead:

```typescript
@Table({
  name: "my-table",
  client: { send: command => getClient().send(command) }
})
abstract class MyTable extends DynaRecord {
  @PartitionKeyAttribute({ alias: "PK" })
  public readonly pk: PartitionKey;

  @SortKeyAttribute({ alias: "SK" })
  public readonly sk: SortKey;
}
```

The object is a valid client the moment it is declared, and the real one is looked up when a command is actually sent.

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
- [id](https://docs.dyna-record.com/classes/default.html#id) - The id for the model. This will be an autogenerated UUID (v4, via Node's built-in `crypto.randomUUID()`) unless [IdAttribute](https://docs.dyna-record.com/functions/IdAttribute.html) is set on a non-nullable entity attribute.
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
import { Entity, StringAttribute, NumberAttribute } from "dyna-record";

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
  public readonly studentId: ForeignKey<Student>;
  public readonly courseId: ForeignKey<Course>;
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

Declare each foreign key on the join table with the entity it references (`ForeignKey<Student>`, not a bare `ForeignKey`). A bare key still works for linking, but a [write condition](#write-conditions) can only guard an entity whose foreign key carries its type.

#### Linking and unlinking

Entities are linked and unlinked through the join table. Each call writes or deletes the denormalized link records in both entities' partitions, in one transaction:

```typescript
await StudentCourse.create({ studentId: "student-1", courseId: "course-1" });

await StudentCourse.delete({ studentId: "student-1", courseId: "course-1" });
```

`create` reads both entities before writing the links. If either does not exist it throws a [NotFoundError](https://docs.dyna-record.com/classes/NotFoundError.html) naming the missing entity, such as `Entities not found: (Course: course-9)`, and nothing is written.

#### Conditional writes

`create` and `delete` on a join table accept a `condition` that guards the entities being linked or unlinked. A join table has no row of its own, so the condition is keyed by its foreign keys, and each value wraps a condition on the referenced entity in `target`. Using the `CustomerStore` join table from [Write conditions](#write-conditions):

```typescript
// Link a Customer to a Store only while the Customer is active and the Store is open
await CustomerStore.create(
  { customerId: "customer-1", storeId: "store-1" },
  {
    condition: {
      customerId: { target: { status: "active" } },
      storeId: { target: { status: "open" } }
    }
  }
);

// Unlink only while the Store is open
await CustomerStore.delete(
  { customerId: "customer-1", storeId: "store-1" },
  { condition: { storeId: { target: { status: "open" } } } }
);
```

Neither link record is written or deleted unless every guard holds. A guard also requires its entity to exist, even with `referentialIntegrityCheck: false`. A `target` guard on a bare `ForeignKey` is a compile error that points at the missing type parameter.

## CRUD Operations

The examples throughout this section use one schema — a `Customer` partition
holding its orders and payment methods. It extends the `MyTable` class defined
in [Defining Entities](#defining-entities):

```typescript
@Entity
class Customer extends MyTable {
  declare readonly type: "Customer";

  @StringAttribute({ alias: "Name" })
  public readonly name: string;

  @StringAttribute({ alias: "Address" })
  public readonly address: string;

  @StringAttribute({ alias: "Email" })
  public readonly email: string;

  @StringAttribute({ alias: "Phone", nullable: true })
  public readonly phone?: string;

  @HasMany(() => Order, { foreignKey: "customerId" })
  public readonly orders: Order[];

  @HasMany(() => PaymentMethod, { foreignKey: "customerId" })
  public readonly paymentMethods: PaymentMethod[];
}

@Entity
class Order extends MyTable {
  declare readonly type: "Order";

  @StringAttribute({ alias: "OrderDate" })
  public readonly orderDate: string;

  @ForeignKeyAttribute(() => Customer, { alias: "CustomerId" })
  public readonly customerId: ForeignKey<Customer>;

  @BelongsTo(() => Customer, { foreignKey: "customerId" })
  public readonly customer: Customer;
}

@Entity
class PaymentMethod extends MyTable {
  declare readonly type: "PaymentMethod";

  @StringAttribute({ alias: "LastFour" })
  public readonly lastFour: string;

  @ForeignKeyAttribute(() => Customer, { alias: "CustomerId" })
  public readonly customerId: ForeignKey<Customer>;

  @BelongsTo(() => Customer, { foreignKey: "customerId" })
  public readonly customer: Customer;
}
```

Because `Order` and `PaymentMethod` both declare a foreign key to `Customer`,
they are stored in that customer's partition — which is what makes a single
`Customer.query("123")` return the customer and all of its related records.

### Create

[Docs](https://docs.dyna-record.com/classes/default.html#create)

The create method is used to insert a new record into a DynamoDB table. This method automatically handles key generation (using v4 UUIDs or a custom id field if [IdAttribute](https://docs.dyna-record.com/functions/IdAttribute.html) is set), timestamps for [createdAt](https://docs.dyna-record.com/classes/default.html#createdAt) and [updatedAt](https://docs.dyna-record.com/classes/default.html#updatedAt) fields, and the management of relationships between entities. It leverages AWS SDK's [TransactWriteCommand](https://www.google.com/search?q=aws+transact+write+command&oq=aws+transact+write+command&gs_lcrp=EgZjaHJvbWUyBggAEEUYOTIGCAEQRRg7MgYIAhBFGDvSAQgzMjAzajBqN6gCALACAA&sourceid=chrome&ie=UTF-8) for transactional integrity, ensuring either complete success or rollback in case of any failure. The method handles conditional checks to ensure data integrity and consistency during creation. If a foreignKey is set on create, dyna-record will de-normalize the data required in order to support the relationship

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

#### Conditional writes

`create` accepts a `condition` that guards the rows the new entity references, checked in the same transaction as the create. Using the schema from [Write conditions](#write-conditions):

```typescript
// Place an Order only for an active Customer at an open Store
const order = await Order.create(
  {
    orderDate: "2026-10-06",
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
```

The keys are limited to what a new entity can reference:

- Its **BelongsTo relationships**, by property name (`customer`), each taking a condition on the parent row.
- Its other **typed foreign keys**, such as the standalone `storeId`, each taking a `target` guard on the row it references.

A create takes **no condition on the new row's own attributes**. Create already requires that row not to exist, so a condition on its values could never hold. The only useful one would be "absent, or …", which turns the create into an overwrite of an existing row and orphans that row's relationship links. To take over a row that may already exist, create it once and change it afterwards with a conditional [`update`](#update). A new entity also has no HasOne child, HasMany children or link partners yet, so those relationships are not offered.

Both kinds of key need the foreign key declared with its target type (`ForeignKey<Customer>`), and the guarded foreign key must be set in the attributes being created; a guard on a key the create leaves unset is a `FilterError`. A guard merges into the referential integrity check on the same row, and it still requires that row to exist when `referentialIntegrityCheck` is `false`.

#### Error handling

The method is designed to throw errors under various conditions, such as transaction cancellation due to failed conditional checks. For instance, if you attempt to create a `Grade` for an `Assignment` that already has one, the method throws a [TransactionWriteFailedError](https://docs.dyna-record.com/classes/TransactionWriteFailedError.html). A failed `condition` is reported inside it as a `WriteConditionFailedError` (see [When a condition fails](#when-a-condition-fails)).

#### Notes

- Automatic Timestamp Management: The [createdAt](https://docs.dyna-record.com/classes/default.html#createdAt) and [updatedAt](https://docs.dyna-record.com/classes/default.html#updatedAt) fields are managed automatically and reflect the time of creation and the last update, respectively.
- Automatic ID Generation: Each entity created gets a unique [id](https://docs.dyna-record.com/classes/default.html#id) as a v4 uuid.
  - This can be customized [IdAttribute](https://docs.dyna-record.com/functions/IdAttribute.html) to support custom id attributes
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

#### Comparison and range conditions

Filters support `$gt`, `$gte`, `$lt` and `$lte`, plus `$between` for an inclusive range.

```typescript
// Everything created in January
const result = await Order.query("123", {
  filter: {
    createdAt: { $gte: new Date("2026-01-01"), $lt: new Date("2026-02-01") }
  }
});

// An inclusive range, as a single condition
const result = await Store.query("123", {
  filter: { "address.geo.lat": { $between: [40, 41] } }
});
```

An enum attribute is stored as a string, so a range on one takes any two of its members as bounds and orders them as strings: `{ status: { $between: ["cancelled", "pending"] } }`. A bound outside the enum is a compile error.

Several comparison operators on one attribute compose with **AND**, which is how a half-open range is written — the `$gte`/`$lt` pair above. `$between` is inclusive on both bounds and its pair is ordered: the lower bound comes first. dyna-record rejects an inverted pair with a `FilterError` naming the attribute, before the request is sent.

A range that cannot match is rejected either way, but the two spellings fail differently. DynamoDB validates `BETWEEN`'s bounds and rejects an inverted pair itself. It does **not** validate a composed range: `{ $gte: 100, $lt: 1 }` is applied as written and returns no rows with no error, which is indistinguishable from a query that legitimately matched nothing. dyna-record rejects both.

##### Whole values and fragments

One rule explains why `$gte` takes a `Date` while `$beginsWith` takes a string. Every condition operand is one of two things:

- A **whole value** of the attribute — an equality value, every `IN` element, every comparison operand, both `$between` bounds. These are named the way the entity declares the attribute, so a date attribute takes a `Date`. dyna-record validates the value against the attribute's schema and converts it to the form the table stores.
- A **fragment** of the stored form — a `$beginsWith` prefix, a `$contains` substring. There is no "`Date` that starts with 2026", so these stay strings and scalars whatever the attribute declares, and are neither validated nor converted.

```typescript
// A whole value: createdAt is declared as a Date, so the operand is a Date
await Order.query("123", {
  filter: { createdAt: { $gte: new Date("2026-01-01") } }
});

// A fragment: a prefix of the ISO string the table stores
await Order.query("123", {
  filter: { createdAt: { $beginsWith: "2026" } }
});
```

A whole value that is an object, or a list element named by an index, is compared whole. dyna-record stores a nulled nullable field by leaving it out, so in such an operand `null` on a nullable field means "not set": the field is left out of the value sent, which then equals a value stored without it, exactly as omitting the field does. The same holds for an `IN` element and for a `$contains` element of a list of objects. `null` is offered only on a field declared nullable, never on a required field, an object field or the whole value.

```typescript
// The Store whose first contact is Jane, with no phone
await Store.query("123", {
  filter: { "address.contacts[0]": { name: "Jane", phone: null } }
});
```

##### Which operators an attribute offers

DynamoDB's condition functions each apply to particular stored types, and a condition outside that set is not an error — it simply matches nothing, which looks exactly like a query that legitimately found no rows. dyna-record leaves those conditions out of the type instead:

| Operator                                 | Applies to a value stored as |
| ---------------------------------------- | ---------------------------- |
| `=`, `IN`                                | anything                     |
| `$gt`, `$gte`, `$lt`, `$lte`, `$between` | String, Number, Binary       |
| `$beginsWith`                            | String, Binary               |
| `$contains`                              | String, List, Set            |

The **stored** form decides, not the declared one. That is why a date attribute offers all of them: it is declared as a `Date` and stored as an ISO 8601 string, which orders lexicographically exactly as the date orders chronologically. A number attribute offers the comparators but not `$beginsWith`; a boolean offers neither. Binary is listed for completeness — dyna-record models no binary attribute kind, so no attribute stores as one.

A dot-path key is judged by the field it names, so a nested string field offers `$beginsWith` and a nested number field does not. An indexed path is judged by the element's own field. A path that names no single field — one descending into a discriminated union variant — cannot be judged, so it is left unconstrained. A path naming a field the schema does not declare, or continuing below a field that is not an object, is a `FilterError` naming the path.

##### Ranges in key conditions

A range is more valuable in a key condition than in a filter: a key condition narrows what DynamoDB **reads**, while a filter is applied after the read and only discards rows you have already paid for.

```typescript
// Reads only the Orders in this range
const result = await Customer.query("123", {
  skCondition: { $between: ["Order#100", "Order#200"] }
});
```

DynamoDB's `KeyConditionExpression` is narrower than a filter:

- The **partition key** takes an equality. Its value selects the partition to read, so there is nothing for another condition to narrow.
- The **sort key** takes exactly one condition: `=`, a comparator, `$between`, or `$beginsWith`. The comparison operators therefore do not compose here — a two-sided key range is `$between`.
- `$or`, `IN` arrays, `$contains` and dot-path keys are not available in a key condition at all.

On an **index** query, `indexName` is a bare string, so dyna-record does not know the index's key schema and cannot tell which attribute plays the partition key role. The partition key equality is enforced for entity queries, where table metadata answers that question; on an index query DynamoDB reports the error itself.

#### Filtering on Object Attributes

When using `@ObjectAttribute`, you can filter on nested Map fields using **dot-path notation** and check List membership using the **`$contains`** operator.

##### Dot-path filtering on nested fields

Use dot notation to filter on fields within an `@ObjectAttribute`. The filter operators work with dot-paths as they do with top level attributes — equality, `IN`, the comparators, `$between`, `$beginsWith` and `$contains` — each offered where the field's stored form can carry it. On an **array** field, use `$contains` to test membership: `IN` compares the whole list against each of its elements, so a list of scalars there matches nothing.

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

##### List elements

A path through an array has to say _which_ element it means, using DynamoDB's
document-path index syntax. `tags[0]` is the first element of `tags`, and a path
may continue below it when the elements are objects.

```typescript
// One element of a list of scalars
const result = await Store.query("123", {
  filter: { "address.tags[0]": "home" }
});

// A field of one element of a list of objects
const result = await Store.query("123", {
  filter: { "address.contacts[0].name": "Jane" }
});
```

An indexed path is typed by the element's own field, so it offers that field's
operators and takes that field's declared form. The type offers indexes `0`
through `9`; a higher one compiles and runs but is not in the key type, because
a condition on a specific element is in practice a condition on an early one. To
ask about a list as a whole — "does any element equal this" — use `$contains`
instead; DynamoDB has no path meaning "every element", so a path omitting the
index matches nothing and is rejected with a `FilterError`.

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

On a string the operand is a substring. On a list it is one whole element, written the way the schema declares an element: a member of the enum on a list of enums, a `Date` on a list of dates, and on a list of objects an object with the element's fields. DynamoDB compares a list of objects element by element, whole, so the operand must describe a complete element. A field the element does not declare is a `FilterError`, because no element could equal the operand, while a nullable field may be omitted or set to `null`, either of which matches an element stored without it.

```typescript
// A Store with a contact named Jane who has no phone
const result = await Store.query("123", {
  filter: { "address.contacts": { $contains: { name: "Jane", phone: null } } }
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
- **Filter values**: A filter value is typed by the attribute it targets, and named the way the entity declares it — so a date attribute takes a `Date`, which dyna-record converts to the ISO string the table stores. An array of those values is an `IN` condition. A function, a class instance, `null` as the whole value, or an operator that does not exist such as `$ne` is a compile error, as is an operator object that names none (`{}`) or that mixes families (`{ $gt, $between }`). Inside an object compared whole, `null` on a nullable field is accepted and means "not set" — see [Whole values and fragments](#whole-values-and-fragments).
- **Operator operands**: `$beginsWith` and `$contains` match against the _stored_ form, so their operands stay strings and scalars whatever the attribute's declared type. This is how a date is matched by partial value: `filter: { createdAt: { $beginsWith: "2026" } }` finds everything in that year. Every other operand is a whole value of the attribute — see [Whole values and fragments](#whole-values-and-fragments). `$contains` on a list is the exception: its operand is one whole element, named as the entity declares an element, so a list of dates takes a `Date` and a list of objects takes an object whose date fields are `Date`s.
- **Operators an attribute offers**: Each operator is available only where the attribute's stored form can carry it, so a comparator on a boolean and a `$beginsWith` on a number are compile errors rather than queries that match nothing — see [Which operators an attribute offers](#which-operators-an-attribute-offers).
- **Key condition values**: A key condition takes a value to match, `$beginsWith`, a single comparator, or `$between`. The partition key takes an equality only, and the sort key takes one condition, so the comparators do not compose there — see [Ranges in key conditions](#ranges-in-key-conditions).
- **Nested fields**: A dot-path key is typed by the field it names, so a nested date field takes a `Date` just as a top level one does, and offers the operators that field's stored form supports.

Filter and key condition values are also checked at runtime against the attribute's schema, in the form the entity declares them, before being converted to the form the table stores. A value that cannot match is reported as a `FilterError` naming the attribute rather than compiled into a query that returns nothing. Two things are not checked, because in each the value is not a value of the attribute being compared: a path that names no single field — one descending into a discriminated union variant — which must be written as stored, and the operands of `$beginsWith` and `$contains`, which are a prefix and a fragment. A `$contains` operand on a list is the exception, because it is one whole element: it is checked against the form the list's elements are stored in, so a number is rejected on a list of strings, then validated against the element's schema and converted to its stored form at every depth. A string outside the enum of a list of enums, an object with a field of the wrong type, and an object with a field the element does not declare are all rejected; a `Date`, on its own or inside an object element, is converted to the ISO string it is stored as. On a list of dates the ISO string itself is also accepted and sent as written. Each element of an `IN` array is checked and converted. An object operand — the whole value of an object attribute or of an object field, in an equality or an `IN` element — is compared whole, so a field it carries that the schema does not declare, at any depth, is a `FilterError` naming the field's path rather than being dropped, since no stored value could equal it. This holds in write conditions too, where dropping the field would let a guard hold that the caller meant to fail.

A filter condition set to `undefined` is dropped, so forwarding an optional input (`filter: { name: req.query.name }`) filters on it only when it has a value. A **key** condition set to `undefined` is an error instead: key conditions are what scope a query to a partition, so dropping one would silently widen the query to everything under it, where dropping a filter only widens the results within the partition already scoped. An operator given no value — `{ name: { $beginsWith: undefined } }` — is an error for the same reason it cannot be dropped: it asks for a comparison and supplies nothing to compare against.

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

**Return type narrowing** works with `skCondition` when the value is an exact entity name, or `$beginsWith` with an entity name or a prefix of one:

```typescript
// skCondition narrows the return type
const orders = await Customer.query("123", { skCondition: "Order" });
// orders is Array<EntityAttributesInstance<Order>>

const orders2 = await Customer.query("123", {
  skCondition: { $beginsWith: "Order" }
});
// orders2 is Array<EntityAttributesInstance<Order>>

// A value that runs past the entity name does not narrow
const specific = await Customer.query("123", { skCondition: "Order#123" });
// specific is QueryResults<Customer> (full union)

const fromPrefix = await Customer.query("123", {
  skCondition: { $beginsWith: "Order#" }
});
// fromPrefix is QueryResults<Customer> (full union)
```

Narrowing reads the entity name at the start of the sort key. `$beginsWith: "Order"` selects every entity whose name starts with `Order`, which includes an `OrderItem` if the partition has one. A value that runs past the entity name, such as `"Order#123"` or `{ $beginsWith: "Order#" }`, is accepted but does not narrow: the table's [delimiter](#customizing-the-default-field-table-aliases-or-delimiter) is configurable and the types cannot see it, so they cannot tell where the name ends.

Narrowing assumes that no entity's sort key starts with another entity's name followed by the delimiter. With the default `#` delimiter this always holds, as it does with any delimiter whose first character cannot appear in a class name.

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

##### Reusing a filter

Narrowing reads the filter's literal type: the `type` it names, its keys and its `$or` blocks. A filter written inline at the call has that type. To define a filter once and reuse it, check it with `satisfies`, which keeps the literal type. A filter whose type is a [TypedFilterParams](https://docs.dyna-record.com/types/TypedFilterParams.html) annotation, such as a function parameter or an object property, is accepted too, but the annotation widens it to every filter the partition allows, so the query cannot narrow by it and returns the whole partition's union.

```typescript
import type { TypedFilterParams } from "dyna-record";

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
```

`satisfies` also keeps every check a literal gets: a key the partition does not declare, or a value of the wrong type, is a compile error on the offending property.

When the query also takes an `skCondition` that names an entity, the filter is scoped to that entity (see [SK-scoped filter validation](#sk-scoped-filter-validation)). Type a reusable filter for that query as [SKScopedFilterParams](https://docs.dyna-record.com/types/SKScopedFilterParams.html), passing the same sort key condition. A partition-wide `TypedFilterParams<T>` is refused there, because it also offers other entities' keys and `type` values that cannot match the rows the sort key selects.

```typescript
import type { SKScopedFilterParams } from "dyna-record";

async function ordersFor(
  customerId: string,
  filter: SKScopedFilterParams<Customer, "Order">
) {
  // The skCondition narrows the results to Order
  return await Customer.query(customerId, { skCondition: "Order", filter });
}

await ordersFor("123", { orderDate: { $beginsWith: "2026" } });
```

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

Because the array is written whole, each element of an array of objects must include every non-nullable field. A nullable field inside an element can be omitted or set to `null`; either way the element is stored without it, and the instance `update` returns leaves it out too.

```typescript
// Replaces the contacts; the second is stored without a phone
await Store.update("123", {
  address: {
    contacts: [
      { name: "Jane", phone: "555-0100" },
      { name: "Sam", phone: null }
    ]
  }
});
```

`create` takes no `null`: a nullable field is omitted on create, inside a list element as anywhere else.

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

#### Conditional writes

`update` accepts a `condition` in its options. The entity, its denormalized copies and its relationship links are updated only if every part of the condition holds, checked in the same transaction. The condition can guard the entity's own row, its related entities by relationship name, and the rows its other foreign keys reference — see [Write conditions](#write-conditions) for the full language.

```typescript
// Cancel an Order only while it is still pending
await Order.update(
  "order-1",
  { status: "cancelled" },
  { condition: { status: "pending" } }
);

// The same on an instance
const cancelled = await orderInstance.update(
  { status: "cancelled" },
  { condition: { status: "pending" } }
);
```

When the update changes a BelongsTo foreign key, a guard on that relationship checks the **new** parent:

```typescript
// Move an Order to another Customer only if that Customer is active
await Order.update(
  "order-1",
  { customerId: "customer-2" },
  { condition: { customer: { status: "active" } } }
);
```

A guard on a relationship whose foreign key the same update sets to `null` could never be checked, so it is a `FilterError` before anything is read or written.

An update with an **empty payload** and a condition is a guarded touch: it changes no attribute of yours, but it still sets `updatedAt`, and only if the condition holds. That makes it a way to record that a row was checked, and it invalidates any other writer guarding on the previous `updatedAt`.

```typescript
await Order.update("order-1", {}, { condition: { status: "pending" } });
```

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

#### Conditional writes

`delete` takes an optional second argument whose `condition` guards the delete, in the same language as [update's](#write-conditions). The entity, its denormalized records and its relationship links are deleted, and its children's foreign keys cleared, only if every part of the condition holds:

```typescript
// Delete an Order only while it is pending and its Customer is active
await Order.delete("order-1", {
  condition: { status: "pending", customer: { status: "active" } }
});
```

A delete with a condition also requires the entity's own row to still exist when the transaction commits, so a delete that races another delete fails as not-found rather than reporting success for a row that is already gone. A delete without a condition behaves exactly as before.

A guard on a HasMany child or a HasOne child lands on the child's row, which the delete is already updating to clear its foreign key. It can only come into play when that foreign key is nullable: if it is not, deleting the parent fails with a `NullConstraintViolationError` before anything is sent, guard or no guard.

#### Error Handling

If deleting an entity or its relationships fails due to database constraints or errors during transaction execution, a TransactionWriteFailedError is thrown, possibly with details such as ConditionalCheckFailedError or NullConstraintViolationError for more specific issues related to relationship constraints or nullability violations. A failed [write condition](#write-conditions) is reported as a `WriteConditionFailedError`.

### Write conditions

A write condition makes a write depend on what is stored when it commits. `create`, `update` (static and instance), `delete`, and a join table's `create` and `delete` all accept one as `condition` in their options. DynamoDB checks it in the same transaction as the write. If any part of it does not hold, nothing is written: not the entity, not its denormalized copies, not its relationship links. A condition only decides whether the write happens. It never changes which items are written, and it is never checked against an earlier read. A write without a `condition` sends exactly the commands it did before.

This closes the gap between reading a row and writing it. Two processes that read the same pending Order and both decide to cancel it cannot both succeed when each cancel is guarded on `status: "pending"`.

The examples in this section extend the [CRUD schema](#crud-operations) with a few attributes and a HasAndBelongsToMany relationship between customers and stores:

```typescript
import {
  Entity,
  EnumAttribute,
  NumberAttribute,
  StringAttribute,
  ForeignKeyAttribute,
  HasAndBelongsToMany,
  JoinTable,
  ForeignKey
} from "dyna-record";

class CustomerStore extends JoinTable<Customer, Store> {
  public readonly customerId: ForeignKey<Customer>;
  public readonly storeId: ForeignKey<Store>;
}

@Entity
class Customer extends MyTable {
  // ...the attributes and relationships above, plus:

  @EnumAttribute({ alias: "Status", values: ["active", "suspended"] })
  public readonly status: "active" | "suspended";

  @HasAndBelongsToMany(() => Store, {
    targetKey: "customers",
    through: () => ({ joinTable: CustomerStore, foreignKey: "customerId" })
  })
  public readonly stores: Store[];
}

@Entity
class Order extends MyTable {
  // ...the attributes and relationships above, plus:

  @EnumAttribute({
    alias: "Status",
    values: ["pending", "shipped", "cancelled"]
  })
  public readonly status: "pending" | "shipped" | "cancelled";

  @NumberAttribute({ alias: "Total" })
  public readonly total: number;

  @StringAttribute({ alias: "TrackingNumber", nullable: true })
  public readonly trackingNumber?: string;

  // A standalone foreign key: Order declares no relationship to Store
  @ForeignKeyAttribute(() => Store, { alias: "StoreId" })
  public readonly storeId: ForeignKey<Store>;
}

@Entity
class Store extends MyTable {
  // ...the address attribute from @ObjectAttribute, plus:

  @EnumAttribute({ alias: "Status", values: ["open", "closed"] })
  public readonly status: "open" | "closed";

  @HasAndBelongsToMany(() => Customer, {
    targetKey: "stores",
    through: () => ({ joinTable: CustomerStore, foreignKey: "storeId" })
  })
  public readonly customers: Customer[];
}
```

#### The entity's own row

Keys that name the entity's own attributes guard its own row. They take everything a [query filter](#typed-query-filters) takes: equality, `IN` arrays, `$beginsWith`, `$contains`, [comparisons and `$between`](#comparison-and-range-conditions), `$or`, and [dot paths](#filtering-on-object-attributes) into object attributes. Operands are typed, validated and converted to the stored form exactly as they are in a filter (see [Whole values and fragments](#whole-values-and-fragments)), and an operator an attribute cannot carry is a compile error there too (see [Which operators an attribute offers](#which-operators-an-attribute-offers)). `type`, the partition key and the sort key are not condition keys, because the write already fixes them.

```typescript
// Cancel an Order only while it is still pending
await Order.update(
  "order-1",
  { status: "cancelled" },
  { condition: { status: "pending" } }
);

// Update only if nothing has written the Order since it was read
const order = await Order.findById("order-1");
if (order !== undefined) {
  await Order.update(
    "order-1",
    { total: 90 },
    { condition: { updatedAt: order.updatedAt } }
  );
}
```

Two rules differ from a query filter:

- **`null` means "not set".** dyna-record removes a nulled attribute rather than storing it, so in a write condition `null` on a nullable attribute matches a row where that attribute is absent, including inside `$or` branches. On an attribute that is not nullable, `null` could never match, so it is a compile error.
- **`undefined` is an error, not a dropped condition.** A filter drops an `undefined` condition so that optional inputs can be forwarded. Dropping part of a guard would quietly loosen it, so a write condition with an `undefined` operand throws a `FilterError`. An empty `$or` and a `null` inside an `IN` array are `FilterError`s too.

```typescript
// Ship an Order only if it has no tracking number yet
await Order.update(
  "order-1",
  { status: "shipped", trackingNumber: "1Z999" },
  { condition: { trackingNumber: null } }
);

// Cancel an Order that is pending or has no tracking number yet
await Order.update(
  "order-1",
  { status: "cancelled" },
  { condition: { $or: [{ status: "pending" }, { trackingNumber: null }] } }
);
```

Dot paths reach fields inside an object attribute, and an index names one element of a list, exactly as in a [filter](#list-elements). A path is validated against the schema: one naming a field the schema does not declare is a `FilterError` rather than a guard that can never hold. An object compared whole, such as a list element named by an index, takes `null` on a nullable field to mean the field is not set (see [Whole values and fragments](#whole-values-and-fragments)).

```typescript
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
```

#### Related entities

A related entity's row is guarded under the relationship's property name, beside the entity's own attributes. The value depends on the kind of relationship:

| Relationship                 | Value                                   | Which row is checked                                                                                                                                    |
| ---------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BelongsTo, HasOne            | a condition on the related entity       | The one the library finds: the parent the foreign key references, or the HasOne child                                                                   |
| HasMany, HasAndBelongsToMany | an array of `{ id, condition }` entries | Each id you name. The same transaction verifies that the id is actually related: the child's foreign key points at this entity, or the join link exists |

A related entity's condition uses the same language as the entity's own row, `null` and `$or` included. Every guard on another row also requires that row to exist, so `customer: {}` is a guard that the Customer exists. This holds even with `referentialIntegrityCheck: false`.

```typescript
// Change an Order only while its total is under 100 and its Customer is active
await Order.update(
  "order-1",
  { total: 90 },
  { condition: { total: { $lt: 100 }, customer: { status: "active" } } }
);

// Rename a Customer only while order-1 is theirs and still pending,
// and store-1 is linked to them and open
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
```

`create` accepts only BelongsTo relationships and typed foreign keys, because a new entity has no children or link partners yet (see [Create](#create)). A guard whose row cannot be found fails the write rather than being skipped: a BelongsTo whose foreign key is `null`, or a HasOne with no child, fails before anything is sent (see [When a condition fails](#when-a-condition-fails)). Naming the same id twice in one relationship is a `FilterError`.

##### `$or` stays within one row

DynamoDB evaluates a condition against exactly one item, and a transaction requires every item's condition to hold, so no condition can say "this row **or** that row". A `$or` branch therefore names the entity's own attributes only. A relationship inside `$or` is a compile error, and a `FilterError` in plain JavaScript. A related row's condition can carry its own `$or` over that row's attributes.

```typescript
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

// Compile error: a $or branch cannot name the customer relationship
await Order.update(
  "order-1",
  { status: "cancelled" },
  {
    condition: {
      $or: [{ status: "pending" }, { customer: { status: "active" } }]
    }
  }
);
```

Emulating an OR across rows with separate requests would not be atomic, so dyna-record does not offer it.

#### Foreign keys and `target`

Some foreign keys back no relationship property: a join table's keys, the child side of a [uni-directional HasMany](#hasmany), and a standalone foreign key such as `Order.storeId`. Each of these guards the row it references under its own property name, with the condition wrapped in `target`. The wrapper makes it clear that the condition applies to the referenced entity's row, not to the foreign key's value.

```typescript
// Change an Order only while its Store is open
await Order.update(
  "order-1",
  { total: 90 },
  { condition: { storeId: { target: { status: "open" } } } }
);
```

- A foreign key that backs a BelongsTo is guarded under the relationship instead: `customer: {...}`, not `customerId: { target: {...} }`. The `target` form there is a compile error, so one parent row is never reachable by two keys.
- A foreign key holds either a condition on its own value or a `target` guard, never both. Put the value condition in a `$or` branch:

  ```typescript
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
  ```

`target` guards, and the relationship guards `create` accepts, need the foreign key declared with its target type: `ForeignKey<Store>` or `NullableForeignKey<Store>`. A bare `ForeignKey` carries no compile-time link to the entity it references, so a guard on it is a compile error that points at the missing type parameter. Adding the type parameter changes nothing else.

#### Conditions on create

A `create` condition guards only the rows the new entity references: its BelongsTo relationships by property name, and its other typed foreign keys through `target`. It takes no condition on the new row's own attributes, because create already requires that row not to exist, and no HasOne, HasMany or HasAndBelongsToMany keys, because a new entity has no children or link partners yet. Every guard needs its foreign key declared with its target type and set in the attributes being created. See [Create](#create) for an example and the reasoning.

#### Join tables

A join table's `create` and `delete` take a condition keyed by the join table's foreign keys, each wrapping a condition on the referenced entity in `target`, since a join table has no row of its own. The link records are written or deleted only if every guard holds. See [HasAndBelongsToMany](#hasandbelongstomany) for an example. When a join-table guard fails, the `WriteConditionFailedError` names the join table as the `entity` and its keys as the `id`, for example `CustomerStore` and `customerId=customer-1, storeId=store-1`.

#### When a condition fails

A condition that does not hold fails the write with a [TransactionWriteFailedError](https://docs.dyna-record.com/classes/TransactionWriteFailedError.html), as any failed transaction does. Among its `errors` is a `WriteConditionFailedError`, a subclass of `ConditionalCheckFailedError`, so existing catch blocks keep working. Identify it with `instanceof`:

```typescript
import {
  TransactionWriteFailedError,
  WriteConditionFailedError
} from "dyna-record";

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
```

`entity` and `id` name the entity being written. `guards` names each guard on the row whose check failed: `{ kind: "self" }` for the entity's own row, `{ kind: "relationship", name }` for a relationship (with `id` for a HasMany or HasAndBelongsToMany entry), and `{ kind: "foreignKey", name }` for a `target` guard. DynamoDB reports only that a row's combined check failed, so when several guards land on one row, all of them are named. The message names them too: `ConditionalCheckFailed: Write condition failed on Order with ID 'order-1': its own row`. Its `code` is `"WriteConditionFailedError"`, where a plain `ConditionalCheckFailedError` carries `"ConditionalCheckFailedError"`, so code that compares `code` rather than using `instanceof` can tell them apart too.

Failures that are not your condition are reported as a plain `ConditionalCheckFailedError` inside the same `TransactionWriteFailedError`, never as a `WriteConditionFailedError`, even when they land on a guarded row. Each message starts with `ConditionalCheckFailed: `:

- **Not found.** The entity's own row does not exist: `Order with ID 'order-1' does not exist`.
- **Referential integrity.** A guarded related row does not exist: `Customer with ID 'customer-9' does not exist`.
- **Concurrent change.** The library resolved a guard's target from its own earlier read, and another write changed that relationship before the transaction committed. The write fails rather than checking a stale target: `Order with ID 'order-1' no longer references Customer with ID 'customer-1': its foreign key 'customerId' was changed by a concurrent write`.
- **Not related.** A HasMany or HasAndBelongsToMany id is not related to this entity: `Order with ID 'order-9' is not associated with Customer with ID 'customer-1' through 'orders'`, or `Store with ID 'store-9' is not linked to Customer with ID 'customer-1' through 'stores'`.

A guard whose target cannot be found in what is stored, such as a BelongsTo whose foreign key is `null` or a HasOne with no child, is reported before anything is sent, as a `WriteConditionFailedError` naming that guard inside a `TransactionWriteFailedError`.

When two writers race for the same row, DynamoDB may cancel the loser with a `TransactionConflict` instead of evaluating its condition. That `TransactionCanceledException` is passed through unchanged, not wrapped in a `TransactionWriteFailedError`, and nothing is written. It is safe to retry: the retry evaluates the condition against the winner's write.

An invalid condition (an unknown key, a relationship inside `$or`, a guard the payload rules out, an `undefined` operand, a dot path the schema does not declare) is a `FilterError` thrown before anything is read or written.

#### Limits

A write condition is a DynamoDB transaction condition, so DynamoDB's transaction rules bound it:

- **One operation per item.** A transaction may touch each item once. When a guard lands on a row the transaction already touches, such as the entity's own row or a parent row its referential integrity check reads, it is merged into that operation's condition rather than added as a separate check. That is also why several guards on one row are reported together.
- **100 items per transaction.** A guard on a row the write does not otherwise touch adds one `ConditionCheck` item, and a HasAndBelongsToMany entry adds two (the related row and the link). These count toward DynamoDB's limit of 100 items per transaction, alongside the denormalized copies the write already maintains.
- **One row per condition.** DynamoDB evaluates a condition against exactly one item, which is why `$or` [stays within one row](#or-stays-within-one-row).

## Vector Search

dyna-record supports [DynamoDB vector search](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/VectorSearchWorkingWith.html): entities declare a searchable attribute, writes embed it automatically through an embedding provider you supply, and similarity searches run as exactly one `SearchVectors` operation returning complete typed entity instances. No separate vector store, no hydration pipeline — the vectors live on your table's canonical rows.

> **Requirements:** vector indexes are an AWS feature of **on-demand capacity mode** tables only, and searches require an `ACTIVE` index. dyna-record surfaces the AWS errors directly; it does not attempt workarounds.

### Declaring searchable entities

Mark exactly one attribute per entity as its searchable text with the layered `@Searchable()` decorator and the `Searchable` property brand. Attributes that searches may filter on are declared with `@SearchFilterable()` and the `SearchFilterable` brand — strings, numbers, enums, and foreign keys qualify. Dates and objects do not, having no reliable equality semantics as an inline filter, and neither do booleans: every inline filter must be declared in the table's `AttributeDefinitions`, whose `ScalarAttributeType` set is `B | N | S`, so a boolean filter attribute cannot be provisioned at all. Nullable attributes compose: instantiate the brand with the optional form (`Filterable<NullableForeignKey<Brand>>`, `Filterable<Optional<string>>`) and the property stays optional — a row where the attribute is absent simply never matches an equality filter on it:

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
  type ForeignKey,
  type NullableForeignKey
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

  // Nullable filterable: optional on the entity, filterable when present
  @SearchFilterable()
  @ForeignKeyAttribute(() => Supplier, { alias: "SupplierId", nullable: true })
  public readonly supplierId?: Filterable<NullableForeignKey<Supplier>>;

  @ForeignKeyAttribute(() => Organization, { alias: "OrganizationId" })
  public readonly organizationId: ForeignKey<Organization>;

  @BelongsTo(() => Organization, { foreignKey: "organizationId" })
  public readonly organization: Organization;
}

// Searchable, and scoped by Organization through its foreign key — but
// Organization declares no `reviews` relationship. Nothing about search
// requires one
@Entity
class Review extends MyTable {
  declare readonly type: "Review";

  @Searchable()
  @StringAttribute({ alias: "Body" })
  public readonly body: SearchableText;

  @ForeignKeyAttribute(() => Organization, { alias: "OrganizationId" })
  public readonly organizationId: ForeignKey<Organization>;
}

// Searchable with no scope parent at all — the member of an unscoped index
@Entity
class Article extends MyTable {
  declare readonly type: "Article";

  @Searchable()
  @StringAttribute({ alias: "Content" })
  public readonly content: SearchableText;
}
```

Relationships play no part in search. Index membership is declared explicitly on the index (see `members:` below) and is the sole source of both what a search returns and how it is typed — a member needs the scoping foreign key, but never a declared relationship on the scope parent. `Review` above is exactly that case: it is searchable within an organization, and reachable by name from the index, without `Organization` declaring a relationship to it.

The brands add no friction at call sites — `create` and `update` accept plain values. An entity may declare at most one `@Searchable` attribute; a second is a compile error at the `@Entity` decorator and a runtime error at metadata initialization.

To search across multiple fields, compose them yourself into one searchable attribute. dyna-record does not auto-concatenate fields, deliberately: the composed text is exactly what gets embedded (and billed per embed), so field order, separators, and which fields participate all shape search quality — and any change to a composed field would silently trigger a re-embed. Owning the composition keeps the embedded text, and what causes it to change, visible in your code:

```typescript
// Ordinary values from your own input — not attributes on the entity
const name = "Trailhead GTX";
const summary = "Waterproof mid-cut hiking boot with a grippy outsole";

await Product.create({
  // The composed text is exactly what gets embedded, and the only thing
  // whose change triggers a re-embed
  description: `${name}\n${summary}`,
  category: "Footwear",
  brandId: "brand-id",
  organizationId: "org-id"
});
```

### Defining vector indexes

A table declares its complete set of vector indexes in **one `vectorIndexes` call**, keyed by export name. Each returned construct is that index's search surface and provisioning definition. The `provider` is **required** — dyna-record ships no embedding implementation and no embedding SDK dependency; you own the client, credentials, region, retry, and timeout posture:

```typescript
import { TitanTextEmbedV2, type EmbeddingProvider } from "dyna-record";
import {
  BedrockRuntimeClient,
  InvokeModelCommand
} from "@aws-sdk/client-bedrock-runtime";

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

export const { orgSearchIndex, helpSearchIndex } = MyTable.vectorIndexes({
  // Scoped index: searches run within one scope value at a time
  orgSearchIndex: {
    name: "org-search-index",
    vectorAttribute: "__dyna_vector",
    model: TitanTextEmbedV2,
    provider: embed,
    scopedBy: () => Organization,
    members: [() => Product, () => Review]
  },
  // Unscoped index: no scope; every search spans its whole membership
  helpSearchIndex: {
    name: "help-search-index",
    vectorAttribute: "__dyna_vector_help",
    model: TitanTextEmbedV2,
    provider: embed,
    members: [() => Article]
  }
});
```

- **`vectorAttribute`** names the table attribute the index's vectors are written under — the index's **physical membership surface**: under DynamoDB's sparse-index semantics, a row is materialized into (and billed by) an index exactly when it carries that index's attribute. It is required and explicit, must be `__dyna_vector` or start with `__dyna_vector_` (the reserved prefix; consumer attributes may not use it), and must be unique per index — enforced at compile time and at metadata initialization. It must never change on a live index: renaming it is a destructive re-provision.
- **`members`** declares the index's **complete membership** — nothing is derived from relationship declarations, and there is no automatic membership. Every listed entity must declare a `@Searchable` attribute (a non-searchable member is a compile error and an init error), and **each searchable entity belongs to exactly one index** — it is embedded by that index's model, written under that index's attribute, and ingested, billed, and searchable only there. An entity in no members list, or in two, fails at metadata initialization.
- **`model`** takes a pure-data descriptor: the shipped `TitanTextEmbedV2` (1024 dimensions), its smaller variants `TitanTextEmbedV2Dim512` and `TitanTextEmbedV2Dim256` (lower vector storage and write cost for an accuracy trade-off — your provider must request the matching output size, EX: `body: JSON.stringify({ inputText: text, dimensions: 512 })`), or your own `EmbeddingModelDescriptor`. Model, provider, dimensions, and distance function are all **per index** — two indexes on one table may embed differently.
- **`scopedBy`** takes a thunk returning one of your dyna-record entity classes — the scope parent. Every member must carry a foreign key to it, and that key becomes the index `HASH`, so every search runs within exactly one of that entity's ids. Multi-tenancy is the canonical use (scope by your tenant/organization entity), but any parent whose searches should never cross instances works the same way — a workspace, a project, a store.

  The scope parent may itself be a member, which is how you search a **hierarchy**: give the entity a foreign key to its own type and list it alongside its children. One search then returns everything under a given parent:

  ```typescript
  @Entity
  class Folder extends MyTable {
    declare readonly type: "Folder";

    @Searchable()
    @StringAttribute({ alias: "FolderName" })
    public readonly folderName: SearchableText;

    // A parent pointer to another Folder — the shared HASH below
    @ForeignKeyAttribute(() => Folder, { alias: "ParentId" })
    public readonly parentId: ForeignKey<Folder>;
  }

  MyTable.vectorIndexes({
    treeIndex: {
      name: "tree-index",
      vectorAttribute: "__dyna_vector",
      model: TitanTextEmbedV2,
      provider: embed,
      scopedBy: () => Folder,
      members: [() => Folder, () => Document] // sub-folders and documents
    }
  });
  ```

  The foreign key must be a real pointer to a _different_ row. Setting an entity's scoping key to its own id, purely to make it appear in its own scope, stores a duplicate of the partition key with no referential meaning — and it does not work: the create would put and condition-check the same item in one transaction, which DynamoDB rejects. If you want a parent searchable on its own terms, give it its own index instead.

  Two write-path consequences are worth knowing before adopting this shape:

  - **The parent must already exist.** Creating a child emits a referential condition check on the parent row, so a tree is built top-down.
  - **A root row is embedded but not searchable.** Make the scoping key nullable so roots can exist — a root then carries no `ParentId`, so under sparse-index semantics it never joins the index, even though it was embedded and billed for. Giving it a parent later makes it searchable with no re-embed, because the vector is already on the row. If your roots are never meant to be searchable, that embed is pure cost; keep root-level entities out of the index's `members` instead.

- An **unscoped** index (no `scopedBy`) has no `HASH`; its searches take no scope id and span its whole membership.

Declaring all of a table's indexes in one call is what lets the type system enforce the table-scoped rules: a duplicate `vectorAttribute` or `name`, a missing or wrongly-prefixed attribute, a non-searchable member, or an unknown option is a compile error on the offending entry. A second `vectorIndexes` call for the same table throws immediately.

### How writes embed

Creating or updating a searchable entity embeds the value synchronously through its **owning index's** provider and model, and writes the vector onto the entity's canonical row under that index's `vectorAttribute` — inside the operation's single transaction. There is no second write, no eventual-consistency pipeline, and rows are searchable sub-second after the write acknowledges. Denormalized relationship copies never carry vectors.

- **Failure semantics:** if the provider rejects or returns the wrong dimensions, the whole write fails with `EmbeddingError` (the provider error on `cause`) — no row is ever written searchable-but-not-embedded. Error messages carry entity, attribute, model, and dimension identities only, never your text.
- **Unchanged values skip embedding:** updates compare the incoming searchable value against the stored one (read through the pre-update fetch) and skip the provider call and the vector write when it is unchanged. Exception: entities with no relationships have no pre-update fetch to supply the stored value, so an update carrying the searchable attribute embeds unconditionally rather than forcing a new read.
- **`forceEmbed` overrides the skip:** `update(id, { description }, { forceEmbed: true })` embeds even when the value appears unchanged. This is the affordance for indexing rows that predate searchability — loop a backfill over existing entities re-saving their own values — and for re-embedding a table after switching embedding models.
- **Clearing:** setting a nullable searchable attribute to `null` (or `""`) removes the vector — the row leaves the index. Empty text never reaches your provider.
- **Vector writes converge the row to one attribute:** on a table with several indexes, any write that touches the vector also removes the table's _other_ vector attributes from the row (a names-only no-op when they are absent). If you move an entity between indexes, existing rows keep their old attribute — still resident and billed in the old physical index — until a vector-touching write lands; re-write moved entities with `forceEmbed` to converge them immediately (see [Migrating from 2.x](#migrating-from-2x)).
- **Latency:** the provider call bounds write latency. Measured against Bedrock Titan V2: ~320 ms p50 / ~400 ms p90 per embed — roughly 7× the DynamoDB write it accompanies. The embed runs concurrently with the operation's existing reads where possible.

### Searching

Search runs through the **index construct** — the values `vectorIndexes({...})` returned — and compiles to exactly one `SearchVectors` operation. Results are ordered most-similar-first; each result carries the complete typed entity (`entity`), a `similarity` (higher is better, converted per the model's distance function — for COSINE, `1 − score`), and the raw AWS `score`.

The index is the thing being searched, so it is the thing you call. It knows its own `members`, which makes every result union exact, and it names itself, so a table with several indexes never has an ambiguous call. The signature follows the index's shape: scoped constructs take the scope value first (they are searchable only within one scope value); unscoped constructs take the query first and reject a scope id.

Starting from the simplest call and adding one option at a time:

```typescript
// No options: searches the organization's whole scoped index, returning the
// 10 most similar (the default topK). The result union is exactly the index's
// declared membership
const results = await orgSearchIndex.search("orgId", "waterproof hiking boots");
// results is Array<SearchResult<Product> | SearchResult<Review>>

// in: narrows to one member entity BY NAME — only Products are searched, and
// the results are typed Product accordingly
const products = await orgSearchIndex.search(
  "orgId",
  "waterproof hiking boots",
  {
    in: "Product"
  }
);
// products is Array<SearchResult<Product>>

// Every declared member is reachable by name, including Review, which carries
// the scoping foreign key but declares no relationship on Organization
const reviews = await orgSearchIndex.search("orgId", "sizing runs small", {
  in: "Review"
});
// reviews is Array<SearchResult<Review>>

// filter: equality conditions on @SearchFilterable attributes, applied in
// the same single operation (no post-fetch filtering)
const footwear = await orgSearchIndex.search(
  "orgId",
  "waterproof hiking boots",
  {
    in: "Product",
    filter: { category: "Footwear" }
  }
);

// Filterable foreign keys narrow by relationship in the same way — products
// of one brand, within the organization's scope
const brandFootwear = await orgSearchIndex.search("orgId", "hiking boots", {
  in: "Product",
  filter: { category: "Footwear", brandId: "brand-id" }
});

// topK: how many results to return — default 10, max 100 (an AWS limit;
// there is no pagination)
const topFifty = await orgSearchIndex.search("orgId", "hiking boots", {
  topK: 50
});

// Unscoped construct: query first, no scope id — searches its declared
// membership, typed exactly like a scoped construct's
const guides = await helpSearchIndex.search("hiking boot sizing");
// guides is Array<SearchResult<Article>>

const articles = await helpSearchIndex.search("hiking boot sizing", {
  in: "Article"
});

// Every result carries the typed entity, similarity, and raw score;
// discriminate on entity.type when the search spans multiple entity types
results.forEach(({ entity, similarity, score }) => {
  if (entity.type === "Product") console.log(entity.description, similarity);
});
```

Every search also accepts a **precomputed vector** in place of query text: `{ vector: number[] }`. The embedding provider is not called — useful when you already hold an embedding (computed by a pipeline outside the request path, cached from an earlier query, or produced in a batch) or when reusing one query embedding across several searches, since each text search bills and waits for its own provider call:

```typescript
// Vector in place of text — the provider is never called
await helpSearchIndex.search({ vector: myVector });

// One provider call, reused across searches
const vector = await embed("waterproof hiking boots");

await orgSearchIndex.search("orgId", { vector }, { in: "Product" });
await orgSearchIndex.search("orgId", { vector }, { in: "Review" });
```

The vector must come from the **same model and dimension count** the index was provisioned with — a different model's embedding produces meaningless similarity scores rather than an error, which dyna-record cannot detect. What it can detect, it does: a vector whose length differs from the index's declared dimensions is rejected with a `ValidationError` before any AWS call.

#### Typed end to end

Both sides of every search are inferred from your declarations — the same brand-driven inference that powers typed query filters:

- **Inputs:** `in:` accepts only the index's declared member entity names. `filter` keys narrow to exactly the searched members' `@SearchFilterable` attributes, and `filter` values narrow to each attribute's declared type — both narrow further when `in:` is present. Non-filterable attributes, unsupported operator shapes, and values the attribute cannot hold are compile errors. Scoped constructs require the scope value first; unscoped constructs reject one.
- **Responses:** the return type is inferred, not declared. `in:` present → `Array<SearchResult<ThatEntity>>`; `in:` omitted → the widened union across the index's whole declared membership (`Array<SearchResult<A> | SearchResult<B>>`), where only shared attributes are accessible until you discriminate on `entity.type` — exactly like query result narrowing. Because membership is declared explicitly, scoped and unscoped constructs are typed identically, and the union always matches what the search actually returns.

#### Filter value typing

A `filter` value is typed from the attribute's own declaration, not widened to "some scalar". An enum filterable accepts only its declared members; a number filterable rejects a string; a filterable foreign key accepts a plain string, because the library's own brands never reach a caller.

Consumer-defined brands are the exception, and deliberately so. dyna-record strips the brands it imposes — `ForeignKey`, `NullableForeignKey`, `Searchable` — because you never asked for them. A brand of your own exists precisely so that a bare value fails, so it survives into the filter type, exactly as it does in `create` and `update` inputs. The rule in one line: **dyna-record strips its own brands, never yours.**

When several members of an index declare the same filterable property, the accepted value is the union of their declared types, and `in:` narrows it to the named member:

```typescript
@Entity
class Listing extends SearchTable {
  @SearchFilterable()
  @EnumAttribute({ alias: "Tier", values: ["gold", "silver"] })
  public readonly tier: Filterable<"gold" | "silver">;
  // ...
}

@Entity
class Review extends SearchTable {
  @SearchFilterable()
  @EnumAttribute({ alias: "Tier", values: ["bronze", "copper"] })
  public readonly tier: Filterable<"bronze" | "copper">;
  // ...
}

// No `in:` — either member's values are in range
await storeSearchIndex.search("store-1", "mugs", { filter: { tier: "gold" } });
await storeSearchIndex.search("store-1", "mugs", {
  filter: { tier: "bronze" }
});

// `in:` narrows the union to that member's declarations
await storeSearchIndex.search("store-1", "mugs", {
  in: "Listing",
  // Error: Type '"bronze"' is not assignable to type '"gold" | "silver" | undefined'
  filter: { tier: "bronze" }
});
```

Members sharing a filterable property must agree on the **type it provisions as**, even when their declared types differ. One filterable property is one table attribute, and one `AttributeDefinitions` entry carries one `ScalarAttributeType` — so two enum value sets are fine (both store as `S`), while a string on one member and a number on another is rejected at metadata initialization rather than at `CreateTable`.

### Filters, scoping, and tenant isolation

DynamoDB's search condition grammar is an **equality-only conjunction**: `attribute = value` conditions joined by `AND`, at most one condition per attribute. This is an AWS constraint, not a library choice — `$or`, `$beginsWith`, `$contains`, `IN` arrays, and range operators are rejected at compile time and at runtime.

Two mechanisms narrow a search, and they are not interchangeable:

- **`scopedBy` is the enforced isolation boundary.** The `HASH` equality is set by the library on every search of a scoped index and cannot be omitted or overridden — a tenant-scoped index physically cannot search across tenants.
- **`filter` narrows within a boundary.** Filterable foreign keys enable sub-scope narrowing (products within a brand, within the organization scope) in the same single operation. **Never use `filter` as tenant separation on an unscoped index** — it is a narrowing convenience, not an isolation mechanism.

A third boundary is the index itself. Because each searchable entity belongs to exactly one index and each index writes its own `vectorAttribute`, **membership is physically disjoint**: an index's searches can never be crowded by another index's corpus, and each corpus is ingested and billed only by its own index. Two indexes may share a scope parent — a catalog corpus and a support corpus both scoped by Organization, say — and remain fully independent: separate attributes, separate physical indexes, separately rankable, optionally separate embedding models. This matters because DynamoDB's filter grammar has no `IN`/`OR`: a shared index could not exclude a co-resident corpus from an un-narrowed search, but disjoint indexes never need to.

Search filters are checked twice. Keys and values are constrained at compile time as described above, and the same conditions are re-checked at runtime for untrusted input — unknown keys, non-filterable attributes, unsupported operator shapes, and mistyped values are rejected before any AWS call, whether or not the caller was typed. Still, **allowlist keys before spreading request input into `filter`** — a valid-but-unintended filterable key is indistinguishable from an intended one.

### Provisioning

Vector indexes are infrastructure. dyna-record declares and validates the configuration and executes searches, but does not create the index — provision it with your IaC tool using the serialized contract from `metadata()`.

Every attribute in a `searchSchema` — the `hash` and every entry in `inlineFilters` — **must also be declared in the table's `AttributeDefinitions`**, the same way key attributes are for a global secondary index, with the `ScalarAttributeType` its kind provisions as: `S` for strings, enums, and foreign keys, `N` for numbers. Since dyna-record does not create the table, this is yours to get right; the library's part is refusing to declare a filter it knows cannot be provisioned.

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
// }, {
//   name: "help-search-index",
//   model: "amazon.titan-embed-text-v2:0",
//   vectorAttribute: "__dyna_vector_help",
//   dimensions: 1024,
//   distanceFunction: "COSINE",
//   projection: "ALL",
//   searchSchema: { inlineFilters: ["Type"] },
//   fingerprint: "…"
// }]
```

Notes on the contract:

- Search-schema entries are **table aliases** (the names stored in DynamoDB), and each must also appear in the table's `AttributeDefinitions`. The entity `type` discriminator is auto-declared as an inline filter on every index; DynamoDB allows at most 18 inline filters per index (the `HASH` does not count).
- `vectorAttribute` is per index and is part of the provisioning contract — pass it as the index's `VectorAttribute` when provisioning.
- The provider never appears in serialized metadata — only the model descriptor's name. No credentials or client configuration can leak through `metadata()`.
- **Index configuration is immutable in DynamoDB.** Adding or removing any `@Searchable`/`@SearchFilterable` declaration affecting a live index — or changing its `vectorAttribute`, model, dimensions, or distance function — is a **destructive re-provision**: the index must be deleted and recreated, and because vectors are written at write time, the recreated index's corpus recovers only as rows are re-written. The `fingerprint` field hashes the search schema, dimensions, distance function, and vector attribute so IaC can detect that a declaration change implies replacement before it happens.
- **AWS creates and deletes one vector index per table at a time** (shared with GSI online indexing), and a new index backfills before it is searchable — `SearchVectors` fails during the backfill and can briefly fail after the index first reports `ACTIVE`. Provision several indexes sequentially and treat first-search failures as retryable.
- **Adopting vector search on an existing table:** pre-existing rows have no vector and are unsearchable until their next write. dyna-record ships no backfill — re-write rows through `update` at your own pace to bring them into the index.
- Configuration is validated when metadata initializes (lazily, at the first operation, with the failure cached and re-thrown on every subsequent operation). Calling `MyTable.metadata()` during startup fails fast at deploy time instead of on the first live request.

### Migrating from 2.x

3.0.0 replaces the shared `__dyna_vector` attribute with a required per-index `vectorAttribute` and makes membership explicit. The migration is mechanical, with one rule that must not be broken:

1. **Wrap declarations in one `vectorIndexes` call**, keyed by export name. The per-call `vectorIndex()` API is removed.
2. **Existing indexes must set `vectorAttribute: "__dyna_vector"`** — the attribute their deployed rows already carry. Any other value is a destructive re-provision requiring a full re-embed of the corpus. With that value kept, the serialized provisioning contract is unchanged and **no re-provision and no data migration occur**.
3. **List every index's members explicitly.** Membership is no longer derived from the scope parent's relationships, and global indexes' automatic all-searchable-entities membership no longer exists — enumerate the corpus (the zero-owner init error lists anything you miss). A 2.x searchable entity that was silently in no index now fails fast at init.
4. **Fingerprints have a new format** — the vector attribute joined the hash inputs — so expect a one-time fingerprint diff on upgrade with no underlying config change. Tooling must not destroy or rebuild an index on a fingerprint change alone; diff the config fields.
5. **Move every `Parent.search(...)` call to its index construct.** The entity-anchored search surface is removed: search runs through the values `vectorIndexes({...})` returned. `Organization.search(orgId, q)` becomes `orgSearchIndex.search(orgId, q)`, and `in:` now names **member entities** rather than relationship properties — `{ in: "products" }` becomes `{ in: "Product" }`. Every call site is a compile error until moved, so nothing is missed silently. Two consequences worth having: un-narrowed results are now typed as the index's full membership (the parent surface typed them from relationships, so members with no relationship on the parent — a `Review` — were returned but typed as a sibling), and a parent may now scope any number of indexes with no ambiguity.
6. **Moving an entity between indexes does not migrate its rows.** Rows whose searchable text never changes keep their vector under the old attribute (still resident and billed in the old index) and have none under the new one — re-write each moved entity with `forceEmbed` to converge it. Two limits on that convergence: it only happens on writes that actually embed or clear (an unchanged-value update writes no vector clauses), and it only removes attributes of indexes the table _still declares_ — so drain an index's corpus before deleting its declaration, or clear the orphaned attribute with a one-off pass afterward.
7. `vectorSearchKeys` is no longer exported; `reservedVectorAttributePrefix` and `isValidVectorAttributeName` replace it.

### Permissions and networking

- **`dynamodb:SearchVectors` is a new IAM action** — existing policies granting DynamoDB read access do not include it. Roles that call `search` need it in addition to the usual read/write actions dyna-record already requires.
- **Your embedding provider needs its own permissions** — for the Bedrock example above, `bedrock:InvokeModel` on the model, with model access enabled in your account and region. dyna-record never touches these credentials; the provider function owns them.
- **`SearchVectors` resolves to separate endpoints** (`<account-id>.search-ddb.<region>.amazonaws.com`, or the dual-stack `search-dynamodb.<region>.api.aws` — not the standard DynamoDB endpoint; the AWS SDKs route automatically). If your network restricts egress through a VPC endpoint, proxy, or allowlist, permit the search hostname too — otherwise writes succeed and only searches fail, with a connection error that does not indicate the cause.

### Cost model

Vector search changes the write and read economics of searchable rows — dyna-record's design choices here exist to manage that, so it's worth understanding what they can and cannot save you:

- **Vector writes dominate, and the unchanged-value skip is the mitigation.** DynamoDB bills a full vector write (`max(1024, 4 × dimensions)` bytes — 4 KB at Titan's 1024 dimensions) on every material write to a vector-bearing row, even updates that don't touch the searchable attribute. dyna-record's unchanged-value comparison avoids the _embedding call_ on unchanged values; the vector write billing on other updates is inherent to keeping the vector on the row.
- **dyna-record truncates embeddings to 7 significant digits** (float32 precision — verified zero effect on search results). This roughly halves the searchable row's storage and ordinary write-capacity footprint. It does **not** reduce vector billing — no precision trick does.
- **Searchable rows are permanently larger, and reads bill on full item size.** dyna-record excludes the vector from `findById`, `query`, and internal pre-fetches via projection, which saves bandwidth and latency — but DynamoDB bills reads on the full item regardless of projection, so every ordinary read of a searchable row costs more forever. Factor this in before marking high-read-traffic entities searchable.

## Type Safety Features

Dyna-Record integrates type safety into your DynamoDB interactions, reducing runtime errors and enhancing code quality.

- **Entity Type Declaration**: The `@Entity` decorator enforces that each entity declares `readonly type` as a string literal matching the class name (`declare readonly type: "MyEntity"`). This is required for compile-time query type safety.
- **Attribute Type Enforcement**: Ensures that the data types of attributes match their definitions in your entities.
- **Method Parameter Checking**: Validates method parameters against entity definitions, preventing invalid operations.
- **Relationship Integrity**: Automatically manages the consistency of relationships between entities, ensuring data integrity.
- **Typed Query Filters**: Query filter keys are validated against the attributes of entities in the partition. Invalid keys, relationship property names, and non-existent attributes produce compile errors. The `type` field only accepts valid entity class names. Filter values are checked too: each is typed by the attribute it targets, and each operator is offered only where that attribute's stored form can carry it.
- **Return Type Narrowing**: When a query filter specifies a `type` value, the return type is automatically narrowed to only the matching entity types instead of the full partition union.
- **`$or` Element Narrowing**: Each element in a `$or` filter array is independently type-checked based on its own `type` field, preventing attribute mismatches.
- **Typed Write Conditions**: A [write condition](#write-conditions) is typed like a query filter over the entity's own attributes, with relationship keys typed by the related entity and `target` guards typed by the foreign key's type parameter. A relationship inside `$or`, a `target` guard on a bare `ForeignKey`, and a `create` condition on the new row's own attributes are compile errors.
- **Searchable Brands**: `@Searchable()` and `@SearchFilterable()` require the `Searchable`/`SearchFilterable` property brands, so the searchable and filterable sets are known at compile time — search `in:` values, filter keys, and result unions all derive from them. A second `@Searchable` attribute on one entity is a compile error at the `@Entity` decorator.
- **Vector Index Declaration Validation**: `vectorIndexes` declarations are validated at the type level — a duplicate `vectorAttribute` or `IndexName`, a missing or wrongly-prefixed vector attribute, a member entity with no `@Searchable` attribute, or an unknown option is a compile error on the offending entry, with metadata initialization as the runtime backstop.
- **Search Return Type Narrowing**: Search results are inferred from the searched membership — the union of searched entity types by default, narrowed to a single entity type when `in:` is present, mirroring query return type narrowing. Membership is declared explicitly, so scoped and unscoped constructs are typed alike.
- **Search Surface Shape**: `search` is reached only through an index construct, never an entity class, so the searched membership is always known. Scoped constructs require the scope value first; unscoped constructs reject one, and each shape is a compile error on the other kind of index.

## Best Practices

- **Define Clear Entity Relationships**: Clearly define how your entities relate to each other for easier data retrieval and manipulation.
- **Use Type Aliases for Foreign Keys**: Utilize TypeScript's type aliases for foreign keys to enhance code readability and maintainability.
- **Leverage Type Safety**: Take advantage of Dyna-Record's type safety features to catch errors early in development.
- **Define Access Patterns**: Dynamo is not as flexible as a relational database. Try to define all access patterns up front.

## Debug logging

To enable debug logging set `process.env.DYNA_RECORD_LOGGING_ENABLED` to `"true"`. When enabled, dyna-record will log to console the dynamo operations it is performing.
