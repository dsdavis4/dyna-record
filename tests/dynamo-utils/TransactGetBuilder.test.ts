import TransactGetBuilder from "../../src/dynamo-utils/TransactGetBuilder.js";
import DynamoClient from "../../src/dynamo-utils/DynamoClient.js";
import { TransactGetCommand } from "@aws-sdk/lib-dynamodb";

const mockSend = vi.fn();

vi.mock("@aws-sdk/lib-dynamodb", () => {
  return {
    TransactGetCommand: vi.fn().mockImplementation(input => {
      return { name: "TransactGetCommand", input };
    })
  };
});

const mockedTransactGetCommand = vi.mocked(TransactGetCommand);

describe("TransactGetBuilder", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockSend.mockReset();
  });

  it("will handle transactions of more than the max allowed by Dynamo (100) into multiple requests", async () => {
    expect.assertions(3);

    const numTransactions = 303;

    mockSend.mockImplementation(async command => {
      const transactions = command.input.TransactItems ?? [];
      return await Promise.resolve({
        Responses: transactions.map(
          (transaction: { Get?: { Key: unknown } }) => ({
            Item: transaction.Get?.Key
          })
        )
      });
    });

    const transactionBuilder = new TransactGetBuilder(
      new DynamoClient({ send: async command => await mockSend(command) })
    );

    for (let i = 0; i < numTransactions; i++) {
      transactionBuilder.addGet({
        TableName: "mock-table",
        Key: { PK: `PK#${i + 1}`, SK: `SK#${i + 1}` }
      });
    }

    const res = await transactionBuilder.executeTransaction();

    expect(res).toEqual(
      Array(numTransactions)
        .fill(undefined)
        .map((_x, i) => ({
          Item: { PK: `PK#${i + 1}`, SK: `SK#${i + 1}` }
        }))
    );
    expect(res).toHaveLength(numTransactions);
    expect(mockedTransactGetCommand).toHaveBeenCalledTimes(4);
  });

  it("sends through the client it was constructed with", async () => {
    expect.assertions(2);

    mockSend.mockResolvedValueOnce({ Responses: [{ Item: { PK: "PK#1" } }] });

    const transactionBuilder = new TransactGetBuilder(
      new DynamoClient({ send: async command => await mockSend(command) })
    );

    transactionBuilder.addGet({ TableName: "mock-table", Key: { PK: "PK#1" } });

    const res = await transactionBuilder.executeTransaction();

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(res).toEqual([{ Item: { PK: "PK#1" } }]);
  });
});
