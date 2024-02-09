import type SingleTableDesign from "./SingleTableDesign";
import type {
  DynamoTableItem,
  BelongsToLinkDynamoItem,
  StringObj
} from "./types";
import Metadata from "./metadata";
import { BelongsToLink } from "./relationships";

// TODO should I pass the entity class instead of the name?
/**
 * Convert an entity to its aliased table item fields to for dynamo interactions
 * @param entityClassName
 * @param entityData
 * @returns
 */
export const entityToTableItem = (
  entityClassName: string,
  entityData: Partial<SingleTableDesign>
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

/**
 * Serialize a table item to its associated Entity class, using the class attribute property names
 * @param EntityClass
 * @param tableItem
 * @returns
 */
export const tableItemToEntity = <T extends SingleTableDesign>(
  EntityClass: new () => T,
  tableItem: DynamoTableItem
): T => {
  const { attributes: attrsMeta } = Metadata.getEntity(EntityClass.name);
  const entity = new EntityClass();

  Object.keys(tableItem).forEach(attrName => {
    const attrMeta = attrsMeta[attrName];

    if (attrMeta !== undefined) {
      const { name: entityKey, serializer } = attrMeta;
      if (isKeyOfEntity(entity, entityKey)) {
        const rawVal = tableItem[attrName];
        const val = serializer === undefined ? rawVal : serializer(rawVal);

        entity[entityKey] = val;
      }
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
 * Type guard to check if the key is a defined property on the entity
 * @param entity
 * @param key
 * @returns
 */
export const isKeyOfObject = <T>(
  entity: Partial<SingleTableDesign>,
  key: any
): key is keyof T => {
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

/**
 * Checks if a value is a valid property key (string, number, or symbol).
 *
 * @param value The value to be checked. This can be of any type.
 * @returns `true` if the value is a `string`, `number`, or `symbol` (i.e., a valid property key); otherwise, `false`.
 *
 * @example
 * console.log(isPropertyKey('test')); // true
 * console.log(isPropertyKey(123)); // true
 * console.log(isPropertyKey(Symbol('sym'))); // true
 * console.log(isPropertyKey({})); // false
 */
export const isPropertyKey = (value: any): value is PropertyKey => {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "symbol"
  );
};

/**
 * Checks if the given value is a string.
 *
 * @param value - The value to check. This can be any type as the function is meant to validate if it's a string.
 * @returns `true` if `value` is a string; otherwise, `false`.
 */
export const isString = (value: any): value is string => {
  return typeof value === "string";
};
