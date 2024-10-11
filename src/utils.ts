import type DynaRecord from "./DynaRecord";
import type { DynamoTableItem, BelongsToLinkDynamoItem } from "./types";
import Metadata, {
  type AttributeMetadata,
  type TableMetadata
} from "./metadata";
import { BelongsToLink } from "./relationships";
import type { NativeScalarAttributeValue } from "@aws-sdk/util-dynamodb";
import { type EntityAttributes } from "./operations";

/**
 * Convert an entity to its aliased table item fields to for dynamo interactions
 * @param entityClassName
 * @param entityData
 * @returns
 */
export const entityToTableItem = <T extends DynaRecord>(
  EntityClass: new () => T,
  entityData: Partial<DynaRecord>
): DynamoTableItem => {
  const attributesMeta = Metadata.getEntityAttributes(EntityClass.name);

  return Object.entries(entityData).reduce<DynamoTableItem>(
    (acc, [key, val]) => {
      const attrMeta = attributesMeta[key];
      if (attrMeta !== undefined) {
        const { alias, serializers } = attrMeta;

        // If the attribute has a custom serializer, serialize it
        const value =
          serializers === undefined ? val : serializers.toTableAttribute(val);

        acc[alias] = value as NativeScalarAttributeValue;
      }
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
export const tableItemToEntity = <T extends DynaRecord>(
  EntityClass: new () => T,
  tableItem: DynamoTableItem
): T => {
  const tableAttributes = Metadata.getEntityTableAttributes(EntityClass.name);

  const entity = new EntityClass();

  Object.keys(tableItem).forEach(attrName => {
    const attrMeta = tableAttributes[attrName];

    if (attrMeta !== undefined) {
      const { name: entityKey, serializers } = attrMeta;
      if (isKeyOfEntity(entity, entityKey)) {
        const rawVal = tableItem[attrName];
        const val =
          serializers?.toEntityAttribute === undefined
            ? rawVal
            : serializers?.toEntityAttribute(rawVal);

        safeAssign(entity, entityKey, val);
      }
    }
  });

  return entity;
};

/**
 * Create an instance of a dyna record class
 */
export const createInstance = <T extends DynaRecord>(
  EntityClass: new () => T,
  attributes: EntityAttributes<T>
): T => {
  const entity = new EntityClass();

  Object.entries(attributes).forEach(([attrName, val]) => {
    if (isKeyOfEntity(entity, attrName)) {
      safeAssign(entity, attrName, val);
    }
  });

  return entity;
};

/**
 * Serialize a dynamo table item response to a BelongsToLink
 * @param tableMeta - Table metadata
 * @param tableItem - Table item from dynamo response
 * @returns - { @link BelongsToLink }
 */
export const tableItemToBelongsToLink = (
  tableMeta: TableMetadata,
  tableItem: BelongsToLinkDynamoItem
): BelongsToLink => {
  const link = new BelongsToLink();

  const belongsToLinkAttrs: Record<string, AttributeMetadata> = {
    ...{
      [tableMeta.partitionKeyAttribute.alias]: tableMeta.partitionKeyAttribute
    },
    ...{ [tableMeta.sortKeyAttribute.alias]: tableMeta.sortKeyAttribute },
    ...tableMeta.defaultTableAttributes
  };

  Object.keys(tableItem).forEach(attrName => {
    const attrMeta = belongsToLinkAttrs[attrName];

    if (attrMeta !== undefined) {
      const { name: entityKey, serializers } = attrMeta;
      const rawVal = tableItem[attrName];
      const val =
        serializers?.toEntityAttribute === undefined
          ? rawVal
          : serializers?.toEntityAttribute(rawVal);

      safeAssign(link, entityKey as keyof BelongsToLink, val);
    }
  });

  return link;
};

/**
 * Type guard to check if the key is defined on the entity
 */
export const isKeyOfEntity = (
  entity: DynaRecord,
  key: string
): key is keyof DynaRecord => {
  return key in entity;
};

/**
 * Type guard to check if the key is a defined property on the entity
 * @param entity
 * @param key
 * @returns
 */
export const isKeyOfObject = <T>(
  entity: Partial<DynaRecord>,
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
  res: DynamoTableItem,
  tableMeta: TableMetadata
): res is BelongsToLinkDynamoItem => {
  return res[tableMeta.defaultAttributes.type.alias] === BelongsToLink.name;
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
 * Logger.log(isPropertyKey('test')); // true
 * Logger.log(isPropertyKey(123)); // true
 * Logger.log(isPropertyKey(Symbol('sym'))); // true
 * Logger.log(isPropertyKey({})); // false
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

/**
 * Safely assigns a value to a property of an object.
 * It's useful for dynamically assigning properties to objects where the property names might be known but the types could vary.
 *
 * @template TObject - The object type to which the property belongs.
 * @template TKey - The type of the keys of `TObject`
 * @template TValue - The  value to be assigned.
 *
 * @param {TObject} object - The target object to which the property will be assigned.
 * @param {TKey} key - The property name under which the value should be assigned. Must be a key of `TObject`.
 * @param {TValue} value - The value to assign to the property on the object.
 *
 * @returns {void} - This function does not return a value; it performs the assignment operation directly on the passed object.
 *
 * @example
 * let entity = { id: "123" };
 * safeAssign(entity, "name", "Jane Doe");
 */
export const safeAssign = <
  TObject extends EntityAttributes<DynaRecord>,
  TKey extends keyof TObject,
  TValue
>(
  object: TObject,
  key: TKey,
  value: TValue
): void => {
  object[key] = value as TObject[TKey];
};
