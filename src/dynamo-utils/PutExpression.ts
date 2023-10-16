import ExpressionBuilder from "./ExpressionBuilder";
import { type DynamoTableItem } from "../types";
import { type Put } from "@aws-sdk/client-dynamodb";

// TODO am I over sharing by extending expression builder...?
// TODO do I need this class at all?
class PutExpression extends ExpressionBuilder {
  public build(entityData: DynamoTableItem): Put {
    const { name: tableName, primaryKey } = this.tableMetadata;

    return {
      TableName: tableName,
      Item: this.buildItem(entityData),
      ConditionExpression: `attribute_not_exists(${primaryKey})` // Ensure item doesn't already exist
    };
  }

  private buildItem(entityData: DynamoTableItem): DynamoTableItem {
    return Object.entries(entityData).reduce<DynamoTableItem>(
      (acc, [key, val]) => {
        // const val = entityData[attributeData.name as keyof CreateOptions<T>];
        // if (val !== undefined) acc[tableKey] = val;
        const tableKey = this.tableKeyLookup[key];
        // Dates mut be converted to strings
        const value = val instanceof Date ? val.toISOString() : val;
        acc[tableKey] = value;
        return acc;
      },
      {}
    );
  }
}

export default PutExpression;
