import type SingleTableDesign from "../SingleTableDesign";

/**
 * Returns Keys of T which are HasMany, BelongsTo or HasOne relationships
 */
type RelationshipAttributeNames<T> = {
  [K in keyof T]: T[K] extends SingleTableDesign
    ? K
    : T[K] extends SingleTableDesign[]
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
