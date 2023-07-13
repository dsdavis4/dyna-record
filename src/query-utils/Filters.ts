import { RelationshipMetadata } from "../metadata";
import { OrFilter } from "./QueryBuilder";
import { BelongsToLink } from "../relationships";

class Filters {
  static includedRelationships(
    parentClass: string,
    includedRelationships: RelationshipMetadata[]
  ): OrFilter {
    const parentFilter = { type: parentClass };
    const filters = [parentFilter];

    const includeBelongsToLinks = includedRelationships.some(
      rel => rel.type === "HasMany"
    );
    includeBelongsToLinks && filters.push({ type: BelongsToLink.name });

    return { $or: filters };
  }
}

export default Filters;
