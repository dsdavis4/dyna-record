import { type UpdateCommandInput } from "@aws-sdk/lib-dynamodb";

/**
 * Defines the structure for an update expression using the SET action in DynamoDB, which is used to add new attributes to an item or modify existing attributes. This interface encapsulates the necessary components of an update expression for the [SET](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.UpdateExpressions.html#Expressions.UpdateExpressions.SET) action.
 */
export interface UpdateSetExpression {
  UpdateExpression: NonNullable<UpdateCommandInput["UpdateExpression"]>;
  ExpressionAttributeNames: NonNullable<
    UpdateCommandInput["ExpressionAttributeNames"]
  >;
  ExpressionAttributeValues: NonNullable<
    UpdateCommandInput["ExpressionAttributeValues"]
  >;
}

/**
 * Defines the structure for an update expression using the REMOVE action in DynamoDB, which is used to delete attributes from an item. This interface encapsulates the necessary components of an update expression for the [REMOVE](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.UpdateExpressions.html#Expressions.UpdateExpressions.REMOVE) action, including attribute names and the update expression itself.
 */
export interface UpdateRemoveExpression {
  UpdateExpression: NonNullable<UpdateCommandInput["UpdateExpression"]>;
  ExpressionAttributeNames: NonNullable<
    UpdateCommandInput["ExpressionAttributeNames"]
  >;
}

/**
 * Represents either an update expression for setting new or modifying existing attributes of an item (UpdateSetExpression) or an update expression for removing attributes from an item (UpdateRemoveExpression) in DynamoDB.
 */
export type UpdateExpression = UpdateSetExpression | UpdateRemoveExpression;

/**
 * The SET and REMOVE clause fragments an update expression was assembled
 * from, each without its action keyword (EX: `["#Name = :Name"]`,
 * `["#Notes"]`).
 *
 * Kept alongside the joined `UpdateExpression` so a caller that must append
 * clauses after the expression is built — the vector write, whose value only
 * arrives once the embedding resolves — can add fragments and re-render,
 * rather than parsing the assembled string back apart.
 */
export interface UpdateExpressionClauses {
  set: string[];
  remove: string[];
}

/**
 * An assembled update expression plus the clause fragments it was built
 * from. See {@link UpdateExpressionClauses} for why the fragments survive
 * assembly.
 */
export interface BuiltUpdateExpression {
  /** Exactly the fields DynamoDB's Update accepts */
  expression: UpdateExpression;
  /** The fragments the expression was rendered from */
  clauses: UpdateExpressionClauses;
}

/**
 * Represents a single document path operation for partial ObjectAttribute updates.
 * Used to build DynamoDB document path expressions like `SET #addr.#street = :addr_street`
 * or `REMOVE #addr.#zip`.
 */
export type DocumentPathOperation =
  | {
      type: "set";
      /** Path segments, e.g. ["address", "street"] or ["address", "geo", "lat"] */
      path: string[];
      /** The serialized value */
      value: unknown;
    }
  | {
      type: "remove";
      /** Path segments, e.g. ["address", "zip"] */
      path: string[];
    };
