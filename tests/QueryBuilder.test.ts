import QueryBuilder from "../src/QueryBuilder";

// import metadata from "../src/metadata";
jest.mock("../src/metadata", () => ({
  tables: {
    MockTable: {
      name: "mock-table",
      primaryKey: "PK",
      sortKey: "SK",
      delimiter: "#"
    }
  },
  entities: {
    Scale: {
      tableName: "MockTable",
      attributes: {
        Type: { name: "type" },
        PK: { name: "pk" },
        SK: { name: "sk" },
        Id: { name: "id" },
        Name: { name: "name" },
        UpdatedAt: { name: "updatedAt" },
        CreatedAt: { name: "createdAt" }
      }
    }
  }
}));

describe("QueryBuilder", () => {
  it("returns QueryCommandInput for an AND filter on a partition", () => {
    expect.assertions(1);

    const queryBuilder = new QueryBuilder({
      entityClassName: "Scale",
      key: { pk: "Scale#123" },
      options: {
        filter: {
          type: "Process",
          createdAt: { $beginsWith: "2021-09-05" },
          name: ["Process1", "Process2"]
        }
      }
    });

    expect(queryBuilder.build()).toEqual({
      TableName: "mock-table",
      KeyConditionExpression: "#PK = :PK5",
      FilterExpression:
        "#Type = :Type1 AND begins_with(#CreatedAt, :CreatedAt2) AND #Name IN (:Name3,:Name4)",
      ExpressionAttributeNames: {
        "#CreatedAt": "CreatedAt",
        "#Name": "Name",
        "#PK": "PK",
        "#Type": "Type"
      },
      ExpressionAttributeValues: {
        ":CreatedAt2": "2021-09-05",
        ":Name3": "Process1",
        ":Name4": "Process2",
        ":PK5": "Scale#123",
        ":Type1": "Process"
      }
    });
  });

  // TODO make this test pass
  it.skip("returns QueryCommandInput for an OR filter on a partition", () => {
    expect.assertions(1);

    const queryBuilder = new QueryBuilder({
      entityClassName: "Scale",
      key: { pk: "Scale#123" },
      options: {
        filter: {
          $or: [
            {
              type: "Process",
              createdAt: { $beginsWith: "2021-09-05" },
              name: ["Process1", "Process2"]
            }
          ]
        }
      }
    });

    expect(queryBuilder.build()).toEqual(undefined);
  });

  it("returns QueryCommandInput for an AND/OR filter on a partition", () => {
    expect.assertions(1);

    const queryBuilder = new QueryBuilder({
      entityClassName: "Scale",
      key: { pk: "Scale#123" },
      options: {
        filter: {
          type: "Process",
          name: ["Process1", "Process2"],
          $or: [
            { type: "BelongsToLink" },
            { createdAt: { $beginsWith: "2021-09-05" } }
          ]
        }
      }
    });

    expect(queryBuilder.build()).toEqual({
      TableName: "mock-table",
      KeyConditionExpression: "#PK = :PK6",
      FilterExpression:
        "(#Type = :Type1 OR begins_with(#CreatedAt, :CreatedAt2)) AND (#Type = :Type3 AND #Name IN (:Name4,:Name5))",
      ExpressionAttributeNames: {
        "#CreatedAt": "CreatedAt",
        "#Name": "Name",
        "#PK": "PK",
        "#Type": "Type"
      },
      ExpressionAttributeValues: {
        ":CreatedAt2": "2021-09-05",
        ":Name4": "Process1",
        ":Name5": "Process2",
        ":PK6": "Scale#123",
        ":Type1": "BelongsToLink",
        ":Type3": "Process"
      }
    });
  });

  // TODO make this test pass
  it.skip("can query on an index", () => {
    expect.assertions(1);
  });
});
