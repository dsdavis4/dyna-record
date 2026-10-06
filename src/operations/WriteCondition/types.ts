import type DynaRecord from "../../DynaRecord.js";
import type { ForeignEntityAttribute } from "../../decorators/types.js";
import type { FilterTypes } from "../../filter-utils/index.js";
import type { ExtractForeignKeyTarget } from "../../types.js";
import type {
  AssertDynaRecord,
  EntityFilterRecord,
  RelationshipProperties,
  TypeAtDotPath
} from "../Query/types.js";
import type { EntityAttributesOnly } from "../types.js";

/**
 * The error surface presented when a `target` guard is written on a foreign
 * key declared without its target type.
 *
 * A bare `ForeignKey` carries no compile-time link to the entity it
 * references, so a guard on it could only be typed against attributes of the
 * wrong entity. Adding the type parameter — `ForeignKey<Customer>` — is a
 * non-breaking change that makes the guard available.
 */
export interface UntypedForeignKeyTargetError {
  __writeConditionError: "declare this foreign key with its target type, ForeignKey<Target> or NullableForeignKey<Target>, to guard the row it references";
}

/**
 * The error surface presented when a `target` guard is written on a foreign
 * key that backs a BelongsTo relationship.
 *
 * The referenced row is guarded under the relationship key instead, so that
 * one parent row is never reachable by two keys.
 *
 * @typeParam Relationship - The relationship key to guard the row under.
 */
export interface BelongsToForeignKeyTargetError<Relationship> {
  __writeConditionError: "this foreign key backs a BelongsTo relationship; guard the row it references under the relationship key";
  relationship: Relationship;
}

/**
 * The error surface presented when a create condition names a single-valued
 * relationship that is not a BelongsTo backed by a typed foreign key.
 *
 * A new entity has no HasOne child yet, so only its parents can be guarded,
 * and a parent is known at compile time only through a foreign key declared
 * with its target type.
 */
export interface CreateRelationshipConditionError {
  __writeConditionError: "create guards only a BelongsTo relationship whose foreign key is declared with its target type, ForeignKey<Target> or NullableForeignKey<Target>";
}

/**
 * Whether a condition key names an attribute, or a field below one, that is
 * declared nullable.
 *
 * Optionality is how the declared type marks a nullable attribute, at the top
 * level and inside an `@ObjectAttribute` schema alike. A dot path is resolved
 * to the field it names; one that names no single field is not nullable.
 *
 * @typeParam T - The entity the key belongs to.
 * @typeParam K - The condition key.
 */
type IsNullableConditionKey<
  T extends DynaRecord,
  K
> = K extends keyof EntityAttributesOnly<T>
  ? undefined extends EntityAttributesOnly<T>[K]
    ? true
    : false
  : K extends string
    ? undefined extends TypeAtDotPath<EntityAttributesOnly<T>, K>
      ? true
      : false
    : false;

/**
 * The conditions one key of a write condition accepts: everything a query
 * filter accepts for it, plus `null` where the attribute is nullable.
 *
 * dyna-record removes a nulled attribute rather than storing it, so in a write
 * condition `null` means "not set" and matches a row where the attribute is
 * absent. On an attribute that cannot be absent it could never match, so it is
 * not offered there.
 *
 * @typeParam T - The entity the key belongs to.
 * @typeParam K - The condition key: an attribute or a dot path below one.
 */
export type WriteConditionValue<
  T extends DynaRecord,
  K extends keyof EntityFilterRecord<T>
> =
  | Exclude<EntityFilterRecord<T>[K], undefined>
  | (IsNullableConditionKey<T, K> extends true ? null : never);

/**
 * A condition on one row's own attributes, without `$or`: the shape of each
 * `$or` branch.
 *
 * The keys are the entity's own attributes and the dot paths below its object
 * attributes, exactly as a query filter offers them for that entity, so `type`,
 * the partition key and the sort key are not among them.
 *
 * @typeParam T - The entity whose row the condition is evaluated against.
 */
