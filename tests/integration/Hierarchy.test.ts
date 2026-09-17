/**
 * The hierarchy pattern: a scoped vector index whose scope parent is also one
 * of its members, joined by a foreign key to its own type.
 *
 * `scopedBy: () => Folder` with `members: [() => Folder, ...]` makes one
 * search return everything under a given folder. That works because the
 * shared `ParentId` foreign key is a genuine pointer to a different row, so
 * it can serve as the index HASH for parents and children alike.
 *
 * These tests pin the write path, which has two consequences the metadata
 * layer does not show: the parent's existence is enforced, and a root row
 * (no parent) is embedded but never joins the index.
 */
import DynaRecord, {
  Table,
  Entity,
  PartitionKeyAttribute,
  SortKeyAttribute,
  StringAttribute,
  ForeignKeyAttribute,
  Searchable,
  TitanTextEmbedV2,
  type PartitionKey,
  type SortKey,
  type NullableForeignKey,
  type Searchable as SearchableText
} from "../../index.js";
import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { generateId } from "../../src/id.js";

vi.mock("../../src/id");

const mockedGenerateId = vi.mocked(generateId);
const mockedTransactWriteCommand = vi.mocked(TransactWriteCommand);
const mockSend = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn().mockImplementation(() => ({ key: "mock" }))
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: vi.fn().mockImplementation(() => ({
      send: vi
        .fn()
        .mockImplementation(
          async (c: unknown) => await Promise.resolve(mockSend(c))
        )
    }))
  },
  TransactWriteCommand: vi
    .fn()
    .mockImplementation(() => ({ name: "TransactWriteCommand" })),
  SearchVectorsCommand: vi.fn(),
  GetCommand: vi.fn(),
  QueryCommand: vi.fn(),
  TransactGetCommand: vi.fn()
}));

const expectedVector = new Array<number>(1024).fill(0.1);
const provider = async (_text: string): Promise<number[]> =>
  await Promise.resolve(expectedVector);

@Table({
  name: "tree-table",
  defaultFields: {
    id: { alias: "Id" },
    type: { alias: "Type" },
    createdAt: { alias: "CreatedAt" },
    updatedAt: { alias: "UpdatedAt" }
  }
})
abstract class TreeTable extends DynaRecord {
  @PartitionKeyAttribute({ alias: "PK" })
  public readonly pk: PartitionKey;

  @SortKeyAttribute({ alias: "SK" })
  public readonly sk: SortKey;
}

@Entity
class Folder extends TreeTable {
  declare readonly type: "Folder";

  @Searchable()
  @StringAttribute({ alias: "FolderName" })
  public readonly folderName: SearchableText;

  // A parent pointer to another Folder. Nullable so a root folder can exist —
  // see the root test below for what that costs
  @ForeignKeyAttribute(() => Folder, { alias: "ParentId", nullable: true })
  public readonly parentId?: NullableForeignKey<Folder>;
}

TreeTable.vectorIndexes({
  treeIndex: {
    name: "tree-index",
    vectorAttribute: "__dyna_vector",
    model: TitanTextEmbedV2,
    provider,
    scopedBy: () => Folder,
    members: [() => Folder]
  }
});

describe("hierarchy: a scoped index whose scope parent is its own member", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2023-10-16T03:31:35.918Z"));
    mockSend.mockResolvedValue({});
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("enforces that the parent exists and writes the HASH attribute and vector", async () => {
    expect.assertions(1);

    mockedGenerateId.mockReturnValueOnce("child-1");

    await Folder.create({ folderName: "Invoices", parentId: "parent-123" });

    // Two items: the row itself, and a referential check that the parent row
    // exists. The parent check is what makes the tree well-formed — a child
    // cannot be created under a folder that was never created
    expect(mockedTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Put: {
                TableName: "tree-table",
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "Folder#child-1",
                  SK: "Folder",
                  Id: "child-1",
                  Type: "Folder",
                  CreatedAt: "2023-10-16T03:31:35.918Z",
                  UpdatedAt: "2023-10-16T03:31:35.918Z",
                  FolderName: "Invoices",
                  ParentId: "parent-123",
                  __dyna_vector: expectedVector
                }
              }
            },
            {
              ConditionCheck: {
                TableName: "tree-table",
                Key: { PK: "Folder#parent-123", SK: "Folder" },
                ConditionExpression: "attribute_exists(PK)"
              }
            }
          ]
        }
      ]
    ]);
  });

  it("embeds a root row but leaves it out of the index, because it carries no HASH", async () => {
    expect.assertions(1);

    mockedGenerateId.mockReturnValueOnce("root-1");

    await Folder.create({ folderName: "Root" });

    // No parent, so no referential check and no ParentId attribute. The row
    // still gets a vector — which is correct: DynamoDB membership is
    // attribute-presence based, so this row simply does not join the index
    // until it is given a parent, and when it is, no re-embed is needed.
    // The trade-off worth knowing: a root row pays for an embed it cannot use
    // while it stays a root.
    expect(mockedTransactWriteCommand.mock.calls).toEqual([
      [
        {
          TransactItems: [
            {
              Put: {
                TableName: "tree-table",
                ConditionExpression: "attribute_not_exists(PK)",
                Item: {
                  PK: "Folder#root-1",
                  SK: "Folder",
                  Id: "root-1",
                  Type: "Folder",
                  CreatedAt: "2023-10-16T03:31:35.918Z",
                  UpdatedAt: "2023-10-16T03:31:35.918Z",
                  FolderName: "Root",
                  __dyna_vector: expectedVector
                }
              }
            }
          ]
        }
      ]
    ]);
  });
});
