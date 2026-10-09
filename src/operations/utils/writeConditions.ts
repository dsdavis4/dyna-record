import type DynaRecord from "../../DynaRecord.js";
import {
  TransactionWriteFailedError,
  WriteConditionFailedError,
  type ConditionFragment,
  type ConsumerGuard,
  type LibraryPin,
  type TransactConditionRow,
  type TransactWriteBuilder,
  type WriteConditionGuard
} from "../../dynamo-utils/index.js";
import { parenthesize } from "../../dynamo-utils/conditionExpression.js";
import { FilterError } from "../../errors.js";
import {
  FilterExpressionBuilder,
  writeConditionCapabilities,
  type FilterAttributeResolver,
  type FilterParams
} from "../../filter-utils/index.js";
import Metadata, {
  type EntityMetadata,
  type RelationshipMetadata
} from "../../metadata/index.js";
import {
  isBelongsToRelationship,
  isForeignKeyAttributeMetadata,
  isHasManyRelationship,
  isHasOneRelationship,
  isOwnedByRelationship
} from "../../metadata/utils.js";
import type { EntityClass } from "../../types.js";
import { isString } from "../../utils.js";
import type { EntityAttributesOnly } from "../types.js";

/**
 * The write operation a condition guards. Decides which keys a condition may
 * hold: a `create` guards only the rows the new entity references, because its
 * own row is required to be absent and it has no children or link partners yet
 */
export type WriteConditionOperation = "create" | "update" | "delete";

/**
 * An entity as an operation's earlier read returns it: the entity's own row or
 * a denormalized link copy in its partition, keyed by entity attribute name
 */
export type WriteConditionReadEntity = Partial<
  EntityAttributesOnly<DynaRecord>
>;

/**
 * Properties for {@link compileWriteCondition}
 *
 * @property {EntityClass<DynaRecord>} EntityClass - The entity being written
 * @property {WriteConditionOperation} operation - The write the condition guards
 * @property {unknown} condition - The caller's `condition` option, as given. A plain JavaScript caller can pass anything, so every shape is validated
 * @property {object} [payload] - The attributes being written, keyed by entity attribute name: create's attributes, or update's. Absent for delete. Decides which parent a guard targets, and which guards can never hold
 * @property {TransactWriteBuilder} transactionBuilder - The operation's transaction. Each compiled fragment draws its own value placeholder prefix from it, so no two fragments or pins of the write bind the same placeholder
 */
export interface CompileWriteConditionProps {
  EntityClass: EntityClass<DynaRecord>;
  operation: WriteConditionOperation;
  condition: unknown;
  payload?: object;
  transactionBuilder: TransactWriteBuilder;
}

/**
 * A guard on another entity's row, as a failure names it: a relationship or
 * foreign key, never the written entity's own row
 */
export type TargetWriteConditionGuard = Exclude<
  WriteConditionGuard,
  { kind: "self" }
>;

/**
 * What every compiled guard on another entity's row carries
 *
 * @property {TargetWriteConditionGuard} guard - The guard as a failure names it
 * @property {EntityClass<DynaRecord>} target - The entity whose own row the guard checks
 * @property {ConditionFragment} condition - The compiled condition, which always requires the row to exist
 */
interface CompiledTargetGuardBase {
  guard: TargetWriteConditionGuard;
  target: EntityClass<DynaRecord>;
  condition: ConditionFragment;
}

/**
 * A guard on the parent a foreign key of the written entity references: a
 * BelongsTo relationship, the child side of a uni-directional HasMany, or a
 * standalone foreign key
 *
 * @property {string} foreignKey - The foreign key attribute on the written entity
 * @property {string} [payloadForeignKey] - The foreign key value the write sets, when the payload sets one. That parent is the target; otherwise the stored one is
 */
export interface CompiledParentGuard extends CompiledTargetGuardBase {
  kind: "parent";
  foreignKey: string;
  payloadForeignKey?: string;
}

/**
 * A guard on the written entity's HasOne child, which the earlier read
 * resolves
 *
 * @property {string} foreignKey - The child's foreign key attribute referencing the written entity
 */
export interface CompiledHasOneGuard extends CompiledTargetGuardBase {
  kind: "hasOne";
  foreignKey: string;
}

/**
 * A guard on one HasMany child, named by the caller
 *
 * @property {string} id - The child's id
 * @property {string} foreignKey - The child's foreign key attribute referencing the written entity
 */
export interface CompiledHasManyGuard extends CompiledTargetGuardBase {
  kind: "hasMany";
  id: string;
  foreignKey: string;
}

/**
 * A guard on one HasAndBelongsToMany partner, named by the caller
 *
 * @property {string} id - The partner's id
 */
export interface CompiledHasAndBelongsToManyGuard
  extends CompiledTargetGuardBase {
  kind: "hasAndBelongsToMany";
  id: string;
}

/**
 * A compiled guard on a row other than the written entity's own
 */
