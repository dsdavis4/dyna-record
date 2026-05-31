import BelongsToRelationship from "./BelongsToRelationship.js";
import HasAndBelongsToManyRelationship from "./HasAndBelongsToManyRelationship.js";
import HasManyRelationship from "./HasManyRelationship.js";
import HasOneRelationship from "./HasOneRelationship.js";
import OwnedByRelationship from "./OwnedByRelationship.js";
import type { RelationshipMetadata } from "./types.js";

export const createRelationshipInstance = (
  options: RelationshipMetadata
): RelationshipMetadata => {
  switch (options.type) {
    case "BelongsTo":
      return new BelongsToRelationship(options);
    case "HasAndBelongsToMany":
      return new HasAndBelongsToManyRelationship(options);
    case "HasMany":
      return new HasManyRelationship(options);
    case "HasOne":
      return new HasOneRelationship(options);
    case "OwnedBy":
      return new OwnedByRelationship(options);
    default:
      throw new Error("Invalid relationship type");
  }
};
