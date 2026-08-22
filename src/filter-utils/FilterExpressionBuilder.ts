import { type NativeAttributeValue } from "@aws-sdk/util-dynamodb";
import { type ZodType } from "zod";
import { FilterError } from "../errors.js";
import type { StringObj } from "../types.js";
import type {
  AndFilter,
  AndOrFilter,
  BeginsWithFilter,
  ContainsFilter,
  FilterAttributeResolver,
  FilterCapabilities,
  FilterExpression,
  FilterParams,
  FilterTypes,
  KeyConditions,
  OrFilter
} from "./types.js";

/**
 * Represents the resolved components of an attribute path for use in DynamoDB expressions.
 *
 * @property expressionPath - The `#`-prefixed expression path (e.g., `#Address.#city`)
 * @property names - The ExpressionAttributeNames entries for each path segment
 * @property placeholderKey - A flat key for use in value placeholders (e.g., `Addresscity`)
 * @property valueSchema - Optional zod validator to run on condition values for the attribute
 */
interface ResolvedPath {
  expressionPath: string;
  names: StringObj;
  placeholderKey: string;
  valueSchema?: ZodType;
}

/**
 * Properties for constructing a {@link FilterExpressionBuilder}.
 *
 * @property {FilterCapabilities} capabilities - The filter vocabulary the context supports.
 * @property {FilterAttributeResolver} resolveAttribute - The context's attribute-metadata resolver.
 */
export interface FilterExpressionBuilderProps {
  capabilities: FilterCapabilities;
  resolveAttribute: FilterAttributeResolver;
}

/**
 * Stateful, capability-parameterized builder for DynamoDB condition
 * expressions. Compiles key conditions and filter conditions into expression
 * strings with their value placeholders and attribute name aliases.
 *
 * An instance owns a single placeholder counter shared across every
 * compilation it performs, so a caller compiling both key conditions and
 * filters (EX: {@link QueryBuilder}) gets continuous placeholder numbering.
 *
 * The supported filter vocabulary is declared through
 * {@link FilterCapabilities} and the attributes that may be filtered on are
 * supplied through a {@link FilterAttributeResolver} — each filter context
 * (query, vector search) parameterizes its own instance. Conditions outside
 * the capability set are rejected with a {@link FilterError}.
 */
class FilterExpressionBuilder {
  readonly #capabilities: FilterCapabilities;
  readonly #resolveAttribute: FilterAttributeResolver;
  #attrCounter: number;
  /**
   * Expression paths a condition has been compiled for, tracked when the
   * capability set allows a single condition per attribute
   */
  readonly #conditionedPaths: Set<string>;

  constructor(props: FilterExpressionBuilderProps) {
    this.#capabilities = props.capabilities;
    this.#resolveAttribute = props.resolveAttribute;
    this.#attrCounter = 0;
    this.#conditionedPaths = new Set();
  }

  /**
   * Creates the filters
   *
   * Supports 'AND' and 'OR'
   * Supports '=', 'begins_with', 'contains', and 'IN' operands
   * Supports dot-path notation for nested Map attributes (e.g., 'address.city')
   *
   * Each of which is subject to the capability set of the filter context
   *
   * @param filter
   * @returns
   */
  public filterParams(filter: FilterParams): FilterExpression {
    const isOrFilter = this.isOrFilter(filter);

    if (isOrFilter) {
      if (!this.#capabilities.or) {
        throw new FilterError(
          `$or conditions are not supported in ${this.#capabilities.context} filters`
        );
      }
      const isAndOrFilter = this.isAndOrFilter(filter);
      return isAndOrFilter ? this.andOrFilter(filter) : this.orFilter(filter);
    } else {
      return this.andFilter(filter);
    }
  }