export type CompiledTargetGuard =
  | CompiledParentGuard
  | CompiledHasOneGuard
  | CompiledHasManyGuard
  | CompiledHasAndBelongsToManyGuard;

/**
 * A validated, compiled write condition, ready for
 * {@link attachWriteCondition} once the operation knows its targets
 *
 * @property {EntityClass<DynaRecord>} EntityClass - The entity being written
 * @property {ConditionFragment} [self] - The condition on the entity's own row, absent when the condition names none of its attributes
 * @property {CompiledTargetGuard[]} guards - The guards on other rows, in the order the condition lists them
 * @property {boolean} needsStoredRow - Whether a guard targets the parent its stored foreign key references, so attaching needs the entity's stored row
 */
export interface CompiledWriteCondition {
  EntityClass: EntityClass<DynaRecord>;
  self?: ConditionFragment;
  guards: CompiledTargetGuard[];
  needsStoredRow: boolean;
}

/**
 * Properties for {@link attachWriteCondition}
 *
 * @property {CompiledWriteCondition} compiled - The compiled condition
 * @property {string} id - The id of the entity being written
 * @property {TransactWriteBuilder} transactionBuilder - The transaction the condition was compiled with, holding every library item of the write
 * @property {WriteConditionReadEntity} [stored] - The entity's stored row from the earlier read, before the write. Required when {@link CompiledWriteCondition.needsStoredRow}; absent on create
 * @property {WriteConditionReadEntity[]} [related] - The link copies in the entity's own partition from the earlier read, where a HasOne child is found
 */
export interface AttachWriteConditionProps {
  compiled: CompiledWriteCondition;
  id: string;
  transactionBuilder: TransactWriteBuilder;
  stored?: WriteConditionReadEntity;
  related?: readonly WriteConditionReadEntity[];
}

/**
 * Properties for {@link compileJoinTableCondition}
 *
 * @property {string} joinTableName - The join table class's name
 * @property {unknown} condition - The caller's `condition` option, as given
 * @property {TransactWriteBuilder} transactionBuilder - The operation's transaction, which each fragment draws its placeholder prefix from
 */
export interface CompileJoinTableConditionProps {
  joinTableName: string;
  condition: unknown;
  transactionBuilder: TransactWriteBuilder;
}

/**
 * A compiled `target` guard on the entity one join-table foreign key
 * references
 *
 * @property {string} foreignKey - The join table's foreign key property
 */
export interface CompiledJoinTableGuard extends CompiledTargetGuardBase {
  foreignKey: string;
}

/**
 * A validated, compiled join-table condition, ready for
 * {@link attachJoinTableCondition}
 *
 * @property {string} joinTableName - The join table class's name
 * @property {CompiledJoinTableGuard[]} guards - The guards, in the order the condition lists them
 */
export interface CompiledJoinTableCondition {
  joinTableName: string;
  guards: CompiledJoinTableGuard[];
}

/**
 * Properties for {@link attachJoinTableCondition}
 *
 * @property {CompiledJoinTableCondition} compiled - The compiled condition
 * @property {object} keys - The join table's foreign key values, as passed to `JoinTable.create` or `JoinTable.delete`
 * @property {TransactWriteBuilder} transactionBuilder - The transaction the condition was compiled with, holding every library item of the write
 */
export interface AttachJoinTableConditionProps {
  compiled: CompiledJoinTableCondition;
  keys: object;
  transactionBuilder: TransactWriteBuilder;
}

/**
 * A row and the library pin to merge onto it
 */
export interface RowPin {
  row: TransactConditionRow;
  pin: LibraryPin;
}

/**
 * A row and the consumer guard to merge onto it
 */
interface RowGuard {
  row: TransactConditionRow;
  guard: ConsumerGuard;
}

/**
 * Everything one write's condition merges onto its transaction. Pins are
 * merged first, because a guard names the row of the pin it was resolved
 * through
 */
interface ResolvedWriteCondition {
  pins: RowPin[];
  guards: RowGuard[];
  /**
   * A guard whose target the stored state does not hold
   */
  missing: WriteConditionFailedError[];
}

/**
 * Whether a value is an object that can hold condition keys
 * @param value - The value
 * @returns Whether it is a non-null, non-array object
 */
const isConditionObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Asserts that a write condition is an object of condition keys
 * @param condition - The condition as the caller passed it
 * @throws {FilterError} When it is not an object of condition keys
 */
function assertConditionObject(
  condition: unknown
): asserts condition is Record<string, unknown> {
  if (!isConditionObject(condition)) {
    throw new FilterError(
      "Invalid write condition: the condition must be an object of condition keys"
    );
  }
}

/**
 * Reads one attribute of an object
 * @param source - The object
 * @param key - The attribute name
 * @returns The attribute's value, or undefined when it has none
 */
const readAttribute = (source: object, key: string): unknown =>
  key in source ? Reflect.get(source, key) : undefined;

/**
 * Hands a validated condition to the filter builder.
 *
 * The one assertion in this module: a condition reaches here from an untyped
 * split, and the builder validates every operand at runtime, rejecting a
 * malformed one with a {@link FilterError} naming its attribute
 * @param conditions - Conditions on one row's own attributes
 * @returns The conditions as the builder's input
 */
