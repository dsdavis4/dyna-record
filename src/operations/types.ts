import type SingleTableDesign from "../SingleTableDesign";

/**
 * Returns Keys of T which are HasMany, BelongsTo or HasOne relationships
 */
export type RelationshipAttributeNames<T> = {
  [K in keyof T]: Exclude<T[K], undefined> extends
    | SingleTableDesign
    | SingleTableDesign[]
    ? K
    : never;
}[keyof T];

/**
 * Entity attributes excluding relationship attributes
 */
export type EntityAttributes<T extends SingleTableDesign> = Omit<
  T,
  RelationshipAttributeNames<T>
>;
