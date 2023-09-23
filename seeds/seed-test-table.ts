import {
  DynamoDBClient,
  ScanCommand
  // PutItemCommand
} from "@aws-sdk/client-dynamodb";

// TODO delete this and script in package.json

// Used to see a test table copy from drews-brews

const client = new DynamoDBClient({});

void (async () => {
  const command = new ScanCommand({
    TableName: "drews-brews"
  });

  const response = await client.send(command);

  if (response.Items !== undefined) {
    console.log("COMMENTED OUT PUT ITEM OPERATION");
    // await Promise.all(
    //   response.Items.map(item =>
    //     client.send(new PutItemCommand({ TableName: "temp-table", Item: item }))
    //   )
    // );
  }
})();
