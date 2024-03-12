import type BelongsToRelationship from "./BelongsToRelationship";
import type HasAndBelongsToManyRelationship from "./HasAndBelongsToManyRelationship";
import type HasManyRelationship from "./HasManyRelationship";
import type HasOneRelationship from "./HasOneRelationship";

export type RelationshipMetadata =
  | BelongsToRelationship
  | HasManyRelationship
  | HasOneRelationship
  | HasAndBelongsToManyRelationship;
