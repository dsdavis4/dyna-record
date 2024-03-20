import type NoOrm from "./NoOrm";
import type { DynamoTableItem, BelongsToLinkDynamoItem } from "./types";
import Metadata, {
  type AttributeMetadata,
  type TableMetadata
} from "./metadata";
import { BelongsToLink } from "./relationships";
import type { NativeScalarAttributeValue } from "@aws-sdk/util-dynamodb";

// TODO should I pass the entity class instead of the name?
/**
 * Convert an entity to its aliased table item fields to for dynamo interactions
 * @param entityClassName
 * @param entityData
 * @returns
 */
export const entityToTableItem = (
  entityClassName: string,
  entityData: Partial<NoOrm>
): DynamoTableItem => {
  const attributesMeta = Metadata.getEntityAttributes(entityClassName);

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
export const tableItemToEntity = <T extends NoOrm>(
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

        entity[entityKey] = val;
      }
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
    ...{ [tableMeta.primaryKeyAttribute.alias]: tableMeta.primaryKeyAttribute },
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

      link[entityKey as keyof BelongsToLink] = val;
    }
  });

  return link;
};

/**
 * Type guard to check if the key is defined on the entity
 */
export const isKeyOfEntity = (
  entity: NoOrm,
  key: string
): key is keyof NoOrm => {
  return key in entity;
};

/**
 * Type guard to check if the key is a defined property on the entity
 * @param entity
 * @param key
 * @returns
 */
export const isKeyOfObject = <T>(
  entity: Partial<NoOrm>,
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

/**
 * Safely assigns a value to a property of an object that extends the `NoOrm`.
 * It's useful for dynamically assigning properties to objects where the property names might be known but the types could vary.
 *
 * @template TObject - The object type to which the property belongs, constrained to extend `NoOrm`.
 * @template TKey - The type of the keys of `TObject`, ensuring only property names defined in `NoOrm` or its extensions are acceptable.
 * @template TValue - The type of the value to be assigned. This method does not constrain `TValue`, allowing for flexible assignments while caution should be exercised to ensure runtime type safety.
 *
 * @param {TObject} object - The target object to which the property will be assigned. Must extend `NoOrm`.
 * @param {TKey} key - The property name under which the value should be assigned. Must be a key of `TObject`.
 * @param {TValue} value - The value to assign to the property on the object. While the function does not enforce a specific type for `TValue`, the assignment itself is type-checked against `TObject`'s property types.
 *
 * @returns {void} - This function does not return a value; it performs the assignment operation directly on the passed object.
 *
 * @example
 * // Assuming NoOrm and a compatible object
 * interface NoOrm {
 *   id: string;
 *   attribute?: any;
 * }
 *
 * interface MyEntity extends NoOrm {
 *   name?: string;
 *   age?: number;
 * }
 *
 * // Create an object of type MyEntity
 * let entity: MyEntity = { id: "123" };
 *
 * // Safely assign a string to the `name` property
 * safeAssignEntity(entity, "name", "Jane Doe");
 *
 * // Safely assign a number to the `age` property
 * safeAssignEntity(entity, "age", 32);
 *
 * // The function enforces type checks aligned with `NoOrm` and its extensions
 */
export const safeAssignEntity = <
  TObject extends NoOrm,
  TKey extends keyof TObject,
  TValue
>(
  object: TObject,
  key: TKey,
  value: TValue
): void => {
  object[key] = value as TObject[TKey];
};
