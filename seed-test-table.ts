import {
  DynamoDBClient,
  ScanCommand,
  PutItemCommand
} from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({});

(async () => {
  const command = new ScanCommand({
    TableName: "drews-brews"
  });

  const response = await client.send(command);

  if (response.Items) {
    console.log("COMMENTED OUT PUT ITEM OPERATION");
    // await Promise.all(
    //   response.Items.map(item =>
    //     client.send(new PutItemCommand({ TableName: "temp-table", Item: item }))
    //   )
    // );
  }
})();
