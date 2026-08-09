import { z, type ZodType } from "zod";
import { FilterError } from "../errors.js";
import Metadata, { type VectorIndexSchema } from "../metadata/index.js";
import type { FilterAttribute, FilterAttributeResolver } from "./types.js";

/**
 * Builds the vector search context's attribute-metadata resolver for a vector
 * index. The resolver is the runtime guard on untrusted filter input — the
 * compile-time search filter typing is erased for plain JS callers (EX:
 * `filter: req.query`), so every filter key must resolve to an attribute
 * declared `@SearchFilterable` on the index's member entities or be rejected
 * with a {@link FilterError} naming the attribute.
 *
 * Resolved attributes carry their registered zod type so condition values
 * that violate the attribute's schema (EX: a nested operator object where a
 * scalar is expected) are rejected by the {@link FilterExpressionBuilder}.
 * When members register different types for the same filterable property, a
 * value is accepted if it matches any member's type.
 *
 * @param index - Metadata of the vector index being searched
 * @returns The index-member {@link FilterAttributeResolver}
 */
export function searchFilterAttributeResolver(
  index: VectorIndexSchema
): FilterAttributeResolver {
  let filterableAttributes: Record<string, FilterAttribute> | undefined;

  // Built lazily so resolvers can be created before metadata initialization
  // has resolved the index's member entities
  const getFilterableAttributes = (): Record<string, FilterAttribute> => {
    if (filterableAttributes !== undefined) return filterableAttributes;

    // The index's member entities are resolved during metadata
    // initialization, which is lazy — looking up the index's table triggers
    // it if it has not run yet
    Metadata.getTable(index.tableClassName);

    const typesByProperty: Record<string, { alias: string; types: ZodType[] }> =
      {};

    for (const entityName of index.memberEntities) {
      const entityMetadata = Metadata.getEntity(entityName);
      for (const attrMeta of entityMetadata.searchFilterableAttributes) {
        const entry = (typesByProperty[attrMeta.name] ??= {
          alias: attrMeta.alias,
          types: []
        });
        entry.types.push(attrMeta.type);
      }
    }

    filterableAttributes = Object.entries(typesByProperty).reduce<
      Record<string, FilterAttribute>
    >((acc, [name, { alias, types }]) => {
      const [firstType, ...otherTypes] = types;
      return {
        ...acc,
        [name]: {
          alias,
          type:
            otherTypes.length === 0
              ? firstType
              : z.union([firstType, ...otherTypes])
        }
      };
    }, {});

    return filterableAttributes;
  };

  return (attributeKey, filterKey) => {
    if (attributeKey === "type") {
      throw new FilterError(
        `Invalid search filter key "${filterKey}": the "type" discriminator cannot be filtered on directly. Narrow a search to specific entities with the "in" option`
      );
    }

    const attributes = getFilterableAttributes();

    if (!(attributeKey in attributes)) {
      throw new FilterError(
        `Invalid search filter key "${filterKey}": attribute "${attributeKey}" is not declared @SearchFilterable on the members of vector index ${index.name}. Filterable attributes are: ${Object.keys(attributes).join(", ")}`
      );
    }

    return attributes[attributeKey];
  };
}
