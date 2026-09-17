import * as publicEntry from "../index.js";
import DynaRecord from "../index.js";

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

describe("the public entry point", () => {
  it("resolves exactly the pinned set of runtime exports", () => {
    expect.assertions(1);

    expect(Object.keys(publicEntry).sort()).toStrictEqual(
      [...publicRuntimeExports].sort()
    );
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
