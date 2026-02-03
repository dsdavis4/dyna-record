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