type SelfCondition<T extends DynaRecord> = {
  [K in keyof EntityFilterRecord<T>]?: WriteConditionValue<T, K>;
};

/**
 * A condition on a related entity's row, in the full query-filter vocabulary:
 * equality, `IN` arrays, `$beginsWith`, `$contains`, the comparison operators,
 * `$between`, `$or` and dot paths — with `null` meaning "not set" on a nullable
 * attribute.
 *
 * Every guard on another row also requires that row to exist, so an empty
 * condition (`{}`) is a guard that the row exists.
 *
 * @typeParam T - The related entity whose row the condition is evaluated against.
 *
 * @example
 * ```typescript
 * // A Customer named Jane, or any Customer whose name starts with "J"
 * const customer: TargetCondition<Customer> = {
 *   $or: [{ name: "Jane" }, { name: { $beginsWith: "J" } }]
 * };
 * ```
 */
export type TargetCondition<T extends DynaRecord> = SelfCondition<T> & {
  /**
   * Condition blocks combined with OR. Each block is a condition on this same
   * row: DynamoDB evaluates a condition against one item, so OR never spans
   * rows.
   */
  $or?: Array<SelfCondition<T>>;
};

/**
 * A guard on one entity of a HasMany or HasAndBelongsToMany relationship.
 *
 * A many-valued relationship has many possible targets, so the guard names one
 * by id. The write also verifies, in the same transaction, that the id is
 * actually related: a HasMany child's foreign key points at this entity, or the
 * HasAndBelongsToMany link exists.
 *
 * @typeParam T - The related entity.
 *
 * @example
 * ```typescript
 * // Guard one of a Customer's Orders
 * const order: RelatedEntityCondition<Order> = {
 *   id: "order-1",
 *   condition: { total: { $lt: 100 } }
 * };
 * ```
 */
export interface RelatedEntityCondition<T extends DynaRecord> {
  /** The related entity's id. */
  id: string;
  /** The condition its row must meet. */
  condition: TargetCondition<T>;
}

/**
 * A guard on the row a foreign key references, keyed by the foreign key
 * property.
 *
 * The `target` wrapper says the condition applies to the referenced entity's
 * row, not to the foreign key's own value. It is offered on a foreign key
 * declared with its target type, `ForeignKey<Target>` or
 * `NullableForeignKey<Target>`, that does not back a BelongsTo relationship: a
 * join table's foreign keys, the child side of a one-way HasMany, and a
 * standalone foreign key.
 *
 * @typeParam T - The entity the foreign key references.
 *
 * @example
 * ```typescript
 * // PaymentMethod declares customerId: ForeignKey<Customer> and no BelongsTo
 * const condition: WriteCondition<PaymentMethod> = {
 *   customerId: { target: { name: "Jane" } }
 * };
 * ```
 */
export interface ForeignKeyTargetGuard<T extends DynaRecord> {
  /** The condition the referenced row must meet. */
  target: TargetCondition<T>;
}

/**
 * The `target` guard a foreign key referencing `Target` takes, or the error
 * surface for a bare `ForeignKey`, whose target resolves to {@link DynaRecord}
 * itself.
 *
 * @typeParam Target - The entity the foreign key's declared type references.
 */
export type ForeignKeyTargetGuardFor<Target extends DynaRecord> =
  DynaRecord extends Target
    ? { target: UntypedForeignKeyTargetError }
    : ForeignKeyTargetGuard<Target>;

/**
 * Whether two entity types are the same entity. Mutual assignability, not
 * identity, because an entity reached through a relationship and one reached
 * through a foreign key's type parameter are the same class written twice.
 */
type IsSameEntity<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false;

/**
 * The single-valued relationship keys of `T` whose entity is `Target`.
 *
 * @typeParam T - The entity declaring the relationships.
 * @typeParam Target - The related entity to look for.
 */
