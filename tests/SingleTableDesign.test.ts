import SingleTableDesign from "../src";
import {
  Table,
  Entity,
  Attribute,
  HasMany,
  BelongsTo
} from "../src/decorators";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
jest.mock("@aws-sdk/client-dynamodb");

import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  QueryCommandInput
} from "@aws-sdk/lib-dynamodb";

const mockedDynamoDBClient = jest.mocked(DynamoDBClient);
const mockedDynamoDBDocumentClient = jest.mocked(DynamoDBDocumentClient);
const mockedGetCommand = jest.mocked(GetCommand);

const mockGet = jest.fn();
const mockSend = jest.fn().mockImplementation(command => {
  if (command.name == "GetCommand") {
    return Promise.resolve(mockGet());
  }
});

jest.mock("@aws-sdk/client-dynamodb", () => {
  return {
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
          send: mockSend
        };
      })
    },
    /* Return your other docClient methods here too... */
    GetCommand: jest.fn().mockImplementation(() => {
      return { name: "GetCommand" };
    })
  };
});

@Table({ name: "mock-table", primaryKey: "PK", sortKey: "SK", delimiter: "#" })
abstract class MockTable extends SingleTableDesign {
  @Attribute({ alias: "PK" })
  public pk: string;

  @Attribute({ alias: "SK" })
  public sk: string;
}

@Entity
class Pet extends MockTable {
  @Attribute({ alias: "Id" })
  public id: string;

  @Attribute({ alias: "OwnerId" })
  public ownerId: string;

  @BelongsTo(type => Person, { as: "pets" })
  public owner: Person;
}

@Entity
class Person extends MockTable {
  @Attribute({ alias: "Id" })
  public id: string;

  @Attribute({ alias: "Name" })
  public name: string;

  @Attribute({ alias: "UpdatedAt" })
  public updatedAt: Date;

  @HasMany(type => Pet, { foreignKey: "ownerId" })
  public pets: Pet[];

  public mockCustomInstanceMethod() {
    return "mock-value";
  }
}

describe("SingleTableDesign", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("findById", () => {
    it("will initialize a Dynamo client", async () => {
      expect.assertions(2);

      mockGet.mockResolvedValueOnce({});

      await Person.findById("123");

      expect(mockedDynamoDBClient.mock.calls).toEqual([
        [{ region: "us-west-2" }]
      ]);
      expect(mockedDynamoDBDocumentClient.from.mock.calls).toEqual([
        [{ key: "MockDynamoDBClient" }]
      ]);
    });

    it("will find an Entity by id and serialize it to the model", async () => {
      expect.assertions(5);

      mockGet.mockResolvedValueOnce({
        Item: {
          PK: "Person#123",
          SK: "Person",
          Id: "123",
          Name: "Some Person",
          Type: "Person",
          UpdatedAt: "2023-09-15T04:26:31.148Z"
        }
      });

      const result = await Person.findById("123");

      expect(result).toBeInstanceOf(Person);
      expect(result).toEqual({
        type: "Person",
        pk: "Person#123",
        sk: "Person",
        id: "123",
        name: "Some Person",
        updatedAt: "2023-09-15T04:26:31.148Z"
      });
      expect(result?.mockCustomInstanceMethod()).toEqual("mock-value");
      expect(mockedGetCommand.mock.calls).toEqual([
        [
          {
            Key: { PK: "Person#123", SK: "Person" },
            TableName: "mock-table"
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "GetCommand" }]]);
    });

    it("will return null if it doesn't find the record", async () => {
      expect.assertions(3);

      mockGet.mockResolvedValueOnce({});

      const result = await Person.findById("123");

      expect(result).toEqual(null);
      expect(mockedGetCommand.mock.calls).toEqual([
        [
          {
            Key: { PK: "Person#123", SK: "Person" },
            TableName: "mock-table"
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "GetCommand" }]]);
    });
  });
});
