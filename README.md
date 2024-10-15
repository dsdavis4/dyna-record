# Dyna-Record

[API Documentation](https://dyna-record.com/)

Dyna-Record is a strongly typed ORM (Object-Relational Mapping) tool designed for modeling and interacting with data stored in DynamoDB in a structured and type-safe manner. It simplifies the process of defining data models (entities), performing CRUD operations, and handling complex queries. To support relational data, dyna-record implements a flavor of the [single-table design pattern](https://aws.amazon.com/blogs/compute/creating-a-single-table-design-with-amazon-dynamodb/) and the [adjacency list design pattern](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-adjacency-graphs.html). All operations are [ACID compliant transactions\*](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html)\. To enforce data integrity beyond the type system, schema validation is performed at runtime.

Note: ACID compliant according to DynamoDB [limitations](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html)

## Table of Contents

- [Getting Started](#getting-started)
  - [Installation](#installation)
  - [Configuration](#configuration)
- [Defining Entities](#defining-entities)
  - [Attributes](#attributes)
  - [Relationships](#relationships)
- [CRUD Operations](#crud-operations)
  - [Create](#create)
  - [FindById](#findbyid)
  - [Query](#query)
  - [Update](#update)
  - [Delete](#delete)
- [Type Safety Features](#type-safety-features)
- [Best Practices](#best-practices)
- [Debug Logging](#debug-logging)

## Getting Started

### Installation

To install Dyna-Record, use npm or yarn:

```bash
npm install dyna-record
```

or

```bash
yarn add dyna-record
```

## Defining Entities

Entities in Dyna-Record represent your DynamoDB table structure and relationships. Think of each entity as a table in a relational database, even though they will be represented on a single table.

### Table

[Docs](https://dyna-record.com/functions/Table.html)

Create a table class that extends [DynaRecord base class](https://dyna-record.com/classes/default.html) and is decorated with the [Table decorator](https://dyna-record.com/functions/Table.html). At a minimum, the table class must define the [PartitionKeyAttribute](https://dyna-record.com/functions/PartitionKeyAttribute.html) and [SortKeyAttribute](https://dyna-record.com/functions/SortKeyAttribute.html).

#### Basic usage

```typescript
import DynaRecord, {
  Table,
  PartitionKeyAttribute,
  SortKeyAttribute,
  PartitionKey,
  SortKey
} from "dyna-record";

@Table({ name: "my-table", delimiter: "#" })
abstract class MyTable extends DynaRecord {
  @PartitionKeyAttribute({ alias: "PK" })
  public readonly pk: PartitionKey;

  @SortKeyAttribute({ alias: "SK" })
  public readonly sk: SortKey;
}
```

#### Customizing the default field table aliases

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
  delimiter: "#",
  defaultFields: {
    id: { alias: "Id" },
    type: { alias: "Type" },
    createdAt: { alias: "CreatedAt" },
    updatedAt: { alias: "UpdatedAt" },
    foreignKey: { alias: "ForeignKey" },
    foreignEntityType: { alias: "ForeignEntityType" }
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

[Docs](https://dyna-record.com/functions/Entity.html)

Each entity must extend the Table class. To support single table design patterns, they must extend the same tables class.

By default, each entity will have [default attributes](https://dyna-record.com/types/_internal_.DefaultFields.html)

- The partition key defined on the [table](#table) class
- The sort key defined on the [table](#table) class
- [id](https://dyna-record.com/classes/default.html#id) - The auto generated uuid for the model
- [type](https://dyna-record.com/classes/default.html#type) - The type of the entity. Value is the entity class name
- [createdAt](https://dyna-record.com/classes/default.html#updatedAt) - The timestamp of when the entity was created
- [updatedAt](https://dyna-record.com/classes/default.html#updatedAt) - Timestamp of when the entity was updated last

```typescript
import { Entity } from "dyna-record";

@Entity
class Student extends MyTable {
  // ...
}

@Entity
class Course extends MyTable {
  /// ...
}
```

### Attributes

Use the attribute decorators below to define attributes on a model. The decorator maps class properties to DynamoDB table attributes.

- Attribute decorators

  - [@StringAttribute](https://dyna-record.com/functions/StringAttribute.html)
  - [@NumberAttribute](https://dyna-record.com/functions/NumberAttribute.html)
  - [@BooleanAttribute](https://dyna-record.com/functions/BooleanAttribute.html)
  - [@DateAttribute](https://dyna-record.com/functions/DateAttribute.html)
  - [@EnumAttribute](https://dyna-record.com/functions/EnumAttribute.html)

- The [alias](https://dyna-record.com/interfaces/AttributeOptions.html#alias) option allows you to specify the attribute name as it appears in the DynamoDB table, different from your class property name.
- Set nullable attributes as optional for optimal type safety
- Attempting to remove a non-nullable attribute will result in a [NullConstrainViolationError](https://dyna-record.com/classes/NullConstraintViolationError.html)

```typescript
import { Entity, Attribute } from "dyna-record";

@Entity
class Student extends MyTable {
  @StringAttribute({ alias: "Username" }) // Sets alias if field in Dynamo is different then on the model
  public username: string;

  @StringAttribute() // Dynamo field and entity field are the same
  public email: string;

  @NumberAttribute({ nullable: true })
  public someAttribute?: number; // Mark as optional
}
```

### Foreign Keys

Define foreign keys in order to support [@BelongsTo](https://dyna-record.com/functions/BelongsTo.html) relationships. A foreign key is required for [@HasOne](https://dyna-record.com/functions/HasOne.html) and [@HasMany](https://dyna-record.com/functions/HasMany.html) relationships.

- The [alias](https://dyna-record.com/interfaces/AttributeOptions.html#alias) option allows you to specify the attribute name as it appears in the DynamoDB table, different from your class property name.
- Set nullable foreign key attributes as optional for optimal type safety
- Attempting to remove an entity from a non-nullable foreign key will result in a [NullConstrainViolationError](https://dyna-record.com/classes/NullConstraintViolationError.html)

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
  @ForeignKeyAttribute()
  public readonly courseId: ForeignKey;

  @BelongsTo(() => Course, { foreignKey: "courseId" })
  public readonly course: Course;
}

@Entity
class Course extends MyTable {
  @ForeignKeyAttribute({ nullable: true })
  public readonly teacherId?: NullableForeignKey; // Set as optional

  @BelongsTo(() => Teacher, { foreignKey: "teacherId" })
  public readonly teacher?: Teacher; // Set as optional because its linked through NullableForeignKey
}
```

### Relationships

Dyna-Record supports defining relationships between entities such as [@HasOne](https://dyna-record.com/functions/HasOne.html), [@HasMany](https://dyna-record.com/functions/HasMany.html), [@BelongsTo](https://dyna-record.com/functions/BelongsTo.html) and [@HasAndBelongsToMany](https://dyna-record.com/functions/HasAndBelongsToMany.html). It does this by de-normalizing [BelongsToLinks](https://dyna-record.com/classes/BelongsToLink.html) according the each pattern to support relational querying.

A relationship can be defined as nullable or non-nullable. Non-nullable relationships will be enforced via transactions and violations will result in [NullConstraintViolationError](https://dyna-record.com/classes/NullConstraintViolationError.html)

- [@ForeignKeyAttribute](https://dyna-record.com/functions/ForeignKeyAttribute.html) is used to define a foreign key that links to another entity
- Relationship decorators ([@HasOne](#hasone), [@HasMany](#hasmany), [@BelongsTo](https://dyna-record.com/functions/BelongsTo.html), [@HasAndBelongsToMany](#hasandbelongstomany)) define how entities relate to each other.

#### HasOne

[Docs](https://dyna-record.com/functions/HasOne.html)

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
  // 'assignmentId' must be defined on associated model
  @HasOne(() => Grade, { foreignKey: "assignmentId" })
  public readonly grade: Grade;
}

@Entity
class Grade extends MyTable {
  @ForeignKeyAttribute()
  public readonly assignmentId: ForeignKey;

  // 'assignmentId' Must be defined on self as ForeignKey or NullableForeignKey
  @BelongsTo(() => Assignment, { foreignKey: "assignmentId" })
  public readonly assignment: Assignment;
}
```

### HasMany

[Docs](https://dyna-record.com/functions/HasMany.html)

```typescript
import { Entity, NullableForeignKey, BelongsTo, HasMany } from "dyna-record";

@Entity
class Teacher extends MyTable {
  // 'teacherId' must be defined on associated model
  @HasMany(() => Course, { foreignKey: "teacherId" })
  public readonly courses: Course[];
}

@Entity
class Course extends MyTable {
  @ForeignKeyAttribute({ nullable: true })
  public readonly teacherId?: NullableForeignKey; // Mark as optional

  // 'teacherId' Must be defined on self as ForeignKey or NullableForeignKey
  @BelongsTo(() => Teacher, { foreignKey: "teacherId" })
  public readonly teacher?: Teacher;
}
```

### HasAndBelongsToMany

[Docs](https://dyna-record.com/functions/HasAndBelongsToMany.html)

HasAndBelongsToMany relationships require a [JoinTable](https://dyna-record.com/classes/JoinTable.html) class. This represents a virtual table to support the relationship

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
  @HasAndBelongsToMany(() => Student, {
    targetKey: "courses",
    through: () => ({ joinTable: StudentCourse, foreignKey: "courseId" })
  })
  public readonly students: Student[];
}

@Entity
class Student extends OtherTable {
  @HasAndBelongsToMany(() => Course, {
    targetKey: "students",
    through: () => ({ joinTable: StudentCourse, foreignKey: "studentId" })
  })
  public readonly courses: Course[];
}
```

## CRUD Operations

### Create

[Docs](https://dyna-record.com/classes/default.html#create)

The create method is used to insert a new record into a DynamoDB table. This method automatically handles key generation (using UUIDs), timestamps for [createdAt](https://dyna-record.com/classes/default.html#createdAt) and [updatedAt](https://dyna-record.com/classes/default.html#updatedAt) fields, and the management of relationships between entities. It leverages AWS SDK's [TransactWriteCommand](https://www.google.com/search?q=aws+transact+write+command&oq=aws+transact+write+command&gs_lcrp=EgZjaHJvbWUyBggAEEUYOTIGCAEQRRg7MgYIAhBFGDvSAQgzMjAzajBqN6gCALACAA&sourceid=chrome&ie=UTF-8) for transactional integrity, ensuring either complete success or rollback in case of any failure. The method handles conditional checks to ensure data integrity and consistency during creation. If a foreignKey is set on create, dyna-record will de-normalize the data required in order to support the relationship

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

#### Error handling

The method is designed to throw errors under various conditions, such as transaction cancellation due to failed conditional checks. For instance, if you attempt to create a `Grade` for an `Assignment` that already has one, the method throws a [TransactionWriteFailedError](https://dyna-record.com/classes/TransactionWriteFailedError.html).

#### Notes

- Automatic Timestamp Management: The [createdAt](https://dyna-record.com/classes/default.html#createdAt) and [updatedAt](https://dyna-record.com/classes/default.html#updatedAt) fields are managed automatically and reflect the time of creation and the last update, respectively.
- Automatic ID Generation: Each entity created gets a unique [id](https://dyna-record.com/classes/default.html#id) generated by the uuidv4 method.
- Relationship Management: The ORM manages entity relationships through DynamoDB's single-table design patterns, creating and maintaining the necessary links between related entities.
- Conditional Checks: To ensure data integrity, the create method performs various conditional checks, such as verifying the existence of entities that new records relate to.
- Error Handling: Errors during the creation process are handled gracefully, with specific errors thrown for different failure scenarios, such as conditional check failures or transaction cancellations.

### FindById

[Docs](https://dyna-record.com/classes/default.html#findById)

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

[Docs](https://dyna-record.com/classes/default.html#query)

The query method is a versatile tool for querying data from DynamoDB tables using primary key conditions and various optional filters. This method enables fetching multiple items that match specific criteria, making it ideal for situations where more than one item needs to be retrieved based on attributes of the primary key (partition key and sort key).

There are two main patterns; query by id and query by primary key

#### Basic usage

To query items using the id, simply pass the partition key value as the first parameter. This fetches all items that share the same partition key value.

The result will be an array of the entity and [BelongsToLinks](https://dyna-record.com/classes/BelongsToLink.html)

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

To be more precise to the underlying data, you can specify the partition key and sort key directly. The keys here will be the partition and sort keys defined on the [table](#table) class.

```typescript
const orderLinks = await Customer.query({
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
      type: ["BelongsToLink", "Brewery"],
      createdAt: { $beginsWith: "202" },
      $or: [
        {
          foreignKey: "111",
          updatedAt: { $beginsWith: "2023-02-15" }
        },
        {
          foreignKey: ["222", "333"],
          createdAt: { $beginsWith: "2021-09-15T" },
          foreignEntityType: "Assignment"
        },
        {
          id: "123"
        }
      ]
    }
  }
);
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

[Docs](https://dyna-record.com/classes/default.html#update)

The update method enables modifications to existing items in a DynamoDB table. It supports updating simple attributes, handling nullable fields, and managing relationships between entities, including updating and removing foreign keys. Only attributes defined on the model can be updated, and will be enforced via types and runtime schema validation.

#### Updating simple attributes

```typescript
await Customer.update("123", {
  name: "New Name",
  address: "New Address"
});
```

#### Removing attributes

Note: Attempting to remove a non nullable attribute will result in a [NullConstraintViolationError](https://dyna-record.com/classes/NullConstraintViolationError.html)

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

Note: Attempting to remove a non nullable foreign key will result in a [NullConstraintViolationError](https://dyna-record.com/classes/NullConstraintViolationError.html)

```typescript
await Pet.update("123", {
  ownerId: null
});
```

#### Instance Method

There is an instance `update` method that has the same rules above, but returns the full updated instance.

```typescript
const updatedInstance = await petInstance.update({
  ownerId: null
});
```

### Delete

[Docs](https://dyna-record.com/classes/default.html#delete)

The delete method is used to remove an entity from a DynamoDB table, along with handling the deletion of associated items in relationships (like HasMany, HasOne, BelongsTo) to maintain the integrity of the database schema.

```typescript
await User.delete("user-id");
```

#### Handling HasMany and HasOne Relationships

When deleting entities involved in HasMany or HasOne relationships:

If a Pet belongs to an Owner (HasMany relationship), deleting the Pet will remove its BelongsToLink from the Owner's partition.
If a Home belongs to a Person (HasOne relationship), deleting the Home will remove its BelongsToLink from the Person's partition.

```typescript
await Home.delete("123");
```

This deletes the Home entity and its BelongsToLink with a Person.

#### Deleting Entities from HasAndBelongsToMany Relationships

For entities part of a HasAndBelongsToMany relationship, deleting one entity will remove the association links (join table entries) with the related entities.

If a Book has and belongs to many authors:

```typescript
await Book.delete("123");
```

This deletes a Book entity and its association links with Author entities.

#### Error Handling

If deleting an entity or its relationships fails due to database constraints or errors during transaction execution, a TransactionWriteFailedError is thrown, possibly with details such as ConditionalCheckFailedError or NullConstraintViolationError for more specific issues related to relationship constraints or nullability violations.

## Type Safety Features

Dyna-Record integrates type safety into your DynamoDB interactions, reducing runtime errors and enhancing code quality.

- **Attribute Type Enforcement**: Ensures that the data types of attributes match their definitions in your entities.
- **Method Parameter Checking**: Validates method parameters against entity definitions, preventing invalid operations.
- **Relationship Integrity**: Automatically manages the consistency of relationships between entities, ensuring data integrity.

## Best Practices

- **Define Clear Entity Relationships**: Clearly define how your entities relate to each other for easier data retrieval and manipulation.
- **Use Type Aliases for Foreign Keys**: Utilize TypeScript's type aliases for foreign keys to enhance code readability and maintainability.
- **Leverage Type Safety**: Take advantage of Dyna-Record's type safety features to catch errors early in development.
- **Define Access Patterns**: Dynamo is not as flexible as a relational database. Try to define all access patterns up front.

## Debug logging

To enable debug logging set `process.env.DYNA_RECORD_LOGGING_ENABLED` to `"true"`. When enabled, dyna-record will log to console the dynamo operations it is performing.
