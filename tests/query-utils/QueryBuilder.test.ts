import QueryBuilder from "../../src/query-utils/QueryBuilder";
import DynaRecord from "../../index";
import {
  Table,
  Entity,
  PartitionKeyAttribute,
  SortKeyAttribute,
  StringAttribute,
  HasMany,
  ForeignKeyAttribute
} from "../../src/decorators";
import type { ForeignKey, PartitionKey, SortKey } from "../../src/types";

@Table({
  name: "mock-table",
  defaultFields: {
    id: { alias: "Id" },
    type: { alias: "Type" },
    createdAt: { alias: "CreatedAt" },
    updatedAt: { alias: "UpdatedAt" }
  }
})
class MockTable extends DynaRecord {
  @PartitionKeyAttribute({ alias: "PK" })
  public pk: PartitionKey;

  @SortKeyAttribute({ alias: "SK" })
  public sk: SortKey;
}

@Entity
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class Scale extends MockTable {
  @StringAttribute({ alias: "Name" })
  public name: string;

  @ForeignKeyAttribute(() => Room, { alias: "RoomId" })
  public readonly roomId: ForeignKey<Room>;
}

@Entity
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class Room extends MockTable {
  @StringAttribute({ alias: "Name" })
  public name: string;

  @HasMany(() => Scale, { foreignKey: "roomId" })
  public readonly scales: Scale[];
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
      },
      ConsistentRead: false
    });
  });

  it("returns QueryCommandInput for a FindById with included HasMany query", () => {
    expect.assertions(1);

    const queryBuilder = new QueryBuilder({
      entityClassName: "Room",
      key: { pk: "Room#123" },
      options: {
        filter: {
          $or: [{ type: "Room" }, { type: "Scale", name: ["test1", "test2"] }]
        }
      }
    });

    expect(queryBuilder.build()).toEqual({
      TableName: "mock-table",
      KeyConditionExpression: "#PK = :PK5",
      FilterExpression:
        "#Type = :Type1 OR (#Type = :Type2 AND #Name IN (:Name3,:Name4))",
      ExpressionAttributeNames: {
        "#Name": "Name",
        "#PK": "PK",
        "#Type": "Type"
      },
      ExpressionAttributeValues: {
        ":Name3": "test1",
        ":Name4": "test2",
        ":PK5": "Room#123",
        ":Type1": "Room",
        ":Type2": "Scale"
      },
      ConsistentRead: false
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
          $or: [{ type: "Room" }, { createdAt: { $beginsWith: "2021-09-05" } }]
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
        ":Type1": "Room",
        ":Type3": "Process"
      },
      ConsistentRead: false
    });
  });

  it("can query with a consistent read", () => {
    expect.assertions(1);

    const queryBuilder = new QueryBuilder({
      entityClassName: "Scale",
      key: { pk: "Scale#123" },
      options: {
        filter: {
          type: "Process",
          createdAt: { $beginsWith: "2021-09-05" },
          name: ["Process1", "Process2"]
        },
        consistentRead: true
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
      },
      ConsistentRead: true
    });
  });
});
