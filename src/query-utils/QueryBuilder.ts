import { type QueryCommandInput } from "@aws-sdk/lib-dynamodb";
import { type NativeAttributeValue } from "@aws-sdk/util-dynamodb";
import Metadata, {
  type AttributeMetadataStorage,
  type TableMetadata
} from "../metadata";
import type { StringObj } from "../types";
import type {
  AndFilter,
  AndOrFilter,
  BeginsWithFilter,
  ContainsFilter,
  FilterExpression,
  FilterParams,
  FilterTypes,
  KeyConditions,
  OrFilter,
  QueryCommandProps
} from "./types";
import { consistentReadVal } from "../operations/utils";

/**
 * Represents the resolved components of an attribute path for use in DynamoDB expressions.
 *
 * @property expressionPath - The `#`-prefixed expression path (e.g., `#Address.#city`)
 * @property names - The ExpressionAttributeNames entries for each path segment
 * @property placeholderKey - A flat key for use in value placeholders (e.g., `Addresscity`)
 */
interface ResolvedPath {
  expressionPath: string;
  names: StringObj;
  placeholderKey: string;
}

/**
 * Constructs and formats a DynamoDB query command based on provided key conditions and query options. This class simplifies the creation of complex DynamoDB queries by abstracting the underlying AWS SDK query command structure, particularly handling the construction of key condition expressions, filter expressions, and expression attribute names and values.
 *
 * Utilizing metadata about the entity and its attributes, `QueryBuilder` generates the necessary DynamoDB expressions to perform precise queries, including support for conditional operators like '=', 'begins_with', 'contains', and 'IN', as well as logical 'AND' and 'OR' operations. Supports dot-path notation for filtering on nested Map attributes.
 */
class QueryBuilder {
  readonly #props: QueryCommandProps;
  readonly #tableMetadata: TableMetadata;
  /**
   * Attributes of the entity and any related entities that are possible to query on
   */
  readonly #attributeMetadata: AttributeMetadataStorage;
  #attrCounter: number;

  constructor(props: QueryCommandProps) {
    this.#props = props;
    this.#attrCounter = 0;

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
  }

