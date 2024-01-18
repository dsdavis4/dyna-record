import Metadata from "./";
import type {
  RelationshipMetadata,
  HasManyRelationship,
  BelongsToRelationship,
  HasOneRelationship,
  EntityClass,
  ForeignKeyAttribute
} from ".";
import type SingleTableDesign from "../SingleTableDesign";
import type { RelationshipMetadataWithForeignKey } from "./types";

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

// TODO is this used?
/**
 * Type guard to check if the relationship metadata includes a foreignKey
 * @param rel
 * @returns
 */
export const isRelationshipMetadataWithForeignKey = (
  rel: RelationshipMetadata
): rel is RelationshipMetadataWithForeignKey => {
  return "foreignKey" in rel;
};

/**
 * Returns true if an "Entity" BelongsTo the provided relationship as a HasOne
 * @param Entity
 * @param rel
 * @returns
 */
export const doesEntityBelongToRelAsHasOne = <T extends SingleTableDesign>(
  Entity: EntityClass<T>,
  rel: BelongsToRelationship
): boolean => {
  const relMetadata = Metadata.getEntity(rel.target.name);

  return Object.values(relMetadata.relationships).some(
    rel => isHasOneRelationship(rel) && rel.target === Entity
  );
};

/**
 * Returns true if an "Entity" BelongsTo the provided relationship as a HasMany
 * @param Entity
 * @param rel
 * @param foreignKey
 * @returns
 */
export const doesEntityBelongToRelAsHasMany = <T extends SingleTableDesign>(
  Entity: EntityClass<T>,
  rel: BelongsToRelationship
): boolean => {
  const relMetadata = Metadata.getEntity(rel.target.name);

  return Object.values(relMetadata.relationships).some(
    rel => isHasManyRelationship(rel) && rel.target === Entity
  );
};
