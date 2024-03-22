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
