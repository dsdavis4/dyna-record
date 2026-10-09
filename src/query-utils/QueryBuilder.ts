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
import { FilterError } from "../errors.js";
import { isObjectValuedScalar } from "../filter-utils/storedForm.js";

/**
 * Constructs and formats a DynamoDB query command based on provided key conditions and query options. This class simplifies the creation of complex DynamoDB queries by abstracting the underlying AWS SDK query command structure, particularly handling the construction of key condition expressions, filter expressions, and expression attribute names and values.
 *
 * Utilizing metadata about the entity and its attributes, `QueryBuilder` generates the necessary DynamoDB expressions to perform precise queries. Filters support equality, 'IN', the comparators, 'BETWEEN', 'begins_with' and 'contains', joined with logical 'AND' and 'OR', over top level attributes and dot-path notation for nested Map attributes. Key conditions compile under a narrower vocabulary — see {@link keyConditionCapabilities}.
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

    const hasIndex = indexName !== undefined;

    // A filter whose every condition was dropped compiles to an empty
    // expression — `filter: { name: req.query.name }` with nothing in it, which
    // is the documented way to forward an optional input. Attaching the empty
    // string is what DynamoDB rejects, so there has to be something to attach
    const hasFilter =
      filterParams !== undefined && filterParams.expression !== "";

    this.assertPartitionKeyEquality(hasIndex);

    const keyFilter = this.#expressionBuilder.keyConditions(this.#props.key);

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
    // Keyed off the compiled values rather than the caller's input, so a filter
    // that dropped every condition contributes none
    const valueParams = { ...keyParams.values, ...filterParams?.values };

    return this.#expressionBuilder.expressionAttributeValues(valueParams);
  }

  /**
   * Rejects a non-equality condition on the table's partition key.
   *
   * DynamoDB requires an equality on the partition key in every key condition:
   * the value selects the partition to read, so there is nothing for a range to
   * narrow. A range there is a `ValidationException` naming neither the
   * attribute nor the reason.
   *
   * Enforced only for an entity query, where the partition key is known from
   * table metadata. On an index query `indexName` is a bare string, so
   * dyna-record does not know the index's key schema and cannot tell which
   * attribute plays that role — the check is skipped rather than guessed at,
   * and DynamoDB rejects a bad index key condition itself. Modeling secondary
   * indexes is what would let this be enforced everywhere
   * @param hasIndex - Whether the query targets a secondary index
   */
  private assertPartitionKeyEquality(hasIndex: boolean): void {
    if (hasIndex) return;

    const { name: attributeName } = this.#tableMetadata.partitionKeyAttribute;
    const condition = this.#props.key[attributeName];

    // A whole value is an equality. Anything else — an operator object, or an
    // IN array — is a condition the key vocabulary may accept on the sort key
    // but never here. What counts as a whole value is stated once, in
    // isObjectValuedScalar, because this check and the condition-shape guard
    // both need it and had drifted apart
    if (
      typeof condition === "object" &&
      condition !== null &&
      !isObjectValuedScalar(condition)
    ) {
      throw new FilterError(
        `Invalid key condition for attribute "${attributeName}": the partition key takes an equality. Its value selects the partition to read, so there is nothing for another condition to narrow`
      );
    }
  }

  /**
   * Resolves a filter attribute key to its table alias via the entity's
   * attribute metadata, which includes the attributes of related entities
   * @param attributeKey - The attribute key being filtered on. For dot-path keys this is the top level segment
   * @param filterKey - The full filter key as provided by the caller
   * @returns The resolved {@link FilterAttribute}
   * @throws {FilterError} When no entity in the partition declares the attribute
   */
  private resolveAttribute(
    attributeKey: string,
    filterKey: string
  ): FilterAttribute {
    if (!Object.hasOwn(this.#attributeMetadata, attributeKey)) {
      throw new FilterError(
        `Invalid filter key "${filterKey}": attribute "${attributeKey}" does not exist on this entity. ` +
          `Valid attributes are: ${Object.keys(this.#attributeMetadata).join(", ")}`
      );
    }

    // AttributeMetadata already is a FilterAttribute: the alias, the validator
    // and the serializers all describe the attribute as the entity declares it,
    // which is how a filter names it
    return this.#attributeMetadata[attributeKey];
  }
}

export default QueryBuilder;