type SingleRelationshipKeysTo<T extends DynaRecord, Target> = {
  [K in RelationshipProperties<T>]: NonNullable<T[K]> extends readonly unknown[]
    ? never
    : IsSameEntity<NonNullable<T[K]>, Target> extends true
      ? K
      : never;
}[RelationshipProperties<T>];

/**
 * The foreign key attributes of `T`.
 *
 * @typeParam T - The entity declaring the foreign keys.
 */
type ForeignKeyKeys<T extends DynaRecord> = Exclude<
  ForeignEntityAttribute<T>,
  undefined
>;

/**
 * The guard a foreign key of `T` offers under its own property name.
 *
 * A typed foreign key that backs a BelongsTo relationship — the entity also
 * declares a single-valued relationship to the same target — presents an error
 * surface naming that relationship, where its row is guarded instead. Every
 * other foreign key takes {@link ForeignKeyTargetGuardFor}.
 *
 * @typeParam T - The entity declaring the foreign key.
 * @typeParam K - The foreign key property.
 */
type ForeignKeyGuard<T extends DynaRecord, K extends ForeignKeyKeys<T>> =
  AssertDynaRecord<ExtractForeignKeyTarget<T[K]>> extends infer Target extends
    DynaRecord
    ? DynaRecord extends Target
      ? ForeignKeyTargetGuardFor<Target>
      : [SingleRelationshipKeysTo<T, Target>] extends [never]
        ? ForeignKeyTargetGuard<Target>
        : {
            target: BelongsToForeignKeyTargetError<
              SingleRelationshipKeysTo<T, Target>
            >;
          }
    : never;

/**
 * The operator keys of a condition on an attribute's own value, read from
 * {@link FilterTypes} so an operator added there is covered here.
 */
type ConditionOperatorKey = FilterTypes extends infer F
  ? F extends object
    ? Extract<keyof F, `$${string}`>
    : never
  : never;

/**
 * The guard a condition key offers besides a condition on its own value:
 * {@link ForeignKeyGuard} for a foreign key, nothing otherwise.
 *
 * The guard refuses every operator key. An object literal is checked for
 * excess properties against the whole union a key accepts, so without this a
 * `target` written beside `$beginsWith` would satisfy the guard member and be
 * accepted; a key holds a value condition or a guard, never both.
 */
type ForeignKeyGuardForKey<T extends DynaRecord, K> =
  K extends ForeignKeyKeys<T>
    ? ForeignKeyGuard<T, K> & { [Op in ConditionOperatorKey]?: never }
    : never;

/**
 * The relationship keys of a write condition, by relationship property name.
 *
 * A BelongsTo or HasOne has one target, which the library resolves, so it takes
 * a {@link TargetCondition}. A HasMany or HasAndBelongsToMany has many, so it
 * takes {@link RelatedEntityCondition} entries naming each one by id.
 *
 * @typeParam T - The entity declaring the relationships.
 */
type RelationshipConditions<T extends DynaRecord> = {
  [K in RelationshipProperties<T>]?: NonNullable<
    T[K]
  > extends readonly (infer R)[]
    ? Array<RelatedEntityCondition<AssertDynaRecord<R>>>
    : TargetCondition<AssertDynaRecord<NonNullable<T[K]>>>;
};

