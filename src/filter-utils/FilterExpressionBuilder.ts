import { type ZodType } from "zod";
import { FilterError } from "../errors.js";
import type { DynamoNativeValue, StringObj } from "../types.js";
import type { TableSerializer } from "../metadata/types.js";
import { fieldDefToZod } from "../decorators/attributes/fieldZod.js";
import {
  fieldConverts,
  resolveFieldDef,
  toStoredFieldValue
} from "./resolveFieldDef.js";
import type {
  AndFilter,
  BetweenFilter,
  ComparisonFilter,
  FilterValue,
  AndOrFilter,
  BeginsWithFilter,
  ContainsFilter,
  FilterAttributeResolver,
  FilterCapabilities,
  FilterExpression,
  FilterParams,
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
 * @property toStored - Optional conversion to the stored form, applied by {@link FilterExpressionBuilder.toStoredValue}
 */
interface ResolvedPath {
  expressionPath: string;
  names: StringObj;
  placeholderKey: string;
  valueSchema?: ZodType;
  toStored?: TableSerializer;
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
  public filterParams(rawFilter: FilterParams): FilterExpression {
    // A condition explicitly set to undefined is no condition. Filter keys are
    // optional, so forwarding an optional input — `filter: { name: req.query.name }`
    // — is the ordinary way to build one, and the alternative to dropping it is
    // an expression referencing a placeholder with nothing bound to it, which
    // DynamoDB rejects. `$or` blocks reach this method through orCondition, so
    // they are covered here too, and an undefined `$or` drops rather than being
    // read as an attribute named "$or"
    const filter = this.definedConditions(rawFilter);
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
   * Returns a condition set without its undefined entries.
   *
   * Scoped to filters. Key conditions get the opposite treatment in
   * {@link andCondition}: dropping one would silently widen the query to the
   * whole partition, where dropping a filter only widens the result set within
   * the partition the key conditions already scoped
   * @param conditions - The filter conditions as the caller supplied them
   * @returns The conditions that carry a value
   */
  private definedConditions(conditions: FilterParams): FilterParams {
    return Object.fromEntries(
      Object.entries(conditions).filter(([, value]) => value !== undefined)
    );
  }

  /**
   * Creates an AND filter
   * @param filter
   * @returns
   */
  public andFilter(filter: FilterParams | KeyConditions): FilterExpression {
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

      // Undefined conditions build no expression (see andFilter), so naming
      // their attributes would leave an unused ExpressionAttributeNames entry,
      // which DynamoDB rejects
      const definedKeys = (conditions: object): string[] =>
        Object.entries(conditions)
          .filter(([, value]) => value !== undefined)
          .map(([key]) => key);

      const or = orFilters.reduce<StringObj>((acc: StringObj, filter) => {
        definedKeys(filter).forEach(key => accumulator(acc, key));
        return acc;
      }, {});

      const and = definedKeys(andFilters).reduce<StringObj>(
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
  private andCondition(
    attr: string,
    value: FilterParams[string]
  ): FilterExpression {
    if (value === undefined) {
      throw new FilterError(
        `Invalid key condition for attribute "${attr}": the condition has no value. A key condition narrows the query, so dropping it would widen the query to the entire partition`
      );
    }

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

    let values: Record<string, DynamoNativeValue> = {};
    if (Array.isArray(value)) {
      if (!this.#capabilities.in) {
        throw new FilterError(
          `IN conditions (array values) are not supported in ${this.#capabilities.context} filters. Attribute "${attr}" has an array value`
        );
      }
      const mappings = value.map(val => {
        this.validateConditionValue(resolved, attr, val);
        const placeholder = `${resolved.placeholderKey}${String(++this.#attrCounter)}`;

        values[placeholder] = this.toStoredValue(resolved, val);
        return `:${placeholder}`;
      });
      condition = `${resolved.expressionPath} IN (${mappings.join()})`;
    } else if (this.isComparisonFilter(value)) {
      throw new FilterError(
        `Comparison conditions are not supported in ${this.#capabilities.context} filters. Attribute "${attr}" has a comparison condition`
      );
    } else if (this.isBetweenFilter(value)) {
      throw new FilterError(
        `$between conditions are not supported in ${this.#capabilities.context} filters. Attribute "${attr}" has a $between condition`
      );
    } else if (this.isBeginsWithFilter(value)) {
      if (!this.#capabilities.beginsWith) {
        throw new FilterError(
          `$beginsWith conditions are not supported in ${this.#capabilities.context} filters. Attribute "${attr}" has a $beginsWith condition`
        );
      }
      this.assertOperandDefined(value.$beginsWith, attr, "$beginsWith");
      const placeholder = `${resolved.placeholderKey}${String(++this.#attrCounter)}`;
      condition = `begins_with(${resolved.expressionPath}, :${placeholder})`;

      values = { [placeholder]: value.$beginsWith };
    } else if (this.isContainsFilter(value)) {
      if (!this.#capabilities.contains) {
        throw new FilterError(
          `$contains conditions are not supported in ${this.#capabilities.context} filters. Attribute "${attr}" has a $contains condition`
        );
      }
      this.assertOperandDefined(value.$contains, attr, "$contains");
      const placeholder = `${resolved.placeholderKey}${String(++this.#attrCounter)}`;
      condition = `contains(${resolved.expressionPath}, :${placeholder})`;

      values = { [placeholder]: value.$contains };
    } else {
      this.validateConditionValue(resolved, attr, value);
      const placeholder = `${resolved.placeholderKey}${String(++this.#attrCounter)}`;
      condition = `${resolved.expressionPath} = :${placeholder}`;

      values = { [placeholder]: this.toStoredValue(resolved, value) };
    }

    // Recorded only after the condition compiles, so a rejected condition
    // does not block a corrected retry on the same attribute
    if (this.#capabilities.singleConditionPerAttribute) {
      this.#conditionedPaths.add(resolved.expressionPath);
    }

    return { expression: `${condition} AND `, values };
  }

  /**
   * Converts a condition value from the form the entity declares to the form
   * the table stores, when the attribute distinguishes them.
   *
   * Applied to equality values and to each element of an `IN` condition, which
   * are whole values of the attribute. Not applied to `$beginsWith` or
   * `$contains` operands — those are a prefix and a fragment of the stored
   * form rather than values to convert — and not to nested paths, whose value
   * belongs to a field of the object rather than to the object itself
   * @param resolved - The resolved attribute path
   * @param value - The condition value as the caller supplied it
   * @returns The value as the table stores it
   */
  private toStoredValue(
    resolved: ResolvedPath,
    value: FilterValue | AndFilter
  ): DynamoNativeValue {
    if (resolved.toStored !== undefined && value !== null) {
      return resolved.toStored(value);
    }

    // No serializers means the declared form is already storable
    return value as DynamoNativeValue;
  }

  /**
   * The remedy to append to a rejected value's error, for an attribute whose
   * stored form differs from its declared one.
   *
   * That mismatch is the likeliest reason such a value is rejected: a filter
   * names an attribute the way the entity declares it, so a caller reaching for
   * the stored form is writing the right query in the wrong vocabulary
   * @param resolved - The resolved attribute path
   * @returns The remedy, or an empty string when there is nothing specific to say
   */
  private declaredFormHint(resolved: ResolvedPath): string {
    return resolved.toStored === undefined
      ? ""
      : ". A filter names an attribute as the entity declares it, and this one is stored in a different form — pass its declared value ($beginsWith matches the stored form by prefix)";
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
    value: unknown
  ): void {
    if (resolved.valueSchema === undefined) return;

    const parsed = resolved.valueSchema.safeParse(value);
    if (!parsed.success) {
      throw new FilterError(
        `Invalid filter value for attribute "${attr}": the value does not match the attribute's type${this.declaredFormHint(resolved)}`,
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

    const {
      alias: tableKey,
      type: valueSchema,
      serializers,
      objectSchema
    } = this.#resolveAttribute(topLevelKey, key);

    const names: StringObj = { [`#${tableKey}`]: tableKey };

    if (segments.length === 1) {
      return {
        expressionPath: `#${tableKey}`,
        names,
        placeholderKey: tableKey,
        valueSchema,
        toStored: serializers?.toTableAttribute
      };
    }

    const subSegments = segments.slice(1);
    for (const segment of subSegments) {
      names[`#${segment}`] = segment;
    }

    const expressionPath = `#${tableKey}.${subSegments.map(s => `#${s}`).join(".")}`;
    const placeholderKey = `${tableKey}${subSegments.join("")}`;

    // The resolver answers for the top level attribute, so a nested value is
    // validated and converted as the field it names rather than as the object
    // that contains it
    const fieldDef = resolveFieldDef(objectSchema, subSegments);

    return {
      expressionPath,
      names,
      placeholderKey,
      ...(fieldDef !== undefined && {
        valueSchema: fieldDefToZod(fieldDef),
        // Only when the field converts: toStored doubles as the signal that a
        // rejected value's remedy should point at the declared form
        ...(fieldConverts(fieldDef) && {
          toStored: value => toStoredFieldValue(fieldDef, value)
        })
      })
    };
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
   * Rejects an operator whose operand is undefined.
   *
   * The operator types declare a defined operand, so this is unreachable
   * against the declared type — but an optional value resolving to undefined
   * (`{ $beginsWith: req.query.prefix }`) reaches here with the key present and
   * nothing under it. Without this the builder emits a condition referencing a
   * placeholder with no value bound to it, which DynamoDB rejects with a
   * ValidationException that names neither the attribute nor the operator
   * @param operand - The value supplied to the operator
   * @param attr - The attribute being filtered, for the error message
   * @param operator - The operator name, for the error message
   */
  private assertOperandDefined(
    operand: unknown,
    attr: string,
    operator: string
  ): void {
    if (operand === undefined) {
      throw new FilterError(
        `Invalid filter value for attribute "${attr}": ${operator} was given no value`
      );
    }
  }

  /**
   * Type guard for a {@link ComparisonFilter}.
   *
   * Presence rather than definedness, matching {@link isBeginsWithFilter}: an
   * operand that resolved to undefined belongs on this path, where the operand
   * check rejects it by name, rather than falling through to equality
   * @param filter - The condition value
   * @returns Whether it carries at least one comparison operand
   */
  private isComparisonFilter(
    filter: FilterParams[string]
  ): filter is ComparisonFilter<FilterValue> {
    return (
      typeof filter === "object" &&
      filter !== null &&
      ("$gt" in filter ||
        "$gte" in filter ||
        "$lt" in filter ||
        "$lte" in filter)
    );
  }

  /**
   * Type guard for a {@link BetweenFilter}
   * @param filter - The condition value
   * @returns Whether it carries a `$between` pair
   */
  private isBetweenFilter(
    filter: FilterParams[string]
  ): filter is BetweenFilter<FilterValue> {
    return (
      typeof filter === "object" && filter !== null && "$between" in filter
    );
  }

  /**
   * Type guard to check if its a BeginsWithFilter
   * @param filter
   * @returns
   */
  private isBeginsWithFilter(
    filter: FilterParams[string]
  ): filter is BeginsWithFilter {
    // The null check keeps an untyped caller's null condition value on the
    // equality path, where the value guard rejects it with a FilterError
    return (
      typeof filter === "object" && filter !== null && "$beginsWith" in filter
    );
  }

  /**
   * Type guard to check if its a ContainsFilter
   * @param filter
   * @returns
   */
  private isContainsFilter(
    filter: FilterParams[string]
  ): filter is ContainsFilter {
    return (
      typeof filter === "object" && filter !== null && "$contains" in filter
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
