import type { RelationshipMetadata } from "../../metadata";
import { isBelongsToRelationship } from "../../metadata/utils";
import type { RelationshipMetaObj } from "../../types";

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
