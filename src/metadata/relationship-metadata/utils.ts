import BelongsToRelationship from "./BelongsToRelationship";
import HasAndBelongsToManyRelationship from "./HasAndBelongsToManyRelationship";
import HasManyRelationship from "./HasManyRelationship";
import HasOneRelationship from "./HasOneRelationship";
import OwnedByRelationship from "./OwnedByRelationship";
import type { RelationshipMetadata } from "./types";

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
