import type { DynamoTableItem } from "../../types";
import type { Expression } from "./types";

/**
 * Builds a dynamo expression given the table attributes
 * @param tableAttrs The table aliases of the entity attributes
 * @returns
 */
export const expressionBuilder = (tableAttrs: DynamoTableItem): Expression => {
  const entries = Object.entries(tableAttrs);
  return entries.reduce<Expression>(
    (acc, [key, val], idx) => {
      const attrName = `#${key}`;
      const attrVal = `:${key}`;
      acc.ExpressionAttributeNames[attrName] = key;
      acc.ExpressionAttributeValues[attrVal] = val;
      acc.UpdateExpression = acc.UpdateExpression.concat(
        ` ${attrName} = ${attrVal},`
      );

      if (idx === entries.length - 1) {
        // Remove trailing comma from the expression
        acc.UpdateExpression = acc.UpdateExpression.slice(0, -1);
      }

      return acc;
    },
    {
      ExpressionAttributeNames: {},
      ExpressionAttributeValues: {},
      UpdateExpression: "SET"
    }
  );
};
