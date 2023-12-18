import type { DynamoTableItem } from "../../types";
import type {
  UpdateExpression,
  UpdateSetExpression,
  UpdateRemoveExpression
} from "./types";

type Action = "SET" | "REMOVE";

/**
 * Builds a dynamo expression given the table attributes
 * @param tableAttrs The table aliases of the entity attributes
 * @returns
 */
export const expressionBuilder = (
  tableAttrs: DynamoTableItem,
  action: Action = "SET"
): UpdateExpression => {
  return action === "SET"
    ? buildUpdateSetExpression(tableAttrs)
    : buildUpdateRemoveExpression(tableAttrs);
};

const buildUpdateSetExpression = (
  tableAttrs: DynamoTableItem
): UpdateSetExpression => {
  const entries = Object.entries(tableAttrs);
  return entries.reduce<UpdateSetExpression>(
    (acc, [key, val], idx) => {
      const attrName = `#${key}`;
      const attrVal = `:${key}`;

      const expression = ` ${attrName} = ${attrVal},`;

      acc.ExpressionAttributeNames[attrName] = key;
      acc.ExpressionAttributeValues[attrVal] = val;
      acc.UpdateExpression = acc.UpdateExpression.concat(expression);

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

// TODO add a test for this case with multiple attributes
const buildUpdateRemoveExpression = (
  tableAttrs: DynamoTableItem
): UpdateRemoveExpression => {
  const entries = Object.entries(tableAttrs);
  return entries.reduce<UpdateRemoveExpression>(
    (acc, [key], idx) => {
      const attrName = `#${key}`;

      const expression = ` ${attrName},`;

      acc.ExpressionAttributeNames[attrName] = key;
      acc.UpdateExpression = acc.UpdateExpression.concat(expression);

      if (idx === entries.length - 1) {
        // Remove trailing comma from the expression
        acc.UpdateExpression = acc.UpdateExpression.slice(0, -1);
      }

      return acc;
    },
    {
      ExpressionAttributeNames: {},
      UpdateExpression: "REMOVE"
    }
  );
};
