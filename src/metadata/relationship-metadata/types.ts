import type BelongsToRelationship from "./BelongsToRelationship";
import type HasAndBelongsToManyRelationship from "./HasAndBelongsToManyRelationship";
import type HasManyRelationship from "./HasManyRelationship";
import type HasOneRelationship from "./HasOneRelationship";
import type OwnedByRelationship from "./OwnedByRelationship";

/**
 * A union type that encompasses all possible relationship metadata classes within the ORM system. This type is used to represent the metadata for various types of relationships that can exist between entities, such as "BelongsTo", "HasMany", "HasOne", and "HasAndBelongsToMany" relationships.
 *
 * Each variant in the union corresponds to a specific relationship type, with its own set of properties and behaviors that define how entities are related to each other. This type enables the ORM to handle relationship metadata in a generic manner while still allowing for the specific characteristics of each relationship type to be accessed and utilized.
 *
 * - `BelongsToRelationship`: Represents a "BelongsTo" relationship, indicating that the entity has a foreign key pointing to another entity.
 * - `HasManyRelationship`: Represents a "HasMany" relationship, indicating that the entity can be associated with multiple instances of another entity.
 * - `HasOneRelationship`: Represents a "HasOne" relationship, indicating that the entity is associated with at most one instance of another entity.
 * - `OwnedByRelationship`: Represents an "OwnedBy" relationship, indicating a unidirectional relationship where the current entity is owned by another entity. This relationship focuses on linking the entity to its owner without requiring reverse associations.
 */
export type RelationshipMetadata =
  | BelongsToRelationship
  | HasManyRelationship
  | HasOneRelationship
  | HasAndBelongsToManyRelationship
  | OwnedByRelationship;

/**
 * An array of "Has" relationships (EX: "HasMany")
 */
export type HasRelationships = Array<
  HasManyRelationship | HasOneRelationship | HasAndBelongsToManyRelationship
>;
