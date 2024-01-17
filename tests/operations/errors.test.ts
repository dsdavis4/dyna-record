import { NullConstraintViolationError, NotFoundError } from "../../src/errors";

describe("errors", () => {
  describe("NullConstraintViolationError", () => {
    it("has a 'NullConstraintViolationError' code", () => {
      expect.assertions(1);

      expect(new NullConstraintViolationError("some error").code).toEqual(
        "NullConstraintViolationError"
      );
    });
  });

  describe("NotFoundError", () => {
    it("has a 'NotFoundError' code", () => {
      expect.assertions(1);

      expect(new NotFoundError("some error").code).toEqual("NotFoundError");
    });
  });
});
