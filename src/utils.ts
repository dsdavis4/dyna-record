import type DynaRecord from "./DynaRecord";
import type { DynamoTableItem, Nullable } from "./types";
import Metadata from "./metadata";
import type { NativeAttributeValue } from "@aws-sdk/util-dynamodb";
import { type EntityAttributesOnly } from "./operations";

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
          serializers === undefined || val === null
            ? val
            : serializers.toTableAttribute(val);

        acc[alias] = value as NativeAttributeValue;
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
  attributes: EntityAttributesOnly<T>
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
  TObject extends EntityAttributesOnly<DynaRecord>,
  TKey extends keyof TObject,
  TValue
>(
  object: TObject,
  key: TKey,
  value: TValue
): void => {
  object[key] = value as TObject[TKey];
};

/**
 * Type guard to check if a string is a Nullable<string>
 * @param val
 * @returns
 */
export const isNullableString = (val: unknown): val is Nullable<string> => {
  return typeof val === "string" || val === null;
};
