## 0.6.0 - 2026-03-17

### Breaking

- **`@Entity` requires `declare readonly type`:** All entity classes must now declare their `type` property as a string literal matching the class name (e.g., `declare readonly type: "Order"`). This is a pure type annotation with zero runtime impact — the ORM continues to set `type` automatically. Entities missing this declaration will produce a compile error at the `@Entity` decorator. This change enables compile-time type safety for query filters and return types.
- **Typed query filters:** The `query` method's `filter` option now validates filter keys at compile time. Only attributes that exist on entities in the queried partition are accepted. Invalid keys, relationship property names, and partition/sort key attributes produce compile errors. Existing code that passes arbitrary string keys in filters will need to be updated. Filter values remain untyped (`FilterTypes` / `any` from AWS SDK's `NativeAttributeValue`).
- **Typed `type` filter field:** The `type` field in query filters now only accepts valid entity class names from the partition. Previously any string was accepted. Code that filters by `type` with values that are not entity class names (e.g., `type: ["Beer", "Brewery"]`) must be updated to use valid entity names.

### Added

- **Strongly-typed query filters:** Query filter keys are validated against the attributes of all entities in the queried partition. This includes entity-defined attributes, default fields (`id`, `createdAt`, `updatedAt`), `ForeignKey` and `NullableForeignKey` attributes, and dot-path keys for `@ObjectAttribute` nested fields (e.g., `"address.city"`, `"address.geo.lat"`).
- **`type` field narrowing:** When filtering by `type` with a single entity name (e.g., `type: "Order"`), filter keys in `$or` elements are narrowed to only that entity's attributes. When `type` is an array (IN operator), all partition entity attributes are accepted.
- **Return type narrowing:** When the filter specifies a `type` value, the return type is automatically narrowed from the full `QueryResults<T>` union to only the matching entity types:
  - `type: "Order"` → `Array<EntityAttributesInstance<Order>>`
  - `type: ["Order", "PaymentMethod"]` → `Array<EntityAttributesInstance<Order> | EntityAttributesInstance<PaymentMethod>>`
  - No `type` specified → `QueryResults<T>` (full union)
- **Sort key condition return type narrowing:** When `skCondition` is an exact string matching an entity class name (e.g., `skCondition: "Order"`), the return type narrows to that entity type.
- **New utility types:** `DotPathKeys<T>`, `ObjectDotPaths<T>`, `EntityFilterableKeys<T>`, `NonRecursiveLeaf`, `PartitionEntities<T>`, `PartitionEntityNames<T>`, `TypedAndFilter<T>`, `TypedFilterParams<T>`, `NarrowedQueryResults<T, F>`, `InferQueryResults<T, F, SK>`, and supporting types for filter validation and return type inference.
- **`IsAny<T>` utility type:** General-purpose type-level `any` detection, exported from `src/types.ts`.

### Changed

- **`@Entity` decorator is now generic:** Uses a conditional intersection type to enforce the `declare readonly type` requirement at compile time. Runtime behavior is unchanged.
- **`OptionsWithoutIndex` is now generic:** Accepts a type parameter `T extends DynaRecord` to scope the `filter` property to `TypedFilterParams<T>`. Defaults to `DynaRecord` for backward compatibility in generic contexts.
- **`DotPathKeys<T>` has a depth limiter:** Recursion stops at 8 levels to prevent "Type instantiation is excessively deep" errors with deeply nested `@ObjectAttribute` schemas.
- **Query method overload updated:** The non-index query overload now uses `const F` and `SK` generic parameters for literal type inference, enabling return type narrowing. The index query overload is unchanged and continues to use untyped `FilterParams`.

## 0.5.3 - 2026-03-09

### Fixed

- **Changelog correction:** Fixed version number in 0.5.2 changelog entry (was incorrectly labeled as 0.6.0).

## 0.5.2 - 2026-03-09

### Changed

- **Zod v4 upgrade:** Upgraded from Zod v3 (`^3.23.8`) to Zod v4 (`^4.3.6`). This is the only dependency change and has no effect on the library's public API or runtime behavior for consumers. All exported types, validation semantics, and error handling remain identical.
- **`z.record()` two-argument form:** Updated all `z.record(schema)` calls in metadata serialization schemas to the required v4 form `z.record(z.string(), schema)`.
- **`.omit()` strict key validation:** Zod v4 throws when `.omit()` receives keys not present in the schema. Added `filterReservedKeys()` in `EntityMetadata` to filter reserved keys to only those present in the entity's attribute schema before calling `.omit()`.
- **`ZodSchema` removed:** Replaced `ZodSchema` type references with `ZodType`, as `ZodSchema` was removed in Zod v4.

### Breaking

- **Validation error issue format:** The `cause` array on `ValidationError` contains Zod issue objects whose shape changed in v4. The `received` field is no longer present, `message` strings use a new format (e.g. `"Invalid input: expected string, received undefined"` instead of `"Required"`), and enum validation errors use `code: "invalid_value"` with a `values` array instead of `code: "invalid_enum_value"` with an `options` array. Code that inspects `ValidationError.cause` issue objects directly will need to be updated.

