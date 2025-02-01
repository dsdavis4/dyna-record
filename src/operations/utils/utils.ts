import type DynaRecord from "../../DynaRecord";
import type {
  BelongsToOrOwnedByRelationship,
  RelationshipMetadata
} from "../../metadata";
import Metadata from "../../metadata";
import {
  doesEntityBelongToRelAsHasMany,
  doesEntityBelongToRelAsHasOne,
  isBelongsToRelationship,
  isRelationshipMetadataWithForeignKey
} from "../../metadata/utils";
import type {
  DynamoTableItem,
  EntityClass,
  ForeignKey,
  Optional,
  RelationshipMetaObj
} from "../../types";
import { isKeyOfObject } from "../../utils";
import { type EntityAttributesOnly } from "../types";

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
export const extractForeignKeyFromEntity = <
  T extends Partial<EntityAttributesOnly<DynaRecord>>
>(
  relMeta: RelationshipMetadata,
  entity: T
): Optional<ForeignKey> => {
  return isRelationshipMetadataWithForeignKey(relMeta) &&
    isKeyOfObject(entity, relMeta.foreignKey)
    ? entity[relMeta.foreignKey]
    : undefined;
};

/**
 * Creates the PK and SK (key) for a table item that BelongsTo another as HasMany or HasOne
 * @param entityClass
 * @param entityId
 * @param relMeta
 * @param foreignKey
 * @returns
 */
export const buildBelongsToLinkKey = (
  entityClass: EntityClass<DynaRecord>,
  entityId: string,
  relMeta: BelongsToOrOwnedByRelationship,
  foreignKey: string
): DynamoTableItem => {
  const tableMeta = Metadata.getEntityTable(entityClass.name);

  const partitionKeyAlias = tableMeta.partitionKeyAttribute.alias;
  const sortKeyAlias = tableMeta.sortKeyAttribute.alias;

  if (doesEntityBelongToRelAsHasMany(entityClass, relMeta)) {
    return {
      [partitionKeyAlias]: relMeta.target.partitionKeyValue(foreignKey),
      [sortKeyAlias]: entityClass.partitionKeyValue(entityId)
    };
  }

  if (doesEntityBelongToRelAsHasOne(entityClass, relMeta)) {
    return {
      [partitionKeyAlias]: relMeta.target.partitionKeyValue(foreignKey),
      [sortKeyAlias]: entityClass.name
    };
  }

  throw new Error("Failed to build BelongsTo key for linked record");
};
