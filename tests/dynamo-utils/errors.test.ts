import { ConditionalCheckFailedError } from "../../src/dynamo-utils";

describe("errors", () => {
  describe("ConditionalCheckFailedError", () => {
    it("has a 'ConditionalCheckFailedError' code", () => {
      expect.assertions(1);

      expect(new ConditionalCheckFailedError("some error").code).toEqual(
        "ConditionalCheckFailedError"
      );
    });
  });
});