const toFilterParams = (conditions: Record<string, unknown>): FilterParams =>
  conditions as FilterParams;

/**
 * Builds the attribute resolver a write condition on an entity's row compiles
 * with: the entity's own attributes, except `type` and the table keys, which a
 * write already fixes
 * @param Target - The entity whose row the condition is evaluated against
 * @returns The resolver, which throws a {@link FilterError} for any other key
 */
const writeConditionAttributeResolver = (
  Target: EntityClass<DynaRecord>
): FilterAttributeResolver => {
  const attributes = Metadata.getEntityAttributes(Target.name);
  const tableMeta = Metadata.getEntityTable(Target.name);
  const fixedKeys = new Set([
    tableMeta.defaultAttributes.type.name,
    tableMeta.partitionKeyAttribute.name,
    tableMeta.sortKeyAttribute.name
  ]);

  return (attributeKey, filterKey) => {
    if (fixedKeys.has(attributeKey)) {
      throw new FilterError(
        `Invalid write condition key "${filterKey}": "${attributeKey}" is fixed by the write itself, so a condition on ${Target.name} cannot name it`
      );
    }

    if (!Object.hasOwn(attributes, attributeKey)) {
      throw new FilterError(
        `Invalid write condition key "${filterKey}": attribute "${attributeKey}" does not exist on ${Target.name}. ` +
          `Valid attributes are: ${Object.keys(attributes)
            .filter(name => !fixedKeys.has(name))
            .join(", ")}`
      );
    }

    return attributes[attributeKey];
  };
};

/**
 * Compiles conditions on one entity's own row
 * @param Target - The entity whose row the conditions are evaluated against
 * @param conditions - The conditions
 * @param prefix - The value placeholder prefix of this fragment
 * @returns The compiled fragment, attaching only non-empty maps
 */
const compileFragment = (
  Target: EntityClass<DynaRecord>,
  conditions: Record<string, unknown>,
  prefix: string
): ConditionFragment => {
  const builder = new FilterExpressionBuilder({
    capabilities: writeConditionCapabilities,
    resolveAttribute: writeConditionAttributeResolver(Target),
    valuePlaceholderPrefix: prefix
  });
  const params = toFilterParams(conditions);

  const { expression, values } = builder.filterParams(params);
  const names = builder.expressionAttributeNames([], params);
  const attributeValues = builder.expressionAttributeValues(values);

  return {
    ConditionExpression: expression,
    ...(Object.keys(names).length > 0 && { ExpressionAttributeNames: names }),
    ...(Object.keys(attributeValues).length > 0 && {
      ExpressionAttributeValues: attributeValues
    })
  };
};

/**
 * Describes where a condition on another entity's row sits in the caller's
 * condition, for an error message
 * @param guard - The guard the condition belongs to
 * @returns The location (EX: `"customer"`, `"orders" entry "o1"`, `"organizationId" target`)
 */
const describeConditionLocation = (
  guard: TargetWriteConditionGuard
): string => {
  if (guard.kind === "foreignKey") return `"${guard.name}" target`;
  return guard.id === undefined
    ? `"${guard.name}"`
    : `"${guard.name}" entry "${guard.id}"`;
};

/**
 * Compiles a condition on a related entity's row. The guard requires the row
 * to exist whatever it says, so `null` as "not set" can never pass on a
 * missing row and an empty condition is a guard that the row exists
 * @param Target - The related entity
 * @param conditions - The condition on its row
 * @param guard - The guard the condition belongs to, which a rejection names
 * @param transactionBuilder - The transaction, for the placeholder prefix
 * @returns The compiled fragment
 * @throws {FilterError} When the filter builder rejects the condition: its error, prefixed with where the condition sits, which the builder never sees, and kept as the `cause`
 */
const compileTargetFragment = (
  Target: EntityClass<DynaRecord>,
  conditions: Record<string, unknown>,
  guard: TargetWriteConditionGuard,
  transactionBuilder: TransactWriteBuilder
): ConditionFragment => {
  const prefix = transactionBuilder.nextPlaceholderPrefix();
  const { alias: partitionKeyAlias } = Metadata.getEntityTable(
    Target.name
  ).partitionKeyAttribute;
  const exists = `attribute_exists(${partitionKeyAlias})`;

  if (Object.keys(conditions).length === 0) {
    return { ConditionExpression: exists };
  }

  let fragment: ConditionFragment;
  try {
    fragment = compileFragment(Target, conditions, prefix);
  } catch (error) {
    if (!(error instanceof FilterError)) throw error;
    throw new FilterError(
      `Invalid write condition for ${describeConditionLocation(guard)}: ${error.message}`,
      { cause: error }
    );
  }
  return {
    ...fragment,
    ConditionExpression: `${exists} AND ${parenthesize(fragment.ConditionExpression)}`
  };
};

