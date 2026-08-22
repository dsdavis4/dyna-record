import { type QueryCommandInput } from "@aws-sdk/lib-dynamodb";
import Metadata, {
  type AttributeMetadataStorage,
  type TableMetadata
} from "../metadata/index.js";
import {
  FilterExpressionBuilder,
  queryFilterCapabilities,
  type FilterAttribute,
  type FilterExpression
} from "../filter-utils/index.js";
import type { QueryCommandProps } from "./types.js";
import { consistentReadVal } from "../operations/utils/index.js";

/**
 * Constructs and formats a DynamoDB query command based on provided key conditions and query options. This class simplifies the creation of complex DynamoDB queries by abstracting the underlying AWS SDK query command structure, particularly handling the construction of key condition expressions, filter expressions, and expression attribute names and values.
 *
 * Utilizing metadata about the entity and its attributes, `QueryBuilder` generates the necessary DynamoDB expressions to perform precise queries, including support for conditional operators like '=', 'begins_with', 'contains', and 'IN', as well as logical 'AND' and 'OR' operations. Supports dot-path notation for filtering on nested Map attributes.
 *
 * Expression compilation is delegated to a {@link FilterExpressionBuilder}
 * instance parameterized with the query capability set (the full filter
 * vocabulary) and an entity-and-relationships attribute resolver. Key
 * conditions and filters compile through the same instance so value
 * placeholder numbering is continuous across both.
 */
class QueryBuilder {
  readonly #props: QueryCommandProps;
  readonly #tableMetadata: TableMetadata;
  /**
   * Attributes of the entity and any related entities that are possible to query on
   */
  readonly #attributeMetadata: AttributeMetadataStorage;
  readonly #expressionBuilder: FilterExpressionBuilder;

  constructor(props: QueryCommandProps) {
    this.#props = props;

    const entityMetadata = Metadata.getEntity(props.entityClassName);
    this.#tableMetadata = Metadata.getTable(entityMetadata.tableClassName);

    const relationshipsAttributesMeta = Object.values(
      entityMetadata.relationships
    ).map(relMeta => Metadata.getEntityAttributes(relMeta.target.name));

    const entityAttrMeta = Metadata.getEntityAttributes(props.entityClassName);
    const allAttrMeta = [...relationshipsAttributesMeta, entityAttrMeta];

    this.#attributeMetadata = allAttrMeta.reduce((allAttrMeta, attrMeta) => {
      return { ...allAttrMeta, ...attrMeta };
    }, {});

    this.#expressionBuilder = new FilterExpressionBuilder({
      capabilities: queryFilterCapabilities,
      resolveAttribute: (attributeKey, filterKey) =>
        this.resolveAttribute(attributeKey, filterKey)
    });
  }

  /**
   * Builds and returns the `QueryCommandInput` for a DynamoDB query operation.
   * @returns {QueryCommandInput} The configured query command input for AWS SDK.
   */
  public build(): QueryCommandInput {
    const { indexName, filter } = this.#props.options ?? {};
    const filterParams =
      filter !== undefined
        ? this.#expressionBuilder.filterParams(filter)
        : undefined;

    const keyFilter = this.#expressionBuilder.andFilter(this.#props.key);

    const hasIndex = indexName !== undefined;
    const hasFilter = filterParams !== undefined;

    // Present only on tables with a vector index: the vector-excluding
    // inclusion projection. Reads on tables without one are untouched
    const { readProjection } = this.#tableMetadata;

    return {
      TableName: this.#tableMetadata.name,
      ...(hasIndex && { IndexName: indexName }),
      ...(hasFilter && { FilterExpression: filterParams.expression }),
      KeyConditionExpression: keyFilter.expression,
      ExpressionAttributeNames: {
        ...this.#expressionBuilder.expressionAttributeNames(
          Object.keys(this.#props.key),
          this.#props.options?.filter
        ),
        ...readProjection?.attributeNames
      },
      ExpressionAttributeValues: this.expressionAttributeValueParams(
        keyFilter,
        filterParams
      ),
      ...(readProjection !== undefined && {
        ProjectionExpression: readProjection.expression
      }),
      ConsistentRead: consistentReadVal(this.#props.options?.consistentRead)
    };
  }

  /**
   * Build ExpressionAttributeValues
   * @param keyParams
   * @param filterParams
   * @returns
   */
  private expressionAttributeValueParams(
    keyParams: FilterExpression,
    filterParams?: FilterExpression
  ): QueryCommandInput["ExpressionAttributeValues"] {
    const hasFilter = this.#props.options?.filter !== undefined;
    const valueParams = hasFilter
      ? { ...keyParams.values, ...filterParams?.values }
      : keyParams.values;

    return this.#expressionBuilder.expressionAttributeValues(valueParams);
  }

  /**
   * Resolves a filter attribute key to its table alias via the entity's
   * attribute metadata, which includes the attributes of related entities
   * @param attributeKey - The attribute key being filtered on. For dot-path keys this is the top level segment
   * @param filterKey - The full filter key as provided by the caller
   * @returns The resolved {@link FilterAttribute}
   */
  private resolveAttribute(
    attributeKey: string,
    filterKey: string
  ): FilterAttribute {
    if (!Object.hasOwn(this.#attributeMetadata, attributeKey)) {
      throw new Error(
        `Invalid filter key "${filterKey}": attribute "${attributeKey}" does not exist on this entity. ` +
          `Valid attributes are: ${Object.keys(this.#attributeMetadata).join(", ")}`
      );
    }

    return { alias: this.#attributeMetadata[attributeKey].alias };
  }
}

export default QueryBuilder;