  /**
   * Builds and returns the `QueryCommandInput` for a DynamoDB query operation.
   * @returns {QueryCommandInput} The configured query command input for AWS SDK.
   */
  public build(): QueryCommandInput {
    const { indexName, filter } = this.#props.options ?? {};
    const filterParams =
      filter !== undefined ? this.filterParams(filter) : undefined;

    const keyFilter = this.andFilter(this.#props.key);

    const hasIndex = indexName !== undefined;
    const hasFilter = filterParams !== undefined;

    return {
      TableName: this.#tableMetadata.name,
      ...(hasIndex && { IndexName: indexName }),
      ...(hasFilter && { FilterExpression: filterParams.expression }),
      KeyConditionExpression: keyFilter.expression,
      ExpressionAttributeNames: this.expressionAttributeNames(),
      ExpressionAttributeValues: this.expressionAttributeValueParams(
        keyFilter,
        filterParams
      ),
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

    return Object.entries(valueParams).reduce(
      (params, [attrName, value]) => ({ ...params, [`:${attrName}`]: value }),
      {}
    );
  }

  /**
   * Build ExpressionAttributeNames
   * @returns
   */
  private expressionAttributeNames(): QueryCommandInput["ExpressionAttributeNames"] {
    const { filter } = this.#props.options ?? {};

    const accumulator = (obj: StringObj, key: string): StringObj => {
      const resolved = this.resolveAttrPath(key);
      Object.assign(obj, resolved.names);
      return obj;
    };

    let expressionAttributeNames = Object.keys(
      this.#props.key
    ).reduce<StringObj>((acc, key) => accumulator(acc, key), {});

    if (filter !== undefined) {
      const { $or: orFilters = [], ...andFilters } = filter;

      const or = orFilters.reduce<StringObj>((acc: StringObj, filter) => {
        Object.keys(filter).forEach(key => accumulator(acc, key));
        return acc;
      }, {});

      const and = Object.keys(andFilters).reduce<StringObj>(
        (acc, key) => accumulator(acc, key),
        {}
      );

      expressionAttributeNames = { ...expressionAttributeNames, ...or, ...and };
    }

    return expressionAttributeNames;
  }

  /**
   * Creates the filters
   *
   * Supports 'AND' and 'OR'
   * Supports '=', 'begins_with', 'contains', and 'IN' operands
   * Supports dot-path notation for nested Map attributes (e.g., 'address.city')
   *
   * @param filter
   * @returns
   */
  private filterParams(filter: FilterParams): FilterExpression {
    const isOrFilter = this.isOrFilter(filter);

    if (isOrFilter) {
      const isAndOrFilter = this.isAndOrFilter(filter);
      return isAndOrFilter ? this.andOrFilter(filter) : this.orFilter(filter);
    } else {
      return this.andFilter(filter);
    }
  }

  /**
   * Creates an AND OR filter
   * @param filter
   * @returns
   */
  private andOrFilter(filter: AndOrFilter): FilterExpression {
    const { $or: _orFilters, ...andFilters } = filter;
    const orFilterParams = this.orFilter(filter);
    const andFilterParams = this.andFilter(andFilters);
    const expression = `(${orFilterParams.expression}) AND (${andFilterParams.expression})`;
    const values = { ...orFilterParams.values, ...andFilterParams.values };
    return { expression, values };
  }

  /**
   * Creates an AND filter
   * @param filter
   * @returns
   */
  private andFilter(filter: KeyConditions | AndFilter): FilterExpression {
    const params = Object.entries(filter).reduce(
      (obj, [attr, value]) => {
        const { expression, values } = this.andCondition(attr, value);
        return {
          expression: obj.expression.concat(expression),
          values: { ...obj.values, ...values }
        };
      },
      { expression: "", values: {} }
    );
    params.expression = params.expression.slice(0, -5); // trim off the trailing " AND "
    return params;
  }

  /**
   * Creates an AND condition.
   * Supports equality, begins_with, contains, and IN operators.
   * Supports dot-path notation for nested Map attributes.
   * @param attr - The attribute key, optionally using dot notation for nested paths
   * @param value
   * @returns
   */
  private andCondition(attr: string, value: FilterTypes): FilterExpression {
    const resolved = this.resolveAttrPath(attr);

    let condition;
    let values: Record<string, NativeAttributeValue> = {};
    if (Array.isArray(value)) {
      const mappings = value.reduce<string[]>((acc, val) => {
        const placeholder = `${resolved.placeholderKey}${++this.#attrCounter}`;
        values[placeholder] = val;
        return acc.concat(`:${placeholder}`);
      }, []);
      condition = `${resolved.expressionPath} IN (${mappings.join()})`;
    } else if (this.isBeginsWithFilter(value)) {
      const placeholder = `${resolved.placeholderKey}${++this.#attrCounter}`;
      condition = `begins_with(${resolved.expressionPath}, :${placeholder})`;
      values = { [placeholder]: value.$beginsWith };
    } else if (this.isContainsFilter(value)) {
      const placeholder = `${resolved.placeholderKey}${++this.#attrCounter}`;
      condition = `contains(${resolved.expressionPath}, :${placeholder})`;
      values = { [placeholder]: value.$contains };
    } else {
      const placeholder = `${resolved.placeholderKey}${++this.#attrCounter}`;
      condition = `${resolved.expressionPath} = :${placeholder}`;
      values = { [placeholder]: value };
    }

    return { expression: `${condition} AND `, values };
  }

  /**
   * Resolves an attribute key (potentially a dot-path) into its DynamoDB expression components.
   *
   * For simple keys (e.g., "name"), resolves via metadata alias.
   * For dot-paths (e.g., "address.city"), resolves the first segment via metadata alias
   * and uses remaining segments as literal Map sub-keys.
   *
   * @param key - The attribute key, optionally using dot notation
   * @returns The resolved expression path, attribute names, and placeholder key
   */
  private resolveAttrPath(key: string): ResolvedPath {
    const segments = key.split(".");
    const topLevelKey = segments[0];
    const tableKey = this.#attributeMetadata[topLevelKey].alias;

    const names: StringObj = { [`#${tableKey}`]: tableKey };

    if (segments.length === 1) {
      return {
        expressionPath: `#${tableKey}`,
        names,
        placeholderKey: tableKey
      };
    }

    const subSegments = segments.slice(1);
    for (const segment of subSegments) {
      names[`#${segment}`] = segment;
    }

    const expressionPath = `#${tableKey}.${subSegments.map(s => `#${s}`).join(".")}`;
    const placeholderKey = `${tableKey}${subSegments.join("")}`;

    return { expressionPath, names, placeholderKey };
  }

  /**
   * Builds an OR filter
   * @param filter
   * @returns
   */
  private orFilter(filter: OrFilter): FilterExpression {
    const orFilter = filter.$or.reduce<FilterExpression>(
      (filterParams, filter) => {
        const { expression, values } = this.orCondition(filter);
        return {
          expression: filterParams.expression.concat(expression),
          values: { ...filterParams.values, ...values }
        };
      },
      { expression: "", values: {} }
    );
    orFilter.expression = orFilter.expression.slice(0, -4); // trim off the trailing " OR "
    return orFilter;
  }

  /**
   * Builds an OR condition
   * @param andFilter \
   * @returns
   */
  private orCondition(andFilter: AndFilter): FilterExpression {
    const andParams = this.filterParams(andFilter);
    const multipleVals = Object.keys(andParams.values).length > 1;
    const expression = multipleVals
      ? `(${andParams.expression}) OR `
      : `${andParams.expression} OR `;

    const values = Object.entries(andParams.values).reduce<
      FilterExpression["values"]
    >((obj, [key, val]) => ({ ...obj, [key]: val }), {});
    return { expression, values };
  }

  /**
   * Type guard to check if its a BeginsWithFilter
   * @param filter
   * @returns
   */
  private isBeginsWithFilter(filter: FilterTypes): filter is BeginsWithFilter {
    return (filter as BeginsWithFilter).$beginsWith !== undefined;
  }

  /**
   * Type guard to check if its a ContainsFilter
   * @param filter
   * @returns
   */
  private isContainsFilter(filter: FilterTypes): filter is ContainsFilter {
    return (filter as ContainsFilter).$contains !== undefined;
  }

  /**
   * Type guard to check if its a AndOrFilter
   * @param filter
   * @returns
   */
  private isAndOrFilter(filter: FilterParams): filter is AndOrFilter {
    return this.isOrFilter(filter) && Object.keys(filter).length > 1;
  }

  /**
   * Type guard to check if its a OrFilter
   * @param filter
   * @returns
   */
  private isOrFilter(filter: FilterParams): filter is OrFilter {
    return filter.$or !== undefined;
  }
}

export default QueryBuilder;
