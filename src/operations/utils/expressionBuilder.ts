import type { DynamoTableItem } from "../../types";
import type {
  UpdateExpression,
  UpdateSetExpression,
  UpdateRemoveExpression,
  DocumentPathOperation
} from "./types";

/**
 * Sorted attributes by operand
 */
interface AttributesByOperand {
  remove: DynamoTableItem;
  set: DynamoTableItem;
}

/**
 * Accumulated expression fragments and placeholders for document path (nested attribute) update operations.
 * Used when merging partial ObjectAttribute updates into the main update expression.
 */
interface DocPathExpressions {
  /** SET clause fragments, e.g. `#path = :value`, to be joined into the UpdateExpression SET clause. */
  setItems: string[];
  /** REMOVE clause path fragments (expression-only, no values), to be joined into the UpdateExpression REMOVE clause. */
  removeItems: string[];
  /** DynamoDB ExpressionAttributeNames: placeholder (#foo) → actual attribute name. */
  expressionAttributeNames: Record<string, string>;
  /** DynamoDB ExpressionAttributeValues: placeholder (:foo) → value. */
  expressionAttributeValues: Record<string, unknown>;
}

/**
 * Builds a dynamo expression given the table attributes and optional document path operations
 * @param tableAttrs The table aliases of the entity attributes
 * @param documentPathOps Optional document path operations for partial ObjectAttribute updates
 * @returns
 */
export const expressionBuilder = (
  tableAttrs: DynamoTableItem,
  documentPathOps?: DocumentPathOperation[]
): UpdateExpression => {
  const sorted = sortAttributesByOperand(tableAttrs);

  const setExpression = buildUpdateSetExpression(sorted.set);
  const removeExpression = buildUpdateRemoveExpression(sorted.remove);

  // Merge document path operations into the expressions
  if (documentPathOps !== undefined && documentPathOps.length > 0) {
    const docPathResult = buildDocumentPathExpressions(documentPathOps);

    // Merge SET items
    if (docPathResult.setItems.length > 0) {
      Object.assign(
        setExpression.ExpressionAttributeNames,
        docPathResult.expressionAttributeNames
      );
      Object.assign(
        setExpression.ExpressionAttributeValues,
        docPathResult.expressionAttributeValues
      );

      const existingSet = setExpression.UpdateExpression;
      const docSetClause = docPathResult.setItems.join(", ");

      if (existingSet !== "") {
        // Append to existing SET clause
        setExpression.UpdateExpression = `${existingSet}, ${docSetClause}`;
      } else {
        setExpression.UpdateExpression = `SET ${docSetClause}`;
      }
    }

    // Merge REMOVE items
    if (docPathResult.removeItems.length > 0) {
      // Add names used in REMOVE paths
      Object.assign(
        removeExpression.ExpressionAttributeNames,
        docPathResult.expressionAttributeNames
      );

      const existingRemove = removeExpression.UpdateExpression;
      const docRemoveClause = docPathResult.removeItems.join(", ");

      if (existingRemove !== "") {
        removeExpression.UpdateExpression = `${existingRemove}, ${docRemoveClause}`;
      } else {
        removeExpression.UpdateExpression = `REMOVE ${docRemoveClause}`;
      }
    }
  }

  return {
    // If the operation has only REMOVE actions, it will not have expression attribute values
    ExpressionAttributeValues: setExpression.ExpressionAttributeValues,
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

/**
 * Build document path expressions from DocumentPathOperations
 */
const buildDocumentPathExpressions = (
  ops: DocumentPathOperation[]
): DocPathExpressions => {
  const result: DocPathExpressions = {
    setItems: [],
    removeItems: [],
    expressionAttributeNames: {},
    expressionAttributeValues: {}
  };

  for (const op of ops) {
    // Build the document path expression: #segment1.#segment2.#segment3
    const pathExpr = op.path.map(seg => `#${seg}`).join(".");
    // Build the value placeholder: :segment1_segment2_segment3
    const valuePlaceholder = `:${op.path.join("_")}`;

    // Register all path segment names
    for (const seg of op.path) {
      result.expressionAttributeNames[`#${seg}`] = seg;
    }

    if (op.type === "set") {
      result.setItems.push(`${pathExpr} = ${valuePlaceholder}`);
      result.expressionAttributeValues[valuePlaceholder] = op.value;
    } else {
      result.removeItems.push(pathExpr);
    }
  }

  return result;
};

/**
 * Sort attributes based on their operand
 * @param tableAttrs
 * @returns
 */
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

/**
 * Build the update [SET](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.UpdateExpressions.html#Expressions.UpdateExpressions.SET) expression
 * @param tableAttrs
 * @returns
 */
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

/**
 * Build the update [REMOVE](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.UpdateExpressions.html#Expressions.UpdateExpressions.REMOVE) expression for removing attributes
 * @param tableAttrs
 * @returns
 */
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
