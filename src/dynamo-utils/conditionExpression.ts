/**
 * Whether a condition expression is one parenthesized group: its opening
 * parenthesis closes at its last character.
 *
 * Reads the expression's parentheses only. That is sound because nothing else
 * in an expression this library builds can hold one: attribute names and
 * values stand in it as `#` and `:` tokens of `[A-Za-z0-9_]`, so every
 * parenthesis is grouping or a function call's, and those always balance
 * @param expression - The condition expression
 * @returns True when the whole expression sits inside one pair of parentheses
 */
const isOneGroup = (expression: string): boolean => {
  if (!expression.startsWith("(")) return false;

  let depth = 0;
  for (let i = 0; i < expression.length; i++) {
    if (expression[i] === "(") depth++;
    if (expression[i] === ")") depth--;
    if (depth === 0) return i === expression.length - 1;
  }
  return false;
};

/**
 * Isolates a condition expression in parentheses before it is ANDed onto
 * another, so an OR inside it cannot bind across the AND.
 *
 * An expression that is already one parenthesized group is returned as it is:
 * it is isolated, and DynamoDB rejects a second pair around it
 * (`attribute_exists(PK) AND ((#A = :a AND #B = :b))` fails with "The
 * expression has redundant parentheses"). A `$or` of one block that binds
 * several values compiles to such a group
 * @param expression - The condition expression
 * @returns The expression, isolated in exactly one pair of parentheses
 */
export const parenthesize = (expression: string): string =>
  isOneGroup(expression) ? expression : `(${expression})`;
