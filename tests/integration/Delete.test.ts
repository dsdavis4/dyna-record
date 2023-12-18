import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { MockTable } from "./mockModels";
import {
  Attribute,
  BelongsTo,
  Entity,
  HasMany,
  HasOne
} from "../../src/decorators";
import { TransactWriteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { ForeignKey } from "../../src/types";

const mockTransactWriteCommand = jest.mocked(TransactWriteCommand);
const mockedQueryCommand = jest.mocked(QueryCommand);

const mockSend = jest.fn();
const mockQuery = jest.fn();
const mockDelete = jest.fn();
const mockTransact = jest.fn();

@Entity
class Person extends MockTable {
  @Attribute({ alias: "Name" })
  public name: string;

  @HasMany(() => Pet, { foreignKey: "ownerId" })
  public pets: Pet[];

  @HasOne(() => Address, { foreignKey: "personId" })
  public address: Address;
}

@Entity
class Pet extends MockTable {
  @Attribute({ alias: "Name" })
  public name: string;

  @Attribute({ alias: "OwnerId" })
  public ownerId: ForeignKey;

  @BelongsTo(() => Person, { foreignKey: "ownerId" })
  public owner: Person;
}

@Entity
class Address extends MockTable {
  @Attribute({ alias: "State" })
  public state: string;

  @Attribute({ alias: "PersonId" })
  public personId: ForeignKey;

  @BelongsTo(() => Person, { foreignKey: "personId" })
  public person: Person;
}

jest.mock("@aws-sdk/client-dynamodb", () => {
  return {
    TransactionCanceledException: jest.fn().mockImplementation((...params) => {
      const obj = Object.create(TransactionCanceledException.prototype);
      Object.assign(obj, ...params);
      return obj;
    }),
    DynamoDBClient: jest.fn().mockImplementation(() => {
      return { key: "MockDynamoDBClient" };
    })
  };
});

jest.mock("@aws-sdk/lib-dynamodb", () => {
  return {
    DynamoDBDocumentClient: {
      from: jest.fn().mockImplementation(() => {
        return {
          send: jest.fn().mockImplementation(async command => {
            mockSend(command);
            if (command.name === "QueryCommand") {
              return await Promise.resolve(mockQuery());
            }

            if (command.name === "DeleteCommand") {
              return await Promise.resolve(mockDelete());
            }

            if (command.name === "TransactWriteCommand") {
              return await Promise.resolve(mockTransact());
            }
          })
        };
      })
    },
    QueryCommand: jest.fn().mockImplementation(() => {
      return { name: "QueryCommand" };
    }),
    DeleteCommand: jest.fn().mockImplementation(() => {
      return { name: "DeleteCommand" };
    }),
    TransactWriteCommand: jest.fn().mockImplementation(() => {
      return { name: "TransactWriteCommand" };
    })
  };
});

describe("Delete", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("will delete an entity that has no relationships", async () => {
    expect.assertions(6);

    @Entity
    class MockModel extends MockTable {
      @Attribute({ alias: "MyVar1" })
      public myVar1: string;

      @Attribute({ alias: "MyVar2" })
      public myVar2: number;
    }

    mockQuery.mockResolvedValueOnce({
      Items: [
        {
          PK: "MockModel#123",
          SK: "MockModel",
          Id: "123",
          Type: "MockModel",
          MyVar1: "MyVar1 val",
          MyVar2: 1
        }
      ]
    });

    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    const res = await MockModel.delete("123");

    expect(res).toEqual(undefined);
    expect(mockSend.mock.calls).toEqual([
      [{ name: "QueryCommand" }],
      [{ name: "TransactWriteCommand" }]
    ]);
    expect(mockQuery.mock.calls).toEqual([[]]);
    expect(mockedQueryCommand.mock.calls).toEqual([
      [
        {
          TableName: "mock-table",
          KeyConditionExpression: "#PK = :PK1",
          ExpressionAttributeNames: { "#PK": "PK" },
          ExpressionAttributeValues: { ":PK1": "MockModel#123" }
        }
      ]
    ]);
    expect(mockTransact.mock.calls).toEqual([[]]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Delete: {
                TableName: "mock-table",
                Key: { PK: "MockModel#123", SK: "MockModel" }
              }
            }
          ]
        }
      ]
    ]);
  });

  it("it will delete an entity that belongs to a relationship as HasMany (Removes BelongsToLink from related HasMany partition)", async () => {
    expect.assertions(6);

    mockQuery.mockResolvedValueOnce({
      Items: [
        {
          PK: "Pet#123",
          SK: "Pet",
          Id: "123",
          Type: "Pet",
          Name: "Fido",
          OwnerId: "456"
        }
      ]
    });

    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    const res = await Pet.delete("123");

    expect(res).toEqual(undefined);
    expect(mockSend.mock.calls).toEqual([
      [{ name: "QueryCommand" }],
      [{ name: "TransactWriteCommand" }]
    ]);
    expect(mockQuery.mock.calls).toEqual([[]]);
    expect(mockedQueryCommand.mock.calls).toEqual([
      [
        {
          TableName: "mock-table",
          KeyConditionExpression: "#PK = :PK1",
          ExpressionAttributeNames: { "#PK": "PK" },
          ExpressionAttributeValues: { ":PK1": "Pet#123" }
        }
      ]
    ]);
    expect(mockTransact.mock.calls).toEqual([[]]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Delete: {
                TableName: "mock-table",
                Key: { PK: "Pet#123", SK: "Pet" }
              }
            },
            {
              // Delete belongs to link for associated hasMany
              Delete: {
                TableName: "mock-table",
                Key: { PK: "Person#456", SK: "Pet#123" }
              }
            }
          ]
        }
      ]
    ]);
  });

  it("it will delete an entity that belongs to a relationship as HasOne (Removes BelongsToLink from related HasOne partition)", async () => {
    expect.assertions(6);

    mockQuery.mockResolvedValueOnce({
      Items: [
        {
          PK: "Address#123",
          SK: "Address",
          Id: "123",
          Type: "Address",
          State: "CO",
          PersonId: "456"
        }
      ]
    });

    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    const res = await Address.delete("123");

    expect(res).toEqual(undefined);
    expect(mockSend.mock.calls).toEqual([
      [{ name: "QueryCommand" }],
      [{ name: "TransactWriteCommand" }]
    ]);
    expect(mockQuery.mock.calls).toEqual([[]]);
    expect(mockedQueryCommand.mock.calls).toEqual([
      [
        {
          TableName: "mock-table",
          KeyConditionExpression: "#PK = :PK1",
          ExpressionAttributeNames: { "#PK": "PK" },
          ExpressionAttributeValues: { ":PK1": "Address#123" }
        }
      ]
    ]);
    expect(mockTransact.mock.calls).toEqual([[]]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Delete: {
                TableName: "mock-table",
                Key: { PK: "Address#123", SK: "Address" }
              }
            },
            {
              // Delete belongs to link for associated HasOne
              Delete: {
                TableName: "mock-table",
                Key: { PK: "Person#456", SK: "Address" }
              }
            }
          ]
        }
      ]
    ]);
  });

  // it("will remove the foreign key attribute on any the HasMany entities that belong to it", async () => {TODO});

  // it("will remove the foreign key attribute on any the HasOne entities that belong to it", async () => {TODO});

  // describe("error handling", () => {
  //   // it("will throw an error if the entity being deleted does not exist", async () => {
  //   //   expect.assertions(8);
  //   // });
  //   // it("will throw an error if it fails to delete the entity", async () => {TODO});

  //   // it("will throw an error if it fails to remove the foreign key attribute from items which belong to the entity as HasMany", async () => {TODO});

  //   // it("will throw an error if it fails to remove the foreign key attribute from items which belong to the entity as HasOne", async () => {TODO});
  // });

  // describe("types", () => {
  //   it("accepts a string as id", () => {
  // TODO
  //   })
  // })
});
