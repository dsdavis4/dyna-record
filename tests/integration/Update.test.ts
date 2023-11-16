import { TransactWriteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import {
  Customer,
  MockTable,
  Order,
  PaymentMethodProvider
} from "./mockModels";
import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { v4 as uuidv4 } from "uuid";

// TODO start here
// After wrting tests, refactor and dry everything up.
// and clean up

jest.mock("uuid");

const mockTransactWriteCommand = jest.mocked(TransactWriteCommand);
const mockedGetCommand = jest.mocked(GetCommand);

const mockSend = jest.fn();
const mockGet = jest.fn();
const mockTransact = jest.fn(); // TODO is this used?

const mockedUuidv4 = jest.mocked(uuidv4);

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
            if (command.name === "GetCommand") {
              return await Promise.resolve(mockGet());
            }

            if (command.name === "TransactWriteCommand") {
              return await Promise.resolve(mockTransact());
            }
          })
        };
      })
    },
    GetCommand: jest.fn().mockImplementation(() => {
      return { name: "GetCommand" };
    }),
    TransactWriteCommand: jest.fn().mockImplementation(() => {
      return { name: "TransactWriteCommand" };
    })
  };
});

// TODO add types test, similiar to create but with optional properties
describe("Update", () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("will update an entity without foreign key attributes", async () => {
    expect.assertions(6);

    jest.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));

    expect(
      // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
      await Customer.update("123", {
        name: "New Name",
        address: "new Address"
      })
    ).toBeUndefined();
    expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
    expect(mockTransact.mock.calls).toEqual([[]]);
    expect(mockSend.mock.calls).toEqual([[{ name: "TransactWriteCommand" }]]);
    expect(mockedGetCommand.mock.calls).toEqual([]);
    expect(mockTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Update: {
                TableName: "mock-table",
                Key: { PK: "Customer#123", SK: "Customer" },
                UpdateExpression:
                  "SET #Name = :Name, #Address = :Address, #UpdatedAt = :UpdatedAt",
                ConditionExpression: "attribute_exists(PK)",
                ExpressionAttributeNames: {
                  "#Address": "Address",
                  "#Name": "Name",
                  "#UpdatedAt": "UpdatedAt"
                },
                ExpressionAttributeValues: {
                  ":Address": "new Address",
                  ":Name": "New Name",
                  ":UpdatedAt": "2023-10-16T03:31:35.918Z"
                }
              }
            }
          ]
        }
      ]
    ]);
  });

  // TODO here...
  // describe("ForeignKey is updated for entity which BelongsTo an entity who HasOne of it", async () => {
  //   describe("when the entity does not already belong to another entity", () => {
  //     it("will update the foreign key if the associated entity exists", async () => {});

  //     it("will throw an error if the associated entity does not exist", async () => {});

  //     it("will throw an error if the entity is already associated with the requested entity", async () => {});
  //   });

  //   describe("when the entity belongs to another another entity", () => {
  //     it("will update the foreign key and delete the old BelongsToLink if the associated entity exists", async () => {});

  //     it("will throw an error if the associated entity does not exist", async () => {});

  //     // TODO is this one possible in this scenario?
  //     it("will throw an error if the entity is already associated with the requested entity", async () => {});
  //   });
  // });
});