/**
 * Returns a relationship or `target` condition, which must be an object
 * @param key - The condition key, for the error
 * @param value - The value under the key
 * @returns The condition
 */
const targetConditionOf = (
  key: string,
  value: unknown
): Record<string, unknown> => {
  if (!isConditionObject(value)) {
    throw new FilterError(
      `Invalid write condition for "${key}": a guard on a related row takes a condition object on that row (an empty object requires only that it exists)`
    );
  }
  return value;
};

/**
 * Returns the `target` condition of a foreign-key guard, which holds nothing
 * else: a condition on the key's own value belongs in a `$or` branch
 * @param key - The foreign key property
 * @param value - The guard
 * @returns The `target` condition
 */
const foreignKeyTargetOf = (
  key: string,
  value: Record<string, unknown>
): Record<string, unknown> => {
  const otherKeys = Object.keys(value).filter(name => name !== "target");
  if (otherKeys.length > 0) {
    throw new FilterError(
      `Invalid write condition for "${key}": a foreign key holds either a condition on its own value or a target guard, never both (found ${otherKeys.join(", ")} beside target). Put the value condition in a $or branch`
    );
  }
  return targetConditionOf(key, value.target);
};

/**
 * Whether a condition value is a `target` guard
 * @param value - The value under a foreign key
 * @returns Whether it is an object holding `target`
 */
const isTargetGuard = (value: unknown): value is Record<string, unknown> =>
  isConditionObject(value) && Object.hasOwn(value, "target");

/**
 * Validates the `{ id, condition }` entries of a HasMany or HasAndBelongsToMany
 * guard, rejecting an id named twice
 * @param key - The relationship property
 * @param value - The entries
 * @returns The entries
 */
const relatedEntriesOf = (
  key: string,
  value: unknown
): Array<{ id: string; condition: Record<string, unknown> }> => {
  if (!Array.isArray(value)) {
    throw new FilterError(
      `Invalid write condition for "${key}": a HasMany or HasAndBelongsToMany guard takes an array of { id, condition } entries`
    );
  }

  const ids = new Set<string>();
  return value.map((entry: unknown) => {
    const id = isConditionObject(entry) ? entry.id : undefined;
    const condition = isConditionObject(entry) ? entry.condition : undefined;
    const isWellFormed =
      isConditionObject(entry) &&
      Object.keys(entry).every(name => name === "id" || name === "condition") &&
      isString(id) &&
      id !== "" &&
      isConditionObject(condition);

    if (!isWellFormed) {
      throw new FilterError(
        `Invalid write condition for "${key}": each entry is { id, condition }, with a non-empty string id and a condition object`
      );
    }

    if (ids.has(id)) {
      throw new FilterError(
        `Invalid write condition for "${key}": id "${id}" is guarded twice. Combine its conditions into one entry`
      );
    }
    ids.add(id);

    return { id, condition };
  });
};

/**
 * Validates the foreign key a parent guard targets against the payload: a
 * create must set it, to a row other than its own new one, and an update may
 * not clear it, or the guard could never hold
 * @param props - The compile props
 * @param target - The entity the foreign key references
 * @param key - The condition key, for the error
 * @param foreignKey - The foreign key attribute
 * @returns The foreign key value the payload sets, if any
 */
const payloadForeignKeyOf = (
  props: CompileWriteConditionProps,
  target: EntityClass<DynaRecord>,
  key: string,
  foreignKey: string
): string | undefined => {
  const { EntityClass, payload } = props;
  const value =
    payload === undefined ? undefined : readAttribute(payload, foreignKey);

  if (props.operation === "create" && !isString(value)) {
    throw new FilterError(
      `Invalid write condition for "${key}": the create does not set "${foreignKey}", so there is no row for the guard to check`
    );
  }

  // Only an id the caller supplies can name the new row: a generated one is new
  const { idField } = Metadata.getEntity(EntityClass.name);
  if (
    props.operation === "create" &&
    target === EntityClass &&
    idField !== undefined &&
    payload !== undefined &&
    value === readAttribute(payload, idField)
  ) {
    throw new FilterError(
      `Invalid write condition for "${key}": the create sets "${foreignKey}" to the new entity's own id, so the guard would check the entity's own row, which must not exist yet`
    );
  }

  if (value === null) {
    throw new FilterError(
      `Invalid write condition for "${key}": the same update clears "${foreignKey}", so there is no row for the guard to check`
    );
  }

  return isString(value) ? value : undefined;
};

/**
 * Compiles the guards one relationship key holds
 * @param props - The compile props
 * @param relationship - The relationship the key names
 * @param key - The relationship property
 * @param value - The value under the key
 * @returns The compiled guards; none for an empty array
 */
