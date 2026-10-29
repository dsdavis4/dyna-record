import { z } from "zod";
import DynaRecord from "../../index.js";
import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  Entity,
  PartitionKeyAttribute,
  Searchable,
  SortKeyAttribute,
  StringAttribute,
  Table
} from "../../src/decorators/index.js";
import { TitanTextEmbedV2 } from "../../src/embedding/types.js";
import Metadata from "../../src/metadata/index.js";
import type {
  PartitionKey,
  Searchable as SearchableText,
  SortKey
} from "../../src/types.js";
import { mockEmbeddingProvider } from "./mockModels.js";

const mockedGetCommand = vi.mocked(GetCommand);
const mockedQueryCommand = vi.mocked(QueryCommand);

const mockGet = vi.fn();
const mockQuery = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => {
  return {
    DynamoDBClient: vi.fn().mockImplementation(() => {
      return { key: "MockDynamoDBClient" };
    })
  };
});

vi.mock("@aws-sdk/lib-dynamodb", () => {
  return {
    DynamoDBDocumentClient: {
      from: vi.fn().mockImplementation(() => {
        return {
          send: vi.fn().mockImplementation(async command => {
            if (command.name === "GetCommand") {
              return await Promise.resolve(mockGet());
            }

            if (command.name === "QueryCommand") {
              return await Promise.resolve(mockQuery());
            }
          })
        };
      })
    },
    GetCommand: vi.fn().mockImplementation(() => {
      return { name: "GetCommand" };
    }),
    QueryCommand: vi.fn().mockImplementation(() => {
      return { name: "QueryCommand" };
    })
  };
});

/**
 * How many long aliases the wide table carries. Written as `#Alias`, 300
 * aliases of 13 characters or more need over 4,800 characters, past
 * DynamoDB's 4 KB expression limit
 */
const WIDE_ATTRIBUTE_COUNT = 300;

@Table({ name: "wide-table" })
abstract class WideTable extends DynaRecord {
  @PartitionKeyAttribute({ alias: "PK" })
  public readonly pk: PartitionKey;

  @SortKeyAttribute({ alias: "SK" })
  public readonly sk: SortKey;
}

@Entity
class WideDoc extends WideTable {
  declare readonly type: "WideDoc";

  @Searchable()
  @StringAttribute({ alias: "Body" })
  public readonly body: SearchableText;
}

/** `WideAttribute000` through `WideAttribute299` */
const wideAliases = Array.from(
  { length: WIDE_ATTRIBUTE_COUNT },
  (_, i) => `WideAttribute${String(i).padStart(3, "0")}`
);

// Registered the way the attribute decorators register them, since a class
// declaring 300 fields by hand would bury what the test is about
for (const alias of wideAliases) {
  Metadata.addEntityAttribute(WideDoc.name, {
    attributeName: alias.charAt(0).toLowerCase() + alias.slice(1),
    alias,
    kind: "string",
    type: z.string()
  });
}

WideTable.vectorIndexes({
  wideIndex: {
    name: "wide-index",
    vectorAttribute: "__dyna_vector",
    model: TitanTextEmbedV2,
    provider: mockEmbeddingProvider,
    members: [() => WideDoc]
  }
});

@Table({ name: "odd-alias-table" })
abstract class OddAliasTable extends DynaRecord {
  @PartitionKeyAttribute({ alias: "PK" })
  public readonly pk: PartitionKey;

  @SortKeyAttribute({ alias: "SK" })
  public readonly sk: SortKey;
}

@Entity
class Shipment extends OddAliasTable {
  declare readonly type: "Shipment";

  @Searchable()
  @StringAttribute({ alias: "Notes" })
  public readonly notes: SearchableText;

  // An alias with a character an expression token cannot hold
  @StringAttribute({ alias: "shipped-at" })
  public readonly shippedAt: string;

  // An alias of the projection's own token form
  @StringAttribute({ alias: "_p1" })
  public readonly carrier: string;
}

OddAliasTable.vectorIndexes({
  shipmentIndex: {
    name: "shipment-index",
    vectorAttribute: "__dyna_vector",
    model: TitanTextEmbedV2,
    provider: mockEmbeddingProvider,
    members: [() => Shipment]
  }
});

/**
 * The odd-alias table's projection: its aliases sorted, each under its
 * position's token. `_p1` sorts first, so the projection's own `#_p0` maps to
 * it and its `#_p1` maps to `createdAt`
 */
