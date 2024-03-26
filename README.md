# Dyna-Record

[API Documentation](https://dyna-record.com/)

Dyna-Record is a strongly typed ORM (Object-Relational Mapping) tool designed for modeling and interacting with data stored in DynamoDB in a structured and type-safe manner. It simplifies the process of defining data models (entities), performing CRUD operations, and handling complex queries. To support relational data, dyna-record implements a flavor of [single-table design patterns](https://aws.amazon.com/blogs/compute/creating-a-single-table-design-with-amazon-dynamodb/). All operations are [ACID compliant transactions\*](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html)\.

Note: ACID compliant according to DynamoDB [limitations](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html)

<!-- TODO add quliafer about acid -->

<!-- TODO here -->

<!-- TODO add debug logging docs -->

## Table of Contents

- [Getting Started](#getting-started)
  - [Installation](#installation)
  - [Configuration](#configuration)
- [Defining Entities](#defining-entities)
  - [Attributes](#attributes)
  - [Relationships](#relationships)
- [CRUD Operations](#crud-operations)
  - [Create](#create)
  - [Read](#read)
    - [FindById](#findbyid)
    - [Query](#query)
  - [Update](#update)
  - [Delete](#delete)
- [Type Safety Features](#type-safety-features)
- [Best Practices](#best-practices)

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

### Required Permissions

<!-- TODO add minimum required permissions -->

## Defining Entities

Entities in Dyna-Record represent your DynamoDB table structures and relationships. Each entity corresponds to a DynamoDB table.

### Table

Create a table class that extends [DynaRecord base class](https://dyna-record.com/classes/default.html) and us decorated with the [Table decorator](https://dyna-record.com/functions/Table.html). At a minimum, the table class define the [PartitionKeyAttribute](https://dyna-record.com/functions/PartitionKeyAttribute.html) and [SortKeyAttribute](https://dyna-record.com/functions/SortKeyAttribute.html).

```typescript
@Table({ name: "my-table", delimiter: "#" })
abstract class MyTable extends DynaRecord {
  @PartitionKeyAttribute({ alias: "PK" })
  public readonly pk: PartitionKey;

  @SortKeyAttribute({ alias: "SK" })
  public readonly sk: SortKey;
}
```

### Entity

Each entity must extend the Table class. To support single table design patterns, they must extend the same tables class.

```typescript
@Entity
class Student extends MyTable {
  // ...
}

@Entity
class Course extends MyTable {
  ...
}

```

### Attributes

For [natively supported data types](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.NamingRulesDataTypes.html#HowItWorks.DataTypes), define attributes using the [@Attribute](https://dyna-record.com/functions/Attribute.html) or [@NullableAttribute](https://dyna-record.com/functions/NullableAttribute.html) decorators. This decorator maps class properties to DynamoDB table attributes.

- The [alias](https://dyna-record.com/interfaces/AttributeOptions.html#alias) option allows you to specify the attribute name as it appears in the DynamoDB table, different from your class property name.
- Set nullable attributes as optional for optimal type safety
- Attempting to remove a non-nullable attribute will result in a [NullConstrainViolationError](https://dyna-record.com/classes/NullConstraintViolationError.html)

```typescript
@Entity
class Student extends MyTable {
  @Attribute({ alias: "Username" }) // Sets alias if field in Dynamo is different then on the model
  public username: string;

  @Attribute() // Dynamo field and entity field are the same
  public email: string;

  @NullableAttribute()
  public someAttribute?: number; // Mark as optional
}
```

### Date Attributes

Dates are not natively supported in Dynamo. To define a date attribute use [@DateAttribute](https://dyna-record.com/functions/DateAttribute.html) or [@NullableDateAttribute](https://dyna-record.com/functions/DateNullableAttribute.html) decorators. dyna-record will save the values as ISO strings in Dynamo, but serialize them as JS date objects on the entity instance

- The [alias](https://dyna-record.com/interfaces/AttributeOptions.html#alias) option allows you to specify the attribute name as it appears in the DynamoDB table, different from your class property name.
- Set nullable attributes as optional for optimal type safety
- Attempting to remove a non-nullable attribute will result in a [NullConstrainViolationError](https://dyna-record.com/classes/NullConstraintViolationError.html)

```typescript
@Entity
class Student extends MyTable {
  @DateAttribute()
  public readonly signUpDate: Date;

  @NullableDateAttribute({ alias: "LastLogin" })
  public readonly lastLogin?: Date; // Set as optional
}
```

### Foreign Keys

Define foreign keys in order to support [@BelongsTo](https://dyna-record.com/functions/BelongsTo.html) relationships. A foreign key us required for [@HasOne](https://dyna-record.com/functions/HasOne.html) and [@HasMany](https://dyna-record.com/functions/HasMany.html) relationships.

- The [alias](https://dyna-record.com/interfaces/AttributeOptions.html#alias) option allows you to specify the attribute name as it appears in the DynamoDB table, different from your class property name.
- Set nullable foreign key attributes as optional for optimal type safety
- Attempting to remove an entity from a non-nullable foreign key will result in a [NullConstrainViolationError](https://dyna-record.com/classes/NullConstraintViolationError.html)

```typescript
@Entity
class Assignment extends MyTable {
  @ForeignKeyAttribute()
  public readonly courseId: ForeignKey;

  @BelongsTo(() => Course, { foreignKey: "courseId" })
  public readonly course: Course;
}

@Entity
class Course extends MyTable {
  @NullableForeignKeyAttribute()
  public readonly teacherId?: NullableForeignKey; // Set as optional

  @BelongsTo(() => Teacher, { foreignKey: "teacherId" })
  public readonly teacher?: Teacher; // Set as optional because its linked through NullableForeignKey
}
```

### Relationships

Dyna-Record supports defining relationships between entities such as [@HasOne](https://dyna-record.com/functions/HasOne.html), [@HasMany](https://dyna-record.com/functions/HasMany.html), [@BelongsTo](https://dyna-record.com/functions/BelongsTo.html) and [@HasAndBelongsToMany](https://dyna-record.com/functions/HasAndBelongsToMany.html). It does this by de-normalizing [BelongsToLinks](https://dyna-record.com/classes/BelongsToLink.html) according the each pattern to support relational querying.

A relationship can be defined as nullable or non-nullable. Non-nullable relationships will be enforced via transactions and violations will result in [NullConstraintViolationError](https://dyna-record.com/classes/NullConstraintViolationError.html)

- `@ForeignKeyAttribute` is used to define a foreign key that links to another entity and is nullable.
- `@NullableForeignKeyAttribute` is used to define a foreign key that links to another entity and is nullable.
- Relationship decorators (`@HasOne`, `@HasMany`, `@BelongsTo`, `@HasAndBelongsToMany`) define how entities relate to each other.

#### HasOne

```typescript
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

  // 'assignmentId' Must be defined on self as ForeignKey
  @BelongsTo(() => Assignment, { foreignKey: "assignmentId" })
  public readonly assignment: Assignment;
}
```

### HasMany

```typescript
@Entity
class Teacher extends MyTable {
  // 'teacherId' Must be defined on self as ForeignKey
  @HasMany(() => Course, { foreignKey: "teacherId" })
  public readonly courses: Course[];
}

@Entity
class Course extends MyTable {
  @NullableForeignKeyAttribute()
  public readonly teacherId?: NullableForeignKey;

  @BelongsTo(() => Teacher, { foreignKey: "teacherId" })
  public readonly teacher?: Teacher;
}
```

### HasAndBelongsToMany

HasAndBelongsToMany relationships require a [JoinTable](https://dyna-record.com/classes/JoinTable.html) class. This represents a virtual table to support the relationship

```typescript
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

Use the `create` method to insert new records into your DynamoDB table.

```typescript
const newUser = await User.create({
  username: "john_doe",
  email: "john@example.com"
});
```

### Read

#### FindById

Retrieve a single record by its primary key.

```typescript
const user = await User.findById("user-id");
```

#### Query

Query records based on primary key attributes and other conditions.

```typescript
const users = await User.query({
  pk: "User#123",
  sk: { $beginsWith: "Order" }
});
```

### Update

Update existing records. You can also update foreign keys, which automatically handles related entities.

```typescript
await User.update("user-id", {
  username: "jane_doe"
});
```

### Delete

Delete records by their primary key.

```typescript
await User.delete("user-id");
```

## Type Safety Features

Dyna-Record integrates type safety into your DynamoDB interactions, reducing runtime errors and enhancing code quality.

- **Attribute Type Enforcement**: Ensures that the data types of attributes match their definitions in your entities.
- **Method Parameter Checking**: Validates method parameters against entity definitions, preventing invalid operations.
- **Relationship Integrity**: Automatically manages the consistency of relationships between entities, ensuring data integrity.

## Best Practices

- **Define Clear Entity Relationships**: Clearly define how your entities relate to each other for easier data retrieval and manipulation.
- **Use Type Aliases for Foreign Keys**: Utilize TypeScript's type aliases for foreign keys to enhance code readability and maintainability.
- **Leverage Type Safety**: Take advantage of Dyna-Record's type safety features to catch errors early in development.

Dyna-Record offers a robust and type-safe ORM layer for DynamoDB, making it easier to manage complex data structures and relationships in your applications. By following the guidelines and practices outlined in this documentation, you can effectively utilize Dyna-Record to
