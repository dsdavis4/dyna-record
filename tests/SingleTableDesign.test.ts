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
        return { send: mockSend };
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
class Order extends MockTable {
  @Attribute({ alias: "Id" })
  public id: string;

  @Attribute({ alias: "CustomerId" })
  public customerId: string;

  @Attribute({ alias: "OrderDate" })
  public orderDate: Date;

  @Attribute({ alias: "UpdatedAt" })
  public updatedAt: Date;

  @BelongsTo(type => Customer, { as: "orders" })
  public order: Order;
}

@Entity
class Customer extends MockTable {
  @Attribute({ alias: "Id" })
  public id: string;

  @Attribute({ alias: "Name" })
  public name: string;

  @Attribute({ alias: "Address" })
  public address: string;

  @Attribute({ alias: "UpdatedAt" })
  public updatedAt: Date;

  @HasMany(type => Order, { foreignKey: "customerId" })
  public orders: Order[];

  public mockCustomInstanceMethod() {
    return `${this.name}-${this.id}`;
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

      await Customer.findById("123");

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
          PK: "Customer#123",
          SK: "Customer",
          Id: "123",
          Name: "Some Customer",
          Address: "11 Some St",
          Type: "Customer",
          UpdatedAt: "2023-09-15T04:26:31.148Z",
          SomeAttr: "attribute that is not modeled"
        }
      });

      const result = await Customer.findById("123");

      expect(result).toBeInstanceOf(Customer);
      expect(result).toEqual({
        type: "Customer",
        pk: "Customer#123",
        sk: "Customer",
        id: "123",
        name: "Some Customer",
        address: "11 Some St",
        updatedAt: "2023-09-15T04:26:31.148Z"
      });
      expect(result?.mockCustomInstanceMethod()).toEqual("Some Customer-123");
      expect(mockedGetCommand.mock.calls).toEqual([
        [
          {
            Key: { PK: "Customer#123", SK: "Customer" },
            TableName: "mock-table"
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "GetCommand" }]]);
    });

    it("will return null if it doesn't find the record", async () => {
      expect.assertions(3);

      mockGet.mockResolvedValueOnce({});

      const result = await Customer.findById("123");

      expect(result).toEqual(null);
      expect(mockedGetCommand.mock.calls).toEqual([
        [
          {
            Key: { PK: "Customer#123", SK: "Customer" },
            TableName: "mock-table"
          }
        ]
      ]);
      expect(mockSend.mock.calls).toEqual([[{ name: "GetCommand" }]]);
    });
  });
});