const oddAliasProjectionNames = {
  "#_p0": "_p1",
  "#_p1": "createdAt",
  "#_p2": "id",
  "#_p3": "Notes",
  "#_p4": "PK",
  "#_p5": "shipped-at",
  "#_p6": "SK",
  "#_p7": "type",
  "#_p8": "updatedAt"
};

const oddAliasProjectionExpression =
  "#_p0,#_p1,#_p2,#_p3,#_p4,#_p5,#_p6,#_p7,#_p8";

describe("read projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("on a table whose aliases would overflow a name-per-alias projection", () => {
    it("stays under DynamoDB's 4 KB expression limit", async () => {
      expect.assertions(3);

      mockGet.mockResolvedValueOnce({});

      await WideDoc.findById("123");

      const [[{ ProjectionExpression, ExpressionAttributeNames }]] =
        mockedGetCommand.mock.calls;

      // The same aliases written as #Alias would not have fit
      expect(
        [...Object.values(ExpressionAttributeNames ?? {})]
          .map(alias => `#${alias}`)
          .join(", ").length
      ).toBeGreaterThan(4096);
      expect(ProjectionExpression?.length).toBeLessThan(4096);
      expect(ProjectionExpression?.split(",")).toEqual(
        Object.keys(ExpressionAttributeNames ?? {})
      );
    });

    it("maps back to every alias exactly once, excluding the vector", async () => {
      expect.assertions(1);

      mockGet.mockResolvedValueOnce({});

      await WideDoc.findById("123");

      const [[{ ExpressionAttributeNames }]] = mockedGetCommand.mock.calls;

      expect(Object.values(ExpressionAttributeNames ?? {}).sort()).toEqual(
        [
          "Body",
          "createdAt",
          "id",
          "PK",
          "SK",
          "type",
          "updatedAt",
          ...wideAliases
        ].sort()
      );
    });
  });

  describe("on a table with aliases an expression token cannot hold", () => {
    it("findById projects an alias with a hyphen and returns its value", async () => {
      expect.assertions(2);

      mockGet.mockResolvedValueOnce({
        Item: {
          PK: "Shipment#123",
          SK: "Shipment",
          id: "123",
          type: "Shipment",
          Notes: "Fragile",
          "shipped-at": "2026-10-28",
          _p1: "Courier",
          createdAt: "2026-10-01T00:00:00.000Z",
          updatedAt: "2026-10-02T00:00:00.000Z"
        }
      });

      const shipment = await Shipment.findById("123");

      expect(mockedGetCommand.mock.calls).toEqual([
        [
          {
            TableName: "odd-alias-table",
            Key: { PK: "Shipment#123", SK: "Shipment" },
            ProjectionExpression: oddAliasProjectionExpression,
            ExpressionAttributeNames: oddAliasProjectionNames,
            ConsistentRead: false
          }
        ]
      ]);
      expect(shipment).toEqual({
        pk: "Shipment#123",
        sk: "Shipment",
        id: "123",
        type: "Shipment",
        notes: "Fragile",
        shippedAt: "2026-10-28",
        carrier: "Courier",
        createdAt: new Date("2026-10-01T00:00:00.000Z"),
        updatedAt: new Date("2026-10-02T00:00:00.000Z")
      });
    });

    it("a query filtering on an attribute aliased like a projection token filters on that attribute", async () => {
      expect.assertions(1);

      mockQuery.mockResolvedValueOnce({ Items: [] });

      await Shipment.query("123", { filter: { carrier: "Courier" } });

      // The filter's token is escaped, so the projection's #_p1 — which maps
      // to createdAt — cannot displace it
      expect(mockedQueryCommand.mock.calls).toEqual([
        [
          {
            TableName: "odd-alias-table",
            KeyConditionExpression: "#PK = :PK2",
            FilterExpression: "#_p1_3771d1 = :_p1_3771d11",
            ExpressionAttributeNames: {
              "#PK": "PK",
              "#_p1_3771d1": "_p1",
              ...oddAliasProjectionNames
            },
            ExpressionAttributeValues: {
              ":PK2": "Shipment#123",
              ":_p1_3771d11": "Courier"
            },
            ProjectionExpression: oddAliasProjectionExpression,
            ExclusiveStartKey: undefined,
            ConsistentRead: false
          }
        ]
      ]);
    });
  });
});
