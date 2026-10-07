import { type ZodType } from "zod";
import { FilterError } from "../errors.js";
import { keyConditionCapabilities } from "./capabilities.js";
import { parenthesize } from "../dynamo-utils/conditionExpression.js";
import type {
  DynamoNativeValue,
  DynamoScalarValue,
  Optional,
  StringObj
} from "../types.js";
import type { TableSerializer } from "../metadata/types.js";
import { fieldDefToZod } from "../decorators/attributes/fieldZod.js";
import {
  fieldConverts,
  fieldValidatesConditionValue,
  parseSegment,
  resolveFieldDef,
  toStoredFieldValue,
  undeclaredFieldIn,
  type FieldResolution
} from "./resolveFieldDef.js";
import {
  fragmentOperatorApplies,
  fragmentOperatorDomain,
  isDynamoOrderable,
  isObjectValuedScalar,
  orderedOperandDomain,
  orderedOperatorApplies,
  orderedOperatorDomain,
  storedFormOfAttribute,
  storedFormOfField,
  storedFormOfOperand,
  type FragmentOperator,
  type StoredForm
} from "./storedForm.js";
import type {
  AndFilter,
  BetweenConditionFor,
  BetweenFilter,
  ComparisonConditionFor,
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
 * @property undeclaredField - For an object, or a field that holds one at any depth, the first field a whole-value operand carries that the schema does not declare
 * @property storedForm - The form the table stores the value in, when it could be resolved. Decides which fragment operators apply
 * @property nullable - Whether the attribute or nested field is declared nullable. Absent when that could not be resolved, which is read as not nullable
 * @property elementForm - For a field stored as a list, the form its elements are stored in. Decides what a `$contains` operand on it must be
 * @property elementValueSchema - For a field stored as a list, the zod validator for one element in the form the entity declares it
 * @property elementToStored - For a list whose elements convert (dates, objects, lists and unions), the conversion of one element to the form the table stores, applied by {@link FilterExpressionBuilder.toStoredElement}
 * @property elementUndeclaredField - For a field stored as a list, the first field an element carries that the element's schema does not declare
 */
interface ResolvedPath {
  expressionPath: string;
  names: StringObj;
  placeholderKey: string;
  valueSchema?: ZodType;
  toStored?: TableSerializer;
  undeclaredField?: (value: unknown) => Optional<string>;
  storedForm?: StoredForm;
  nullable?: boolean;
  elementForm?: StoredForm;
  elementValueSchema?: ZodType;
  elementToStored?: TableSerializer;
  elementUndeclaredField?: (element: unknown) => Optional<string>;
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
/**
 * {@link comparisonOperators}' keys, hoisted so the guard and the compilation
 * do not rebuild the list per condition. Mirrors {@link supportedOperators}.
 */
const comparisonOperatorNames = Object.keys(
  comparisonOperators
) as ComparisonOperator[];

const supportedOperators = [
  ...comparisonOperatorNames,
  "$between",
  "$beginsWith",
  "$contains"
] as const;

/**
 * The characters DynamoDB accepts in an expression attribute name token, after
 * the `#`. Verified against the service: `#a_b` and `#1x` are accepted, while
 * `#a b` and `#a-b` are rejected with a `ValidationException`.
 */
const SAFE_TOKEN = /^[A-Za-z0-9_]+$/;

/**
 * A stable short digest of a string, for disambiguating sanitized tokens.
 *
 * djb2, base 36. Not a security property — it only has to be deterministic, so
 * that the two passes over a condition (compiling it, and collecting its
 * attribute names) derive the same token for the same segment without sharing
 * state.
 * @param value - The string to digest
 * @returns A short alphanumeric digest
 */
const digest = (value: string): string => {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
};

/**
 * The token a path segment is referenced by inside an expression.
 *
 * An attribute name can be almost anything — which is why DynamoDB has
 * expression attribute names at all — but the *token* standing in for it
 * cannot. Using the segment verbatim produced `#a b` for a field named `"a b"`,
 * which the service rejects, and an `ObjectSchema` key is an unrestricted
 * string, so that name is legal to declare.
 *
 * A segment that is already a safe token is used unchanged, which keeps every
 * ordinary expression byte-for-byte what it was. Anything else is sanitized and
 * suffixed with a digest of the original, so `"a b"` and `"a-b"` cannot collide
 * on `a_b`. Deterministic, because the condition pass and the attribute-name
 * pass each derive it independently
 * @param segment - The attribute or field name as declared
 * @returns A token safe to place after `#` in an expression
 */
const nameToken = (segment: string): string =>
  SAFE_TOKEN.test(segment)
    ? segment
    : `${segment.replace(/[^A-Za-z0-9_]/g, "_")}_${digest(segment)}`;

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
  /**
   * Prepended to every value placeholder the instance binds, leaving attribute
   * names unchanged. Lets a compiled condition share an expression's value map
   * with placeholders compiled elsewhere — an update expression's, or another
   * condition's — without binding the same name twice. Must consist of the
   * characters an expression token accepts. Defaults to none, which is the
   * naming every query and search compiles with.
   */
  valuePlaceholderPrefix?: string;
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
  readonly #valuePlaceholderPrefix: string;
  #attrCounter: number;
  /**
   * Expression paths a condition has been compiled for, tracked when the
   * capability set allows a single condition per attribute
   */
  readonly #conditionedPaths: Set<string>;

  constructor(props: FilterExpressionBuilderProps) {
    this.#capabilities = props.capabilities;
    this.#resolveAttribute = props.resolveAttribute;
    this.#valuePlaceholderPrefix = props.valuePlaceholderPrefix ?? "";
    this.#attrCounter = 0;
    this.#conditionedPaths = new Set();
  }

  /**
   * Creates the filters
   *
   * Supports 'AND' and 'OR'
   * Supports equality, 'IN', the comparators, 'BETWEEN', 'begins_with' and
   * 'contains' operands, each subject to the capability set
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
    // read as an attribute named "$or". A context that does not drop one
    // rejects it here instead, at every depth for the same reason
    if (!this.#capabilities.dropUndefinedConditions) {
      this.assertConditionsDefined(rawFilter);
    }
    const filter = this.definedConditions(rawFilter);
    const isOrFilter = this.isOrFilter(filter);

    if (isOrFilter) {
      if (!this.#capabilities.or) {
        throw new FilterError(
          `$or conditions are not supported in ${this.#capabilities.context}`
        );
      }
      // An $or of no blocks compiles to nothing, which a filter drops. A
      // context that does not drop it rejects it, because nothing is what it
      // asks for
      if (filter.$or.length === 0 && !this.#capabilities.dropEmptyOr) {
        throw new FilterError(
          `Invalid condition: $or has no condition blocks, and ${this.#capabilities.context} reject an empty $or rather than dropping it — dropping it would loosen what the condition checks`
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
   * Rejects a condition set to undefined, for a context that does not drop one.
   *
   * A write condition is the case: dropping one of its conditions lets through
   * a write the caller meant to stop, where dropping a filter's only widens a
   * read
   * @param conditions - The conditions as the caller supplied them
   */
  private assertConditionsDefined(conditions: FilterParams): void {
    const undefinedKey = Object.keys(conditions).find(
      key => conditions[key] === undefined
    );

    if (undefinedKey !== undefined) {
      throw new FilterError(
        `Invalid filter value for attribute "${undefinedKey}": the condition has no value, and ${this.#capabilities.context} reject one rather than dropping it — dropping it would loosen what the condition checks`
      );
    }
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
    filter: Record<string, FilterParams[string]>,
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
    const accumulator =
      (capabilities: FilterCapabilities) =>
      (obj: StringObj, key: string): StringObj => {
        const resolved = this.resolveAttrPath(key, capabilities);
        Object.assign(obj, resolved.names);
        return obj;
      };

    // Key paths are resolved under the key condition vocabulary, the same set
    // keyConditions compiles them with. Passing the builder's own set here let a
    // dotted key condition past the nested-path gate, which only the order of
    // the two calls in QueryBuilder.build was hiding
    const resolveKey = accumulator(keyConditionCapabilities);
    const resolveFilterKey = accumulator(this.#capabilities);

    let expressionAttributeNames = keys.reduce<StringObj>(
      (acc, key) => resolveKey(acc, key),
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
        definedKeys(filter).forEach(key => resolveFilterKey(acc, key));
        return acc;
      }, {});

      const and = definedKeys(andFilters).reduce<StringObj>(
        (acc, key) => resolveFilterKey(acc, key),
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

    // A half that compiled to nothing contributes nothing. Wrapping it anyway
    // put empty parentheses in the expression — `() AND (#Name = :Name1)` —
    // which DynamoDB rejects, and which the caller's empty-expression check
    // cannot catch because the string is not empty. The same rule orFilter
    // applies to a block it emptied
    const parts = [orFilterParams, andFilterParams].filter(
      ({ expression }) => expression !== ""
    );

    // One part needs no grouping; it is the whole expression. Of two, each is
    // isolated in one pair of parentheses: an $or of one block that binds
    // several values is already one group, and a second pair around it is
    // rejected by DynamoDB as redundant
    const expression =
      parts.length === 1
        ? parts[0].expression
        : parts.map(({ expression }) => parenthesize(expression)).join(" AND ");

    const values = { ...orFilterParams.values, ...andFilterParams.values };
    return { expression, values };
  }

  /**
   * Creates an AND condition.
   * Supports equality, 'IN', the comparators, 'BETWEEN', 'begins_with' and
   * 'contains', each subject to the capability set this compilation runs under.
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

    this.assertConditionShape(resolved, value, attr);

    let condition;

    const values: Record<string, DynamoNativeValue> = {};
    if (Array.isArray(value)) {
      if (!capabilities.in) {
        throw new FilterError(
          `IN conditions (array values) are not supported in ${capabilities.context}. Attribute "${attr}" has an array value`
        );
      }
      // Guarded because `IN ()` is not syntax DynamoDB has — the builder would
      // be emitting a malformed expression, which is its own bug rather than
      // the caller's. DynamoDB's documented 100-value cap is deliberately NOT
      // guarded: it reports that itself, and a quota is a number AWS can raise,
      // where a library that hardcodes it becomes a false blocker needing a
      // release to clear. The test for a guard here is whether DynamoDB would
      // accept the condition, match nothing, and report nothing
      if (value.length === 0) {
        throw new FilterError(
          `Invalid filter value for attribute "${attr}": an IN condition has no values. DynamoDB has no syntax for an empty list, and a membership test against nothing matches nothing`
        );
      }
      const mappings = value.map(val => {
        // Where null means "not set" it is a condition of its own rather than
        // a value to compare against, so it has no place in a list of them
        if (val === null && capabilities.nullMeansNotSet) {
          throw new FilterError(
            `Invalid filter value for attribute "${attr}": an IN list cannot carry null. null means "not set" in ${capabilities.context}, which is its own condition — write it as an $or block`
          );
        }
        // The same checks every other operand gets. Without the first, an
        // element that resolved to undefined still takes a placeholder and the
        // expression references one with no value bound to it
        this.assertOperandDefined(val, attr, "IN");
        this.assertInElementShape(val, attr);
        return this.bindWholeValue(resolved, attr, val, values);
      });
      condition = `${resolved.expressionPath} IN (${mappings.join()})`;
    } else if (this.isComparisonFilter(value)) {
      this.assertCapability(
        capabilities,
        "comparison",
        attr,
        "Comparison",
        "a comparison"
      );
      const operands = this.presentComparisons(value);

      // Before the count and before the applicability gate: both read or count
      // the operands, and a condition whose operands all resolved to undefined
      // supplied none — being told it "has 2 comparison operands" names a
      // mistake the caller did not make
      operands.forEach(operator => {
        this.assertOperandDefined(value[operator], attr, operator);
      });

      this.assertOrderedOperatorApplies(resolved, attr, operands.join(" and "));
      if (operands.length > 1 && !capabilities.composedComparisons) {
        throw new FilterError(
          `Composed comparisons are not supported in ${capabilities.context}. Attribute "${attr}" has ${String(operands.length)} comparison operands, and DynamoDB allows one condition on the sort key — use $between for a two-sided range`
        );
      }
      const bound = operands.map(operator => {
        const operand = value[operator];
        this.assertOperandDefined(operand, attr, operator);
        const reference = this.bindWholeValue(resolved, attr, operand, values);
        this.assertOperandOrdered(values, reference, attr, operator);
        return { operator, reference };
      });
      this.assertComposedRangeSatisfiable(values, bound, attr);
      condition = bound
        .map(
          ({ operator, reference }) =>
            `${resolved.expressionPath} ${comparisonOperators[operator]} ${reference}`
        )
        .join(" AND ");
    } else if (this.isBetweenFilter(value)) {
      this.assertCapability(
        capabilities,
        "between",
        attr,
        "$between",
        "a $between"
      );
      // Bounds read first, for the same reason the comparison arm checks
      // definedness first — the applicability gate describes the attribute,
      // which is not the mistake when no bound was supplied
      const [lower, upper] = this.betweenBounds(value, attr);
      this.assertOrderedOperatorApplies(resolved, attr, "$between");
      const lowerRef = this.bindWholeValue(resolved, attr, lower, values);
      const upperRef = this.bindWholeValue(resolved, attr, upper, values);
      this.assertOperandOrdered(values, lowerRef, attr, "$between");
      this.assertOperandOrdered(values, upperRef, attr, "$between");
      this.assertBoundsOrdered(values, lowerRef, upperRef, attr);
      condition = `${resolved.expressionPath} BETWEEN ${lowerRef} AND ${upperRef}`;
    } else if (this.isBeginsWithFilter(value)) {
      this.assertCapability(
        capabilities,
        "beginsWith",
        attr,
        "$beginsWith",
        "a $beginsWith"
      );
      this.assertOperandDefined(value.$beginsWith, attr, "$beginsWith");
      this.assertFragmentOperatorApplies(resolved, attr, "$beginsWith");
      this.assertFragmentOperandShape(
        resolved,
        value.$beginsWith,
        attr,
        "$beginsWith"
      );
      const reference = this.bindFragment(resolved, value.$beginsWith, values);
      condition = `begins_with(${resolved.expressionPath}, ${reference})`;
    } else if (this.isContainsFilter(value)) {
      this.assertCapability(
        capabilities,
        "contains",
        attr,
        "$contains",
        "a $contains"
      );
      this.assertOperandDefined(value.$contains, attr, "$contains");
      this.assertFragmentOperatorApplies(resolved, attr, "$contains");
      // A list element is validated and converted before the shape check, so
      // an element named the way the entity declares it is judged in the form
      // it will be sent in
      const operand = this.toStoredElement(resolved, value.$contains, attr);
      this.assertFragmentOperandShape(resolved, operand, attr, "$contains");
      const reference = this.bindFragment(resolved, operand, values);
      condition = `contains(${resolved.expressionPath}, ${reference})`;
    } else if (value === null && capabilities.nullMeansNotSet) {
      // dyna-record removes a nulled attribute rather than storing NULL, so
      // "not set" is an absent attribute — a test of the path, binding no value
      this.assertNullable(resolved, attr, capabilities);
      condition = `attribute_not_exists(${resolved.expressionPath})`;
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
   * Rejects an operator the context cannot represent.
   *
   * The four operator families whose rejection reads the same way share this,
   * so the message shape is written once. `in` and `composedComparisons` keep
   * their own blocks, because what they have to say genuinely differs — one
   * names an array value, the other counts operands and points at `$between`
   * @param capabilities - The vocabulary this compilation may use
   * @param capability - The capability the operator needs
   * @param attr - The attribute key, for the error message
   * @param subject - The operator as the message opens with it (EX: `$between`)
   * @param noun - The operator as the message refers back to it (EX: `a $between`)
   */
  private assertCapability(
    capabilities: FilterCapabilities,
    capability: "comparison" | "between" | "beginsWith" | "contains",
    attr: string,
    subject: string,
    noun: string
  ): void {
    if (capabilities[capability]) return;

    throw new FilterError(
      `${subject} conditions are not supported in ${capabilities.context}. Attribute "${attr}" has ${noun} condition`
    );
  }

  /**
   * Rejects `null` as "not set" on an attribute that is not declared nullable.
   *
   * Such an attribute is always set, so the condition could never hold. The
   * nullability read is the attribute's, or for a dot path the nested field's;
   * a path whose field could not be resolved is not known to be nullable and
   * is rejected too
   * @param resolved - The resolved attribute path
   * @param attr - The attribute key, for the error message
   * @param capabilities - The vocabulary this compilation may use, for the message
   */
  private assertNullable(
    resolved: ResolvedPath,
    attr: string,
    capabilities: FilterCapabilities
  ): void {
    if (resolved.nullable === true) return;

    throw new FilterError(
      `Invalid filter value for attribute "${attr}": null means "not set" in ${capabilities.context}, which only an attribute declared nullable can be`
    );
  }

  /**
   * The next value placeholder for a path: the instance's prefix, the path's
   * placeholder key and the instance's counter
   * @param resolved - The resolved attribute path
   * @returns The placeholder, without its `:`
   */
  private nextPlaceholder(resolved: ResolvedPath): string {
    return `${this.#valuePlaceholderPrefix}${resolved.placeholderKey}${String(++this.#attrCounter)}`;
  }

  /**
   * Binds a whole-value operand and returns the placeholder reference naming
   * it.
   *
   * A whole value of the attribute: an equality value, an `IN` element, a
   * comparison operand, a `$between` bound. Shape-checked against the stored
   * form, validated in the declared form with every field it carries declared,
   * and converted to the stored one — the operand rule's first half applied in
   * one place instead of in each branch that carries such an operand. Putting the shape check here rather
   * than at each call site is what kept the equality arm from being the one
   * that forgot it
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
    this.assertWholeValueShape(resolved, value, attr);
    this.validateConditionValue(resolved, attr, value);
    this.assertFieldsDeclared(resolved, attr, value);
    const placeholder = this.nextPlaceholder(resolved);
    values[placeholder] = this.toStoredValue(resolved, value, attr);
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
    const placeholder = this.nextPlaceholder(resolved);
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
    return comparisonOperatorNames.filter(operator => operator in filter);
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

    return [lower, upper];
  }

  /**
   * Rejects composed comparisons that bound an empty range.
   *
   * This one closes a genuinely silent failure, and the asymmetry is worth
   * knowing: DynamoDB *validates* `BETWEEN`'s bounds and rejects an inverted
   * pair, but applies a composed `>=`/`<` pair as written and answers an empty
   * range with no rows and no error. Verified against the service. So the form
   * the documentation presents as *the* way to write a range is the one the
   * service will not catch for you.
   *
   * An exclusive bound makes equal endpoints empty too: `{ $gt: 5, $lt: 5 }`
   * excludes 5 from both sides. `{ $gte: 5, $lte: 5 }` is the degenerate but
   * satisfiable case, matching exactly 5, and is allowed for the same reason an
   * equal `$between` pair is
   * @param values - The value map the operands were bound into
   * @param bound - The operators compiled, with their placeholder references
   * @param attr - The attribute key, for the error message
   */
  private assertComposedRangeSatisfiable(
    values: Record<string, DynamoNativeValue>,
    bound: Array<{ operator: ComparisonOperator; reference: string }>,
    attr: string
  ): void {
    const stored = (reference: string): DynamoNativeValue =>
      values[reference.slice(1)];
    const find = (...wanted: ComparisonOperator[]): Optional<string> =>
      bound.find(({ operator }) => wanted.includes(operator))?.reference;

    const lowerRef = find("$gt", "$gte");
    const upperRef = find("$lt", "$lte");
    if (lowerRef === undefined || upperRef === undefined) return;

    const lower = stored(lowerRef);
    const upper = stored(upperRef);
    if (!isOrdered(lower) || !isOrdered(upper)) return;

    // Equal endpoints are empty unless both bounds include them
    const exclusive = bound.some(
      ({ operator }) => operator === "$gt" || operator === "$lt"
    );
    const empty = lower > upper || (lower === upper && exclusive);

    if (empty) {
      throw new FilterError(
        `Invalid filter value for attribute "${attr}": the comparison bounds an empty range. Its lower bound is not below its upper bound, and DynamoDB applies a composed range as written — it returns no rows rather than reporting the mistake`
      );
    }
  }

  /**
   * Rejects a `$between` whose bounds are the wrong way round.
   *
   * DynamoDB rejects an inverted pair itself — "The BETWEEN operator requires
   * upper bound to be greater than or equal to lower bound" — verified against
   * the service, so this is not a silent failure being caught. What it buys is
   * an earlier rejection that names the *attribute*, which the service's
   * message does not: with several conditions in a filter, "lower bound
   * operand: …" leaves the caller to work out which one.
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
        `Invalid filter value for attribute "${attr}": the $between bounds are inverted. The lower bound comes first`
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
    resolved: ResolvedPath,
    value: FilterParams[string],
    attr: string
  ): void {
    // An array is a condition shape of its own (an IN list), and a Date or a
    // Uint8Array is a whole value, so none of them is an operator object
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      isObjectValuedScalar(value)
    ) {
      return;
    }

    // On a Map-stored attribute a plain object is the attribute's own value,
    // and DynamoDB's `=` does compare Maps — so an object naming no operator is
    // a whole-value equality here rather than a mistyped operator. Only an
    // object that names one is a condition, and mixing the two is still wrong.
    //
    // An unresolved form answers the same way, because this guard is the only
    // one that would otherwise judge what it cannot see: a path into a union
    // variant resolves to no field, and the field it names may well be a Map.
    // Abstaining is what every other guard does
    const families = this.operatorFamilies(value);

    // A `$`-prefixed key is this vocabulary's mark of an operator, so one that
    // names no operator is a typo rather than data — independent of what the
    // attribute can hold, which is why it is asked first. Abstaining on an
    // unresolved form below would otherwise let `{ $ne: 1 }` through as an
    // equality against the operator object itself
    const operatorKeys = Object.keys(value).filter(key => key.startsWith("$"));

    if (families.length === 0 && operatorKeys.length > 0) {
      throw new FilterError(
        `Invalid filter value for attribute "${attr}": ${operatorKeys.join(", ")} ${operatorKeys.length === 1 ? "is not a supported operator" : "are not supported operators"}. The supported operators are ${supportedOperators.join(", ")}`
      );
    }

    // Whether a plain object is the attribute's own value does depend on the
    // form. An unresolved form abstains, as every other guard does — a path
    // into a union variant may well name a Map
    const mayHoldAnObject =
      resolved.storedForm === "map" || resolved.storedForm === undefined;

    if (mayHoldAnObject && families.length === 0) {
      return;
    }

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
   * Rejects an ordered comparison on an attribute DynamoDB cannot order.
   *
   * `<`, `<=`, `>`, `>=` and `BETWEEN` need comparable operands. A boolean, a
   * Map and a List are not comparable, and DynamoDB says so itself —
   * "Incorrect operand type for operator or function; operator or function: >,
   * operand type: BOOL", verified against the service. So unlike the fragment
   * gate, this is not closing a silent failure: it rejects before the request
   * and names the attribute, where the service names only the operator.
   *
   * Decided by the stored form, which is why a date attribute keeps its ranges:
   * an ISO string orders lexicographically exactly as the `Date` orders
   * chronologically
   * @param resolved - The resolved attribute path
   * @param attr - The attribute key, for the error message
   * @param operator - The operator or operators being applied, for the message
   */
  private assertOrderedOperatorApplies(
    resolved: ResolvedPath,
    attr: string,
    operator: string
  ): void {
    if (orderedOperatorApplies(resolved.storedForm)) return;

    throw new FilterError(
      `Invalid filter value for attribute "${attr}": ${operator} does not apply to a value stored as a ${String(resolved.storedForm)}. ${orderedOperatorDomain}`
    );
  }

  /**
   * Rejects a fragment operand that the operator cannot take.
   *
   * "Neither validated nor converted" is right about not checking the operand
   * against the *attribute's* schema — there is no "Date that starts with
   * 2026". It is not a reason to skip the weaker check that the operand is the
   * kind of thing the function compares.
   *
   * What that is depends on the stored form, which is why this reads it.
   * `begins_with` takes a string prefix. `contains` takes a substring of a
   * String, but an *element* of a List — and an element may be a Map, which is
   * what a List of objects holds. Requiring a scalar there would refuse the
   * membership test the library documents for exactly that schema.
   * @param resolved - The resolved attribute path
   * @param operand - The operand supplied to the operator
   * @param attr - The attribute key, for the error message
   * @param operator - The fragment operator being applied
   */
  private assertFragmentOperandShape(
    resolved: ResolvedPath,
    operand: unknown,
    attr: string,
    operator: FragmentOperator
  ): void {
    // Every value begins with, and contains, the empty string — so this is the
    // one case that fails by matching *everything* rather than nothing. The
    // reach is the idiom assertOperandDefined's doc already cites,
    // `$beginsWith: req.query.prefix ?? ""`, and in a key condition it reads
    // the whole partition while looking like a narrow
    if (operand === "") {
      throw new FilterError(
        `Invalid filter value for attribute "${attr}": ${operator} was given an empty string, which every value matches. Drop the condition rather than passing an empty operand`
      );
    }

    if (operator === "$beginsWith") {
      if (typeof operand !== "string") {
        throw new FilterError(
          `Invalid filter value for attribute "${attr}": $beginsWith takes a string prefix of the stored value, and this operand is neither`
        );
      }
      return;
    }

    // On a String the operand is a substring, so it has to be a string — a
    // number or a boolean there compares a scalar against a String and answers
    // nothing. On a List it is an element, which can be any type the list
    // holds, including a Map; the only shape ruled out there is the absent one
    if (resolved.storedForm === "string") {
      if (typeof operand !== "string") {
        throw new FilterError(
          `Invalid filter value for attribute "${attr}": $contains takes a substring of the stored value, which is a string. A date attribute is stored as an ISO string, so a year is written "2026" rather than 2026`
        );
      }
      return;
    }

    if (operand === null) {
      throw new FilterError(
        `Invalid filter value for attribute "${attr}": $contains takes a single value to look for, and null is not one`
      );
    }

    // On a List whose elements' form is known, the operand is one of them, so
    // it has to be stored in that form — a number in a list of strings is never
    // a member, and DynamoDB answers the test with nothing. Judged by stored
    // form, as the String reading above is: the operand arrives here already
    // converted, so this is the form it is sent in
    const { elementForm } = resolved;

    if (
      elementForm !== undefined &&
      storedFormOfOperand(operand) !== elementForm
    ) {
      throw new FilterError(
        `Invalid filter value for attribute "${attr}": $contains on a list looks for one of its elements, and this list's elements are stored as a ${elementForm}, which this operand is not`
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
   * Rejects an `IN` element that names an operator.
   *
   * The elements are the one place {@link assertConditionShape} cannot reach:
   * it exempts arrays wholesale, because an array *is* a condition shape there.
   * So a nested operator reached the binder and was compared as a Map, which
   * DynamoDB answers with nothing. The element's *value* shape is checked by
   * {@link bindWholeValue}, which every whole-value operand passes through
   * @param element - One element of the IN list
   * @param attr - The attribute key, for the error message
   */
  private assertInElementShape(
    element: FilterValue | AndFilter,
    attr: string
  ): void {
    const families = this.operatorFamilies(element);

    if (families.length > 0) {
      throw new FilterError(
        `Invalid filter value for attribute "${attr}": an IN element names ${families.join(" and ")}. Each element is a value to compare against, and an operator cannot be nested inside one`
      );
    }
  }

  /**
   * Rejects a whole-value operand that is not shaped like the attribute's own
   * value.
   *
   * Both arms that compare against a whole value need this — `IN`, once per
   * element, and equality. `IN`'s elements are also the one place the
   * condition-shape guard cannot reach, because it exempts arrays wholesale:
   * an array *is* a condition shape there.
   *
   * Both compare the whole attribute against the operand, so the operand has to
   * be shaped like the attribute's value. On a List-stored field that means a
   * list — a scalar there asks whether the list *equals* that scalar, which it
   * never does, and the membership test the caller meant is `$contains`
   * @param resolved - The resolved attribute path
   * @param element - The operand: an IN element, or an equality value
   * @param attr - The attribute key, for the error message
   */
  private assertWholeValueShape(
    resolved: ResolvedPath,
    element: FilterValue | AndFilter,
    attr: string
  ): void {
    // Checked before the stored form, because this is true of every attribute:
    // dyna-record removes a nulled attribute rather than storing DynamoDB's
    // NULL, so no row holds one and `#Attr = NULL` is false for all of them.
    // The ordered arms already rejected it; equality and IN are where it hid,
    // and an IN list mixing null with real values hides it best of all — the
    // real values still match, so the dead branch never announces itself
    if (element === null) {
      throw new FilterError(
        `Invalid filter value for attribute "${attr}": a condition cannot compare against null. dyna-record removes a nulled attribute rather than storing NULL, so no item holds one to match`
      );
    }

    const { storedForm } = resolved;

    // Where the stored form is unknown, dyna-record cannot judge the element —
    // the same abstention a dot path into a union variant gets everywhere else
    if (storedForm === undefined) return;

    const isList = Array.isArray(element);
    // null was rejected above, so `typeof === "object"` is an object here
    const isPlainObject =
      typeof element === "object" && !isList && !isObjectValuedScalar(element);

    const shaped =
      storedForm === "list"
        ? isList
        : storedForm === "map"
          ? isPlainObject
          : !isList && !isPlainObject;

    if (!shaped) {
      const remedy =
        storedForm === "list" && !isList
          ? ". A comparison asks whether the whole list equals the operand, so a single value never matches — $contains is the membership test"
          : "";

      throw new FilterError(
        `Invalid filter value for attribute "${attr}": the operand is not a value this attribute can hold, which is stored as a ${storedForm}${remedy}`
      );
    }
  }

  /**
   * The operator families a condition object names.
   *
   * Separated from {@link assertConditionShape} because the shape rule needs
   * the count twice — none means the object is not a condition at all, more
   * than one means the compilation would drop all but the first — and because
   * an `IN` element has to ask the same question of itself
   * @param value - A condition value; only an object can name a family
   * @returns The families present, in a stable order
   */
  private operatorFamilies(value: unknown): string[] {
    if (typeof value !== "object" || value === null) return [];

    return [
      this.isComparisonFilter(value) && "comparison",
      "$between" in value && "$between",
      "$beginsWith" in value && "$beginsWith",
      "$contains" in value && "$contains"
    ].filter((family): family is string => family !== false);
  }

  /**
   * Rejects an operand DynamoDB cannot order.
   *
   * Checked on the **stored** value, which is the one DynamoDB compares, and
   * delegated to {@link isDynamoOrderable} so the answer is given in one place
   * rather than restated per operand kind. That subsumes several cases at once:
   * `null` never reaches a stored row because dyna-record removes a nulled
   * attribute instead of storing NULL, and a boolean, a Map and a List have no
   * ordering at all. Binary is accepted, because DynamoDB orders it even though
   * JavaScript's `>` does not — which is why this does not use `isOrdered`.
   *
   * The attribute-side gate ({@link assertOrderedOperatorApplies}) answers the
   * same question from the schema, and abstains where the stored form could not
   * be resolved — a dot path into a union variant.
   * This is the check that still applies there, where the value is all there is
   * to go on
   * @param values - The value map the operand was bound into
   * @param reference - The operand's placeholder reference
   * @param attr - The attribute key, for the error message
   * @param operator - The operator name, for the error message
   */
  private assertOperandOrdered(
    values: Record<string, DynamoNativeValue>,
    reference: string,
    attr: string,
    operator: string
  ): void {
    const stored = values[reference.slice(1)];

    if (!isDynamoOrderable(stored)) {
      throw new FilterError(
        `Invalid filter value for attribute "${attr}": ${operator} cannot order this value. ${orderedOperandDomain}`
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
   * @param attr - The attribute key, for the error message
   * @returns The value as the table stores it
   */
  private toStoredValue(
    resolved: ResolvedPath,
    value: FilterValue | AndFilter,
    attr: string
  ): DynamoNativeValue {
    if (resolved.toStored !== undefined && value !== null) {
      const stored = resolved.toStored(value);

      // A serializer answers undefined for a value it cannot convert. Binding
      // that leaves the expression referencing a placeholder with no value,
      // which is the builder emitting something malformed rather than the
      // caller asking for something impossible
      if (stored === undefined) {
        throw new FilterError(
          `Invalid filter value for attribute "${attr}": the value could not be converted to the form the table stores`
        );
      }

      return stored;
    }

    // No serializers means the declared form is already storable
    return value as DynamoNativeValue;
  }

  /**
   * Validates a `$contains` operand on a list against the list's element schema
   * and converts it from the form the entity declares an element in to the form
   * the table stores it.
   *
   * On a List the operand is not a fragment but a whole element, so the
   * operand rule's first half applies to it: it is validated against the
   * element's schema and converted through the same conversion that writes the
   * field. An enum element must be a member, a number element a finite number,
   * an object element an object of the element's fields with each field's
   * declared type, and a union element one of the union's variants. A `Date` is
   * converted to the ISO string it is stored as, at any depth.
   *
   * Two things zod would let through are rejected as well. An object element
   * carrying a field its schema does not declare: zod strips such a field,
   * which is right for a write and wrong here, because `contains` compares an
   * element whole and the stripped operand is not the element the caller
   * described. A nullable field the operand omits, leaves undefined or sets to
   * null is not rejected: the write removes a nulled field rather than storing
   * NULL, so in all three spellings the element looked for lacks it, as the
   * stored one does. A required field left undefined is rejected by the schema.
   *
   * An operand in another form than the elements' is passed through for
   * {@link assertFragmentOperandShape} to reject, which names the form the
   * elements are stored in. So is the ISO string on a list of dates: it is
   * already the stored form, and is sent as written
   * @param resolved - The resolved attribute path
   * @param operand - The operand as the caller supplied it
   * @param attr - The attribute key, for the error message
   * @returns The operand as the table stores it
   */
  private toStoredElement(
    resolved: ResolvedPath,
    operand: DynamoScalarValue,
    attr: string
  ): DynamoNativeValue {
    const {
      elementForm,
      elementValueSchema,
      elementToStored,
      elementUndeclaredField
    } = resolved;

    // Not a list, or a path whose field could not be resolved
    if (elementValueSchema === undefined) return operand;

    // A date is the one element declared in a form other than its stored one:
    // the only string-stored element with a conversion
    const isDateElement =
      elementForm === "string" && elementToStored !== undefined;

    if (isDateElement && typeof operand === "string") return operand;

    const inElementForm =
      operand instanceof Date
        ? isDateElement
        : storedFormOfOperand(operand) === elementForm;

    if (!inElementForm) return operand;

    // An invalid Date is still a Date, and converting one throws a RangeError
    // from toISOString rather than reporting the attribute
    const parsed = elementValueSchema.safeParse(operand);
    if (!parsed.success) {
      throw new FilterError(
        `Invalid filter value for attribute "${attr}": $contains on a list looks for one of its elements, and this operand is not a value the list's elements can hold`,
        { cause: parsed.error.issues }
      );
    }

    const undeclared = elementUndeclaredField?.(operand);
    if (undeclared !== undefined) {
      throw new FilterError(
        `Invalid filter value for attribute "${attr}": $contains on a list looks for one of its elements, and "${undeclared}" is not a field the list's elements declare. contains compares an element whole, so no element can equal this operand`
      );
    }

    return elementToStored === undefined ? operand : elementToStored(operand);
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
   * Rejects a whole-value operand carrying a field its schema does not declare,
   * at any depth.
   *
   * The schema's validator strips such a field rather than rejecting it, and so
   * does the conversion to the stored form — right for a value about to be
   * written, wrong for one compared whole. The stripped operand is not the value
   * the caller described: `{ city: "X", zip: "Y" }` would be sent as
   * `{ city: "X" }`, and a write condition would hold against a row that holds
   * no `zip` at all, letting through a write the caller meant to stop. Unless
   * every field is declared, no stored value can equal the operand, so it is
   * refused before anything is sent.
   *
   * Runs after {@link validateConditionValue}, which has accepted every declared
   * field's value, so the walk only has undeclared fields left to find
   * @param resolved - The resolved attribute path
   * @param attr - The attribute key, for error messages
   * @param value - The operand as the caller supplied it
   */
  private assertFieldsDeclared(
    resolved: ResolvedPath,
    attr: string,
    value: unknown
  ): void {
    const undeclared = resolved.undeclaredField?.(value);

    if (undeclared !== undefined) {
      throw new FilterError(
        `Invalid filter value for attribute "${attr}": "${undeclared}" is not a field the attribute declares. An object is compared whole, so no stored value can equal this operand`
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
      kind,
      nullable
    } = this.#resolveAttribute(topLevelKey, key);

    // The alias and each field name stand in an expression as a `#` token,
    // which has a narrower charset than an attribute name does — see nameToken
    const tableToken = nameToken(tableKey);
    const names: StringObj = { [`#${tableToken}`]: tableKey };

    if (segments.length === 1) {
      return {
        expressionPath: `#${tableToken}`,
        names,
        placeholderKey: tableToken,
        valueSchema,
        toStored: serializers?.toTableAttribute,
        ...(objectSchema !== undefined && {
          undeclaredField: value =>
            undeclaredFieldIn({ type: "object", fields: objectSchema }, value)
        }),
        storedForm: storedFormOfAttribute(kind),
        nullable
      };
    }

    const subSegments = segments.slice(1);

    // An empty segment names no attribute, and DynamoDB has no name for it to
    // map a token to — `{ "meta.": x }` or `{ "meta..label": x }`, which is what
    // `{ [`${prefix}.${field}`]: value }` produces when either half is empty
    if (subSegments.some(segment => segment === "")) {
      throw new FilterError(
        `Invalid filter key "${key}": it has an empty path segment, so one of its parts names no attribute`
      );
    }

    // A segment may carry list indexes — `audit[0]`. The index is part of the
    // path, not of the attribute's name, so it sits outside the `#` token
    const parsed = subSegments.map(segment => parseSegment(segment));
    const tokens = parsed.map(segment => nameToken(segment.name));

    parsed.forEach((segment, i) => {
      names[`#${tokens[i]}`] = segment.name;
    });

    /** `#audit[0]` — the token, then the indexes it was written with */
    const reference = (i: number): string =>
      `#${tokens[i]}${parsed[i].indexes.map(n => `[${String(n)}]`).join("")}`;

    const expressionPath = `#${tableToken}.${parsed.map((_, i) => reference(i)).join(".")}`;

    // A placeholder key has to stay a valid token, so the indexes join it as
    // digits rather than as brackets
    const placeholderKey = `${tableToken}${parsed
      .map((segment, i) => `${tokens[i]}${segment.indexes.join("")}`)
      .join("")}`;

    // The resolver answers for the top level attribute, so a nested value is
    // validated and converted as the field it names rather than as the object
    // that contains it. An attribute of a known kind without an object schema
    // is a scalar, which no path continues below; one of an unknown kind is
    // left to the walk, which abstains on it
    const resolution: FieldResolution =
      objectSchema === undefined && kind !== undefined
        ? {
            outcome: "pathPastScalar",
            segment: topLevelKey,
            field: parsed[0].name
          }
        : resolveFieldDef(objectSchema, parsed);

    // A path running *through* a list without naming an element reaches nothing
    // DynamoDB can address: it compiles, matches no row, and reports no error
    if (resolution.outcome === "listWithoutIndex") {
      throw new FilterError(
        `Invalid filter key "${key}": "${resolution.segment}" is a list, and a condition below it has to name an element — write "${resolution.segment}[0]" for the first. DynamoDB has no path to "every element", so the condition as written can match nothing`
      );
    }

    // An index on anything but a List addresses an element of something that
    // holds none — also accepted, also matching nothing
    if (resolution.outcome === "indexOnNonList") {
      throw new FilterError(
        `Invalid filter key "${key}": "${resolution.segment}" indexes "${parseSegment(resolution.segment).name}", which does not hold a list. A list index addresses one element, and a condition on anything else names it without an index`
      );
    }

    // A field a declared object does not have names nothing a row can hold —
    // a typo the types refuse, and one the service would answer with no rows,
    // or with a failed guard indistinguishable from a real one
    if (resolution.outcome === "undeclaredField") {
      throw new FilterError(
        `Invalid filter key "${key}": "${resolution.field}" is not a field its object declares, so the condition names nothing a row can hold and can match nothing. The declared fields are: ${resolution.declared.join(", ")}`
      );
    }

    // Below a scalar there are no fields at all, declared or otherwise
    if (resolution.outcome === "pathPastScalar") {
      throw new FilterError(
        `Invalid filter key "${key}": "${resolution.segment}" is not an object, so it has no field "${resolution.field}" and the condition can match nothing`
      );
    }

    // A union variant the path does not name: the field may exist, so nothing
    // here can judge it
    if (resolution.outcome === "unknown") {
      return { expressionPath, names, placeholderKey };
    }

    const { fieldDef } = resolution;

    return {
      expressionPath,
      names,
      placeholderKey,
      storedForm: storedFormOfField(fieldDef),
      // An object field is never nullable, so its definition has no flag
      nullable: fieldDef.type !== "object" && fieldDef.nullable === true,
      ...(fieldDef.type === "array" && {
        elementForm: storedFormOfField(fieldDef.items),
        // A `$contains` operand is a whole element, so it is validated against
        // the element's schema and converted as the element is written — see
        // toStoredElement
        elementValueSchema: fieldDefToZod(fieldDef.items),
        elementUndeclaredField: element =>
          undeclaredFieldIn(fieldDef.items, element),
        ...(fieldConverts(fieldDef.items) && {
          elementToStored: value => toStoredFieldValue(fieldDef.items, value)
        })
      }),
      // Not every field's schema describes the value a condition carries;
      // where it does not, the stored form is still known and is what decides
      // which operators apply
      ...(fieldValidatesConditionValue(fieldDef) && {
        valueSchema: fieldDefToZod(fieldDef),
        undeclaredField: value => undeclaredFieldIn(fieldDef, value),
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
    // A block whose every condition was dropped contributes nothing — see
    // orCondition, which is where the bare " OR " is prevented. An $or left
    // with nothing compiles to nothing itself, which the caller assembling the
    // command drops in turn
    const orFilter = filter.$or
      .map(block => this.orCondition(block))
      .reduce<FilterExpression>(
        (filterParams, { expression, values }) => ({
          expression: filterParams.expression.concat(expression),
          values: { ...filterParams.values, ...values }
        }),
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

    // Nothing to join and nothing to parenthesize; orFilter drops these
    if (andParams.expression === "") return { expression: "", values: {} };

    // Grouped when the block binds more than one value, which stands in for
    // "the block has more than one condition". That substitution is sound only
    // because of an invariant worth stating: every arm binds at least one
    // placeholder, and both binders draw from the monotonic #attrCounter, so
    // placeholders never collide — two conditions therefore always mean two
    // value keys, and the parentheses can never go missing when they are
    // needed. It over-triggers harmlessly, grouping a single multi-value
    // condition such as a $between or a composed comparison.
    //
    // The one arm that binds no value is null read as "not set", so each of
    // those is counted alongside the values. It is reachable only where null
    // means "not set" — every other context rejects null before this — so the
    // count is unchanged everywhere else.
    //
    // An arm that bound no value uncounted, or reused a placeholder, would
    // break the substitution and silently drop the grouping. Parenthesizing
    // unconditionally would remove the proxy entirely and is always valid;
    // it is not done only because it would rewrite every expression a
    // single-condition block produces
    const notSetConditions = Object.values(andFilter).filter(
      value => value === null
    ).length;
    const multipleVals =
      Object.keys(andParams.values).length + notSetConditions > 1;
    // parenthesize leaves a block that is already one group as it is: an
    // untyped caller's $or nested directly in this block compiles to one, and
    // DynamoDB rejects a second pair around it
    const expression = multipleVals
      ? `${parenthesize(andParams.expression)} OR `
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
    filter: unknown
  ): filter is ComparisonConditionFor<OrderedFilterValue> {
    return (
      typeof filter === "object" &&
      filter !== null &&
      comparisonOperatorNames.some(operator => operator in filter)
    );
  }

  /**
   * Type guard for a {@link BetweenFilter}
   * @param filter - The condition value
   * @returns Whether it carries a `$between` pair
   */
  private isBetweenFilter(
    filter: unknown
  ): filter is BetweenConditionFor<OrderedFilterValue> {
    return (
      typeof filter === "object" && filter !== null && "$between" in filter
    );
  }

  /**
   * Type guard to check if its a BeginsWithFilter
   * @param filter
   * @returns
   */
  private isBeginsWithFilter(filter: unknown): filter is BeginsWithFilter {
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
  private isContainsFilter(filter: unknown): filter is ContainsFilter {
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
