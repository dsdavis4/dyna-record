/**
 * Thin indirection over `globalThis.crypto.randomUUID()` so the test suite
 * can mock ID generation via `vi.mock("../../src/id")` rather than patching
 * the non-configurable `globalThis.crypto.randomUUID` property.
 *
 * Behavior identical to the prior `uuid.v4()` implementation: returns a v4
 * UUID string in the canonical 8-4-4-4-12 hex format.
 *
 * @returns A canonical 8-4-4-4-12 hex v4 UUID string.
 */
export const generateId = (): string => globalThis.crypto.randomUUID();
