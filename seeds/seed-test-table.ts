import {
  DeleteCommand,
  PutCommand,
  ScanCommand,
  DynamoDBDocumentClient
} from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

// TODO delete this and script in package.json

// Used to see a test table copy from drews-brews

const dynamo = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: "us-west-2" })
);

void (async () => {
  const command = new ScanCommand({
    TableName: "drews-brews"
  });

  const response = await dynamo.send(command);

  if (response.Items !== undefined) {
    console.log("COMMENTED OUT PUT ITEM OPERATION");
    const tempTable = "temp-table";

    const deletes = response.Items.map(
      link =>
        new DeleteCommand({
          TableName: tempTable,
          Key: { PK: link.PK, SK: link.SK }
        })
    );
    await Promise.all(deletes.map(async cmd => await dynamo.send(cmd)));
    await Promise.all(
      response.Items.map(
        async item =>
          await dynamo.send(
            new PutCommand({ TableName: tempTable, Item: item })
          )
      )
    );
  }
})();
