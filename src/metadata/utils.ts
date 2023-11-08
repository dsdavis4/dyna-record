import type {
  RelationshipMetadata,
  HasManyRelationship,
  BelongsToRelationship,
  HasOneRelationship
} from ".";

/**
 * Type guard to check if the relationship is a HasMany
 */
export const isHasManyRelationship = (
  rel: RelationshipMetadata
): rel is HasManyRelationship => {
  return rel.type === "HasMany" && rel.foreignKey !== undefined;
};

/**
 * Type guard to check if the relationship is a BelongsTo
 */
export const isBelongsToRelationship = (
  rel: RelationshipMetadata
): rel is BelongsToRelationship => {
  return rel.type === "BelongsTo" && rel.foreignKey !== undefined;
};

/**
 * Type guard to check if the relationship is a HasOne
 */
export const isHasOneRelationship = (
  rel: RelationshipMetadata
): rel is HasOneRelationship => {
  return rel.type === "HasOne" && rel.foreignKey !== undefined;
};