const compileRelationshipGuards = (
  props: CompileWriteConditionProps,
  relationship: RelationshipMetadata,
  key: string,
  value: unknown
): CompiledTargetGuard[] => {
  const { transactionBuilder } = props;
  const target = relationship.target;

  if (props.operation === "create" && !isBelongsToRelationship(relationship)) {
    throw new FilterError(
      `Invalid write condition key "${key}": a create guards only its BelongsTo relationships, because a new entity has no children or link partners yet`
    );
  }

  if (isBelongsToRelationship(relationship)) {
    const condition = targetConditionOf(key, value);
    const foreignKey = relationship.foreignKey;
    const payloadForeignKey = payloadForeignKeyOf(
      props,
      target,
      key,
      foreignKey
    );
    const guard: TargetWriteConditionGuard = {
      kind: "relationship",
      name: key
    };
    return [
      {
        kind: "parent",
        guard,
        target,
        foreignKey,
        ...(payloadForeignKey !== undefined && { payloadForeignKey }),
        condition: compileTargetFragment(
          target,
          condition,
          guard,
          transactionBuilder
        )
      }
    ];
  }

  if (isHasOneRelationship(relationship)) {
    const condition = targetConditionOf(key, value);
    const guard: TargetWriteConditionGuard = {
      kind: "relationship",
      name: key
    };
    return [
      {
        kind: "hasOne",
        guard,
        target,
        foreignKey: relationship.foreignKey,
        condition: compileTargetFragment(
          target,
          condition,
          guard,
          transactionBuilder
        )
      }
    ];
  }

  const entries = relatedEntriesOf(key, value);

  if (isHasManyRelationship(relationship)) {
    return entries.map(({ id, condition }) => {
      const guard: TargetWriteConditionGuard = {
        kind: "relationship",
        name: key,
        id
      };
      return {
        kind: "hasMany",
        guard,
        target,
        id,
        foreignKey: relationship.foreignKey,
        condition: compileTargetFragment(
          target,
          condition,
          guard,
          transactionBuilder
        )
      };
    });
  }

  return entries.map(({ id, condition }) => {
    const guard: TargetWriteConditionGuard = {
      kind: "relationship",
      name: key,
      id
    };
    return {
      kind: "hasAndBelongsToMany",
      guard,
      target,
      id,
      condition: compileTargetFragment(
        target,
        condition,
        guard,
        transactionBuilder
      )
    };
  });
};

/**
 * Compiles a `target` guard on the parent a foreign key references. A foreign
 * key backing a BelongsTo is guarded under the relationship instead, so one
 * parent row is never reachable by two keys
 * @param props - The compile props
 * @param entityMeta - The written entity's metadata
 * @param target - The entity the foreign key references
 * @param key - The foreign key property
 * @param value - The guard
 * @returns The compiled guard
 */
const compileForeignKeyGuard = (
  props: CompileWriteConditionProps,
  entityMeta: EntityMetadata,
  target: EntityClass<DynaRecord>,
  key: string,
  value: Record<string, unknown>
): CompiledParentGuard => {
  const condition = foreignKeyTargetOf(key, value);

  const belongsTo = entityMeta.belongsToRelationships.find(
    relationship => relationship.foreignKey === key
  );
  if (belongsTo !== undefined) {
    throw new FilterError(
      `Invalid write condition for "${key}": this foreign key backs the BelongsTo relationship "${belongsTo.propertyName}". Guard the row it references under "${belongsTo.propertyName}" instead`
    );
  }

  const payloadForeignKey = payloadForeignKeyOf(props, target, key, key);
  const guard: TargetWriteConditionGuard = { kind: "foreignKey", name: key };
  return {
    kind: "parent",
    guard,
    target,
    foreignKey: key,
    ...(payloadForeignKey !== undefined && { payloadForeignKey }),
    condition: compileTargetFragment(
      target,
      condition,
      guard,
      props.transactionBuilder
    )
  };
};

/**
 * Rejects a relationship named inside a `$or` branch: DynamoDB evaluates a
 * condition against one row, so OR never spans rows. Anything else in a
 * branch is left to the filter builder
 * @param entityMeta - The written entity's metadata
 * @param branches - The `$or` value
 */
const assertSelfOnlyBranches = (
  entityMeta: EntityMetadata,
  branches: unknown
): void => {
  if (!Array.isArray(branches)) return;

  for (const branch of branches) {
    if (!isConditionObject(branch)) continue;

    const relationshipKey = Object.keys(branch).find(key => {
      const relationship = entityMeta.relationships[key];
      return (
        Object.hasOwn(entityMeta.relationships, key) &&
        !isOwnedByRelationship(relationship)
      );
    });

    if (relationshipKey !== undefined) {
      throw new FilterError(
        `Invalid write condition key "${relationshipKey}" inside $or: a $or branch names the entity's own attributes only, because OR never spans rows. Guard the relationship at the top level of the condition`
      );
    }
  }
};

