/**
 * The reserved form of a read projection token: `_p` and a base 36 index,
 * nothing else
 */
const READ_PROJECTION_TOKEN = /^_p[0-9a-z]+$/;

/**
 * The expression attribute name token, after the `#`, that the read projection
 * references its attribute at `index` by.
 *
 * The projection names every alias on a vector-indexed table, so it references
 * them positionally: its length then depends on how many attributes there are,
 * not on how long their names are, which is what keeps it under DynamoDB's
 * 4 KB expression limit.
 *
 * Its tokens share one `ExpressionAttributeNames` map with a query's key
 * conditions and filter, whose tokens are the attribute and field names
 * themselves. They stay apart because the filter tokenizer never emits a token
 * of this form — see {@link isReadProjectionToken}. Anything else that merges
 * names with the projection has to hold that too
 * @param index - The attribute's position in the projection
 * @returns A token of the reserved form, such as `_p0` or `_p1a`
 */
export const readProjectionToken = (index: number): string =>
  `_p${index.toString(36)}`;

/**
 * Whether a token has the form reserved for read projection tokens.
 *
 * The filter tokenizer treats a name of this form as unsafe and gives it a
 * digest-suffixed token instead, which contains an underscore after its first
 * character and so never has this form. That keeps an attribute or field
 * actually named `_p1` from colliding with the projection's `#_p1`
 * @param token - A candidate token
 * @returns True when the token has the reserved form
 */
export const isReadProjectionToken = (token: string): boolean =>
  READ_PROJECTION_TOKEN.test(token);
