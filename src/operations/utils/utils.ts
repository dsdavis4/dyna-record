import type { DynamoTableItem } from "../../types";
import type {
  UpdateExpression,
  UpdateSetExpression,
  UpdateRemoveExpression
} from "./types";

/**
 * Sorted attributes by operand
 */
interface AttributesByOperand {
  remove: DynamoTableItem;
  set: DynamoTableItem;
}

/**
 * Builds a dynamo expression given the table attributes
 * @param tableAttrs The table aliases of the entity attributes
 * @returns
 */
export const expressionBuilder = (
  tableAttrs: DynamoTableItem
): UpdateExpression => {
  const sorted = sortAttributesByOperand(tableAttrs);

  const setExpression = buildUpdateSetExpression(sorted.set);
  const removeExpression = buildUpdateRemoveExpression(sorted.remove);

  const hasSetOperation =
    Object.keys(setExpression.ExpressionAttributeValues).length > 0;

  return {
    // If the operation has only REMOVE actions, it will not have expression attribute values
    ExpressionAttributeValues: hasSetOperation
      ? setExpression.ExpressionAttributeValues
      : undefined,
    ExpressionAttributeNames: {
      ...setExpression.ExpressionAttributeNames,
      ...removeExpression.ExpressionAttributeNames
    },
    UpdateExpression: [
      setExpression.UpdateExpression,
      removeExpression.UpdateExpression
    ]
      .filter(expr => expr)
      .join(" ")
  };
};

const sortAttributesByOperand = (
  tableAttrs: DynamoTableItem
): AttributesByOperand => {
  return Object.entries(tableAttrs).reduce<AttributesByOperand>(
    (acc, [key, value]) => {
      const isRemovingAttr = value === null;
      if (isRemovingAttr) {
        acc.remove[key] = value;
      } else {
        acc.set[key] = value;
      }
      return acc;
    },
    {
      remove: {},
      set: {}
    }
  );
};

const buildUpdateSetExpression = (
  tableAttrs: DynamoTableItem
): UpdateSetExpression => {
  const entries = Object.entries(tableAttrs);
  const action = "SET";
  return entries.reduce<UpdateSetExpression>(
    (acc, [key, val], idx) => {
      const attrName = `#${key}`;
      const attrVal = `:${key}`;

      const expression = ` ${attrName} = ${attrVal},`;

      acc.ExpressionAttributeNames[attrName] = key;
      acc.ExpressionAttributeValues[attrVal] = val;
      acc.UpdateExpression = acc.UpdateExpression.concat(expression);

      // For the first element, add the operand
      if (idx === 0) acc.UpdateExpression = `${action}${acc.UpdateExpression}`;

      if (idx === entries.length - 1) {
        // Remove trailing comma from the expression
        acc.UpdateExpression = acc.UpdateExpression.slice(0, -1);
      }

      return acc;
    },
    {
      ExpressionAttributeNames: {},
      ExpressionAttributeValues: {},
      UpdateExpression: ""
    }
  );
};

// TODO add a test for this case with multiple attributes
const buildUpdateRemoveExpression = (
  tableAttrs: DynamoTableItem
): UpdateRemoveExpression => {
  const entries = Object.entries(tableAttrs);
  const action = "REMOVE";
  return entries.reduce<UpdateRemoveExpression>(
    (acc, [key], idx) => {
      const attrName = `#${key}`;

      const expression = ` ${attrName},`;

      acc.ExpressionAttributeNames[attrName] = key;
      acc.UpdateExpression = acc.UpdateExpression.concat(expression);

      // For the first element, add the operand
      if (idx === 0) acc.UpdateExpression = `${action}${acc.UpdateExpression}`;

      if (idx === entries.length - 1) {
        // Remove trailing comma from the expression
        acc.UpdateExpression = acc.UpdateExpression.slice(0, -1);
      }

      return acc;
    },
    {
      ExpressionAttributeNames: {},
      UpdateExpression: ""
    }
  );
};