/**
 * Validates and compiles a write condition, before the operation reads or
 * writes anything.
 *
 * The condition's keys are split by the entity's metadata:
 * - its own attributes, dot paths into them and `$or`, compiled into one
 *   fragment for its own row (not accepted on create)
 * - its relationships by property name: a BelongsTo or HasOne takes a
 *   condition on the related row, a HasMany or HasAndBelongsToMany takes
 *   `{ id, condition }` entries (only a BelongsTo on create)
 * - a foreign key that backs no BelongsTo — the child side of a
 *   uni-directional HasMany, or a standalone foreign key — holding a `target`
 *   guard on the parent it references
 *
 * Each fragment compiles with its own placeholder prefix from the operation's
 * transaction.
 * @param props - The condition, the entity and the write it guards
 * @returns The compiled condition
 * @throws {FilterError} When the condition names an unknown or fixed key, a relationship inside `$or`, a key the operation does not accept, a target guard on a BelongsTo's foreign key, a value condition beside a target, an id twice, a guard the payload rules out, or a malformed shape
 */
export const compileWriteCondition = (
  props: CompileWriteConditionProps
): CompiledWriteCondition => {
  const { EntityClass, operation, transactionBuilder } = props;
  const { condition } = props;
  assertConditionObject(condition);

  const entityMeta = Metadata.getEntity(EntityClass.name);
  const selfConditions: Record<string, unknown> = {};
  const guards: CompiledTargetGuard[] = [];

  for (const [key, value] of Object.entries(condition)) {
    const relationship = Object.hasOwn(entityMeta.relationships, key)
      ? entityMeta.relationships[key]
      : undefined;
    const attribute = Object.hasOwn(entityMeta.attributes, key)
      ? entityMeta.attributes[key]
      : undefined;
    // A dot path (`"details.sku"`, `"details.audit[0].at"`) names a field of
    // the attribute its first segment names. The filter builder splits it the
    // same way, then resolves and validates the rest
    const isOwnAttributePath = Object.hasOwn(
      entityMeta.attributes,
      key.split(".")[0]
    );

    if (relationship !== undefined && !isOwnedByRelationship(relationship)) {
      guards.push(
        ...compileRelationshipGuards(props, relationship, key, value)
      );
    } else if (
      attribute !== undefined &&
      isForeignKeyAttributeMetadata(attribute) &&
      isTargetGuard(value)
    ) {
      guards.push(
        compileForeignKeyGuard(
          props,
          entityMeta,
          attribute.foreignKeyTarget,
          key,
          value
        )
      );
    } else if (key === "$or" || isOwnAttributePath) {
      if (key === "$or") assertSelfOnlyBranches(entityMeta, value);
      selfConditions[key] = value;
    } else {
      throw new FilterError(
        `Invalid write condition key "${key}": it is not an attribute, relationship or foreign key of ${EntityClass.name}`
      );
    }
  }

  const selfKeys = Object.keys(selfConditions);
  if (operation === "create" && selfKeys.length > 0) {
    throw new FilterError(
      `Invalid write condition key "${selfKeys[0]}": a create takes no condition on the entity's own row, which must not exist yet. Guard its BelongsTo relationships or foreign keys instead`
    );
  }

  return {
    EntityClass,
    ...(selfKeys.length > 0 && {
      self: compileFragment(
        EntityClass,
        selfConditions,
        transactionBuilder.nextPlaceholderPrefix()
      )
    }),
    guards,
    needsStoredRow:
      operation !== "create" &&
      guards.some(
        guard =>
          guard.kind === "parent" && guard.payloadForeignKey === undefined
      )
  };
};

/**
 * Builds the row key of an entity's own row, under the table's key aliases
 * @param Target - The entity
 * @param id - Its id
 * @returns The table name and key
 */
const entityRowKey = (
  Target: EntityClass<DynaRecord>,
  id: string
): Omit<TransactConditionRow, "missingRowMessage"> => {
  const tableMeta = Metadata.getEntityTable(Target.name);
  return {
    TableName: tableMeta.name,
    Key: {
      [tableMeta.partitionKeyAttribute.alias]: Target.partitionKeyValue(id),
      [tableMeta.sortKeyAttribute.alias]: Target.name
    }
  };
};

/**
 * An entity's own row, reported as not found when it is missing
 * @param Target - The entity
 * @param id - Its id
 * @returns The row
 */
export const existingEntityRow = (
  Target: EntityClass<DynaRecord>,
  id: string
): TransactConditionRow => ({
  ...entityRowKey(Target, id),
  missingRowMessage: `${Target.name} with ID '${id}' does not exist`
});

/**
 * Describes a guard on another entity's row for an error message
 * @param guard - The guard
 * @returns The description (EX: `relationship 'customer'`)
 */
const describeGuard = (guard: TargetWriteConditionGuard): string =>
  `${guard.kind === "relationship" ? "relationship" : "foreign key"} '${guard.name}'`;

/**
 * Resolves one compiled guard's rows and pins
 * @param props - The attach props
 * @param guard - The compiled guard
 * @param resolved - The resolution so far, added to
 */
