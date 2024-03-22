import type NoOrm from "../../NoOrm";
import type { EntityClass } from "../../types";

type RelationshipType =
  | "HasMany"
  | "BelongsTo"
  | "HasOne"
  | "HasAndBelongsToMany";

/**
 * Serves as the base class for defining metadata related to various types of relationships within the ORM system, such as "HasMany", "BelongsTo", "HasOne", and "HasAndBelongsToMany". This abstract class provides a common structure for relationship metadata, encapsulating the relationship type, target entity, and property name.
 *
 * Each subclass of `RelationshipMetadata` specifies a concrete type of relationship, leveraging this base class to ensure consistency and reusability across different relationship types. The metadata captured here is essential for the ORM to accurately manage and navigate relationships between entities, enabling operations like query construction, relationship traversal, and data integrity enforcement.
 *
 * @property {RelationshipType} type - An abstract property that must be defined by subclasses, indicating the specific type of relationship ("HasMany", "BelongsTo", "HasOne", "HasAndBelongsToMany").
 * @property {EntityClass<NoOrm>} target - The entity class that is the target of the relationship. This specifies the class of the entity on the "other side" of the relationship.
 * @property {keyof NoOrm} propertyName - The property name on the source entity that holds or references the related entity or entities. This name is used within the source entity's class definition to access the related entity.
 *
 * Note: This class is abstract and cannot be instantiated directly. Instead, it should be extended by specific relationship metadata classes that define concrete types of relationships.
 */
abstract class RelationshipMetadata {
  public abstract type: RelationshipType;
  public target: EntityClass<NoOrm>;
  public propertyName: keyof NoOrm;
}

export default RelationshipMetadata;
