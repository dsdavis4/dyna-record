import {
  DeleteCommand,
  PutCommand,
  ScanCommand,
  DynamoDBDocumentClient
} from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

// TODO delete this AND script in package.json

// Use this class to update the belongs to links to fit new format

const dynamo = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: "us-west-2" })
);

const TABLE_NAME = "temp-table";

void (async () => {
  const command = new ScanCommand({
    TableName: TABLE_NAME
  });

  const response = await dynamo.send(command);

  const items = response.Items ?? [];

  const belongsToLinks = items.filter(item => item.Type === "BelongsToLink");

  console.log("finished scan");
  console.log(items.length);
  console.log(belongsToLinks.length);

  if (belongsToLinks.length > 0) {
    const deletes = belongsToLinks.map(
      link =>
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { PK: link.PK, SK: link.SK }
        })
    );

    const puts = belongsToLinks.map(link => {
      const [linkedModelName, linkedModelId] = link.SK.split("#");
      return new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: link.PK,
          SK: `${linkedModelName}#${link.Id}`,
          Id: link.Id,
          CreatedAt: link.CreatedAt,
          UpdatedAt: link.UpdatedAt,
          Type: link.Type,
          ForeignEntityType: linkedModelName,
          ForeignKey: linkedModelId
        }
      });
    });

    try {
      await Promise.all(deletes.map(async cmd => await dynamo.send(cmd)));
      await Promise.all(puts.map(async cmd => await dynamo.send(cmd)));
      console.log("done");
    } catch (e) {
      console.log(e);
    }
  }
})();
