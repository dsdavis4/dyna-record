import type SingleTableDesign from "./SingleTableDesign";
import {
  type DynamoTableItem,
  type BelongsToLinkDynamoItem,
  type StringObj
} from "./types";
import Metadata from "./metadata";
import { BelongsToLink } from "./relationships";

export const entityToTableItem = (
  entityClassName: string,
  entityData: SingleTableDesign
): DynamoTableItem => {
  const entityMetadata = Metadata.getEntity(entityClassName);

  const possibleAttrs = {
    ...entityMetadata.attributes,
    ...Metadata.getEntity(BelongsToLink.name).attributes
  };

  const tableKeyLookup = Object.entries(possibleAttrs).reduce<StringObj>(
    (acc, [tableKey, attrMetadata]) => {
      acc[attrMetadata.name] = tableKey;
      return acc;
    },
    {}
  );

  return Object.entries(entityData).reduce<DynamoTableItem>(
    (acc, [key, val]) => {
      const tableKey = tableKeyLookup[key];
      // Dynamo doesn't support date, convert to string
      const value = val instanceof Date ? val.toISOString() : val;
      acc[tableKey] = value;
      return acc;
    },
    {}
  );
};

export const tableItemToEntity = <T extends SingleTableDesign>(
  EntityClass: new () => T,
  tableItem: DynamoTableItem
): T => {
  const { attributes: attrs } = Metadata.getEntity(EntityClass.name);
  const entity = new EntityClass();

  Object.keys(tableItem).forEach(attr => {
    const entityKey = attrs[attr]?.name;
    if (isKeyOfEntity(entity, entityKey)) {
      entity[entityKey] = tableItem[attr];
    }
  });

  return entity;
};

/**
 * Type guard to check if the key is defined on the entity
 */
export const isKeyOfEntity = (
  entity: SingleTableDesign,
  key: string
): key is keyof SingleTableDesign => {
  return key in entity;
};

/**
 * Type guard to check if the DynamoTableItem is a BelongsToLink
 * @param res DynamoTableItem
 * @returns boolean
 */
export const isBelongsToLinkDynamoItem = (
  res: DynamoTableItem
): res is BelongsToLinkDynamoItem => {
  return res.Type === BelongsToLink.name;
};

/**
 * Break an array into chunks
 * @param array
 * @param size
 * @returns Array split into chunks of given  size
 */
export const chunkArray = <T>(array: T[], size: number): T[][] => {
  return Array.from({ length: Math.ceil(array.length / size) }, (_, index) =>
    array.slice(index * size, (index + 1) * size)
  );
};