  /**
   * Creates an AND filter
   * @param filter
   * @returns
   */
  public andFilter(filter: KeyConditions | AndFilter): FilterExpression {
    const params = Object.entries(filter).reduce<FilterExpression>(
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
   * Build ExpressionAttributeNames entries for a set of key condition
   * attributes and an optional filter
   * @param keys - Attribute keys of the key conditions
   * @param filter - Optional filter conditions
   * @returns
   */
  public expressionAttributeNames(
    keys: string[],
    filter?: FilterParams
  ): StringObj {
    const accumulator = (obj: StringObj, key: string): StringObj => {
      const resolved = this.resolveAttrPath(key);
      Object.assign(obj, resolved.names);
      return obj;
    };

    let expressionAttributeNames = keys.reduce<StringObj>(
      (acc, key) => accumulator(acc, key),
      {}
    );

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
   * Maps a compiled filter's value placeholders to `ExpressionAttributeValues`
   * entries by prefixing each placeholder with `:`
   * @param values - The compiled {@link FilterExpression} values
   * @returns The `ExpressionAttributeValues` map
   */
  public expressionAttributeValues(
    values: FilterExpression["values"]
  ): FilterExpression["values"] {
    return Object.entries(values).reduce<FilterExpression["values"]>(
      (params, [placeholder, value]) => ({
        ...params,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- NativeAttributeValue is 'any' from AWS SDK
        [`:${placeholder}`]: value
      }),
      {}
    );
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
   * Creates an AND condition.
   * Supports equality, begins_with, contains, and IN operators.
   * Supports dot-path notation for nested Map attributes.
   * @param attr - The attribute key, optionally using dot notation for nested paths
   * @param value
   * @returns
   */
  private andCondition(attr: string, value: FilterTypes): FilterExpression {
    const resolved = this.resolveAttrPath(attr);

    if (
      this.#capabilities.singleConditionPerAttribute &&
      this.#conditionedPaths.has(resolved.expressionPath)
    ) {
      throw new FilterError(
        `${this.#capabilities.context} filters support a single condition per attribute. Attribute "${attr}" has more than one condition`
      );
    }

    let condition;

    let values: Record<string, NativeAttributeValue> = {};
    if (Array.isArray(value)) {
      if (!this.#capabilities.in) {
        throw new FilterError(
          `IN conditions (array values) are not supported in ${this.#capabilities.context} filters. Attribute "${attr}" has an array value`
        );
      }
      const mappings = (value as unknown[]).reduce<string[]>((acc, val) => {
        const placeholder = `${resolved.placeholderKey}${String(++this.#attrCounter)}`;

        values[placeholder] = val;
        return acc.concat(`:${placeholder}`);
      }, []);
      condition = `${resolved.expressionPath} IN (${mappings.join()})`;
    } else if (this.isBeginsWithFilter(value)) {
      if (!this.#capabilities.beginsWith) {
        throw new FilterError(
          `$beginsWith conditions are not supported in ${this.#capabilities.context} filters. Attribute "${attr}" has a $beginsWith condition`
        );
      }
      const placeholder = `${resolved.placeholderKey}${String(++this.#attrCounter)}`;
      condition = `begins_with(${resolved.expressionPath}, :${placeholder})`;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- NativeAttributeValue is 'any' from AWS SDK
      values = { [placeholder]: value.$beginsWith };
    } else if (this.isContainsFilter(value)) {
      if (!this.#capabilities.contains) {
        throw new FilterError(
          `$contains conditions are not supported in ${this.#capabilities.context} filters. Attribute "${attr}" has a $contains condition`
        );
      }
      const placeholder = `${resolved.placeholderKey}${String(++this.#attrCounter)}`;
      condition = `contains(${resolved.expressionPath}, :${placeholder})`;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- NativeAttributeValue is 'any' from AWS SDK
      values = { [placeholder]: value.$contains };
    } else {
      this.validateConditionValue(resolved, attr, value);
      const placeholder = `${resolved.placeholderKey}${String(++this.#attrCounter)}`;
      condition = `${resolved.expressionPath} = :${placeholder}`;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- NativeAttributeValue is 'any' from AWS SDK
      values = { [placeholder]: value };
    }

    // Recorded only after the condition compiles, so a rejected condition
    // does not block a corrected retry on the same attribute
    if (this.#capabilities.singleConditionPerAttribute) {
      this.#conditionedPaths.add(resolved.expressionPath);
    }

    return { expression: `${condition} AND `, values };
  }

  /**
   * Validates an equality condition value against the attribute's zod schema
   * when the context's attribute resolver supplies one. This is the runtime
   * value guard for untrusted filter input — the compile-time typing is
   * erased for plain JS callers, so a value whose shape violates the
   * attribute's registered type (EX: a nested operator object where a scalar
   * is expected) must be rejected here
   * @param resolved - The resolved attribute path
   * @param attr - The attribute key, for error messages
   * @param value - The condition value
   */
  private validateConditionValue(
    resolved: ResolvedPath,
    attr: string,
    value: NativeAttributeValue
  ): void {
    if (resolved.valueSchema === undefined) return;

    const parsed = resolved.valueSchema.safeParse(value);
    if (!parsed.success) {
      throw new FilterError(
        `Invalid filter value for attribute "${attr}": the value does not match the attribute's type`,
        { cause: parsed.error.issues }
      );
    }
  }

  /**
   * Resolves an attribute key (potentially a dot-path) into its DynamoDB expression components.
   *
   * For simple keys (e.g., "name"), resolves via the context's attribute resolver.
   * For dot-paths (e.g., "address.city"), resolves the first segment via the resolver
   * and uses remaining segments as literal Map sub-keys.
   *
   * @param key - The attribute key, optionally using dot notation
   * @returns The resolved expression path, attribute names, and placeholder key
   */
  private resolveAttrPath(key: string): ResolvedPath {
    const segments = key.split(".");
    const topLevelKey = segments[0];

    if (segments.length > 1 && !this.#capabilities.nestedPaths) {
      throw new FilterError(
        `Nested attribute paths are not supported in ${this.#capabilities.context} filters. Received filter key "${key}"`
      );
    }

    const { alias: tableKey, type: valueSchema } = this.#resolveAttribute(
      topLevelKey,
      key
    );

    const names: StringObj = { [`#${tableKey}`]: tableKey };

    if (segments.length === 1) {
      return {
        expressionPath: `#${tableKey}`,
        names,
        placeholderKey: tableKey,
        valueSchema
      };
    }

    const subSegments = segments.slice(1);
    for (const segment of subSegments) {
      names[`#${segment}`] = segment;
    }

    const expressionPath = `#${tableKey}.${subSegments.map(s => `#${s}`).join(".")}`;
    const placeholderKey = `${tableKey}${subSegments.join("")}`;

    return { expressionPath, names, placeholderKey, valueSchema };
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

    return { expression, values: andParams.values };
  }

  /**
   * Type guard to check if its a BeginsWithFilter
   * @param filter
   * @returns
   */
  private isBeginsWithFilter(filter: FilterTypes): filter is BeginsWithFilter {
    // The null check keeps an untyped caller's null condition value on the
    // equality path, where the value guard rejects it with a FilterError
    return (
      typeof filter === "object" &&
      filter !== null &&
      (filter as BeginsWithFilter).$beginsWith !== undefined
    );
  }

  /**
   * Type guard to check if its a ContainsFilter
   * @param filter
   * @returns
   */
  private isContainsFilter(filter: FilterTypes): filter is ContainsFilter {
    return (
      typeof filter === "object" &&
      filter !== null &&
      (filter as ContainsFilter).$contains !== undefined
    );
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

export default FilterExpressionBuilder;
