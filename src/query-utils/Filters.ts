import { type RelationshipMetadata } from "../metadata";
import { type OrFilter } from "./types";
import { BelongsToLink } from "../relationships";
import { type NativeScalarAttributeValue } from "@aws-sdk/util-dynamodb";

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
  const includedTypes = [
    parentClassName,
    ...includedRelationships.map(rel => rel.target.name)
  ];

  const filters: OrFilter["$or"] = [{ type: includedTypes }];

  return { $or: filters };
}
