import QueryBuilder from "../../src/query-utils/QueryBuilder";
import SingleTableDesign from "../../src";
import {
  Table,
  Entity,
  PrimaryKeyAttribute,
  SortKeyAttribute,
  Attribute
} from "../../src/decorators";
import type { PrimaryKey, SortKey } from "../../src/types";

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
class MockTable extends SingleTableDesign {
  @PrimaryKeyAttribute({ alias: "PK" })
  public pk: PrimaryKey;

  @SortKeyAttribute({ alias: "SK" })
  public sk: SortKey;
}

@Entity
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class Scale extends MockTable {
  @Attribute({ alias: "Name" })
  public name: string;
}

@Entity
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class Room extends MockTable {
  @Attribute({ alias: "Name" })
  public name: string;
}

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

  it("returns QueryCommandInput for a FindById with included HasMany query", () => {
    expect.assertions(1);

    const queryBuilder = new QueryBuilder({
      entityClassName: "Room",
      key: { pk: "Room#123" },
      options: {
        filter: {
          $or: [
            { type: "Room" },
            { type: "BelongsToLink", foreignEntityType: ["Brewery", "Scale"] }
          ]
        }
      }
    });

    expect(queryBuilder.build()).toEqual({
      ExpressionAttributeNames: {
        "#PK": "PK",
        "#Type": "Type",
        "#ForeignEntityType": "ForeignEntityType"
      },
      ExpressionAttributeValues: {
        ":PK5": "Room#123",
        ":Type1": "Room",
        ":Type2": "BelongsToLink",
        ":ForeignEntityType3": "Brewery",
        ":ForeignEntityType4": "Scale"
      },
      FilterExpression:
        "#Type = :Type1 OR (#Type = :Type2 AND #ForeignEntityType IN (:ForeignEntityType3,:ForeignEntityType4))",
      KeyConditionExpression: "#PK = :PK5",
      TableName: "mock-table"
    });
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
});
