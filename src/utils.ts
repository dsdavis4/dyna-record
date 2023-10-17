import type SingleTableDesign from "./SingleTableDesign";
import { type DynamoTableItem, type StringObj } from "./types";
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
