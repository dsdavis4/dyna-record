import { NullConstraintViolationError } from "../../src/errors";

describe("errors", () => {
  describe("NullConstraintViolationError", () => {
    it("has a 'NullConstraintViolationError' code", () => {
      expect.assertions(1);

      expect(new NullConstraintViolationError("some error").code).toEqual(
        "NullConstraintViolationError"
      );
    });
  });
});