const resolveTargetGuard = (
  props: AttachWriteConditionProps,
  guard: CompiledTargetGuard,
  resolved: ResolvedWriteCondition
): void => {
  const { EntityClass } = props.compiled;
  const { id } = props;
  const consumerGuard = {
    entity: EntityClass.name,
    id,
    guard: guard.guard,
    condition: guard.condition
  };
  const missing = (): void => {
    resolved.missing.push(
      new WriteConditionFailedError(
        `Write condition failed on ${EntityClass.name} with ID '${id}': ${describeGuard(guard.guard)} references no ${guard.target.name}`,
        { entity: EntityClass.name, id, guards: [guard.guard] }
      )
    );
  };

  switch (guard.kind) {
    case "parent": {
      const selfRow = existingEntityRow(EntityClass, id);
      const storedForeignKey =
        props.stored === undefined
          ? undefined
          : readAttribute(props.stored, guard.foreignKey);
      const targetsPayload =
        guard.payloadForeignKey !== undefined &&
        guard.payloadForeignKey !== storedForeignKey;

      if (!targetsPayload && props.stored === undefined) {
        throw new Error(
          `The write condition guard on ${describeGuard(guard.guard)} of ${EntityClass.name} targets its stored parent, but no stored row was given`
        );
      }

      const targetId = targetsPayload
        ? guard.payloadForeignKey
        : storedForeignKey;
      if (!isString(targetId)) {
        missing();
        return;
      }

      if (!targetsPayload) {
        const { alias } = Metadata.getEntityAttributes(EntityClass.name)[
          guard.foreignKey
        ];
        resolved.pins.push({
          row: selfRow,
          pin: {
            attribute: alias,
            value: targetId,
            failureMessage: `${EntityClass.name} with ID '${id}' no longer references ${guard.target.name} with ID '${targetId}': its foreign key '${guard.foreignKey}' was changed by a concurrent write`
          }
        });
      }

      resolved.guards.push({
        row: existingEntityRow(guard.target, targetId),
        guard: {
          ...consumerGuard,
          ...(!targetsPayload && {
            pinnedBy: { TableName: selfRow.TableName, Key: selfRow.Key }
          })
        }
      });
      return;
    }

    case "hasOne":
    case "hasMany": {
      const childId =
        guard.kind === "hasMany"
          ? guard.id
          : props.related
              ?.filter(
                entity =>
                  readAttribute(entity, "type") === guard.target.name &&
                  readAttribute(entity, guard.foreignKey) === id
              )
              .map(entity => readAttribute(entity, "id"))
              .find(isString);

      if (childId === undefined) {
        missing();
        return;
      }

      const notAssociated = `${guard.target.name} with ID '${childId}' is not associated with ${EntityClass.name} with ID '${id}' through '${guard.guard.name}'`;
      // A self-referential child named by the entity's own id is the entity's
      // own row, which is reported as not-found when it is missing
      const isOwnRow = guard.target === EntityClass && childId === id;
      const childRow = isOwnRow
        ? existingEntityRow(EntityClass, id)
        : {
            ...entityRowKey(guard.target, childId),
            missingRowMessage: notAssociated
          };
      const { alias } = Metadata.getEntityAttributes(guard.target.name)[
        guard.foreignKey
      ];

      resolved.pins.push({
        row: childRow,
        pin: { attribute: alias, value: id, failureMessage: notAssociated }
      });
      resolved.guards.push({ row: childRow, guard: consumerGuard });
      return;
    }

    case "hasAndBelongsToMany": {
      const tableMeta = Metadata.getEntityTable(EntityClass.name);
      const notLinked = `${guard.target.name} with ID '${guard.id}' is not linked to ${EntityClass.name} with ID '${id}' through '${guard.guard.name}'`;
      // The link row in the partner's partition holds this entity's copy
      const linkRow = {
        TableName: tableMeta.name,
        Key: {
          [tableMeta.partitionKeyAttribute.alias]:
            guard.target.partitionKeyValue(guard.id),
          [tableMeta.sortKeyAttribute.alias]: EntityClass.partitionKeyValue(id)
        },
        missingRowMessage: notLinked
      };

      resolved.pins.push({
        row: linkRow,
        pin: {
          attribute: tableMeta.defaultAttributes.id.alias,
          value: id,
          failureMessage: notLinked
        }
      });
      resolved.guards.push({
        row: existingEntityRow(guard.target, guard.id),
        guard: {
          ...consumerGuard,
          pinnedBy: { TableName: linkRow.TableName, Key: linkRow.Key }
        }
      });
    }
  }
};

/**
 * Merges resolved pins, then guards, onto the transaction
 * @param transactionBuilder - The transaction
 * @param resolved - The resolution
 * @throws {TransactionWriteFailedError} When a guard's target is missing from stored state, wrapping a {@link WriteConditionFailedError} for each, before anything is merged or sent
 */
const mergeResolved = (
  transactionBuilder: TransactWriteBuilder,
  resolved: ResolvedWriteCondition
): void => {
  if (resolved.missing.length > 0) {
    throw new TransactionWriteFailedError(
      resolved.missing,
      "Failed Validations"
    );
  }

  resolved.pins.forEach(({ row, pin }) => {
    transactionBuilder.addPin(row, pin);
  });
  resolved.guards.forEach(({ row, guard }) => {
    transactionBuilder.addGuard(row, guard);
  });
};

