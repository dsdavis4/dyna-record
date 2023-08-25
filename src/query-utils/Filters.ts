import { RelationshipMetadata } from "../metadata";
import { OrFilter } from "./QueryBuilder";
import { BelongsToLink } from "../relationships";
import { NativeScalarAttributeValue } from "@aws-sdk/util-dynamodb";

// Key must be in BelongsToFilter, match the type of the key and a valid filter attribute type
type BelongsToLinkFilter = {
  [K in keyof BelongsToLink]?: BelongsToLink[K] extends NativeScalarAttributeValue
    ? BelongsToLink[K] | BelongsToLink[K][]
    : never;
};

class Filters {
  static includedRelationships(
    parentClassName: string,
    includedRelationships: RelationshipMetadata[]
  ): OrFilter {
    const filters: OrFilter["$or"] = [{ type: parentClassName }];

    const includeBelongsToLinks = includedRelationships.some(
      rel => rel.type === "HasMany"
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
}

export default Filters;