## 0.5.1 - 2026-03-07

### Changed

- **ESLint 9 migration:** Migrated from ESLint 8 to ESLint 9 with flat config (`eslint.config.mjs`). Removed legacy `.eslintrc.js` and `.eslintignore`. Added `@eslint/js@^9`, `typescript-eslint@^8`, `globals@^16`. Removed `@typescript-eslint/parser@6`, `eslint-config-standard-with-typescript`, `eslint-plugin-import`, `eslint-plugin-n`, `eslint-plugin-promise`.
- **Strict type-checked linting:** Upgraded from `tseslint.configs.strict` to `tseslint.configs.strictTypeChecked` for non-test files, enforcing stricter type-aware lint rules across the codebase.
- **Decorator type safety:** Removed unnecessary `context.kind` runtime checks from all decorator functions — TypeScript's type system already enforces correct decorator placement.
- **Relationship metadata constructors:** Removed unnecessary `if (item !== undefined)` guards from all relationship metadata constructors (BelongsTo, HasOne, HasMany, HasAndBelongsToMany, OwnedBy).
- **Record key existence checks:** Replaced `record[key] !== undefined` patterns with `key in record` for proper type narrowing with `Record<string, X>` types across MetadataStorage, FindById, Update, QueryBuilder, and utility files.
- **Type guard improvements:** Changed relationship type guards in `metadata/utils.ts` to use `in` operator for checking discriminant properties (`foreignKey`, `joinTableName`).
- **`EntityMetadata.idField`:** Made properly optional (`string` → `string?`) to reflect that not all entities have custom ID fields.
- **`extractForeignKeyFromEntity` return type:** Widened to `ForeignKey | null | undefined` to accurately reflect nullable foreign key values at runtime, with corresponding null guards in Create and Update operations.
- **`DynaRecord.query()` overloads:** Combined duplicate overload signatures into a single unified signature.

## 0.5.0 - 2026-03-03

### Changed

- **Partial `@ObjectAttribute` updates:** Updating an `@ObjectAttribute` is now a **partial merge** instead of a full replacement. Only the fields you provide are modified — omitted fields are preserved. Under the hood, dyna-record generates DynamoDB document path expressions (e.g., `SET #address.#street = :address_street`) instead of replacing the entire map. Nested objects are recursively merged. Arrays within objects are still full replacement. Setting a nullable field within an object to `null` generates a `REMOVE` expression for that specific field.
- **Object attributes are never nullable:** `@ObjectAttribute` fields no longer support `nullable: true`. DynamoDB cannot update nested document paths (e.g., `address.geo.lat`) if the parent object does not exist, causing a `ValidationException`. To prevent this, object attributes always exist as at least `{}`. Nested `"object"` fields within schemas are also never nullable. Non-object fields (primitives, enums, dates, arrays) can still be nullable.
- **Update types for `@ObjectAttribute`:** All fields within object attributes are now optional (`Partial<>`) in update payloads, matching the partial update semantics. This is a compile-time change — you no longer need to provide all required fields when updating a subset of an object attribute.
- **Update validation for `@ObjectAttribute`:** The Zod schema used for update validation is now a deep partial schema for object attributes. All fields are optional (can be omitted), but type validation still applies for provided fields. Non-nullable fields still reject `null`.
- **Instance `update` deep merge:** The instance `update` method now deep merges object attributes, preserving existing fields not included in the partial update. Previously, `Object.assign` would shallow-replace the entire object attribute value.

## 0.4.11 - 2026-03-02

### Added

- **`"date"` field type for `@ObjectAttribute`:** Define date fields within object schemas using `{ type: "date" }`. Dates are stored as ISO 8601 strings in DynamoDB and exposed as JavaScript `Date` objects on entities, mirroring `@DateAttribute` behavior. Supports `nullable: true` for optional date fields. Works at any nesting level — top-level, inside nested objects, or as array items.
- **Object attribute serialization:** `@ObjectAttribute` now registers `toTableAttribute` and `toEntityAttribute` serializers. These handle date conversion to/from ISO strings and strip `null`/`undefined` values for nullable fields, ensuring removed fields are omitted from stored objects rather than persisted as `null` in DynamoDB.

### Changed

- **Nullable field semantics in `@ObjectAttribute`:** Nullable fields (`nullable: true`) now omit the field from the stored object when set to `null` or `undefined`, rather than persisting `null` in DynamoDB. Inferred types for nullable fields changed from `T | null | undefined` to `T | undefined` — use `undefined` to omit a nullable field.
- **Update operation typing for nested object attributes:** `AllowNullForNullable` now recurses into plain object values (e.g. object schema attributes) so that nullable fields at any nesting depth can receive `| null` in update payloads, matching root-level nullable attribute behavior. This allows explicitly passing `null` for nested nullable fields during updates to remove them.