/**
 * The condition an `update` or `delete` accepts. The write happens only if
 * every part holds, checked in the same transaction as the write.
 *
 * One object holds three kinds of key, mirroring the entity's own shape:
 * - **Its own attributes**, in the full query-filter vocabulary, guarding the
 *   entity's own row. `null` on a nullable attribute means "not set". `$or`
 *   combines blocks of these, and only these: DynamoDB evaluates a condition
 *   against one row, so OR never spans rows.
 * - **Its relationships**, by property name. A BelongsTo or HasOne takes a
 *   {@link TargetCondition} on the related row, which the library resolves. A
 *   HasMany or HasAndBelongsToMany takes {@link RelatedEntityCondition} entries.
 * - **Its foreign keys** that do not back a BelongsTo, which may guard the row
 *   they reference through a {@link ForeignKeyTargetGuard}. Such a key holds
 *   either a condition on its own value or a `target` guard, never both; the
 *   value condition goes in an `$or` branch.
 *
 * @typeParam T - The entity being written.
 *
 * @example
 * ```typescript
 * // Update an Order only while its total is under 100 and its Customer is Jane
 * const condition: WriteCondition<Order> = {
 *   total: { $lt: 100 },
 *   customer: { name: "Jane" }
 * };
 *
 * // Delete a Customer only if one of its Orders predates 2026
 * const guard: WriteCondition<Customer> = {
 *   orders: [{ id: "order-1", condition: { orderDate: { $lt: new Date("2026-01-01") } } }]
 * };
 * ```
 */
export type WriteCondition<T extends DynaRecord> = {
  [K in keyof EntityFilterRecord<T>]?:
    | WriteConditionValue<T, K>
    | ForeignKeyGuardForKey<T, K>;
} & {
  /**
   * Condition blocks on this entity's own row, combined with OR. A block names
   * the entity's own attributes only: OR never spans rows.
   */
  $or?: Array<SelfCondition<T>>;
} & RelationshipConditions<T>;

/**
 * Whether `T` declares a foreign key typed to reference `Target`.
 */
type HasTypedForeignKeyTo<T extends DynaRecord, Target> = true extends {
  [K in ForeignKeyKeys<T>]: IsSameEntity<ExtractForeignKeyTarget<T[K]>, Target>;
}[ForeignKeyKeys<T>]
  ? true
  : false;

/**
 * The single-valued relationship keys of `T`.
 */
type SingleRelationshipKeys<T extends DynaRecord> = {
  [K in RelationshipProperties<T>]: NonNullable<T[K]> extends readonly unknown[]
    ? never
    : K;
}[RelationshipProperties<T>];

/**
 * The guards a `create` offers, before the closing step in
 * {@link CreateCondition}.
 *
 * @typeParam T - The entity being created.
 */
type CreateConditionKeys<T extends DynaRecord> = {
  [K in SingleRelationshipKeys<T>]?: HasTypedForeignKeyTo<
    T,
    NonNullable<T[K]>
  > extends true
    ? TargetCondition<AssertDynaRecord<NonNullable<T[K]>>>
    : CreateRelationshipConditionError;
} & {
  [K in ForeignKeyKeys<T>]?: ForeignKeyGuard<T, K>;
};

/**
 * The condition a `create` accepts: guards on the rows the new entity
 * references. The write happens only if every guard holds, checked in the same
 * transaction as the write.
 *
 * Create already requires the entity's own row to be absent, so a condition on
 * the new row's attributes could never hold, and none is offered. A new entity
 * has no HasOne child, HasMany children or link partners yet, so the keys are
 * limited to:
 * - **BelongsTo relationships** backed by a foreign key declared with its
 *   target type, taking a {@link TargetCondition} on the parent row.
 * - **Other typed foreign keys** — the child side of a one-way HasMany, or a
 *   standalone foreign key — taking a {@link ForeignKeyTargetGuard}.
 *
 * An entity with neither, such as one whose only relationships are HasMany,
 * takes only an empty condition. Its key set would otherwise be the empty
 * object type `{}`, which an object literal is never checked against for
 * excess properties, so any key would be accepted.
 *
 * @typeParam T - The entity being created.
 *
 * @example
 * ```typescript
 * // Create an Order only for a Customer named Jane
 * const condition: CreateCondition<Order> = { customer: { name: "Jane" } };
 * ```
 */
export type CreateCondition<T extends DynaRecord> = [
  keyof CreateConditionKeys<T>
] extends [never]
  ? Record<string, never>
  : CreateConditionKeys<T>;
