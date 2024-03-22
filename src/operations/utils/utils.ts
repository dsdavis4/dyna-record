import type DynaRecord from "../../DynaRecord";
import type { RelationshipMetadata } from "../../metadata";
import {
  isBelongsToRelationship,
  isRelationshipMetadataWithForeignKey
} from "../../metadata/utils";
import type { ForeignKey, Optional, RelationshipMetaObj } from "../../types";
import { isKeyOfObject } from "../../utils";

/**
 * Creates an object including
 *  - relationsLookup: Object to look up RelationshipMetadata by Entity name
 *  - belongsToRelationships: An array of BelongsTo relationships
 * @param includedRelationships
 * @returns
 */
export const buildEntityRelationshipMetaObj = (
  relationships: RelationshipMetadata[]
): RelationshipMetaObj => {
  return Object.values(relationships).reduce<RelationshipMetaObj>(
    (acc, rel) => {
      if (isBelongsToRelationship(rel)) {
        acc.belongsToRelationships.push(rel);
      }

      acc.relationsLookup[rel.target.name] = rel;

      return acc;
    },
    { relationsLookup: {}, belongsToRelationships: [] }
  );
};

/**
 * Extracts a ForeignKey value from an entity instance
 * @param relMeta - RelationshipMetadata for associated foreignKey
 * @param entity - instance of DynaRecord
 * @returns
 */
export const extractForeignKeyFromEntity = <T extends DynaRecord>(
  relMeta: RelationshipMetadata,
  entity?: T
): Optional<ForeignKey> => {
  return entity !== undefined &&
    isRelationshipMetadataWithForeignKey(relMeta) &&
    isKeyOfObject(entity, relMeta.foreignKey)
    ? entity[relMeta.foreignKey]
    : undefined;
};
