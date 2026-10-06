import * as publicEntry from "../index.js";
import DynaRecord from "../index.js";
import type {
  BelongsToForeignKeyTargetError,
  CreateCondition,
  CreateOperationOptions,
  CreateRelationshipConditionError,
  DeleteOperationOptions,
  ForeignKeyTargetGuard,
  JoinTable,
  JoinTableCondition,
  JoinTableCreateOptions,
  JoinTableDeleteOptions,
  RelatedEntityCondition,
  TargetCondition,
  UntypedForeignKeyTargetError,
  UpdateOperationOptions,
  WriteCondition
} from "../index.js";

/**
 * Every name the entry point resolves at run time, in sort order.
 *
 * `src/index.ts` re-exports four modules with `export *`, so an export added
 * anywhere beneath them reaches consumers without a deliberate decision, and
 * a rename inside those modules silently breaks the package's surface. This
 * list is the deliberate decision: adding to the public API means adding a
 * line here.
 *
 * Type-only exports never appear — they leave nothing behind at run time.
 * Their compile-time contracts are asserted in the suites that own them.
 */
const publicRuntimeExports = [
  "default",
  // Table and entity declaration
  "Table",
  "Entity",
  // Attribute decorators
  "PartitionKeyAttribute",
  "SortKeyAttribute",
  "IdAttribute",
  "StringAttribute",
  "NumberAttribute",
  "BooleanAttribute",
  "DateAttribute",
  "EnumAttribute",
  "ObjectAttribute",
  "ForeignKeyAttribute",
  // Relationship decorators
  "HasMany",
  "HasOne",
  "BelongsTo",
  "HasAndBelongsToMany",
  "JoinTable",
  // Vector search declaration
  "Searchable",
  "SearchFilterable",
  "TitanTextEmbedV2",
  "TitanTextEmbedV2Dim512",
  "TitanTextEmbedV2Dim256",
  "reservedVectorAttributePrefix",
  "isValidVectorAttributeName",
  // Errors a consumer catches
  "NotFoundError",
  "ValidationError",
  "FilterError",
  "EmbeddingError",
  "NullConstraintViolationError",
  "ConditionalCheckFailedError",
  "TransactionWriteFailedError"
];

/**
 * The type-only exports of conditional writes, which a consumer names in their
 * own signatures.
 *
 * They leave nothing at run time, so the list above cannot hold them. Naming
 * each one here is the deliberate decision instead: if one stops being
 * exported from the entry point, this file stops compiling.
 */
type PublicWriteConditionTypes = [
  WriteCondition<DynaRecord>,
  CreateCondition<DynaRecord>,
  TargetCondition<DynaRecord>,
  RelatedEntityCondition<DynaRecord>,
  ForeignKeyTargetGuard<DynaRecord>,
  UntypedForeignKeyTargetError,
  BelongsToForeignKeyTargetError<string>,
  CreateRelationshipConditionError,
  CreateOperationOptions<DynaRecord>,
  UpdateOperationOptions<DynaRecord>,
  DeleteOperationOptions<DynaRecord>,
  JoinTableCondition<JoinTable<DynaRecord, DynaRecord>>,
  JoinTableCreateOptions<JoinTable<DynaRecord, DynaRecord>>,
  JoinTableDeleteOptions<JoinTable<DynaRecord, DynaRecord>>
];

describe("the public entry point", () => {
  it("resolves exactly the pinned set of runtime exports", () => {
    expect.assertions(1);

    expect(Object.keys(publicEntry).sort()).toStrictEqual(
      [...publicRuntimeExports].sort()
    );
  });

  it("exports the write-condition types", () => {
    expect.assertions(1);

    const types: PublicWriteConditionTypes | undefined = undefined;

    expect(types).toBeUndefined();
  });

  it("exports the base class as the default", () => {
    expect.assertions(1);

    expect(publicEntry.default).toBe(DynaRecord);
  });

  it.each([
    "dateSerializer",
    "createObjectSerializer",
    "objectToTableItem",
    "tableItemToObject",
    "convertFieldToTableItem"
  ])(
    "does not leak the internal serializer %s through the decorators barrel",
    internalName => {
      expect.assertions(1);

      // These back @ObjectAttribute and @DateAttribute. They were public only
      // because the attributes barrel re-exported their module wholesale, and
      // that barrel is re-exported by the entry point
      expect(publicEntry).not.toHaveProperty(internalName);
    }
  );
});
