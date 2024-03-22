import { type RelationshipMetadata } from "../metadata";
import { type OrFilter } from "./types";
import { BelongsToLink } from "../relationships";
import { type NativeScalarAttributeValue } from "@aws-sdk/util-dynamodb";

// Key must be in BelongsToFilter, match the type of the key and a valid filter attribute type
type BelongsToLinkFilter = {
  [K in keyof BelongsToLink]?: BelongsToLink[K] extends NativeScalarAttributeValue
    ? BelongsToLink[K] | Array<BelongsToLink[K]>
    : never;
};

/**
 * Builds the filter so that relationships that are included in the query will have their {@link BelongsToLink} included in the query
 * @param parentClassName
 * @param includedRelationships
 * @returns
 */
export function includedRelationshipsFilter(
  parentClassName: string,
  includedRelationships: RelationshipMetadata[]
): OrFilter {
  const filters: OrFilter["$or"] = [{ type: parentClassName }];

  const includeBelongsToLinks = includedRelationships.some(
    rel =>
      rel.type === "HasMany" ||
      rel.type === "HasOne" ||
      rel.type === "HasAndBelongsToMany"
  );

  if (includeBelongsToLinks) {
    const belongsToFilter: BelongsToLinkFilter = {
      type: BelongsToLink.name,
      foreignEntityType: includedRelationships.map(rel => rel.target.name)
    };
    filters.push(belongsToFilter);
  }

  return { $or: filters };
}
