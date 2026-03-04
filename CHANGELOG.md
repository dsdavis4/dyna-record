## 0.4.12 - 2026-03-03

### Changed

- **Partial `@ObjectAttribute` updates:** Updating an `@ObjectAttribute` is now a **partial merge** instead of a full replacement. Only the fields you provide are modified — omitted fields are preserved. Under the hood, dyna-record generates DynamoDB document path expressions (e.g., `SET #address.#street = :address_street`) instead of replacing the entire map. Nested objects are recursively merged. Arrays within objects are still full replacement. Setting a nullable field within an object to `null` generates a `REMOVE` expression for that specific field. Setting a nullable object attribute itself to `null` removes the entire object (unchanged behavior).
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
  - **Nullable fields:** Individual fields and the object attribute itself support `nullable: true`
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
