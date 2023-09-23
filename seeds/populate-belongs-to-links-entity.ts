import {
  DynamoDBClient,
  ScanCommand,
  UpdateItemCommand
} from "@aws-sdk/client-dynamodb";

// TODO delete this AND script in package.json

// Use this class to add ForeignEntityType to the table BelongsToLinks

const client = new DynamoDBClient({});

void (async () => {
  const command = new ScanCommand({
    TableName: "drews-brews"
  });

  const response = await client.send(command);

  const items = response.Items ?? [];

  const belongsToLinks = items.filter(item => item.Type.S === "BelongsToLink");

  console.log(items.length);
  console.log(belongsToLinks.length);
  console.log(belongsToLinks[0]);

  if (belongsToLinks.length > 0) {
    const updates = belongsToLinks.map(
      link =>
        new UpdateItemCommand({
          TableName: "temp-table",
          Key: { PK: link.PK, SK: link.SK },
          ExpressionAttributeNames: {
            "#ForeignEntityType": "ForeignEntityType"
          },
          ExpressionAttributeValues: {
            ":ForeignEntityType": {
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-non-null-asserted-optional-chain
              S: link.SK.S?.split("#")[0]!
            }
          },
          UpdateExpression: "SET #ForeignEntityType = :ForeignEntityType"
        })
    );

    try {
      await Promise.all(updates.map(async cmd => await client.send(cmd)));
    } catch (e) {
      console.log(e);
    }
  }
})();