/**
 * Resolves each compiled guard's row from the operation's earlier read and
 * merges the guards and their library pins onto the transaction.
 *
 * Call after every library item of the write is queued. A parent guard
 * targets the parent the payload sets when it changes the foreign key, and
 * otherwise the stored parent, pinning the stored foreign key on the entity's
 * own row so a concurrent change fails the write instead of checking the
 * wrong row. A HasOne child is found among the earlier read's link copies; a
 * HasOne or HasMany child's row is pinned to reference this entity, and a
 * HasAndBelongsToMany partner's link row must exist.
 * @param props - The compiled condition and the operation's read state
 * @throws {TransactionWriteFailedError} Before anything is sent, when the stored state holds no target for a guard: a null or absent foreign key, or no HasOne child
 */
export const attachWriteCondition = (
  props: AttachWriteConditionProps
): void => {
  const { compiled, id } = props;
  const resolved: ResolvedWriteCondition = {
    pins: [],
    guards: [],
    missing: []
  };

  if (compiled.self !== undefined) {
    resolved.guards.push({
      row: existingEntityRow(compiled.EntityClass, id),
      guard: {
        entity: compiled.EntityClass.name,
        id,
        guard: { kind: "self" },
        condition: compiled.self
      }
    });
  }

  compiled.guards.forEach(guard => {
    resolveTargetGuard(props, guard, resolved);
  });

  mergeResolved(props.transactionBuilder, resolved);
};

/**
 * Returns the entity each foreign key of a join table references.
 *
 * Each side's HasAndBelongsToMany registers its *target* with its *own*
 * foreign key, so one metadata entry pairs an entity with the other side's
 * key: a foreign key references the entity on the other entry
 * @param joinTableName - The join table class's name
 * @returns The referenced entity, by foreign key property
 */
const joinTableTargets = (
  joinTableName: string
): Map<string, EntityClass<DynaRecord>> => {
  const [first, second] = Metadata.getJoinTable(joinTableName);
  return new Map([
    [String(first.foreignKey), second.entity],
    [String(second.foreignKey), first.entity]
  ]);
};

/**
 * Validates and compiles a join-table condition, before the operation reads
 * or writes anything. Each key is a join-table foreign key holding a `target`
 * guard on the entity it references.
 * @param props - The condition and the join table
 * @returns The compiled condition
 * @throws {FilterError} When a key is not a foreign key of the join table, holds anything but a `target` condition object, or the target condition is invalid
 */
export const compileJoinTableCondition = (
  props: CompileJoinTableConditionProps
): CompiledJoinTableCondition => {
  const { condition } = props;
  assertConditionObject(condition);

  const targets = joinTableTargets(props.joinTableName);

  const guards = Object.entries(condition).map(([key, value]) => {
    const target = targets.get(key);
    if (target === undefined) {
      throw new FilterError(
        `Invalid write condition key "${key}": it is not a foreign key of ${props.joinTableName}. Valid keys are: ${[...targets.keys()].join(", ")}`
      );
    }
    if (!isTargetGuard(value)) {
      throw new FilterError(
        `Invalid write condition for "${key}": a join-table foreign key takes a target guard, { target: condition }, on the entity it references`
      );
    }

    const guard: TargetWriteConditionGuard = { kind: "foreignKey", name: key };
    return {
      foreignKey: key,
      guard,
      target,
      condition: compileTargetFragment(
        target,
        foreignKeyTargetOf(key, value),
        guard,
        props.transactionBuilder
      )
    };
  });

  return { joinTableName: props.joinTableName, guards };
};

/**
 * Merges a compiled join-table condition's guards onto the rows of the
 * entities the keys reference. Call after every library item of the write is
 * queued. A failed guard names the join table and its key values as the write.
 * @param props - The compiled condition and the join table's keys
 * @throws {FilterError} When a guarded foreign key's value is not a string
 */
export const attachJoinTableCondition = (
  props: AttachJoinTableConditionProps
): void => {
  const { compiled, keys } = props;
  const writeId = [...joinTableTargets(compiled.joinTableName).keys()]
    .sort()
    .map(
      foreignKey => `${foreignKey}=${String(readAttribute(keys, foreignKey))}`
    )
    .join(", ");

  const guards = compiled.guards.map(guard => {
    const targetId = readAttribute(keys, guard.foreignKey);
    if (!isString(targetId)) {
      throw new FilterError(
        `Invalid write condition for "${guard.foreignKey}": the join table key "${guard.foreignKey}" has no id to guard`
      );
    }

    return {
      row: {
        ...entityRowKey(guard.target, targetId),
        missingRowMessage: `${guard.target.name} with ID '${targetId}' does not exist`
      },
      guard: {
        entity: compiled.joinTableName,
        id: writeId,
        guard: guard.guard,
        condition: guard.condition
      }
    };
  });

  mergeResolved(props.transactionBuilder, { pins: [], guards, missing: [] });
};
