import { type ZodType } from "zod";
import { FilterError } from "../errors.js";
import { keyConditionCapabilities } from "./capabilities.js";
import type { DynamoNativeValue, StringObj } from "../types.js";
import type { TableSerializer } from "../metadata/types.js";
import { fieldDefToZod } from "../decorators/attributes/fieldZod.js";
import {
  fieldConverts,
  resolveFieldDef,
  toStoredFieldValue
} from "./resolveFieldDef.js";
import {
  fragmentOperatorApplies,
  fragmentOperatorDomain,
  storedFormOfAttribute,
  storedFormOfField,
  type FragmentOperator,
  type StoredForm
} from "./storedForm.js";
import type {
  AndFilter,
  BetweenFilter,
  ComparisonFilter,
  FilterValue,
  OrderedFilterValue,
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
 * @property storedForm - The form the table stores the value in, when it could be resolved. Decides which fragment operators apply
 */
interface ResolvedPath {
  expressionPath: string;
  names: StringObj;
  placeholderKey: string;
  valueSchema?: ZodType;
  toStored?: TableSerializer;
  storedForm?: StoredForm;
}

/**
 * The DynamoDB comparator each comparison operator compiles to.
 *
 * The single source for both {@link FilterExpressionBuilder.isComparisonFilter}
 * and the compilation, so an operator cannot be recognized without being
 * compiled or compiled without being recognized. Iteration order fixes the
 * order several operands on one attribute appear in, which keeps a compiled
 * expression a function of the condition rather than of how the caller's
 * object literal happened to be written.
 */
const comparisonOperators = {
  $gt: ">",
  $gte: ">=",
  $lt: "<",
  $lte: "<="
} as const;

/**
 * The name of a comparison operator, used to iterate
 * {@link comparisonOperators} without widening to `string`.
 */
type ComparisonOperator = keyof typeof comparisonOperators;

/**
 * Every operator a condition object may name, for the error that rejects one
 * naming none of them. Capability-independent: it describes the vocabulary
 * rather than what the current context accepts, so a caller who mistyped an
 * operator is told what the operators are and a caller who used one the
 * context cannot represent is told that by the capability rejection instead.
 */
const supportedOperators = [
  ...Object.keys(comparisonOperators),
  "$between",
  "$beginsWith",
  "$contains"
] as const;

/**
 * Whether a stored value has a meaningful JavaScript relational order.
 *
 * Strings, numbers and bigints do. A boolean, `null` and a `Uint8Array` do
 * not — DynamoDB orders binary as unsigned bytes, which JavaScript's `>` does
 * not reproduce — so a range over one is left unchecked rather than checked
 * wrongly.
 * @param value - A value in the form the table stores it
 * @returns Whether `>` orders it as DynamoDB would
 */
const isOrdered = (
  value: DynamoNativeValue
): value is string | number | bigint =>
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "bigint";

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
          `$or conditions are not supported in ${this.#capabilities.context}`
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
   * Compiles a set of conditions joined with AND, under the builder's own
   * capability set.
   * @param filter - The conditions to compile
   * @returns The compiled expression and its values
   */
  public andFilter(filter: FilterParams | KeyConditions): FilterExpression {
    return this.conjunction(filter, this.#capabilities);
  }

  /**
   * Compiles a query's key conditions, under the key condition capability set
   * rather than the builder's own.
   *
   * A key condition is not a filter: the partition key takes an equality and
   * the sort key takes one condition from a narrower vocabulary. Those
   * restrictions belong to the compilation, not to the builder — the
   * placeholder counter has to stay continuous across a query's key conditions
   * and its filter, so compiling them with different vocabularies cannot mean
   * two builder instances.
   * @param keys - The key conditions to compile
   * @returns The compiled expression and its values
   */
  public keyConditions(keys: KeyConditions): FilterExpression {
    return this.conjunction(keys, keyConditionCapabilities);
  }

  /**
   * Compiles conditions joined with AND under a given capability set.
   * @param filter - The conditions to compile
   * @param capabilities - The vocabulary this compilation may use
   * @returns The compiled expression and its values
   */
  private conjunction(
    filter: FilterParams | KeyConditions,
    capabilities: FilterCapabilities
  ): FilterExpression {
    // Checked here rather than only in filterParams, which is the one entry
    // point that can route an $or block somewhere. Every other compilation
    // reaches this method, and without the check a context declaring `or:
    // false` relies on no attribute happening to be named "$or" — leaving the
    // capability decorative and the rejection blaming an unknown attribute
    // Object.hasOwn rather than `in`: the declared type is an object, but an
    // untyped caller can pass a primitive, and `in` throws a TypeError on one
    // where hasOwn coerces and answers false
    if (!capabilities.or && Object.hasOwn(filter, "$or")) {
      throw new FilterError(
        `$or conditions are not supported in ${capabilities.context}`
      );
    }

    const params = Object.entries(filter).reduce<FilterExpression>(
      (obj, [attr, value]) => {
        const { expression, values } = this.andCondition(
          attr,
          value,
          capabilities
        );
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
      const resolved = this.resolveAttrPath(key, this.#capabilities);
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
    value: FilterParams[string],
    capabilities: FilterCapabilities
  ): FilterExpression {
    if (value === undefined) {
      throw new FilterError(
        `Invalid key condition for attribute "${attr}": the condition has no value. A key condition narrows the query, so dropping it would widen the query to the entire partition`
      );
    }

    const resolved = this.resolveAttrPath(attr, capabilities);

    if (
      capabilities.singleConditionPerAttribute &&
      this.#conditionedPaths.has(resolved.expressionPath)
    ) {
      throw new FilterError(
        `${capabilities.context} support a single condition per attribute. Attribute "${attr}" has more than one condition`
      );
    }

    this.assertConditionShape(value, attr);

    let condition;

    const values: Record<string, DynamoNativeValue> = {};
    if (Array.isArray(value)) {
      if (!capabilities.in) {
        throw new FilterError(
          `IN conditions (array values) are not supported in ${capabilities.context}. Attribute "${attr}" has an array value`
        );
      }
      const mappings = value.map(val =>
        this.bindWholeValue(resolved, attr, val, values)
      );
      condition = `${resolved.expressionPath} IN (${mappings.join()})`;
    } else if (this.isComparisonFilter(value)) {
      if (!capabilities.comparison) {
        throw new FilterError(
          `Comparison conditions are not supported in ${capabilities.context}. Attribute "${attr}" has a comparison condition`
        );
      }
      const operands = this.presentComparisons(value);
      if (operands.length > 1 && !capabilities.composedComparisons) {
        throw new FilterError(
          `Composed comparisons are not supported in ${capabilities.context}. Attribute "${attr}" has ${String(operands.length)} comparison operands, and DynamoDB allows one condition on the sort key — use $between for a two-sided range`
        );
      }
      condition = operands
        .map(operator => {
          const operand = value[operator];
          this.assertOperandDefined(operand, attr, operator);
          this.assertOperandOrderable(operand, attr, operator);
          const reference = this.bindWholeValue(
            resolved,
            attr,
            operand,
            values
          );
          return `${resolved.expressionPath} ${comparisonOperators[operator]} ${reference}`;
        })
        .join(" AND ");
    } else if (this.isBetweenFilter(value)) {
      if (!capabilities.between) {
        throw new FilterError(
          `$between conditions are not supported in ${capabilities.context}. Attribute "${attr}" has a $between condition`
        );
      }
      const [lower, upper] = this.betweenBounds(value, attr);
      const lowerRef = this.bindWholeValue(resolved, attr, lower, values);
      const upperRef = this.bindWholeValue(resolved, attr, upper, values);
      this.assertBoundsOrdered(values, lowerRef, upperRef, attr);
      condition = `${resolved.expressionPath} BETWEEN ${lowerRef} AND ${upperRef}`;
    } else if (this.isBeginsWithFilter(value)) {
      if (!capabilities.beginsWith) {
        throw new FilterError(
          `$beginsWith conditions are not supported in ${capabilities.context}. Attribute "${attr}" has a $beginsWith condition`
        );
      }
      this.assertOperandDefined(value.$beginsWith, attr, "$beginsWith");
      this.assertFragmentOperatorApplies(resolved, attr, "$beginsWith");
      const reference = this.bindFragment(resolved, value.$beginsWith, values);
      condition = `begins_with(${resolved.expressionPath}, ${reference})`;
    } else if (this.isContainsFilter(value)) {
      if (!capabilities.contains) {
        throw new FilterError(
          `$contains conditions are not supported in ${capabilities.context}. Attribute "${attr}" has a $contains condition`
        );
      }
      this.assertOperandDefined(value.$contains, attr, "$contains");
      this.assertFragmentOperatorApplies(resolved, attr, "$contains");
      const reference = this.bindFragment(resolved, value.$contains, values);
      condition = `contains(${resolved.expressionPath}, ${reference})`;
    } else {
      const reference = this.bindWholeValue(resolved, attr, value, values);
      condition = `${resolved.expressionPath} = ${reference}`;
    }

    // Recorded only after the condition compiles, so a rejected condition
    // does not block a corrected retry on the same attribute
    if (capabilities.singleConditionPerAttribute) {
      this.#conditionedPaths.add(resolved.expressionPath);
    }

    return { expression: `${condition} AND `, values };
  }

  /**
   * Binds a whole-value operand and returns the placeholder reference naming
   * it.
   *
   * A whole value of the attribute: an equality value, an `IN` element, a
   * comparison operand, a `$between` bound. Validated in the declared form and
   * converted to the stored one, which is the operand rule's first half applied
   * in one place instead of in each branch that carries such an operand
   * @param resolved - The resolved attribute path
   * @param attr - The attribute key, for error messages
   * @param value - The operand as the caller supplied it
   * @param values - The value map the placeholder is recorded in, mutated
   * @returns The `:`-prefixed placeholder reference
   */
  private bindWholeValue(
    resolved: ResolvedPath,
    attr: string,
    value: FilterValue | AndFilter,
    values: Record<string, DynamoNativeValue>
  ): string {
    this.validateConditionValue(resolved, attr, value);
    const placeholder = `${resolved.placeholderKey}${String(++this.#attrCounter)}`;
    values[placeholder] = this.toStoredValue(resolved, value);
    return `:${placeholder}`;
  }

  /**
   * Binds a fragment operand and returns the placeholder reference naming it.
   *
   * A fragment of the stored form rather than a value of the attribute: a
   * `$beginsWith` prefix, a `$contains` substring. Neither validated nor
   * converted, which is the operand rule's second half. The two binders are
   * what make that rule structural — a branch picks one, and which one it picks
   * is the whole of its operand behavior
   * @param resolved - The resolved attribute path
   * @param value - The operand, already in the stored form
   * @param values - The value map the placeholder is recorded in, mutated
   * @returns The `:`-prefixed placeholder reference
   */
  private bindFragment(
    resolved: ResolvedPath,
    value: DynamoNativeValue,
    values: Record<string, DynamoNativeValue>
  ): string {
    const placeholder = `${resolved.placeholderKey}${String(++this.#attrCounter)}`;
    values[placeholder] = value;
    return `:${placeholder}`;
  }

  /**
   * The comparison operators a condition carries, in {@link comparisonOperators}
   * order.
   * @param filter - A condition known to carry at least one
   * @returns The operators present, ordered
   */
  private presentComparisons(
    filter: ComparisonFilter<OrderedFilterValue>
  ): ComparisonOperator[] {
    const operators = Object.keys(comparisonOperators) as ComparisonOperator[];
    return operators.filter(operator => operator in filter);
  }

  /**
   * Extracts a `$between` condition's two bounds.
   *
   * The type already requires an ordered pair, so this answers for a plain
   * JavaScript caller: anything that is not a two-element list cannot name a
   * range, and a missing bound would otherwise reach DynamoDB as an unbound
   * placeholder
   * @param filter - The `$between` condition
   * @param attr - The attribute key, for the error message
   * @returns The lower and upper bounds, as the caller supplied them
   */
  private betweenBounds(
    filter: BetweenFilter<OrderedFilterValue>,
    attr: string
  ): readonly [OrderedFilterValue, OrderedFilterValue] {
    // Checked through a widened binding: the declared type says a pair, so the
    // compiler holds the shape proven and a check against it unreachable. A
    // plain JavaScript caller is who this answers for, and the alternative is
    // a placeholder reaching DynamoDB with no value bound to it
    const supplied: unknown = filter.$between;

    if (!Array.isArray(supplied) || supplied.length !== 2) {
      throw new FilterError(
        `Invalid filter value for attribute "${attr}": $between takes an ordered pair of bounds`
      );
    }

    // Read from the declared tuple now that the pair is proven, so the bounds
    // keep their type rather than widening to the array check's element type
    const [lower, upper] = filter.$between;
    this.assertOperandDefined(lower, attr, "$between");
    this.assertOperandDefined(upper, attr, "$between");
    this.assertOperandOrderable(lower, attr, "$between");
    this.assertOperandOrderable(upper, attr, "$between");

    return [lower, upper];
  }

  /**
   * Rejects a `$between` whose bounds are the wrong way round.
   *
   * DynamoDB accepts an inverted pair, matches nothing and reports no error, so
   * the query looks like it ran and the empty result reads as "no such rows".
   * Compared in the stored form, because that is the form DynamoDB compares —
   * a date's ISO string orders exactly as the `Date` does — and only when that
   * form has a meaningful JavaScript order
   * @param values - The value map the bounds were bound into
   * @param lowerRef - The lower bound's placeholder reference
   * @param upperRef - The upper bound's placeholder reference
   * @param attr - The attribute key, for the error message
   */
  private assertBoundsOrdered(
    values: Record<string, DynamoNativeValue>,
    lowerRef: string,
    upperRef: string,
    attr: string
  ): void {
    const lower = values[lowerRef.slice(1)];
    const upper = values[upperRef.slice(1)];

    if (isOrdered(lower) && isOrdered(upper) && lower > upper) {
      throw new FilterError(
        `Invalid filter value for attribute "${attr}": the $between bounds are inverted. The lower bound comes first, and DynamoDB matches nothing for an inverted range rather than reporting an error`
      );
    }
  }

  /**
   * Rejects an operator object that names no supported operator, or that mixes
   * operators which do not compose.
   *
   * Without this, either one falls through to the equality branch and compiles
   * to `#Attr = :placeholder` against the operator object itself — a condition
   * DynamoDB accepts, matches nothing for, and reports no error about. A
   * mistyped operator and a condition asking for everything look identical in
   * the result.
   *
   * Several comparison operators compose, which is how a half-open range is
   * written. Operators from different families do not: the branch compiling one
   * would silently drop the rest
   * @param value - The condition value
   * @param attr - The attribute key, for the error message
   */
  private assertConditionShape(
    value: FilterParams[string],
    attr: string
  ): void {
    // A Date and a Uint8Array are objects to `typeof` and whole values to a
    // filter, so neither is an operator object
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      value instanceof Date ||
      value instanceof Uint8Array
    ) {
      return;
    }

    const families = [
      this.isComparisonFilter(value) && "comparison",
      "$between" in value && "$between",
      "$beginsWith" in value && "$beginsWith",
      "$contains" in value && "$contains"
    ].filter(family => family !== false);

    if (families.length === 0) {
      throw new FilterError(
        `Invalid filter value for attribute "${attr}": the condition is an object naming no supported operator. The supported operators are ${supportedOperators.join(", ")}`
      );
    }

    if (families.length > 1) {
      throw new FilterError(
        `Invalid filter value for attribute "${attr}": a condition combines ${families.join(" and ")}, and only comparison operators compose. Split it across separate conditions`
      );
    }
  }

  /**
   * Rejects a fragment operator on an attribute whose stored form cannot carry
   * it.
   *
   * `begins_with` and `contains` are DynamoDB functions over the stored value,
   * so what they apply to is decided by the form the table holds — not by the
   * form the entity declares. A date attribute keeps both, stored as an ISO
   * string; a number attribute has neither a prefix nor a substring, and
   * DynamoDB answers such a condition with no rows and no error.
   *
   * The type rejects these too. This answers for the plain JavaScript caller,
   * and for a dot path whose field the type could resolve more precisely than
   * the condition's declared type suggests
   * @param resolved - The resolved attribute path
   * @param attr - The attribute key, for the error message
   * @param operator - The fragment operator being applied
   */
  private assertFragmentOperatorApplies(
    resolved: ResolvedPath,
    attr: string,
    operator: FragmentOperator
  ): void {
    if (fragmentOperatorApplies(operator, resolved.storedForm)) return;

    throw new FilterError(
      `Invalid filter value for attribute "${attr}": ${operator} does not apply to a value stored as a ${String(resolved.storedForm)}. ${fragmentOperatorDomain[operator]}`
    );
  }

  /**
   * Rejects `null` as an operand of an ordered comparison.
   *
   * dyna-record removes a nulled attribute rather than storing DynamoDB's NULL,
   * so there is no stored null for an ordered comparison to match — and
   * DynamoDB has no ordering between NULL and a scalar in the first place. The
   * condition asks for something no row can satisfy, which is worth saying
   * rather than compiling
   * @param operand - The operand supplied to the operator
   * @param attr - The attribute key, for the error message
   * @param operator - The operator name, for the error message
   */
  private assertOperandOrderable(
    operand: FilterValue,
    attr: string,
    operator: string
  ): void {
    if (operand === null) {
      throw new FilterError(
        `Invalid filter value for attribute "${attr}": ${operator} cannot compare against null. dyna-record removes a nulled attribute rather than storing NULL, so no row can satisfy an ordered comparison against it`
      );
    }
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
  private resolveAttrPath(
    key: string,
    capabilities: FilterCapabilities
  ): ResolvedPath {
    const segments = key.split(".");
    const topLevelKey = segments[0];

    if (segments.length > 1 && !capabilities.nestedPaths) {
      throw new FilterError(
        `Nested attribute paths are not supported in ${capabilities.context}. Received filter key "${key}"`
      );
    }

    const {
      alias: tableKey,
      type: valueSchema,
      serializers,
      objectSchema,
      kind
    } = this.#resolveAttribute(topLevelKey, key);

    const names: StringObj = { [`#${tableKey}`]: tableKey };

    if (segments.length === 1) {
      return {
        expressionPath: `#${tableKey}`,
        names,
        placeholderKey: tableKey,
        valueSchema,
        toStored: serializers?.toTableAttribute,
        storedForm: storedFormOfAttribute(kind)
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
        storedForm: storedFormOfField(fieldDef),
        // An array field's schema describes the list while a condition on it
        // carries an element — an IN element, or a $contains operand — so
        // validating against it would reject every one. Its stored form is
        // still known, and is what decides which operators apply to it
        ...(fieldDef.type !== "array" && {
          valueSchema: fieldDefToZod(fieldDef),
          // Only when the field converts: toStored doubles as the signal that a
          // rejected value's remedy should point at the declared form
          ...(fieldConverts(fieldDef) && {
            toStored: value => toStoredFieldValue(fieldDef, value)
          })
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
  private assertOperandDefined<T>(
    operand: T,
    attr: string,
    operator: string
  ): asserts operand is Exclude<T, undefined> {
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
  ): filter is ComparisonFilter<OrderedFilterValue> {
    return (
      typeof filter === "object" &&
      filter !== null &&
      Object.keys(comparisonOperators).some(operator => operator in filter)
    );
  }

  /**
   * Type guard for a {@link BetweenFilter}
   * @param filter - The condition value
   * @returns Whether it carries a `$between` pair
   */
  private isBetweenFilter(
    filter: FilterParams[string]
  ): filter is BetweenFilter<OrderedFilterValue> {
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
