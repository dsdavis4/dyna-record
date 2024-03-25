# Dyna-Record

[Documentation Site](https://dyna-record.com/)

Dyna-Record is a type-safe ORM (Object-Relational Mapping) tool designed for managing and interacting with data stored in DynamoDB in a structured and type-safe manner. It simplifies the process of defining data models (entities), performing CRUD operations, and handling complex queries with ease. This documentation covers the core concepts, entity structure, and CRUD operation methods, highlighting the type safety features of Dyna-Record.

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

\`\`\`bash
npm install dyna-record

# or

yarn add dyna-record
\`\`\`

### Configuration

Before using Dyna-Record, configure it to connect to your DynamoDB instance. This typically involves specifying your AWS credentials and setting the DynamoDB table names you will be working with.

## Defining Entities

Entities in Dyna-Record represent your DynamoDB table structures and relationships. Each entity corresponds to a DynamoDB table.

### Attributes

Define attributes using the \`@Attribute\` decorator. This decorator maps class properties to DynamoDB table attributes.

\`\`\`typescript
@Entity
class User extends MockTable {
@Attribute({ alias: "Username" })
public username: string;

@Attribute()
public email: string;
}
\`\`\`

- The \`alias\` option allows you to specify the attribute name as it appears in the DynamoDB table, different from your class property name.

### Relationships

Dyna-Record supports defining relationships between entities such as \`HasOne\`, \`HasMany\`, and \`BelongsTo\`.

\`\`\`typescript
@Entity
class Order extends MockTable {
@ForeignKeyAttribute({ alias: "CustomerId" })
public customerId: ForeignKey;

@BelongsTo(() => Customer, { foreignKey: "customerId" })
public customer: Customer;
}
\`\`\`

- \`@ForeignKeyAttribute\` is used to define a foreign key that links to another entity.
- Relationship decorators (\`@HasOne\`, \`@HasMany\`, \`@BelongsTo\`) define how entities relate to each other.

## CRUD Operations

### Create

Use the \`create\` method to insert new records into your DynamoDB table.

\`\`\`typescript
const newUser = await User.create({
username: "john_doe",
email: "john@example.com",
});
\`\`\`

### Read

#### FindById

Retrieve a single record by its primary key.

\`\`\`typescript
const user = await User.findById("user-id");
\`\`\`

#### Query

Query records based on primary key attributes and other conditions.

\`\`\`typescript
const users = await User.query({ pk: "User#123", sk: { $beginsWith: "Order" } });
\`\`\`

### Update

Update existing records. You can also update foreign keys, which automatically handles related entities.

\`\`\`typescript
await User.update("user-id", {
username: "jane_doe",
});
\`\`\`

### Delete

Delete records by their primary key.

\`\`\`typescript
await User.delete("user-id");
\`\`\`

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
