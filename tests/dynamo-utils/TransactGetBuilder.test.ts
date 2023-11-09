import TransactGetBuilder from "../../src/dynamo-utils/TransactGetBuilder";

import DynamoClient from "../../src/DynamoClient";
jest.mock("../../src/DynamoClient");

describe("TransactGetBuilder", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("will handle transactions of more than the max allowed by Dynamo (100) into multiple requests", async () => {
    expect.assertions(3);

    const numTransactions = 303;

    const mockTransactGetItems = jest.spyOn(
      DynamoClient.prototype,
      "transactGetItems"
    );

    mockTransactGetItems.mockImplementation(async params => {
      const transactions = params.TransactItems ?? [];
      return await Promise.resolve(
        transactions.map(transaction => ({ Item: transaction.Get?.Key }))
      );
    });

    const transactionBuilder = new TransactGetBuilder();

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
    expect(mockTransactGetItems).toHaveBeenCalledTimes(4);
  });
});