## 0.4.10 - 2026-02-22

### Added

- **`@ObjectAttribute` decorator:** Define structured, typed object attributes on entities. Objects are validated at runtime via Zod and stored as native DynamoDB Map types. Declare schemas using `ObjectSchema` and derive TypeScript types with `InferObjectSchema<typeof schema>`.
  - **Supported field types:** `"string"`, `"number"`, `"boolean"`, `"enum"`, nested `"object"`, and `"array"`
  - **Enum fields:** Use `{ type: "enum", values: ["a", "b"] }` to define string literal union fields with compile-time type inference and runtime validation. Enum fields work at any nesting level — top-level, inside nested objects, or as array items.
  - **Nullable fields:** Individual non-object fields support `nullable: true`. Object attributes and nested object fields are never nullable.
  - **Nested objects and arrays:** Arbitrarily deep nesting via `"object"` with `fields` and `"array"` with `items`, including arrays of objects and nested arrays
- **`$contains` query filter operator:** Filter on List attributes containing a specific element or string attributes containing a substring. Maps to DynamoDB's `contains()` function. Works with both top-level attributes and nested fields via dot-path notation.
- **Dot-path query filtering for nested Map attributes:** Filter on fields within `@ObjectAttribute` using dot notation (e.g., `"address.city"`, `"address.geo.lat"`). All standard filter operators work with dot-paths: equality, `$beginsWith`, `$contains`, and `IN`.

## 0.4.9 - 2026-02-16

### Fixed

- **FindById with HasOne includes now returns class instances with instance methods:** When `findById` was called with `include` for a HasOne association, the included related record was returned as a serialized plain object without instance methods. The included HasOne record is now returned as a class instance (with instance methods such as `update`), aligning with BelongsTo and collection associations. This is a runtime fix.

## 0.4.8 - 2026-02-16

### Fixed

- **FindById include typing for optional single associations:** When an included relationship was optional (single HasOne or BelongsTo that may be undefined), the included property was typed as the full related entity type union `undefined` instead of the serialized attribute type. The result type now correctly uses `EntityAttributesOnly<Related> | undefined` for optional included single associations, matching the serialized shape. Type-only fix; no runtime behavior changed.

## 0.4.7 - 2026-02-16

### Fixed

- **FindById include typing for single associations (HasOne/BelongsTo):** When `findById` was called with `include: [{ association: 'foo' }]` and `foo` was a single related entity (HasOne or BelongsTo), the included property was incorrectly typed as the parent entity’s attributes (`EntityAttributesOnly<Parent>`) instead of the related entity’s attributes. The result type now correctly uses `EntityAttributesOnly<Related>` for included HasOne/BelongsTo associations, so TypeScript infers the related entity’s attributes (e.g. `EntityAttributesOnly<RevenueCache>`) rather than the parent’s. HasMany and optional single associations are unchanged. This is a type-only fix; no runtime behavior changed.

## 0.4.2 - 2026-02-02

### Added

- `DynaRecord.metadata()` static method that returns serialized table metadata containing only serializable values. This method provides a plain object representation of the table metadata, with functions, class instances, and other non-serializable data converted to their string representations or omitted. Useful for introspection, debugging, and generating documentation.

## 0.4.1 - 2025-12-01

### Added

- `referentialIntegrityCheck` option for `Create` and `Update` operations (defaults to `true`). When set to `false`, skips explicit condition checks that verify foreign key references exist before creating or updating entities. This can be beneficial in high-contention or high-throughput systems where the overhead of these checks might impact performance.
- `referentialIntegrityCheck` option for `JoinTable.create()` method, allowing referential integrity checks to be skipped when creating join table entries.

## 0.4.0 - 2025-11-12

### Breaking Changes

- `@ForeignKeyAttribute` now requires a target entity factory (for example `@ForeignKeyAttribute(() => Customer, { alias: "CustomerId" })`). This guarantees that every foreign key knows the entity it references so that referential integrity checks can run even when no relationship decorator is present.
- `Create` and `Update` operations add DynamoDB `ConditionCheck` steps for foreign keys that are not paired with a relationship decorator. This closes the gap where standalone foreign keys could point at non-existent records, ensuring writes fail fast with `ConditionalCheckFailedError` instead of persisting broken references.

### Added

- `EntityMetadata.foreignKeyAttributes` and `EntityMetadata.standaloneForeignKeyAttributes` expose foreign-key metadata with guaranteed targets, giving operations a canonical view of all foreign keys that require integrity enforcement.
- Type guard `isForeignKeyAttributeMetadata` for working with foreign-key attribute metadata.

### Changed

- `BelongsTo` typing now enforces that the decorated relationship target matches the branded `ForeignKey` type, preventing mismatched associations at compile time.
- Standalone foreign-key validation in `Create` and `Update` leverages existing string helpers, removing redundant casting and aligning transaction item ordering.
